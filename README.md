# PulseRetain

**The AI retention concierge for fitness studios — it spots the members about to quit, writes each one a personal win-back text, handles their reply, and tells the owner what's driving churn.**

Most churn tools stop at a *prediction*. PulseRetain starts there: it generates the outreach, holds the two-way conversation, and turns every reply into competitive and operational intelligence.

🔗 **Live app:** https://main.d2yk3ai4m6puu9.amplifyapp.com (behind login)
🌐 **Marketing site:** https://main.deghc4fxl89sq.amplifyapp.com

> Built for the AI Vibe Coding Competition. Target industry: SIC 7997 (membership sports & recreation clubs).

---

## The problem

Most gyms don't notice a member is slipping until they've already cancelled. Research on membership businesses suggests roughly two-thirds of members who quit do so quietly — no complaint, no notice — and it often takes staff over a week to realize a regular has stopped showing up. By then they're gone, and it costs about **5× more** to win a new member than to keep an existing one.

## What it does

PulseRetain runs a retention loop — **predict → personalize → converse → learn:**

1. **Predict** — scores every member's churn risk from behavioral signals (visit recency, usual schedule, tenure, missed payments, upcoming bookings).
2. **Personalize** — Claude writes each at-risk member a win-back text tuned to their situation (not a template), with a suggested offer and follow-up timing.
3. **Converse** — when a member replies, Claude drafts the studio's response (warm, on-brand, with safety guardrails). The owner taps send. *No competitor handles the reply.*
4. **Learn** — it aggregates *why* and *where* members leave into a **Retention Strategist** (root-cause findings + fixes) and **Competitive Intelligence** (which gyms are pulling members) — consent-based, from conversation, never location tracking.

### Feature highlights

| Area | What it does |
|------|--------------|
| **Dashboard + "Today's Priorities"** | Opens like a to-do list — the 3 members to win back today, ranked by revenue at risk, one tap to send. |
| **AI churn analysis** | Per-member risk score, plain-English reason, generated SMS, offer, follow-up cadence. |
| **Conversational reply agent** | Drafts the studio's reply to a member's text; fixed offer menu + crisis/minors safety + prompt-injection defense, all server-side. |
| **Retention Strategist** | Turns the data into business insight: "new members are leaking," "your weekend slot is bleeding," "F45 is your top threat" — each with a fix. |
| **Competitive Intelligence** | A leaderboard of where members go when they leave, and the revenue at risk to each competitor. |
| **Bring your own data** | Import a real member roster by CSV (auto-detects messy export headers), paste a list, or add members by hand. Parsed in-browser. |
| **Mobile / installable** | A responsive, installable PWA — add to the home screen, full-screen, stays logged in. |
| **Outreach log + analytics** | Tracks sent / responded / recovered / no-reply and rolls it up into revenue-saved figures. |

## How AI is used

The intelligence is **Anthropic Claude — Haiku 4.5** (`claude-haiku-4-5-20251001`), routed through a secure AWS Lambda so no API key ever touches the browser.

- **Churn analysis** (`analyze`): the member's signals go to Claude, which returns strict JSON — one call doing three jobs at once: **prediction** (risk score), **explanation** (the reason), and **generation** (the personalized SMS + offer + follow-up window):

```json
{ "riskLevel": "high", "score": 85, "reason": "One-sentence churn explanation",
  "message": "Personalized SMS under 160 characters", "followUpDays": 3, "offerType": "class_credit" }
```

- **Conversational reply** (`draft_reply`): a server-side system prompt teaches Claude to reply as the studio owner — a fixed offer menu it can't deviate from, an objection playbook, a crisis-safety branch, and defenses against prompt injection. It also extracts the member's stated reason for leaving + any competitor named, which powers the Strategist and Competitive Intelligence views.

Haiku 4.5 was chosen for sub-second responses and negligible per-member cost. **All credentials (Claude, Twilio) live server-side in the Lambda — never in the frontend or this repo.**

## Architecture

```
┌────────────────────┐        ┌──────────────────────────┐
│  React app (CRA)   │  HTTPS │  AWS Lambda Function URL  │
│  on AWS Amplify    │ ─────► │  pulseretain-claude-proxy │
│  • Cognito login   │        │  (single secure API)      │
│  • Dashboard /     │        └─────────────┬────────────┘
│    Strategist /    │            ┌──────────┼───────────┐
│    Outreach /      │            ▼          ▼           ▼
│    Analytics /     │      ┌─────────┐ ┌────────┐ ┌─────────┐
│    Competitors     │      │ Claude  │ │ Twilio │ │DynamoDB │
└────────────────────┘      │ Haiku   │ │  SMS   │ │ 3 tables│
                            └─────────┘ └────────┘ └─────────┘
```

| Layer | Technology |
|-------|-----------|
| Frontend | React (Create React App) + installable PWA, on **AWS Amplify** (CI/CD from GitHub `main`) |
| Auth | **AWS Cognito** via `@aws-amplify/ui-react` (hashed passwords, tokens, password reset; the app is gated behind login) |
| API | A single **AWS Lambda Function URL** — every call routes through it, so no secrets reach the client |
| AI | **Anthropic Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) |
| SMS / Email | **Twilio** (SMS) · **Amazon SES** (lead notifications) |
| Database | **Amazon DynamoDB** (3 tables) |
| Region | `us-east-1` |

The Lambda is a small router keyed on an `action` field:

| Action | Purpose |
|--------|---------|
| `analyze` | Run Claude churn analysis for a member |
| `draft_reply` | Draft the studio's reply to a member's message (the conversational agent) |
| `get_conversation` / `log_reply_sent` | Restore / append a member's reply thread |
| `get_competitive_intel` | Aggregate where/why members leave |
| `send_sms` | Send a win-back text via Twilio |
| `save_outreach` / `update_outreach_status` / `load_data` | Persist and restore outreach logs + saved analyses |
| `submit_lead` | Save a marketing-site demo request + email the owner |

## Data model

**Member** (the demo roster is a realistic synthetic dataset; owners import their own via CSV):
`id, name, plan, lastVisit, usualVisits, risk, score, value ($/mo), email, phone, joinedMonths, missedPayments, classesBooked`

**DynamoDB tables (`us-east-1`, string keys):**
- `pulseretain-members` (`memberId`) — saved AI analyses.
- `pulseretain-outreach` (`logID`) — outreach log + conversation threads (`conv-<memberId>`).
- `pulseretain-leads` (`leadID`) — demo-request leads from the marketing site.

**PII handling:** member name, email, and phone are treated as PII — sent only to the Lambda over HTTPS, never placed in URLs or client-side logs. The demo roster uses synthetic contacts.

## Running locally

```bash
npm install
npm start          # http://localhost:3000
npm run build      # production build (what Amplify deploys)
npm test           # unit tests for the pure logic modules
```

No `.env` is needed to run the frontend — Cognito config is in `src/aws-config.js` and the Lambda URL is in `src/App.js`. Server-side secrets are configured in the Lambda's environment (see `.env.example` for the variable names).

## Deployment

Amplify watches `main`. **Pushing to `main` auto-builds and deploys** (~3–5 min) — no manual upload. The Lambda is deployed separately (its source of truth is `lambda/index.mjs`).

## Security & honesty notes

- **No secrets in the frontend or in git history** — Claude and Twilio credentials live only in the Lambda's server-side environment; `.env` is git-ignored.
- The app is **gated behind Cognito login**.
- The member roster is **synthetic** for the demo; CSV import lets an owner run it on their real members. Live gym-platform integrations (Mindbody / Glofox) are on the roadmap.

## Project structure

```
hello-contest/
├── src/
│   ├── App.js            # dashboard, strategist, outreach, analytics, competitors, AI calls, PWA
│   ├── retention.js      # churn stats, risk derivation, "Today's Priorities" queue (tested)
│   ├── importMembers.js  # CSV parsing + member mapping + risk scoring (tested)
│   ├── strategist.js     # root-cause Retention Strategist engine (tested)
│   ├── aws-config.js     # Cognito user pool config (public client IDs)
│   └── *.test.js         # unit tests
├── lambda/index.mjs      # the secure API (source of truth; deployed to AWS Lambda)
├── public/               # manifest, service worker, branded icons (PWA)
├── docs/                 # one-pager, architecture, demo script, ethics & accessibility
├── sample-gym-roster.csv # 20-member demo roster for CSV import
└── README.md
```

## License

MIT — see [LICENSE](LICENSE).
