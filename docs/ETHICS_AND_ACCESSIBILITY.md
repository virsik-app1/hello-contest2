# PulseRetain — Ethical AI, Accessibility & Cross-Disciplinary Design

*Addressing the competition's bonus criteria (up to 5 points): exceptional ethical AI considerations, accessibility features, and cross-disciplinary application.*

PulseRetain makes predictions about real people and then reaches out to them. That responsibility shaped the design from the start — the goal was a tool that *earns* members back, not one that manipulates or surveils them.

## 1. Ethical AI

**A human sends every message — the AI never acts alone.** PulseRetain *recommends*: a risk score, a plain-language reason, and a drafted text. A staff member reads it and taps send. Nothing reaches a member without a person's judgment in the loop, so a human stays accountable for every word.

**We chose consent over surveillance.** A judge suggested geofencing — tracking members' phone locations to detect when they visit a competitor gym. We deliberately rejected it. PulseRetain's Competitive Intelligence is built **only** from what members voluntarily say in conversation ("I'm switching to F45"), never from location tracking. We picked the harder, more private path on purpose — the single clearest ethical decision in the project.

**No dark patterns.** The AI is instructed to offer something *fair* — a membership pause, a class credit, a check-in — not false urgency, guilt, or a discount war. When a member says "it's too expensive," the system drafts a *pause*, respecting that some people genuinely should leave.

**Safety guardrails on the conversation.** The reply agent runs a server-side safety branch: it will not improvise around sensitive disclosures (a crisis, a minor, a medical issue) and is hardened against prompt-injection, so a hostile message can't hijack the studio's AI.

**It judges behavior, not identity.** The model is never given age, gender, race, or any protected attribute — only engagement signals (visit recency, schedule, tenure, missed payments, bookings). Because behavioral signals can still correlate with protected attributes, the visible reasoning and human-in-the-loop act as a check, and a real deployment would add periodic review of who gets flagged to watch for skew.

**Privacy by default.** Only the signals needed for the task are used; names, emails, and phone numbers go solely to a secure backend for the narrow purpose of writing and delivering one message — never placed in URLs, never logged client-side, never embedded in the public frontend. All third-party credentials live server-side.

**Honest representation.** The demo uses a clearly synthetic member roster; the project does not claim to use real customer data it does not have.

## 2. Accessibility

The app was reviewed against common accessibility needs, and the following were implemented or hardened:

- **Screen-reader support** — icon-only and ambiguous controls (modal close, filter pills) carry `aria-label`s; the member detail dialog uses `role="dialog"` / `aria-modal`; status confirmations ("Outreach logged") announce through a polite live region.
- **Keyboard operable** — dialogs close with **Escape**; controls are real buttons with real text ("Analyze", "Send SMS Now", "Sign out"), not icons alone.
- **Color is not the only signal** — risk shows a text label ("High Risk", "Safe") alongside color, so it's distinguishable without color vision; dark-navy-on-light and white-on-color meet legibility expectations.
- **Works everywhere** — a responsive, installable PWA that reflows with `auto-fit` and runs full-screen from a phone's home screen, so a busy front-desk owner can use it one-handed.

(See `CHANGELOG_ENHANCEMENTS.md` for the specific accessibility code changes.)

## 3. Cross-Disciplinary Application

PulseRetain sits deliberately at the intersection of **AI, management, finance, and small-business survival:**

- **Management & retention economics** — it operationalizes the core insight that retention is ~5× cheaper than acquisition into a daily to-do list, with revenue-at-risk and revenue-saved shown in real dollars an owner cares about.
- **Behavioral science** — churn risk is inferred from routine disruption and forward commitment (engagement recency, schedule, tenure, bookings), and outreach is *timed* with a follow-up cadence rather than blasted.
- **Computer science / cloud engineering** — a secure serverless architecture (Cognito, Lambda, DynamoDB, Amplify) with disciplined secret management.
- **Applied AI** — a single LLM call performs prediction, explanation, and natural-language generation together, with structured output engineered for reliability; a second call holds the two-way conversation.
- **Social good** — independent studios run on thin margins; a tool that recovers even a few members a month can be the difference between a local gym staying open or closing.

The result is not "an AI demo" but a small, plausible product a real studio owner in SIC 7997 could adopt — built to be **fair, transparent, and humane** by design.
