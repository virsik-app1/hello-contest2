# Billing with Stripe

## What it does

- **Free trial, no card.** A gym's 14-day trial (`TRIAL_DAYS`) starts the first time the app asks
  for its billing status. The dashboard shows a yellow banner in the last 7 days and a red one once
  the trial ends, a payment fails, or a subscription is cancelled. Nothing is locked yet; see
  "Not in this version".
- **Plans by member count** (`lambda/billing.mjs` → `TIERS`):

  | Plan       | Members    | Suggested price (to confirm) | Lambda env var         |
  |------------|------------|------------------------------|------------------------|
  | Starter    | up to 300  | $99 / month                  | `STRIPE_PRICE_STARTER` |
  | Growth     | up to 1,000| $199 / month                 | `STRIPE_PRICE_GROWTH`  |
  | Studio Pro | up to 5,000| $349 / month                 | `STRIPE_PRICE_PRO`     |

  The real amounts come from the Stripe Prices, so changing a price only needs Stripe, not code.
  The page marks the smallest plan that fits the roster, and plans the gym has outgrown can't be picked.
- **Billing page** (header → Billing): current status, the three plans, and **Manage billing**
  (Stripe Customer Portal: change card, see invoices, switch plan, cancel).
- **Checkout** is Stripe-hosted. Subscribing during the trial keeps the remaining trial days:
  the first charge happens when the trial would have ended.
- **Webhook**: Stripe posts to the same Lambda Function URL. The Lambda checks the
  `Stripe-Signature` header and keeps a `billing#<gym>` item in `pulseretain-outreach` up to date
  (status, plan, renewal date). Out-of-order events can't overwrite newer ones.

New Lambda actions (behind Cognito login): `get_billing`, `create_checkout_session {tier, email?}`,
`create_portal_session`. The webhook needs no login; it is identified by the `Stripe-Signature` header.

## Setup in Stripe test mode (about 15 minutes)

Never paste a Stripe secret key into a chat, an email or the repo. Keys only go into the Lambda's
environment variables.

1. **Test mode.** In the Stripe Dashboard, turn on **Test mode** (toggle at the top right).
2. **Products and prices.** Product catalog → Add product, three times:
   `PulseRetain Starter`, `PulseRetain Growth`, `PulseRetain Studio Pro`, each with a
   **Recurring, Monthly** price in USD. Copy each price id (`price_…`).
3. **Customer Portal.** Settings → Billing → Customer portal → turn on: update payment method,
   invoice history, cancel subscriptions, and switch plans (add the three products). Save.
   The **Manage billing** button fails until this is saved once.
4. **Webhook.** Developers → Webhooks → Add endpoint:
   - URL: `https://duu25rkvvopryctqwaxzleqxg40nbcqf.lambda-url.us-east-1.on.aws/`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `customer.subscription.paused`, `customer.subscription.resumed`
   - After saving, reveal and copy the **Signing secret** (`whsec_…`).
5. **API key.** Developers → API keys → copy the **Secret key** (`sk_test_…`).
   (A restricted key works too, with write access to Customers, Checkout Sessions,
   Customer portal and read access to Prices and Subscriptions.)
6. **Lambda env vars.** AWS console → Lambda → `pulseretain-claude-proxy` → Configuration →
   Environment variables → Edit → add:

   | Key                     | Value                                            |
   |-------------------------|--------------------------------------------------|
   | `STRIPE_SECRET_KEY`     | `sk_test_…` from step 5                          |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 4                            |
   | `STRIPE_PRICE_STARTER`  | `price_…`                                        |
   | `STRIPE_PRICE_GROWTH`   | `price_…`                                        |
   | `STRIPE_PRICE_PRO`      | `price_…`                                        |
   | `APP_URL`               | `https://main.d2yk3ai4m6puu9.amplifyapp.com`     |
   | `TRIAL_DAYS` (optional) | `14`                                             |

   Save. Existing variables (Anthropic, Twilio) stay as they are.
7. **Deploy the code.** Upload `lambda/index.mjs`, `lambda/followups.mjs` **and the new
   `lambda/billing.mjs`** together (index imports both). The frontend deploys itself when the PR
   merges to `main`.

## Testing it

1. Sign in, open **Billing**. The status says Free trial and an orange "test mode" note shows.
2. Choose a plan, pay with card `4242 4242 4242 4242`, any future date, any CVC, any ZIP.
3. You land back on Billing. Within a few seconds the status shows the plan and the first charge
   date. If it still says Free trial, check Stripe → Webhooks → the endpoint's event log (a 400
   there means `STRIPE_WEBHOOK_SECRET` doesn't match).
4. **Manage billing** opens the portal. Cancel there and the page shows the cancel date.
5. Failed payment: card `4000 0000 0000 0341` attaches but fails on charge; use a Stripe test clock
   to move time past the trial and see the red "payment didn't go through" banner.

## Going live

Repeat steps 2–6 with Test mode off (live products, live webhook, `sk_live_…`, live `whsec_…`)
and put the live values in the Lambda env vars. Nothing in the code changes.

## Not in this version

- **No lockout.** An expired trial or unpaid account still works; the banner only nudges.
  Turning on a lock (for example, blocking texts and AI) is a small follow-up once prices are final.
- Member count is checked at checkout only. A gym that grows past its plan isn't moved up
  automatically.
- One subscription per gym login (the Cognito user). Multi-user gyms share the owner's login today.

Tests: `node --test lambda/billing.test.mjs` and `npm test`.
