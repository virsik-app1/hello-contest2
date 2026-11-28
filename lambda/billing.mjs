// PulseRetain — Stripe billing: plans, free trial, webhook verification.
//
// Pure logic only: no AWS SDK and no Stripe SDK, so it runs under `node --test`
// with no install. index.mjs does the DynamoDB writes and the Stripe API calls.
//
// DEPLOY NOTE: the Lambda now needs lambda/index.mjs, lambda/followups.mjs AND
// this file (lambda/billing.mjs) side by side. See docs/BILLING.md.

import crypto from "crypto";

// ── Plans, priced by how many members the gym has ────────────────────────────
// The real prices live in Stripe (one recurring monthly Price per plan, its id
// in the Lambda env var named below). `suggestedMonthly` is only shown when
// Stripe isn't configured yet, and is a SUGGESTION awaiting Carter's sign-off.
export const TIERS = [
  { id: "starter", name: "Starter",    maxMembers: 300,  priceEnv: "STRIPE_PRICE_STARTER", suggestedMonthly: 99,  blurb: "Single studio, up to 300 members" },
  { id: "growth",  name: "Growth",     maxMembers: 1000, priceEnv: "STRIPE_PRICE_GROWTH",  suggestedMonthly: 199, blurb: "Busy gym, up to 1,000 members" },
  { id: "pro",     name: "Studio Pro", maxMembers: 5000, priceEnv: "STRIPE_PRICE_PRO",     suggestedMonthly: 349, blurb: "Multi-location, up to 5,000 members" },
];

export const DEFAULT_TRIAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export const billingKey  = (tenantId)   => `billing#${tenantId}`;
export const customerKey = (customerId) => `stripecust#${customerId}`;

export const tierById = (id) => TIERS.find(t => t.id === id) || null;

// Smallest plan that fits the roster; the largest plan if the roster is huge.
export function recommendTier(memberCount) {
  const n = Math.max(0, Number(memberCount) || 0);
  return TIERS.find(t => n <= t.maxMembers) || TIERS[TIERS.length - 1];
}

// A plan the gym has already outgrown can't be picked at checkout.
export function tierFits(tier, memberCount) {
  return !!tier && (Number(memberCount) || 0) <= tier.maxMembers;
}

export function priceIdForTier(tierId, env = process.env) {
  const t = tierById(tierId);
  return t ? (env[t.priceEnv] || "").trim() || null : null;
}

export function tierForPrice(priceId, env = process.env) {
  if (!priceId) return null;
  return TIERS.find(t => (env[t.priceEnv] || "").trim() === priceId) || null;
}

// ── Free trial (in the app, no card needed) ──────────────────────────────────
// The trial clock starts the first time the gym opens Billing or the app asks
// for billing status. Subscribing during the trial keeps the remaining days:
// Stripe is told not to charge until the trial would have ended.
export function trialInfo(trialStartedAt, now = new Date(), trialDays = DEFAULT_TRIAL_DAYS) {
  const start = Date.parse(trialStartedAt);
  if (!Number.isFinite(start)) return { trialEndsAt: null, daysLeft: 0, expired: true };
  const endMs = start + trialDays * DAY_MS;
  const left = endMs - now.getTime();
  return {
    trialEndsAt: new Date(endMs).toISOString(),
    daysLeft: left > 0 ? Math.ceil(left / DAY_MS) : 0,
    expired: left <= 0,
  };
}

// Stripe needs trial_end at least 48 hours out; otherwise bill from today.
export function checkoutTrialEnd(trialEndsAt, now = new Date()) {
  const end = Date.parse(trialEndsAt);
  if (!Number.isFinite(end)) return null;
  return end - now.getTime() >= 2 * DAY_MS + 60 * 1000 ? Math.floor(end / 1000) : null;
}

// ── Subscription → what we store per gym ─────────────────────────────────────
const SUB_STATUSES = new Set(["trialing", "active", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]);

export function summarizeSubscription(sub, env = process.env) {
  if (!sub || typeof sub !== "object") return null;
  const item = sub.items?.data?.[0] || {};
  const priceId = item.price?.id || null;
  const tier = tierForPrice(priceId, env);
  // Newer Stripe API versions moved current_period_end onto the item.
  const periodEnd = sub.current_period_end ?? item.current_period_end ?? null;
  return {
    subscriptionId: sub.id || null,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id || null,
    status: SUB_STATUSES.has(sub.status) ? sub.status : "incomplete",
    priceId,
    tier: tier ? tier.id : null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    stripeTrialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
  };
}

// One plain answer for the dashboard: where does this gym stand?
//   trial          free trial, no subscription yet
//   trial_ended    trial over, no subscription
//   active         paying (or subscribed and waiting for the trial to end)
//   past_due       a payment failed; Stripe is retrying
//   canceled       subscription ended
export function billingStatus(item = {}, now = new Date(), trialDays = DEFAULT_TRIAL_DAYS) {
  const s = item.status;
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid" || s === "incomplete") return "past_due";
  if (s === "canceled" || s === "incomplete_expired" || s === "paused") return "canceled";
  return trialInfo(item.trialStartedAt, now, trialDays).expired ? "trial_ended" : "trial";
}

// True when the gym already has a subscription that should be managed in the
// Customer Portal instead of starting a second one through Checkout.
export function hasLiveSubscription(item = {}) {
  return ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(item.status) && !!item.subscriptionId;
}

// ── Stripe webhook signature (Stripe-Signature: t=…,v1=…) ─────────────────────
// HMAC-SHA256 of `${t}.${rawBody}` with the endpoint's signing secret (whsec_…).
// Rejects stale timestamps so a captured request can't be replayed later.
export function verifyStripeSignature(rawBody, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!secret || !header || typeof rawBody !== "string") return false;
  let t = null;
  const v1 = [];
  for (const part of String(header).split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1.push(v);
  }
  const ts = Number(t);
  if (!t || !Number.isFinite(ts) || !v1.length) return false;
  if (Math.abs(now / 1000 - ts) > toleranceSec) return false;
  const expected = Buffer.from(crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex"));
  return v1.some(sig => {
    const b = Buffer.from(sig);
    return b.length === expected.length && crypto.timingSafeEqual(b, expected);
  });
}

// Stripe's API takes form encoding with bracketed nesting: a[b][0][c]=x.
export function stripeForm(obj) {
  const out = [];
  const walk = (val, key) => {
    if (val === undefined || val === null) return;
    if (Array.isArray(val)) val.forEach((v, i) => walk(v, `${key}[${i}]`));
    else if (typeof val === "object") Object.entries(val).forEach(([k, v]) => walk(v, key ? `${key}[${k}]` : k));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
  };
  walk(obj, "");
  return out.join("&");
}

// Where Stripe sends the owner back after Checkout / the portal. APP_URL wins;
// otherwise only the app's own Amplify domain or localhost is trusted, so a
// forged Origin header can't turn Checkout into an open redirect.
export function returnBaseUrl(origin, env = process.env) {
  const fixed = (env.APP_URL || "").trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const o = String(origin || "").replace(/\/+$/, "");
  if (/^https:\/\/[a-z0-9.-]+\.amplifyapp\.com$/i.test(o)) return o;
  if (/^http:\/\/localhost:\d{2,5}$/i.test(o)) return o;
  return null;
}

// Monthly display amount from a Stripe Price object.
export function priceDisplay(price) {
  if (!price || typeof price.unit_amount !== "number") return null;
  const interval = price.recurring?.interval || "month";
  const count = price.recurring?.interval_count || 1;
  return {
    amount: price.unit_amount / 100,
    currency: String(price.currency || "usd").toUpperCase(),
    interval: count === 1 ? interval : `${count} ${interval}s`,
  };
}

export const isEmail = (s) => typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
