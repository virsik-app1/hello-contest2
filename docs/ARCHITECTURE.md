# PulseRetain — Architecture & Data Model

This document explains how PulseRetain is built and how data moves through it. It is written to be readable by a non-specialist while still being technically precise.

## High-level picture

PulseRetain is a **serverless web application**. There is no traditional always-on server to manage; every moving part is a managed AWS service that scales to zero when idle (which keeps it inside the AWS Free Tier).

```
                          THE BROWSER                              THE CLOUD (AWS, us-east-1)
┌──────────────────────────────────────────┐      ┌──────────────────────────────────────────────┐
│  React single-page app (Create React App) │      │                                                │
│  hosted on AWS Amplify                     │      │   AWS Lambda Function URL                      │
│                                            │ HTTPS│   "pulseretain-claude-proxy"                   │
│   • Cognito login screen (Amplify UI)      │ ────►│   one endpoint, routed by an "action" field    │
│   • Dashboard  · Outreach  · Analytics     │ POST │                                                │
│                                            │      │     action=analyze    ──►  Anthropic Claude    │
│   Holds NO secret keys —                   │      │     action=send_sms   ──►  Twilio              │
│   only the public Lambda URL               │      │     action=load_data  ──►  DynamoDB (read)     │
│                                            │      │     action=save_outreach ─► DynamoDB (write)   │
│                                            │      │     action=update_outreach_status ─► DynamoDB  │
└──────────────────────────────────────────┘      └──────────────────────────────────────────────┘
                                                          │            │              │
                                                    ┌─────▼───┐  ┌─────▼────┐  ┌──────▼───────┐
                                                    │ Claude  │  │  Twilio  │  │  DynamoDB     │
                                                    │ (Haiku) │  │   SMS    │  │  3 tables     │
                                                    └─────────┘  └──────────┘  └──────────────┘
```

A **second, separate** Amplify app hosts the public marketing site (`pulseretain-landing`), whose demo-request form writes leads into DynamoDB through the same Lambda.

## Why a single Lambda "proxy"?

The most important design decision is that **the browser never holds a secret**. A naive build would put the Claude API key in the frontend, where anyone could read it from the page source and run up the bill. Instead:

- The React app only knows one public address: the Lambda Function URL.
- The Lambda holds the Claude key and Twilio credentials in its server-side environment.
- The browser asks the Lambda to "please analyze this member" or "please send this text"; the Lambda does the privileged work and returns only the result.

This is the difference between handing someone your house key versus asking the doorman to let them in.

## Components

| Component | Service | Role |
|-----------|---------|------|
| Web hosting + CI/CD | **AWS Amplify** | Serves the React build; auto-deploys on every push to GitHub `main`. |
| Authentication | **AWS Cognito** | User pool `us-east-1_aQyubZnZS`. Handles sign-up, login, hashed passwords, tokens, password reset. Rendered by the Amplify Authenticator component. |
| API / backend | **AWS Lambda (Function URL)** | Single endpoint, routed by `action`. The only thing that talks to Claude, Twilio, and DynamoDB. |
| AI | **Anthropic Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) | Churn scoring + reasoning + message generation in one call; conversational reply drafting. |
| SMS | **Twilio** | Delivers the generated win-back text. |
| Email | **AWS SES** | Email notifications / lead handling. |
| Database | **Amazon DynamoDB** | Persists AI results, outreach logs, and marketing leads. |

## Request flows

**1. Analyze a member (the core AI feature)**

```
User clicks "Analyze" / "Run AI Analysis"
   → frontend POSTs {action:"analyze", member signals} to the Lambda
      → Lambda calls Claude with a structured-JSON prompt
         → Claude returns {riskLevel, score, reason, message, followUpDays, offerType}
      → Lambda returns the JSON to the browser
   → UI renders the risk score, the reason, and the generated SMS
```

**2. Send / log outreach**

```
User clicks "Send SMS Now"
   → POST {action:"send_sms", to, message} → Lambda → Twilio → confirmation
   → outreach is logged: POST {action:"save_outreach", log} → DynamoDB
Later, the owner marks the outcome:
   → POST {action:"update_outreach_status", logId, status} → DynamoDB
```

**3. Reload state**

```
On app load → POST {action:"load_data"} → Lambda reads DynamoDB
   → restores previously generated AI results and the full outreach log
```

## Data model

### Member (frontend roster)

The demo uses a realistic synthetic roster of 10 members. Each member record:

| Field | Example | Notes |
|-------|---------|-------|
| `id` | 1 | Stable key |
| `name` | "Sarah Reynolds" | PII |
| `plan` | "Unlimited Monthly" | |
| `lastVisit` | "9 days ago" | Churn signal |
| `usualVisits` | "Tue & Thu" | Churn signal |
| `risk` / `score` | "high" / 91 | Baseline before AI re-scores |
| `value` | 79 | $/month — drives revenue math |
| `email` / `phone` | synthetic | PII |
| `joinedMonths` | 14 | Tenure signal |
| `missedPayments` | 0 | Churn signal |
| `classesBooked` | 2 | Forward-engagement signal |

### DynamoDB tables (`us-east-1`)

**`pulseretain-members`** — saved AI analysis
`memberId (key), aiResult { riskLevel, score, reason, message, followUpDays, offerType }`

**`pulseretain-outreach`** — outreach log
`logId (key), memberId, memberName, plan, value, message, sentAt, status, followUpDays`
`status ∈ { sent, responded, recovered, no_response }`

**`pulseretain-leads`** — marketing demo requests
`name, email, gym/studio, member-count` (captured from the landing page)

### PII & security posture

- Member name/email/phone are PII. They travel only browser → Lambda over HTTPS for the purpose of generating and sending a message; they are not placed in URLs or client-side logs.
- All third-party credentials are server-side in the Lambda environment.
- Authentication is enforced by Cognito; the app content is gated behind login.
- `.env` is git-ignored; no secrets exist in the repository or its history.

## Notable design trade-offs

- **Haiku over a larger model:** speed and cost win at studio scale; the task (short structured output) doesn't need a frontier model.
- **One Lambda, many actions:** simpler to deploy and reason about than many micro-endpoints, at the cost of a small internal router.
- **Synthetic member roster:** lets the AI, persistence, and SMS pipeline be demonstrated end-to-end without integrating a live gym-management API (e.g., Mindbody) during the build window.
