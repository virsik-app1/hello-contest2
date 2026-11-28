// PulseRetain — Mindbody member sync (first version).
//
// A SEPARATE Lambda from the main dashboard proxy (lambda/index.mjs). It runs on
// a schedule (EventBridge Scheduler, nightly), pulls each connected gym's
// clients, recent + upcoming visits and active memberships from the Mindbody
// Public API v6, maps them onto PulseRetain members with STABLE ids
// ("mb-<siteId>-<clientId>"), re-scores baseline churn risk with the same
// formula as the CSV import, and upserts them into the server-side member store.
//
// Like the main Lambda it is deployed by pasting this one file: Node 18+
// built-ins (global fetch) plus the AWS SDK v3 that ships in the Lambda runtime.
// The SDK is imported lazily so the pure functions below can be unit-tested
// offline with `node --test lambda/mindbody-sync/sync.test.mjs`.
//
// It does NOT call Claude. Precise AI re-scoring stays on-demand in the
// dashboard (and under its cost guards); this only refreshes the baseline score.
//
// Things marked GUESS are assumptions about the Mindbody API or the business
// rules that have not been checked against a live Mindbody sandbox yet. See
// docs/MINDBODY_SYNC.md for the full list.

// ═══ CONFIG ═══════════════════════════════════════════════════════════════════
const REGION          = "us-east-1";
const MEMBERS_TABLE   = "pulseretain-members";
const OUTREACH_TABLE  = "pulseretain-outreach";   // holds per-gym sync config/state items (no new table)
const MB_BASE         = process.env.MINDBODY_BASE_URL || "https://api.mindbodyonline.com/public/v6";
const PAGE_SIZE       = 200;                       // GUESS: Mindbody's max Limit per page
const VISIT_LOOKBACK_DAYS  = Number(process.env.VISIT_LOOKBACK_DAYS)  || 90;
const VISIT_LOOKAHEAD_DAYS = Number(process.env.VISIT_LOOKAHEAD_DAYS) || 30;
// Mindbody bills API calls above a free daily allowance (GUESS: ~1,000/site/day),
// so the per-client visit calls are capped per gym per run, stalest first.
const MAX_VISIT_CALLS = Number(process.env.MAX_VISIT_CALLS_PER_RUN) || 800;
const CONCURRENCY     = Number(process.env.MINDBODY_CONCURRENCY) || 4;
const DAY = 86400000;

export const configKey = (tenantId) => `mbsync#${tenantId}`;
export const stableMemberId = (siteId, clientId) => `mb-${siteId}-${clientId}`;

// ═══ SCORING — must stay identical to scoreMember in src/importMembers.js ══════
// (sync.test.mjs loads the frontend file and checks the two agree.)
export function scoreMember({ daysSince, missedPayments = 0, classesBooked = 0, joinedMonths = 12 }) {
  const d = daysSince == null ? 5 : daysSince;
  let s = Math.min(d * 7, 70);
  s += Math.min(missedPayments, 4) * 12;
  s -= Math.min(classesBooked, 6) * 5;
  if (joinedMonths < 4) s += 10;
  s = Math.max(0, Math.min(100, Math.round(s)));
  const risk = s >= 68 ? "high" : s >= 38 ? "medium" : "low";
  return { score: s, risk };
}

// ═══ PURE MAPPING (unit-tested) ═══════════════════════════════════════════════
function relativeDays(d) {
  if (d == null) return "Unknown";
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

function initialsOf(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

const parseTime = (v) => { const t = Date.parse(v || ""); return Number.isNaN(t) ? null : t; };

// From a client's visit list: days since the last ATTENDED visit, and how many
// future classes are booked. GUESS: a past visit counts as attended when
// SignedIn is true; late-cancels/no-shows (SignedIn false) do not.
export function summarizeVisits(visits, nowMs) {
  let lastMs = null, upcoming = 0;
  for (const v of Array.isArray(visits) ? visits : []) {
    const t = parseTime(v.StartDateTime);
    if (t == null) continue;
    if (t > nowMs) {
      if (!v.LateCancelled) upcoming++;
    } else if (v.SignedIn && (lastMs == null || t > lastMs)) {
      lastMs = t;
    }
  }
  return {
    daysSince: lastMs == null ? null : Math.max(0, Math.floor((nowMs - lastMs) / DAY)),
    lastVisitAt: lastMs == null ? null : new Date(lastMs).toISOString(),
    classesBooked: upcoming,
  };
}

// Pick the membership to show as the member's plan: the active one that
// expires last. GUESS on field names (Name, ExpirationDate, Current).
export function pickPlan(memberships) {
  const list = (Array.isArray(memberships) ? memberships : []).filter(m => m && m.Name && m.Current !== false);
  if (!list.length) return null;
  list.sort((a, b) => (parseTime(b.ExpirationDate) ?? Infinity) - (parseTime(a.ExpirationDate) ?? Infinity));
  return list[0].Name;
}

// Turn one Mindbody client + its visits/memberships into a PulseRetain member.
// `existing` is the member already stored (if any): fields Mindbody can't give
// us (monthly value set by the owner, usual schedule) are kept from it.
// `planPrices` maps plan name → monthly $ (set per gym in the sync config).
export function mapClientToMember({ siteId, client, visits, memberships, existing, planPrices = {}, nowMs }) {
  const name = [client.FirstName, client.LastName].filter(Boolean).join(" ").trim() || "Unknown";
  const plan = pickPlan(memberships) || existing?.plan || "Membership";
  const joinedAt = parseTime(client.CreationDate);
  const joinedMonths = joinedAt == null ? (existing?.joinedMonths ?? 12) : Math.max(0, Math.floor((nowMs - joinedAt) / (30.44 * DAY)));

  // When this run skipped the visit call (call budget), keep the last known
  // visit info rather than treating the member as "never visited".
  let vs;
  if (visits) vs = summarizeVisits(visits, nowMs);
  else if (existing?.lastVisitAt) {
    vs = { lastVisitAt: existing.lastVisitAt, daysSince: Math.max(0, Math.floor((nowMs - Date.parse(existing.lastVisitAt)) / DAY)), classesBooked: existing.classesBooked ?? 0 };
  } else vs = { lastVisitAt: null, daysSince: null, classesBooked: existing?.classesBooked ?? 0 };

  // GUESS: a negative AccountBalance means the client owes money; we count that
  // as one missed payment until we read autopay/contract history properly.
  const missedPayments = Number(client.AccountBalance) < 0 ? 1 : 0;
  const value = planPrices[plan] != null ? Math.round(Number(planPrices[plan])) : (existing?.value ?? 0);
  const { score, risk } = scoreMember({ daysSince: vs.daysSince, missedPayments, classesBooked: vs.classesBooked, joinedMonths });

  return {
    id: stableMemberId(siteId, client.Id),
    source: "mindbody",
    externalId: String(client.Id),
    siteId: String(siteId),
    name,
    initials: initialsOf(name),
    plan,
    lastVisit: relativeDays(vs.daysSince),
    lastVisitAt: vs.lastVisitAt,
    usualVisits: existing?.usualVisits || "—",
    risk,
    score,
    value,
    email: client.Email || "",
    phone: client.MobilePhone || client.HomePhone || "",
    joinedMonths,
    missedPayments,
    classesBooked: vs.classesBooked,
    location: client.HomeLocation?.Name || existing?.location || "",
    active: client.Active !== false,
    smsOptIn: client.SendPromotionalTexts ?? null,  // GUESS field name; informational only
    previousRisk: existing?.risk ?? null,
    visitsSyncedAt: visits ? new Date(nowMs).toISOString() : (existing?.visitsSyncedAt ?? null),
  };
}

// Which active clients get a (billable) visits call this run: never-synced
// first, then the stalest, up to the cap.
export function chooseVisitRefresh(clients, existingById, siteId, cap) {
  return clients
    .filter(c => c.Active !== false)
    .map(c => ({ id: String(c.Id), at: parseTime(existingById[stableMemberId(siteId, c.Id)]?.visitsSyncedAt) ?? -1 }))
    .sort((a, b) => a.at - b.at)
    .slice(0, Math.max(0, cap))
    .map(x => x.id);
}

// Summary of a run for logs and the sync-state item.
export function summarizeRun(members) {
  const out = { total: members.length, high: 0, medium: 0, low: 0, newlyHigh: 0 };
  for (const m of members) {
    out[m.risk]++;
    if (m.risk === "high" && m.previousRisk && m.previousRisk !== "high") out.newlyHigh++;
  }
  return out;
}

// ═══ MINDBODY API CLIENT ══════════════════════════════════════════════════════
export function createMindbodyClient({ apiKey, siteId, username, password, fetchImpl = globalThis.fetch }) {
  let token = null;
  let calls = 0;

  async function request(method, path, { query, body, auth = true } = {}) {
    const url = new URL(MB_BASE + path);
    for (const [k, v] of Object.entries(query || {})) {
      if (v == null) continue;
      for (const item of Array.isArray(v) ? v : [v]) url.searchParams.append(k, String(item));
    }
    const headers = { "Api-Key": apiKey, "SiteId": String(siteId), "Content-Type": "application/json" };
    if (auth && token) headers.Authorization = token; // GUESS: raw token (some docs show "Bearer <token>")
    for (let attempt = 0; ; attempt++) {
      calls++;
      const res = await fetchImpl(url.toString(), { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 429 && attempt < 3) { await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)); continue; }
      const text = await res.text();
      if (!res.ok) throw new Error(`Mindbody ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
      return text ? JSON.parse(text) : {};
    }
  }

  return {
    get callCount() { return calls; },
    async authenticate() {
      const r = await request("POST", "/usertoken/issue", { body: { Username: username, Password: password }, auth: false });
      token = r.AccessToken;
      if (!token) throw new Error("Mindbody did not return an access token");
    },
    // All clients, paginated. Pass `modifiedSince` for an incremental pull.
    async listClients({ modifiedSince } = {}) {
      const all = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const r = await request("GET", "/client/clients", { query: { Limit: PAGE_SIZE, Offset: offset, LastModifiedDate: modifiedSince } });
        const page = r.Clients || [];
        all.push(...page);
        const total = r.PaginationResponse?.TotalResults;
        if (page.length < PAGE_SIZE || (total != null && all.length >= total)) break;
      }
      return all;
    },
    async clientVisits(clientId, startDate, endDate) {
      const r = await request("GET", "/client/clientvisits", { query: { ClientId: clientId, StartDate: startDate, EndDate: endDate, Limit: PAGE_SIZE } });
      return r.Visits || [];
    },
    // Active memberships for up to PAGE_SIZE clients per call. GUESS: endpoint
    // name and response shape ({ ClientMemberships: [{ ClientId, Memberships }] }).
    async activeMemberships(clientIds) {
      const byClient = {};
      for (let i = 0; i < clientIds.length; i += PAGE_SIZE) {
        const r = await request("GET", "/client/activeclientsmemberships", { query: { ClientIds: clientIds.slice(i, i + PAGE_SIZE), Limit: PAGE_SIZE } });
        for (const cm of r.ClientMemberships || []) byClient[String(cm.ClientId)] = cm.Memberships || [];
      }
      return byClient;
    },
  };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() { while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ═══ ONE GYM'S SYNC (I/O injected so it can be tested with fakes) ═════════════
export async function syncTenant({ tenantId, config, mb, store, nowMs = Date.now() }) {
  const siteId = config.siteId;
  await mb.authenticate();

  // Full pull every run for v1 (rosters are small). Incremental pulls via
  // LastModifiedDate are supported by listClients but visits don't change a
  // client's modified date, so a full list is what lets us refresh visits.
  const clients = await mb.listClients();
  const existingById = await store.loadMembers(tenantId);

  const activeIds = clients.filter(c => c.Active !== false).map(c => String(c.Id));
  const memberships = activeIds.length ? await mb.activeMemberships(activeIds) : {};

  const refreshIds = new Set(chooseVisitRefresh(clients, existingById, siteId, MAX_VISIT_CALLS));
  const start = new Date(nowMs - VISIT_LOOKBACK_DAYS * DAY).toISOString().slice(0, 10);
  const end   = new Date(nowMs + VISIT_LOOKAHEAD_DAYS * DAY).toISOString().slice(0, 10);
  const visitsById = {};
  await mapLimit([...refreshIds], CONCURRENCY, async (id) => {
    try { visitsById[id] = await mb.clientVisits(id, start, end); }
    catch (e) { console.warn(`visits failed for client ${id}: ${e.message}`); } // keep last known
  });

  const members = clients.map(client => mapClientToMember({
    siteId, client,
    visits: visitsById[String(client.Id)],
    memberships: memberships[String(client.Id)],
    existing: existingById[stableMemberId(siteId, client.Id)],
    planPrices: config.planPrices || {},
    nowMs,
  }));

  await store.upsertMembers(tenantId, members);
  const summary = { ...summarizeRun(members), visitCalls: refreshIds.size, apiCalls: mb.callCount };
  await store.saveSyncState(tenantId, { lastSyncAt: new Date(nowMs).toISOString(), lastResult: "ok", summary });
  return summary;
}

// ═══ AWS ADAPTERS (lazy SDK imports) ══════════════════════════════════════════
let _ddb;
async function ddb() {
  if (_ddb) return _ddb;
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const lib = await import("@aws-sdk/lib-dynamodb");
  _ddb = { doc: lib.DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), { marshallOptions: { removeUndefinedValues: true } }), lib };
  return _ddb;
}

async function scanAll(params) {
  const { doc, lib } = await ddb();
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await doc.send(new lib.ScanCommand({ ...params, ExclusiveStartKey }));
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// Member store — matches the roster schema in lambda/index.mjs (the "Save
// imported members on the server" work): one item per member in
// pulseretain-members, key "<tenantId>#<id>", the dashboard's fields under
// `profile`, `aiResult` written separately by the analyze route. We use
// UpdateItem so an existing aiResult and sortOrder survive every sync.
// Sync-only bookkeeping lives under `mbSync` so the profile stays exactly the
// shape the dashboard expects (its cleaner drops unknown profile fields).
const PROFILE_FIELDS = ["id", "name", "initials", "plan", "lastVisit", "usualVisits", "risk", "score", "value",
  "email", "phone", "joinedMonths", "missedPayments", "classesBooked", "location", "source", "externalId", "lastVisitDate"];
const SYNC_FIELDS = ["siteId", "lastVisitAt", "visitsSyncedAt", "active", "smsOptIn"];
const capStr = (v) => (typeof v === "string" ? v.slice(0, 200) : v);

// Split a synced member into the stored { profile, mbSync } pair.
export function toStoredMember(m) {
  const profile = {}, mbSync = {};
  for (const k of PROFILE_FIELDS) if (m[k] !== undefined) profile[k] = capStr(m[k]);
  profile.lastVisitDate = m.lastVisitAt ? m.lastVisitAt.slice(0, 10) : null;
  for (const k of SYNC_FIELDS) if (m[k] !== undefined) mbSync[k] = m[k];
  return { profile, mbSync };
}

// Rebuild the "existing" member mapClientToMember expects from a stored item.
export function fromStoredItem(item) {
  const p = item.profile || {};
  return { ...p, ...(item.mbSync || {}), lastVisitAt: item.mbSync?.lastVisitAt ?? (p.lastVisitDate ? `${p.lastVisitDate}T00:00:00.000Z` : null) };
}

export const dynamoStore = {
  async loadMembers(tenantId) {
    const items = await scanAll({ TableName: MEMBERS_TABLE, FilterExpression: "tenantId = :t", ExpressionAttributeValues: { ":t": tenantId } });
    const byId = {};
    for (const i of items) if (i.profile?.id) byId[i.profile.id] = fromStoredItem(i);
    return byId;
  },
  async upsertMembers(tenantId, members) {
    const { doc, lib } = await ddb();
    const now = new Date().toISOString();
    await mapLimit(members, 10, (m) => {
      const { profile, mbSync } = toStoredMember(m);
      return doc.send(new lib.UpdateCommand({
        TableName: MEMBERS_TABLE,
        Key: { memberId: `${tenantId}#${m.id}` },
        // New members sort after the existing roster (keeps owner ordering).
        UpdateExpression: "SET profile = :p, mbSync = :s, tenantId = :t, rawMemberId = :r, updatedAt = :u, sortOrder = if_not_exists(sortOrder, :o)",
        ExpressionAttributeValues: { ":p": profile, ":s": mbSync, ":t": tenantId, ":r": m.id, ":u": now, ":o": 1e9 },
      }));
    });
  },
  async saveSyncState(tenantId, state) {
    const { doc, lib } = await ddb();
    await doc.send(new lib.UpdateCommand({
      TableName: OUTREACH_TABLE,
      Key: { logID: configKey(tenantId) },
      UpdateExpression: "SET lastSyncAt = :a, lastResult = :r, lastSummary = :s, lastError = :e",
      ExpressionAttributeValues: { ":a": state.lastSyncAt, ":r": state.lastResult, ":s": state.summary ?? null, ":e": state.error ?? null },
    }));
  },
};

// Gyms with Mindbody connected: config items { logID: "mbsync#<tenantId>",
// type: "mindbody_sync", tenantId, siteId, enabled, planPrices }.
async function listConnectedTenants() {
  const items = await scanAll({ TableName: OUTREACH_TABLE, FilterExpression: "#ty = :ty", ExpressionAttributeNames: { "#ty": "type" }, ExpressionAttributeValues: { ":ty": "mindbody_sync" } });
  return items.filter(i => i.enabled !== false && i.tenantId && i.siteId);
}

// Each gym's Mindbody staff login lives in Secrets Manager, never in DynamoDB,
// the browser, or chat: secret "pulseretain/mindbody/<tenantId>" = {"username","password"}.
async function loadCredentials(tenantId) {
  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const sm = new SecretsManagerClient({ region: REGION });
  const r = await sm.send(new GetSecretValueCommand({ SecretId: `pulseretain/mindbody/${tenantId}` }));
  return JSON.parse(r.SecretString || "{}");
}

// ═══ HANDLER ══════════════════════════════════════════════════════════════════
// Invoked by EventBridge Scheduler with {} (sync every connected gym) or
// {"tenantId": "..."} (one gym, e.g. a manual test run). Not exposed over HTTP.
export const handler = async (event = {}) => {
  const apiKey = process.env.MINDBODY_API_KEY;
  if (!apiKey) throw new Error("MINDBODY_API_KEY not set");

  let tenants = await listConnectedTenants();
  if (event.tenantId) tenants = tenants.filter(t => t.tenantId === event.tenantId);

  const results = [];
  for (const config of tenants) {   // one gym at a time keeps the Mindbody rate limit simple
    const { tenantId } = config;
    try {
      const creds = await loadCredentials(tenantId);
      const mb = createMindbodyClient({ apiKey, siteId: config.siteId, username: creds.username, password: creds.password });
      const summary = await syncTenant({ tenantId, config, mb, store: dynamoStore });
      console.log(`mindbody sync ok tenant=${tenantId}`, JSON.stringify(summary));
      results.push({ tenantId, ok: true, summary });
    } catch (e) {
      console.error(`mindbody sync failed tenant=${tenantId}: ${e.message}`);
      try { await dynamoStore.saveSyncState(tenantId, { lastSyncAt: new Date().toISOString(), lastResult: "error", error: e.message.slice(0, 500) }); } catch {}
      results.push({ tenantId, ok: false, error: e.message });
    }
  }
  return { synced: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
};
