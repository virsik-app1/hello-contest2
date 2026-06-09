# PulseRetain — One-Page Summary

**AI-powered member churn prediction & automated retention outreach for fitness studios**
Student: Carter Virsik · AI Vibe Coding Competition · Target industry: SIC 7997
Live app: https://main.d2yk3ai4m6puu9.amplifyapp.com (behind login) · Repo: https://github.com/virsik-app1/hello-contest2

---

### The problem

Gyms and boutique studios bleed revenue through *silent churn*. About two-thirds of members who cancel never complain or give notice — they just quietly stop showing up, and staff typically don't notice for over a week. Because winning a new member costs roughly 5× more than keeping one, every member who fades out unnoticed is avoidable lost revenue. Owners have dashboards full of data but no system that watches for the early warning signs and acts on them.

### The solution

PulseRetain is a member-intelligence platform that turns raw membership data into retention action. For every member it predicts a churn-risk score, explains the risk in one sentence, and — for at-risk members — has Claude write a personalized win-back text matched to that member's history. The owner can send the message by SMS in one click, log it, and track whether the member responded and came back. A live analytics view rolls this up into revenue-at-risk and revenue-saved figures, so the tool's value is visible in dollars.

### How AI is used

The intelligence is a single call to **Claude (`claude-haiku-4-5`)**, routed through a secure AWS Lambda so no API key is ever exposed in the browser. Each member's behavioral signals — last visit, usual schedule, tenure, missed payments, upcoming bookings, current risk score — are sent to Claude, which returns a strict JSON object containing a risk level and score, a one-sentence churn reason, a personalized SMS under 160 characters, a recommended follow-up window, and a suggested retention offer. One call therefore performs three AI tasks at once: **prediction, explanation, and generation.** Haiku was chosen for sub-second responses and negligible cost at studio scale.

### Key technical choices

- **Single secure Lambda "proxy"** — the React frontend only knows a Lambda URL; Claude and Twilio credentials live server-side. This keeps secrets out of the browser and out of the public GitHub repo.
- **Structured-JSON prompting** — Claude is instructed to return raw JSON only, which is parsed defensively, making the AI output reliable enough to drive UI.
- **Serverless on AWS Free Tier** — Amplify (hosting + CI/CD from GitHub), Cognito (auth), Lambda, DynamoDB, SES, plus Twilio for SMS — chosen to keep running costs near zero while staying production-shaped.
- **Cognito for real auth** — hashed passwords, tokens, password reset, and enforced login, rather than a cosmetic gate.

### What was learned

- **"Works on my laptop" is not "deployed."** The biggest lesson was that Amplify deploys only what reaches GitHub's `main` branch — local progress that was never pushed left the public site showing an empty shell. Continuous deployment makes `git push` the real "publish" button.
- **Secrets discipline matters and is easy to get wrong.** Keeping the Claude/Twilio keys server-side in the Lambda (never in the frontend or in `.env` committed to a public repo) is what makes the project safe to open-source.
- **The browser and the cloud must agree.** A deployed frontend calling a backend introduces CORS and configuration concerns that simply don't exist on localhost.
- **Verify, don't assume.** Checking the live network traffic — rather than trusting that a feature "should" work — was what revealed the real state of the app.

### Success criteria (and status)

1. Predict a churn-risk score for every member — **done (live, via Claude).**
2. Generate a personalized, ready-to-send message for each at-risk member — **done.**
3. One-click outreach with persistent logging and outcome tracking — **done (DynamoDB).**
4. Quantify impact in dollars (revenue at risk / saved) — **done (Analytics tab).**
5. Publicly accessible, behind real authentication — **done (Amplify + Cognito).**
