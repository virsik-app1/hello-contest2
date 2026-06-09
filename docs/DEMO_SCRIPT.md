# PulseRetain — 5–10 Minute Demo Script

A tight, rehearsable walkthrough for judging day. Timings are guides. The golden rule: **show the AI doing real work live.**

---

## Before you start (setup checklist)

- [ ] Live URL open and logged in **already** in one tab: https://main.d2yk3ai4m6puu9.amplifyapp.com
- [ ] Marketing site open in a second tab: https://main.deghc4fxl89sq.amplifyapp.com
- [ ] Run the AI analysis on one or two members **right before** the demo so you have results to fall back on if the network is slow — but keep at least one high-risk member *un-analyzed* so you can show the AI running live.
- [ ] **SMS note:** Twilio is on a trial, which can only text *verified* numbers. For a guaranteed live text, temporarily set one member's `phone` to your own verified number. Otherwise, demo the flow with **"Log Only (no SMS)"** — it shows the full pipeline without depending on Twilio's trial limits. Decide which before you present.
- [ ] Close noisy tabs/notifications. Zoom the browser to ~110% so judges can read it.

---

## The script

### 1. The hook (45 sec)
> "Most gyms lose members without ever seeing it coming. About two-thirds of members who quit never complain — they just quietly stop showing up, and staff don't notice for over a week. And it costs five times more to replace a member than to keep one. PulseRetain is an AI that catches those members *before* they're gone."

*(Optional: show the marketing site's hero for one beat, then switch to the app.)*

### 2. The dashboard (1 min)
Show the **Member Retention Dashboard**.
> "Every member is scored for churn risk from real behavioral signals — how long since their last visit, their usual schedule, tenure, missed payments, upcoming bookings. Red means they're slipping."

Point to the **stat cards** (recovered, revenue saved, messages sent, response rate, at-risk count) and the **Risk Monitor** table. Use the **filter pills** to jump to "High" risk.

### 3. The AI, live (2–2.5 min) — *the centerpiece*
Pick a high-risk member you have **not** analyzed yet. Click **Analyze** (or **Run AI Analysis**).
> "This is calling Claude live, right now."

When it returns, walk through the three outputs:
- **AI Risk Assessment** — the one-sentence reason.
- **AI Score** + recommended **offer** (e.g., free class credit).
- **Follow-up timing.**

Then read the **Claude-Generated SMS** aloud:
> "And here's the part that saves the owner's time — Claude wrote a personalized text for *this specific member*, under 160 characters, ready to send."

### 4. Taking action (1.5 min)
Click **Send SMS Now** (if using a verified number) *or* **Log Only**.
> "One click sends the text and logs the outreach."

Switch to the **Outreach** tab. Show the logged message, then mark it **Responded → Recovered**.
> "The owner tracks what actually worked. Watch the dashboard update."

### 5. The payoff (1 min)
Open the **Analytics** tab.
> "Everything rolls up into dollars: revenue at risk, revenue saved, and how effective the outreach has been. That's the ROI an owner can see immediately."

### 6. Under the hood + lessons (1 min)
> "It's fully serverless on AWS — React on Amplify, Cognito for real login, a single Lambda that's the only thing holding any API keys, DynamoDB for persistence, Claude Haiku for the intelligence, Twilio for the texts.
>
> The biggest thing I learned: 'works on my laptop' isn't 'deployed' — Amplify only ships what's pushed to GitHub, so `git push` is the real publish button. And keeping every secret server-side in the Lambda is what makes it safe to open-source."

### 7. Close (15 sec)
> "PulseRetain turns data a gym already has into retention revenue it's currently losing — automatically. Happy to take questions."

---

## If something breaks (recovery lines)

- **AI call is slow/fails:** "Let me show you one I ran a moment ago" → click an already-analyzed member. (This is why you pre-analyze one.)
- **SMS fails:** "On the trial, Twilio only texts verified numbers, so I'll show the log-and-track flow instead" → use Log Only. This is a *feature* talking point, not an apology.
- **Anything else:** stay on the Dashboard and Analytics — they're the strongest, most reliable screens.

## Likely judge questions — quick answers
- *"Is the AI real or scripted?"* Real — it's a live Claude call; that's why analyzing takes a second.
- *"Where's the API key?"* Server-side in the Lambda; never in the browser or the repo.
- *"Where does member data come from?"* A realistic synthetic roster for the demo; the pipeline is built to plug into a gym system like Mindbody.
- *"What would you build next?"* Live Mindbody sync, automatic scheduled re-scoring, and email as a second channel via SES.
