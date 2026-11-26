# Weekly retention email for gym owners

Every Monday morning each gym owner gets one email with their week in PulseRetain,
then a button back to the dashboard.

## What's in it

| Section | Where the number comes from |
|---|---|
| Revenue at risk ($/month) | Saved roster members whose risk is high (the AI's risk level when there is one, otherwise the roster's), summing their monthly value. Same rule as the dashboard headline. |
| Revenue saved | Outreach logs marked **Recovered** in the last 7 days, monthly value x 12 (matches the dashboard's "per year" card). |
| Members won back | Count and first names of those recovered members. |
| Texts sent | `sendlog` items in the last 7 days (manual sends and scheduled follow-ups both write one), plus follow-ups booked for the coming week. |
| Replies | Texted member replies received in the last 7 days, and how many members sent them. |
| Replies waiting | Texted threads whose last message is from the member and hasn't been marked handled. |
| Who to contact this week | Up to 3 high or slipping members not contacted yet, high risk first, then score x value, with the AI's reason. |

The window is the 7 days before the run. Sample/demo members (non `m_`/`mb-` ids) are never counted.
A gym with no roster and no activity that week gets no email.

## How it works

- `lambda/weeklyReport.mjs`: pure logic (numbers, subject line, HTML + plain-text email, the run loop). Tests: `node --test lambda/*.test.mjs`.
- `lambda/index.mjs`:
  - When the dashboard loads settings (`get_settings`), the Lambda looks up the owner's **verified login email** from Cognito using the owner's own token (Cognito `GetUser`, no extra IAM permission) and stores it as `reportEmail` on the gym's `settings#<gym>` item. The browser can't set the address, so the report can't be pointed at someone else.
  - `save_report_prefs {weeklyReport: true|false}` turns the email on or off (on by default).
  - `send_test_report` sends this week's report now to the owner's own login email (max 3 a day per gym).
  - A scheduled event with `{"pulseretainJob":"weekly_report"}` runs the weekly send for every gym. Each gym is claimed for the ISO week with a conditional write first, so a retry or a second firing never emails twice. A failed send frees the claim so a re-run can try again.
- Dashboard (Outreach tab, under the time zone picker): "Weekly email report to you@gym.com, Mondays" checkbox and a "Send me this week's now" link.

## Sender: Amazon SES

SES is already in the stack (demo-request emails) and the Lambda role already has
`AmazonSESFullAccess`, so no new service or IAM change is needed.

## Setup steps (Carter, once)

1. **Verify a sender.** SES console (us-east-1) → Identities → Create identity.
   - Best: **Domain** (e.g. `pulseretain.com`), then add the 3 DKIM CNAME records it shows to your DNS. Mail then comes from any address at that domain, e.g. `reports@pulseretain.com`.
   - Quick start: **Email address**, click the link SES emails you.
2. **Leave the sandbox.** A new SES account can only email *verified* addresses (fine for testing with your own). SES → Account dashboard → **Request production access**: use case "transactional: weekly account reports to our own signed-in customers", about 1 email per customer per week. Usually approved in about a day.
3. **Lambda environment variables** (Configuration → Environment variables):
   - `REPORT_FROM_EMAIL` = the verified address, e.g. `reports@pulseretain.com` (falls back to `NOTIFY_EMAIL` if unset)
   - `DASHBOARD_URL` (optional) = the app link in the email; defaults to `https://main.d2yk3ai4m6puu9.amplifyapp.com`
4. **Deploy the Lambda code:** upload `index.mjs`, `followups.mjs` **and the new `weeklyReport.mjs`** side by side (the Lambda fails to start without it).
5. **Schedule:** EventBridge → Rules → Create rule → *Schedule* → cron `0 13 ? * MON *` (Mondays 13:00 UTC = 8am Eastern, 5am Pacific) → target: `pulseretain-claude-proxy` → *Additional settings* → **Constant (JSON text)**: `{"pulseretainJob":"weekly_report"}`.
   The constant input matters: without it the event looks like the hourly follow-up run and sends follow-ups instead of reports.
6. **Try it:** sign in to the dashboard (this stores your email), open Outreach, click "Send me this week's now".

Owners are picked up the next time they sign in after this deploy (that's when their email is stored).

## Known limits (v1)

- One send time for every gym (Monday 13:00 UTC), not each gym's local morning.
- The email doesn't show the gym's name: there's no gym-name setting yet.
- Each gym's data is read with two table Scans; fine at beta size, same as the rest of the Lambda.
- Turning the email off is a dashboard checkbox; there's no one-click unsubscribe link in the email yet.
