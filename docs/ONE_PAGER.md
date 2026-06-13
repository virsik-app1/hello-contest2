# PulseRetain — One-Page Summary

**The AI retention concierge for fitness studios — predict who's leaving, win them back, and handle the conversation.**
Student: Carter Virsik · AI Vibe Coding Competition · Target industry: SIC 7997
Live app: https://main.d2yk3ai4m6puu9.amplifyapp.com (behind login) · Repo: https://github.com/virsik-app1/hello-contest2

---

### The problem

Gyms and boutique studios bleed revenue through *silent churn*. Research on membership businesses suggests about two-thirds of members who cancel never complain or give notice — they just quietly stop showing up, and staff often don't notice for over a week. Because winning a new member costs roughly 5× more than keeping one, every member who fades out unnoticed is avoidable lost revenue.

### The solution

PulseRetain runs a full retention loop — **predict → personalize → converse → learn:**

- **Predict.** It scores every member's churn risk from behavioral signals (visit recency, schedule, tenure, missed payments, bookings) and opens like a to-do list — the few members to win back *today*, ranked by revenue at risk.
- **Personalize.** Claude writes each at-risk member a win-back text tuned to their situation — with a suggested offer and follow-up timing.
- **Converse.** When a member replies ("it's gotten too expensive"), Claude drafts the studio's response — warm, on-brand, offering a *pause* instead of a discount war. The owner taps send. **No competitor handles the reply.**
- **Learn.** A **Retention Strategist** turns the data into business insight ("new members are leaking," "your weekend slot is bleeding," "F45 is your top threat") with a fix for each, and a **Competitive Intelligence** view shows where members go — learned from consent-based conversation, never location tracking.

Owners can import their real roster by CSV, and the whole thing is an **installable mobile app** (add to home screen, full-screen, stays logged in).

### How AI is used

The intelligence is **Anthropic Claude — Haiku 4.5** (`claude-haiku-4-5-20251001`), routed through a secure AWS Lambda so no API key is ever exposed in the browser. The core `analyze` call performs **three AI tasks at once** — prediction (risk score), explanation (a one-sentence reason), and generation (a personalized SMS + offer + follow-up window) — returning strict JSON that drives the UI. A second `draft_reply` call uses a server-side system prompt (a fixed offer menu, an objection playbook, and a crisis-safety branch) to hold the two-way conversation and to extract *why* members leave. Haiku was chosen for sub-second responses and negligible per-member cost.

### Why it's different

Emarsys is a $1,500–$10,000+/month enterprise marketing cloud built for Fortune-1000 retailers — not studios. The fitness churn tools (Keepme, Glofox, Gleantap, 1club) all *predict and fire a templated, one-way campaign.* A scoring model can rank a member; only a frontier LLM can **write a unique message, hold the reply, and explain the root cause.** PulseRetain is the studio-native, conversational, pay-when-it-works alternative.

### Key technical choices

- **Single secure Lambda "proxy"** — the React frontend only knows a Lambda URL; Claude and Twilio credentials live server-side, out of the browser and out of the public repo.
- **Structured-JSON prompting**, parsed defensively, so AI output is reliable enough to drive the UI.
- **Serverless on AWS** — Amplify (hosting + CI/CD), Cognito (auth), Lambda, DynamoDB, SES — plus Twilio for SMS, to keep running costs near zero.
- **Installable PWA** — one codebase that works on the web and installs to a phone's home screen.

### What was learned

- **"Works on my laptop" is not "deployed."** Amplify ships only what reaches GitHub's `main`; `git push` is the real publish button.
- **Config bugs fail silently.** A one-letter key mismatch (`logId` vs the table's `logID`) meant data quietly never saved — a reminder to verify reads *and* writes, not just that an API returns success.
- **Secrets discipline matters** — keeping keys server-side in the Lambda is what makes the project safe to open-source.
- **Verify, don't assume** — inspecting live network traffic, not trusting that a feature "should" work, repeatedly revealed the true state of the app.

### Success criteria (and status)

1. Predict a churn-risk score for every member — **done (live, via Claude).**
2. Generate a personalized, ready-to-send win-back message — **done.**
3. **Hold the two-way conversation** — draft the reply to a member's response — **done (the differentiator).**
4. Explain *why* members leave and what to fix — **done (Retention Strategist + Competitive Intelligence).**
5. Run on a real roster, on a phone, behind real auth — **done (CSV import, installable PWA, Cognito).**
