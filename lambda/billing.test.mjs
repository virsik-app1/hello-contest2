// Run with: node --test lambda/
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { TIERS, recommendTier, tierFits, priceIdForTier, tierForPrice, trialInfo, checkoutTrialEnd, summarizeSubscription, billingStatus, hasLiveSubscription, verifyStripeSignature, stripeForm, returnBaseUrl, priceDisplay, isEmail } from "./billing.mjs";

const ENV = { STRIPE_PRICE_STARTER: "price_s", STRIPE_PRICE_GROWTH: "price_g", STRIPE_PRICE_PRO: "price_p" };

test("plans are recommended by member count", () => {
  assert.equal(recommendTier(0).id, "starter");
  assert.equal(recommendTier(300).id, "starter");
  assert.equal(recommendTier(301).id, "growth");
  assert.equal(recommendTier(1000).id, "growth");
  assert.equal(recommendTier(4000).id, "pro");
  assert.equal(recommendTier(99999).id, "pro");
  assert.equal(tierFits(TIERS[0], 301), false);
  assert.equal(tierFits(TIERS[1], 301), true);
});

test("price ids map both ways through env vars", () => {
  assert.equal(priceIdForTier("growth", ENV), "price_g");
  assert.equal(priceIdForTier("nope", ENV), null);
  assert.equal(priceIdForTier("growth", {}), null);
  assert.equal(tierForPrice("price_p", ENV).id, "pro");
  assert.equal(tierForPrice("price_x", ENV), null);
});

test("trial counts down and expires", () => {
  const start = "2026-11-01T12:00:00.000Z";
  const t1 = trialInfo(start, new Date("2026-11-02T12:00:00Z"), 14);
  assert.equal(t1.daysLeft, 13);
  assert.equal(t1.expired, false);
  assert.equal(t1.trialEndsAt, "2026-11-15T12:00:00.000Z");
  const t2 = trialInfo(start, new Date("2026-11-15T12:00:01Z"), 14);
  assert.equal(t2.expired, true);
  assert.equal(t2.daysLeft, 0);
  assert.equal(trialInfo(undefined).expired, true);
});

test("checkout keeps remaining trial only when 48h+ remain", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  assert.equal(checkoutTrialEnd("2026-11-15T00:00:00Z", now), Date.parse("2026-11-15T00:00:00Z") / 1000);
  assert.equal(checkoutTrialEnd("2026-11-11T00:00:00Z", now), null);
  assert.equal(checkoutTrialEnd(null, now), null);
});

test("subscription summary handles both API shapes", () => {
  const sub = { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, current_period_end: 1767225600, items: { data: [{ price: { id: "price_g" } }] } };
  const s = summarizeSubscription(sub, ENV);
  assert.equal(s.tier, "growth");
  assert.equal(s.customerId, "cus_1");
  assert.equal(s.currentPeriodEnd, "2026-01-01T00:00:00.000Z");
  const newer = { ...sub, current_period_end: undefined, items: { data: [{ price: { id: "price_s" }, current_period_end: 1767225600 }] } };
  assert.equal(summarizeSubscription(newer, ENV).currentPeriodEnd, "2026-01-01T00:00:00.000Z");
  assert.equal(summarizeSubscription({ ...sub, status: "weird" }, ENV).status, "incomplete");
});

test("billing status reads plainly", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  assert.equal(billingStatus({ trialStartedAt: "2026-11-05T00:00:00Z" }, now), "trial");
  assert.equal(billingStatus({ trialStartedAt: "2026-10-01T00:00:00Z" }, now), "trial_ended");
  assert.equal(billingStatus({ status: "trialing" }, now), "active");
  assert.equal(billingStatus({ status: "active" }, now), "active");
  assert.equal(billingStatus({ status: "past_due" }, now), "past_due");
  assert.equal(billingStatus({ status: "canceled" }, now), "canceled");
  assert.equal(hasLiveSubscription({ status: "active", subscriptionId: "sub_1" }), true);
  assert.equal(hasLiveSubscription({ status: "canceled", subscriptionId: "sub_1" }), false);
});

test("webhook signatures verify, and forged or stale ones fail", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });
  const t = 1_800_000_000;
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const now = t * 1000;
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, { now }), true);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=deadbeef,v1=${sig}`, secret, { now }), true); // secret rotation
  assert.equal(verifyStripeSignature(body + " ", `t=${t},v1=${sig}`, secret, { now }), false);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_other", { now }), false);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, { now: now + 301_000 }), false);
  assert.equal(verifyStripeSignature(body, `v1=${sig}`, secret, { now }), false);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, "", { now }), false);
});

test("stripe form encoding nests with brackets", () => {
  assert.equal(
    stripeForm({ mode: "subscription", line_items: [{ price: "price_1", quantity: 1 }], subscription_data: { metadata: { tenantId: "a b" }, trial_end: undefined } }),
    "mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&subscription_data%5Bmetadata%5D%5BtenantId%5D=a%20b"
  );
});

test("return URLs only go back to the app", () => {
  assert.equal(returnBaseUrl("https://evil.example", { APP_URL: "https://app.pulseretain.com/" }), "https://app.pulseretain.com");
  assert.equal(returnBaseUrl("https://main.d123.amplifyapp.com", {}), "https://main.d123.amplifyapp.com");
  assert.equal(returnBaseUrl("http://localhost:3000", {}), "http://localhost:3000");
  assert.equal(returnBaseUrl("https://evil.example", {}), null);
  assert.equal(returnBaseUrl("https://amplifyapp.com.evil.example", {}), null);
});

test("price display and email check", () => {
  assert.deepEqual(priceDisplay({ unit_amount: 19900, currency: "usd", recurring: { interval: "month", interval_count: 1 } }), { amount: 199, currency: "USD", interval: "month" });
  assert.equal(priceDisplay(null), null);
  assert.equal(isEmail("owner@gym.com"), true);
  assert.equal(isEmail("not-an-email"), false);
});
