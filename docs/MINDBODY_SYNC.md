# Mindbody member sync (v1)

A nightly job that pulls each connected gym's members, visits and memberships
from the Mindbody Public API v6, turns them into PulseRetain members with stable
ids, and re-scores their baseline churn risk. Code: `lambda/mindbody-sync/index.mjs`.
Tests: `node --test lambda/mindbody-sync/sync.test.mjs` (offline, no AWS or Mindbody needed).

## How it works

```
EventBridge Scheduler (nightly)
   └─► Lambda "pulseretain-mindbody-sync"  (separate from the dashboard Lambda)
         for each gym with a "mbsync#<tenantId>" config item:
           1. read the gym's Mindbody staff login from Secrets Manager
           2. POST /usertoken/issue                        → access token
           3. GET  /client/clients (200 per page)          → every client
           4. GET  /client/activeclientsmemberships        → plan names (200 clients per call)
           5. GET  /client/clientvisits per active client  → last attended visit (90 days back)
                                                             + classes booked ahead (30 days out)
           6. map + score each client (same formula as CSV import)
           7. upsert into pulseretain-members, record run summary on the config item
```

- **Stable ids:** `mb-<siteId>-<clientId>`. Re-running never creates duplicates, and
  saved AI results keyed by member id stay attached to the right person.
- **Re-scoring:** the baseline score uses `scoreMember`, kept identical to
  `src/importMembers.js` (a test fails if they drift). Claude is not called; precise
  AI scoring stays on-demand in the dashboard under its cost guards. Each run records
  how many members *newly* became high risk (`lastSummary.newlyHigh`).
- **What Mindbody can't tell us:** monthly value comes from a per-gym `planPrices`
  map (plan name → $), falling back to the value already stored. "Usual schedule"
  is kept from what's already stored.
- **API cost:** Mindbody bills calls above a daily allowance. The visit lookup is one
  call per client, so it is capped (`MAX_VISIT_CALLS_PER_RUN`, default 800 per gym per
  run), refreshing never-synced then stalest members first. Members skipped this run
  keep their last known visit data. A 400-member gym costs roughly 400 + 6 calls a night.
- **Failures:** one gym failing doesn't stop the others; the error is stored on that
  gym's config item (`lastResult: "error"`, `lastError`). Rate limits (429) retry with backoff.

## Member storage

Synced members use the roster store from the "Save imported members on the
server" work: one item per member in `pulseretain-members`, key
`<tenantId>#mb-<siteId>-<clientId>`, dashboard fields under `profile`
(`source: "mindbody"`, `externalId` = Mindbody client id). Sync-only bookkeeping
(exact last-visit time, when visits were last fetched, active flag) is kept under
`mbSync` so the profile stays the shape the dashboard expects. Writes are
UpdateItem, so a saved `aiResult` and the owner's `sortOrder` survive every sync.

The CSV import's "replace" mode deletes only non-Mindbody members, so imports
don't wipe synced members. The dashboard's "reset to demo" removes everything,
including synced members; the next nightly run brings them back (without any
saved AI results).

## Setting up a gym (by hand for v1)

No credentials go in the browser, the repo, DynamoDB, or chat.

1. **PulseRetain's Mindbody developer account** (once): get a Public API key and set
   it as `MINDBODY_API_KEY` on the sync Lambda. Use the sandbox site (`-99`) first.
2. **The gym owner** activates PulseRetain for their site in Mindbody (activation
   link from the developer portal) and creates a staff login for it.
3. **Store that staff login** in AWS Secrets Manager as
   `pulseretain/mindbody/<tenantId>` with value `{"username": "...", "password": "..."}`.
   `<tenantId>` is the owner's Cognito `sub`.
4. **Add a config item** to `pulseretain-outreach`:
   `{ "logID": "mbsync#<tenantId>", "type": "mindbody_sync", "tenantId": "<tenantId>", "siteId": "<site id>", "enabled": true, "planPrices": { "Unlimited Monthly": 159 } }`
   (the dashboard's outreach loader only reads `type: "outreach"`, so this item is ignored there).

## Deploying the Lambda (once)

1. Create a Node.js 20 Lambda `pulseretain-mindbody-sync` in us-east-1, paste
   `lambda/mindbody-sync/index.mjs` as `index.mjs`. Timeout 15 min, memory 256 MB.
2. Env vars: `MINDBODY_API_KEY` (required); optional `MAX_VISIT_CALLS_PER_RUN`,
   `MINDBODY_CONCURRENCY`, `VISIT_LOOKBACK_DAYS`, `VISIT_LOOKAHEAD_DAYS`, `MINDBODY_BASE_URL`.
3. Role permissions: `dynamodb:Scan`, `dynamodb:UpdateItem` on `pulseretain-members`
   and `pulseretain-outreach`; `secretsmanager:GetSecretValue` on
   `arn:aws:secretsmanager:us-east-1:<account>:secret:pulseretain/mindbody/*`.
4. EventBridge Scheduler: daily at e.g. 3:00 AM America/New_York, target the Lambda,
   payload `{}`. For a manual one-gym test, invoke with `{"tenantId": "<tenantId>"}`.

## Guesses to verify against the Mindbody sandbox

These are written from memory of the v6 API and have not been run against a live site:

| Guess | Where |
|---|---|
| `Authorization` header takes the raw token (some docs show `Bearer <token>`) | `createMindbodyClient.request` |
| Max page size is 200; `PaginationResponse.TotalResults` gives the total | `listClients` |
| `/client/activeclientsmemberships` takes repeated `ClientIds` and returns `{ ClientMemberships: [{ ClientId, Memberships }] }` | `activeMemberships` |
| A past visit counts as attended when `SignedIn` is true; `LateCancelled` bookings don't count as booked ahead | `summarizeVisits` |
| Negative `AccountBalance` = owes money → counted as 1 missed payment | `mapClientToMember` |
| Free allowance is ~1,000 calls per site per day | `MAX_VISIT_CALLS_PER_RUN` default |
| `SendPromotionalTexts` reflects SMS consent (stored only, not yet used) | `mapClientToMember` |

## Not in v1

- Owner-facing "Connect Mindbody" screen and sync status in the dashboard.
- Real missed-payment history (autopay/contract data) and per-plan prices from Mindbody.
- Webhooks for near-real-time updates instead of a nightly pull.
- Re-running Claude analysis automatically for members who newly turn high risk.
