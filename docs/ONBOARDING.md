# Self-serve signup and onboarding

A new gym owner can go from the marketing site to seeing their at-risk members in about five minutes, without help.

## Flow

1. **Sign up.** Any link to the app with `?signup` (or `#signup`) opens the Create Account tab of the Cognito sign-in. The demo's "Sign up" buttons now use it. Cognito emails a verification code as before.
2. **Your gym.** Gym name, average monthly membership price, and time zone (defaults to the browser's zone). Saved to the gym's `settings#<tenant>` item.
3. **Your members.** Drag in or choose a CSV export (Mindbody, Glofox, PushPress, ABC, spreadsheet), download a template, or try the sample roster. Members whose file has no price get the gym's average price. The roster is saved through the existing `save_members` route.
4. **Who's at risk.** Revenue at risk per month and per year, how many members are likely to cancel, the top three to contact first, and plain-English hints about missing columns (no phones, no last-visit dates). "Go to my dashboard" lands on Today.

"I'll do this later" skips setup. "Guided setup" in the Add members dialog, or `#setup` in the address, opens it again.

## Who sees it

Only gyms with no `onboardedAt`, no saved members and no outreach history. Existing gyms (including Carter's) never see it. If the Lambda hasn't been redeployed yet, `get_settings` has no `onboardedAt` field and the app doesn't show setup at all.

## Backend

- `lambda/onboarding.mjs` (new, must be zipped beside `index.mjs`): validation and the DynamoDB update for the gym profile. Tests: `node --test lambda/onboarding.test.mjs`.
- `get_settings` now also returns `gymName`, `avgPrice`, `onboardedAt`, `onboardingSkipped`.
- New action `save_gym_profile` `{ profile?: { gymName, avgPrice, timezone }, complete?: true, skipped?: true }` returns the updated settings.
- No new table or IAM permission.

## Billing

Stripe's 14-day trial (PR 7) starts on the first `get_billing` call, which happens when the owner first signs in, so onboarding needs no billing code.
