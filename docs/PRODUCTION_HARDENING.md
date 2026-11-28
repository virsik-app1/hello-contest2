# Production hardening (Nov 2026)

A security and reliability pass before real gym members' data goes in.
Code fixes are in this PR. AWS changes are listed at the bottom and need
Carter's OK before anyone makes them.

## What was already solid

- **Login on every route.** Every Lambda action except the public demo form
  and the Twilio webhook checks a Cognito access token (signature, issuer,
  expiry, token type and app client). No token gives a 401 and touches no data.
- **Gym data isolation.** The gym id comes from the verified token, never from
  the browser. Every DynamoDB key is prefixed with it and every read filters on
  it, so one gym can't read or change another gym's members, logs or threads.
- **Twilio webhook signatures** are checked with a constant-time compare
  before anything is read.
- **Cost guards.** Daily AI and texting budgets per gym; the server picks the
  AI model and answer length; texting honors STOP, quiet hours and the opt-out
  footer.
- **No secrets in the repo.** Keys live in Lambda environment variables.

## Findings and fixes

| # | Severity | Finding | Fix in this PR |
|---|----------|---------|----------------|
| 1 | High | `send_sms` and follow-ups would text **any country**. A signed-up account could pump texts to premium international numbers ("SMS pumping" fraud) at PulseRetain's cost. | Texts only go to valid US/Canada numbers. Anything else gets a clear 400. |
| 2 | High | Anyone can create an account, and budgets were per gym only, so many sign-ups multiplied the AI and texting budget. | New all-gyms daily caps (3,000 AI calls, 1,500 texts; env-overridable) as a safety net, with a log line and metric when hit. |
| 3 | Medium | The public demo form had no rate limit or validation, so a bot could fill the leads table and flood the notification inbox. Two requests in the same millisecond also overwrote each other. | 5 per IP per hour, 200 per day overall; fields trimmed and capped; email checked; optional hidden `website` honeypot; random lead ids. |
| 4 | Medium | No short-term rate limit: a script with a valid login could hammer the API. | 120 requests per gym per minute on signed-in routes (normal use is a few per minute; "Analyze members" runs one at a time). |
| 5 | Medium | 500 errors sent raw internal messages (DynamoDB, stack details) to the browser. | Browser gets a plain sentence plus a reference id; details stay in CloudWatch logs. Twilio's own "invalid number" text is still shown. |
| 6 | Medium | No error monitoring beyond raw logs. | CloudWatch metrics in the `PulseRetain` namespace, written as log lines (no new permissions): `ServerError`, `AuthRejected`, `TwilioSignatureInvalid`, `RateLimited`, `QuotaExceeded`, `GlobalQuotaExceeded`, `AIRequestFailed`, `FollowupRunFailed`, `SmsSent`. |
| 7 | Low | `save_outreach` stored whatever object the browser sent (any fields, any size, up to 400 KB). | Only plain fields with safe names, capped at 8 KB; reserved keys dropped. |
| 8 | Low | `update_outreach_status` accepted any status and could touch non-log items. | Status must be sent, responded, recovered or no_response, and only outreach logs are updated. |
| 9 | Low | Member ids and names from the browser weren't bounded. | Member ids must be short letters/digits/`-`/`_`; names capped at 120 characters. |
| 10 | Low | A malformed AI answer in `analyze` turned a paid, successful call into a 500. | Bad JSON is skipped and the answer still returns. |
| 11 | Low | Rate and usage counters pile up forever. | Counters carry an `expiresAt` attribute, ready for DynamoDB TTL (infra item 5). |

Known and accepted for now: CORS allows any origin (fine with bearer tokens, no
cookies); one shared Twilio number means a STOP applies to every gym and the
gym that texted a number last owns its replies. Per-gym numbers fix both.

New file `lambda/security.mjs` must be deployed beside `index.mjs` and
`followups.mjs`. Tests: `node --test lambda/followups.test.mjs lambda/security.test.mjs`.

## AWS changes for Carter's approval

Live setup checked read-only on Nov 26, 2026. None of these changes have been
made. Each one can be undone.

| # | Priority | Live today | Proposed change |
|---|----------|------------|-----------------|
| 1 | High | Point-in-time recovery **off** on all three tables, deletion protection **off**, no AWS Backup plan. 46 members, 38 outreach items, 2 leads. | Turn on point-in-time recovery (35 days of restore points, costs cents at this size) and deletion protection on `pulseretain-members`, `pulseretain-outreach`, `pulseretain-leads`. |
| 2 | High | Only two billing alarms ($1, $5). **Nothing watches the app itself.** | Alarms emailed through the existing `billing-alerts` SNS topic: Lambda `Errors` ≥ 5 in 5 min; Lambda `Throttles` ≥ 1; `PulseRetain/ServerError` ≥ 5 in 5 min; `PulseRetain/FollowupRunFailed` ≥ 1; `PulseRetain/GlobalQuotaExceeded` ≥ 1; `PulseRetain/TwilioSignatureInvalid` ≥ 20 in 1 hour; `PulseRetain/AIRequestFailed` ≥ 10 in 15 min. The `PulseRetain/*` ones start reporting once PR 8 is deployed. |
| 3 | Medium | No reserved concurrency; Function URL is public (auth type NONE, by design). | Reserved concurrency of 20: a hard cap on parallel runs and cost if the URL is flooded. |
| 4 | Medium | Lambda role has `AmazonDynamoDBFullAccess` and `AmazonSESFullAccess` (every table and every SES action in the account). | Replace with one policy allowing only Get/Put/Update/Delete/Scan/BatchWrite on the three tables and `ses:SendEmail` from the notify address. |
| 5 | Medium | Cognito: **anyone can sign up** (8 users now), MFA off. Password policy is good (8+ chars, mixed case, number, symbol); deletion protection on. | Decide whether sign-up should stay open until Stripe billing is live. Turn MFA to "optional" (authenticator app) so owners can protect their accounts. |
| 6 | Low | Log group keeps logs forever (about 0.5 MB today). | 90-day retention on `/aws/lambda/pulseretain-claude-proxy`. |
| 7 | Low | TTL off on `pulseretain-outreach`. | TTL on attribute `expiresAt`, so rate and usage counters clean themselves up. |
| 8 | Low | Keys are plain Lambda environment variables; no Secrets Manager secrets. Leftover `SMS_ALLOWLIST` variable is no longer read by the code. | Later: move `ANTHROPIC_API_KEY`, `TWILIO_AUTH_TOKEN` and Stripe keys to Secrets Manager. Remove `SMS_ALLOWLIST`. |
