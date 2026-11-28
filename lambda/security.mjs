// Production hardening helpers for the PulseRetain Lambda: input validation,
// rate-limit keys, safe error bodies and CloudWatch metrics. Pure functions
// only (no AWS calls), so they are unit-tested in security.test.mjs.
// Deploy this file beside index.mjs and followups.mjs.

// ─── SMS destinations ─────────────────────────────────────────────────────────
// PulseRetain texts gym members in the US and Canada. Blocking every other
// country stops "SMS pumping" fraud, where an attacker uses a signed-up account
// to send texts to premium-rate international numbers and runs up the Twilio bill.
// A valid North American number is +1, then an area code and exchange that
// don't start with 0 or 1.
const NANP_RE = /^\+1[2-9]\d{2}[2-9]\d{6}$/;
export function isAllowedSmsDestination(e164) {
  return typeof e164 === "string" && NANP_RE.test(e164);
}

// ─── Public demo-request form ─────────────────────────────────────────────────
const LEAD_LIMITS = { name: 100, email: 200, gym: 150, size: 50, plan: 60 };
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

// Returns { lead } with trimmed, length-capped fields, { spam: true } when the
// hidden honeypot field was filled in (bots fill every field), or { error }.
export function cleanLead(raw) {
  const lead = raw && typeof raw === "object" ? raw : {};
  if (typeof lead.website === "string" && lead.website.trim()) return { spam: true };
  const out = {};
  for (const [field, max] of Object.entries(LEAD_LIMITS)) {
    out[field] = String(lead[field] ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
  }
  if (!out.name && !out.email) return { error: "Please add your name and email." };
  if (out.email && !EMAIL_RE.test(out.email)) return { error: "That email address doesn't look right." };
  if (!out.plan) out.plan = "Demo request";
  return { lead: out };
}

// ─── Outreach log validation ──────────────────────────────────────────────────
export const OUTREACH_STATUSES = new Set(["sent", "responded", "recovered", "no_response"]);
const RESERVED_LOG_KEYS = new Set(["logID", "logId", "tenantId", "type", "savedAt", "updatedAt"]);
const MAX_LOG_BYTES = 8000; // a real log is ~600 bytes; DynamoDB's item cap is 400 KB

// Keep only plain, size-bounded fields from a browser-sent outreach log.
export function cleanOutreachLog(log) {
  if (!log || typeof log !== "object" || Array.isArray(log)) return null;
  const id = String(log.id ?? "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || id.startsWith("conv-")) return null;
  const out = {};
  for (const [k, v] of Object.entries(log)) {
    if (RESERVED_LOG_KEYS.has(k) || !/^[A-Za-z0-9_]{1,40}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 1000);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean" || v === null) out[k] = v;
  }
  if (out.status !== undefined && !OUTREACH_STATUSES.has(out.status)) out.status = "sent";
  if (Buffer.byteLength(JSON.stringify(out)) > MAX_LOG_BYTES) return null;
  return out;
}

// Member ids arrive from the browser and become part of DynamoDB keys.
export function isSafeMemberId(id) {
  return (typeof id === "string" || typeof id === "number") && /^[A-Za-z0-9_-]{1,100}$/.test(String(id));
}

// ─── Rate limits ──────────────────────────────────────────────────────────────
// Fixed-window counters stored as items in the outreach table. Each carries an
// `expiresAt` (epoch seconds) so DynamoDB TTL can delete old counters once TTL
// is switched on for that attribute.
export function windowKey(scope, id, windowSeconds, now = Date.now()) {
  const bucket = Math.floor(now / 1000 / windowSeconds);
  return { key: `rate#${scope}#${id}#${bucket}`, expiresAt: (bucket + 2) * windowSeconds };
}

// The caller's IP from a Function URL event (v2 or v1 payload).
export function clientIp(event) {
  return String(event?.requestContext?.http?.sourceIp || event?.requestContext?.identity?.sourceIp || "unknown").slice(0, 64);
}

// ─── Errors and monitoring ────────────────────────────────────────────────────
// Internal error text (DynamoDB, Twilio, stack details) stays in the logs. The
// browser gets a plain sentence plus a reference id to find the log line.
export function safeErrorMessage(requestId) {
  const ref = requestId ? ` (reference ${String(requestId).slice(0, 8)})` : "";
  return `Something went wrong on our side. Please try again${ref}.`;
}

// CloudWatch Embedded Metric Format: one JSON log line becomes a metric in the
// "PulseRetain" namespace with no extra AWS calls or permissions. Alarms are
// then set on these metrics (see docs/PRODUCTION_HARDENING.md).
export const METRIC_NAMESPACE = "PulseRetain";
export function metricLine(name, value = 1, now = Date.now()) {
  return JSON.stringify({
    _aws: { Timestamp: now, CloudWatchMetrics: [{ Namespace: METRIC_NAMESPACE, Dimensions: [[]], Metrics: [{ Name: name, Unit: "Count" }] }] },
    [name]: value,
  });
}
export function emitMetric(name, value = 1) {
  try { console.log(metricLine(name, value)); } catch { /* never break a request over a metric */ }
}
