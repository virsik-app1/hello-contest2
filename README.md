# PulseRetain

**AI-powered member churn prediction and automated retention outreach for fitness studios and gyms.**

PulseRetain spots the members who are about to quietly cancel, has Claude write each one a personalized win-back text, sends it, and tracks whether it worked — so a studio owner stops losing members they never knew were slipping away.

🔗 **Live app:** https://main.d2yk3ai4m6puu9.amplifyapp.com (behind login)
🌐 **Marketing site:** https://main.deghc4fxl89sq.amplifyapp.com

> Built for the "How crazy can you get?" AI Vibe Coding Competition. Target industry: SIC 7997 (membership sports & recreation clubs).

---

## The problem

Most gyms don't notice a member is slipping until they've already cancelled. Roughly two-thirds of members who quit do so quietly, with no complaint and no warning, and it takes staff over a week on average to realize a regular has stopped showing up. By then the member is gone — and it costs about five times more to win a new member than to keep an existing one.

## The solution

PulseRetain is a member-intelligence dashboard that:

1. **Scores churn risk** for every member from behavioral signals (recency of last visit, usual schedule, tenure, missed payments, upcoming bookings).
2. **Generates a personalized win-back message** with Claude — tuned to each member's specific situation, under 160 characters, ready to send as a text.
3. **Sends it** by SMS (via Twilio) and **logs the outreach** to a database.
4. **Tracks the outcome** — responded, recovered, or no reply — and rolls it up into revenue-saved analytics.

## AI usage

The intelligent core is a call to **Claude (`claude-haiku-4-5`)** routed through a secure AWS Lambda. For each member, Claude receives the member's signals and returns a strict JSON object:

```json
{
  "riskLevel": "high",
  "score": 85,
  "reason": "One-sentence churn explanation",
  "message": "Personalized SMS under 160 characters",
  "followUpDays": 3,
  "offerType": "class_credit"
}
```

This single call does three AI jobs at once: **prediction** (risk score), **explanation** (the reason), and **generation** (the personalized message + recommended offer and follow-up cadence). Haiku was chosen for its speed and low cost, which keeps the per-member analysis essentially free at this scale.

**No API keys ever touch the browser.** The frontend only knows a Lambda URL; the Claude and Twilio credentials live server-side in the Lambda's environment.

---

## Architecture

```
┌────────────────────┐        ┌──────────────────────────┐
│  React app (CRA)   │  HTTPS │  AWS Lambda Function URL  │
│  on AWS Amplify    │ ─────► │  pulseretain-claude-proxy │
│  • Cognito login   │        │  (single secure API)      │
│  • Dashboard/      │        └─────────────┬────────────┘
│    Outreach/       │            ┌──────────┼───────────┐
│    Analytics       │            ▼          ▼           ▼
└────────────────────┘      ┌─────────┐ ┌────────┐ ┌─────────┐
                            │ Claude  │ │ Twilio │ │DynamoDB │
                            │  API    │ │  SMS   │ │ 3 tables│
                            └─────────┘ └────────┘ └─────────┘
```

| Layer | Technology |
|-------|-----------|
| Frontend | React (Create React App), deployed on **AWS Amplify** (CI/CD from GitHub `main`) |
| Auth | **AWS Cognito** via `@aws-amplify/ui-react` Authenticator (hashed passwords, tokens, password reset) |
| API | A single **AWS Lambda Function URL** — every call goes through it, so no secrets reach the client |
| AI | **Anthropic Claude** (`claude-haiku-4-5`) |
| SMS | **Twilio** |
| Email | **AWS SES** |
| Database | **Amazon DynamoDB** (3 tables) |
| Region | `us-east-1` |

The Lambda is a small router keyed on an `action` field. Supported actions:

| Action | Purpose |
|--------|---------|
| `analyze` | Run Claude churn analysis for a member |
| `send_sms` | Send a win-back text via Twilio |
| `load_data` | Restore saved AI results + outreach logs on app load |
| `save_outreach` | Persist a logged outreach message |
| `update_outreach_status` | Update an outreach's outcome (responded/recovered/no reply) |

## Data model

**Member** (demo roster is a realistic synthetic dataset of 10 members):

`id, name, plan, lastVisit, usualVisits, risk, score, value ($/mo), email, phone, joinedMonths, missedPayments, classesBooked`

**DynamoDB tables (`us-east-1`):**

- `pulseretain-members` — saved AI analysis results, keyed by `memberId`.
- `pulseretain-outreach` — outreach log: `logId, memberId, memberName, plan, value, message, sentAt, status, followUpDays`.
- `pulseretain-leads` — demo-request leads captured from the marketing site.

**PII handling:** member name, email, and phone are treated as PII. They are sent only to the Lambda over HTTPS for message delivery and are never placed in URLs or client-side logs. (The demo roster uses synthetic contact details.)

---

## Running locally

```bash
npm install
npm start          # opens http://localhost:3000
```

The app needs no `.env` to run — the Cognito config lives in `src/aws-config.js` and the Lambda URL is set in `src/App.js`. Server-side secrets (Claude key, Twilio credentials) are configured in the Lambda's environment, not in this repo.

```bash
npm run build      # production build (what Amplify deploys)
```

## Deployment

Amplify is connected to this repo's `main` branch. **Pushing to `main` automatically triggers a build and deploy** — there is no manual upload step.

```bash
git add -A
git commit -m "your message"
git push           # Amplify rebuilds and the live URL updates in ~2-3 min
```

## Security notes

- No API keys in the frontend or in git — all secrets are server-side in the Lambda.
- `.env` is git-ignored.
- Auth is real (Cognito): hashed passwords, session tokens, working sign-out and password reset.

## Project structure

```
hello-contest/
├── src/
│   ├── App.js          # entire app: dashboard, outreach, analytics, AI calls
│   ├── aws-config.js   # Cognito user pool config (public client IDs)
│   └── ...
├── docs/               # one-pager, architecture, demo script, ethics & accessibility
├── public/
└── README.md
```

## License

MIT
