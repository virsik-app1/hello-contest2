import { billingBanner, statusSummary, formatPrice, DEMO_BILLING } from "./Billing";

describe("billingBanner", () => {
  const base = { status: "trial", trialDaysLeft: 10, trialDays: 14, tiers: [] };
  test("quiet early in the trial and in the demo", () => {
    expect(billingBanner(base)).toBeNull();
    expect(billingBanner(DEMO_BILLING)).toBeNull();
    expect(billingBanner(null)).toBeNull();
  });
  test("yellow nudge in the last week of the trial", () => {
    const b = billingBanner({ ...base, trialDaysLeft: 1 });
    expect(b.tone).toBe("mid");
    expect(b.text).toBe("Your free trial ends in 1 day.");
  });
  test("red when the trial ended or a payment failed", () => {
    expect(billingBanner({ ...base, status: "trial_ended" }).tone).toBe("bad");
    expect(billingBanner({ ...base, status: "past_due" }).action).toBe("portal");
  });
});

describe("statusSummary", () => {
  test("subscribed during the trial shows the first charge date", () => {
    const s = statusSummary({ status: "active", stripeStatus: "trialing", stripeTrialEnd: "2026-12-10T12:00:00Z", tier: "growth", tiers: [{ id: "growth", name: "Growth" }] });
    expect(s.title).toBe("Growth plan");
    expect(s.detail).toMatch(/first charge is on Dec 10, 2026/);
  });
});

describe("formatPrice", () => {
  test("uses the Stripe price when present, else the suggestion", () => {
    expect(formatPrice({ price: { amount: 199, currency: "USD", interval: "month" } })).toEqual({ main: "$199", unit: "/ month", suggested: false });
    expect(formatPrice({ price: null, suggestedMonthly: 99 }).suggested).toBe(true);
  });
});
