# PulseRetain — Ethics, Accessibility & Cross-Disciplinary Notes

This document addresses the competition's bonus criteria (up to 5 points): ethical AI considerations, accessibility, and cross-disciplinary application.

## Ethical AI

PulseRetain makes predictions about people and then contacts them, so it was designed with several guardrails:

**Human in the loop.** The AI never contacts a member on its own. It *recommends* — a score, a reason, and a drafted message — and a staff member decides whether to send. Nothing is automated past the point of human judgment. This keeps a person accountable for every message a member receives.

**Transparency, not a black box.** Every prediction comes with a plain-language reason ("hasn't visited in 9 days and has no upcoming classes booked"). The owner sees *why* a member is flagged, rather than being handed an unexplained number. This makes it possible to catch and override a bad call.

**Data minimization & PII protection.** Only the signals needed for the task are used (visit recency, schedule, tenure, payments, bookings). Personal identifiers (name, email, phone) are sent only to the secure backend for the narrow purpose of generating and delivering a message — never placed in URLs, never logged client-side, never embedded in the public frontend. All credentials are server-side.

**Respectful, non-manipulative outreach.** The prompt asks Claude for a genuinely helpful, personalized win-back message and a *fair* retention offer (a class credit, a guest pass, a trainer intro) — not dark-pattern pressure or false urgency. The goal is to re-engage members who would genuinely benefit, not to trap people who want to leave.

**Avoiding unfair bias.** The model scores behavior, not identity — it is never given protected attributes (age, gender, race, etc.). Because behavioral signals can still correlate with such attributes, the human-in-the-loop and visible reasoning act as a check, and a real deployment would add periodic review of who gets flagged to watch for skew.

**Honest representation.** The demo uses a clearly synthetic member roster; the project does not claim to use real customer data it does not have.

## Accessibility

The app was reviewed against common accessibility needs, and the following were implemented or hardened:

- **Real text on controls.** Buttons say what they do ("Analyze", "Send SMS Now", "Log Only", "Sign out") rather than relying on icons alone.
- **Labels for assistive tech.** Icon-only and ambiguous controls (e.g., the modal close button, filter pills) carry `aria-label`s so screen readers announce their purpose.
- **Keyboard operability.** The member detail dialog can be closed with the **Escape** key, and the dialog is marked up with `role="dialog"`/`aria-modal` so screen readers treat it correctly.
- **Status messages are announced.** Toast notifications use a polite live region so confirmations ("Outreach logged") are read aloud.
- **Color is not the only signal.** Risk is shown with a text label ("High Risk", "Safe") in addition to color, so it's distinguishable without color vision.
- **Readable contrast & sizing.** Dark navy text on light cards and white-on-color buttons meet legibility expectations.
- **Responsive layout.** Card grids and the header reflow with `auto-fit` so the app remains usable on smaller screens.

(See `CHANGELOG_ENHANCEMENTS.md` for the specific accessibility code changes made.)

## Cross-disciplinary application

PulseRetain sits deliberately at the intersection of several fields:

- **Business / marketing:** it operationalizes a core retention-economics insight (retention is ~5× cheaper than acquisition) into a working tool, with revenue-at-risk and revenue-saved framed in dollars an owner cares about.
- **Behavioral science:** churn risk is inferred from behavioral signals (engagement recency, routine disruption, forward commitment), and outreach is timed with a follow-up cadence rather than sent blindly.
- **Computer science / cloud engineering:** a secure serverless architecture (Cognito, Lambda, DynamoDB, Amplify) with disciplined secret management.
- **Applied AI:** a single LLM call performs prediction, explanation, and natural-language generation together, with structured output engineered for reliability.

The result is not "an AI demo" but a small, plausible product a real studio owner in SIC 7997 could adopt.
