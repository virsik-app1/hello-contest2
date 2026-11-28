// Churn ROI math for the marketing site. Pure functions, no DOM, so the same
// file runs in the browser (window.PulseROI) and in `node --test`.
(function (root) {
  "use strict";

  // Same tiers as the in-app billing page (lambda/billing.mjs). Prices are
  // the suggested launch prices; keep them in step with the Stripe Prices.
  var PLANS = [
    { id: "starter", name: "Starter",    maxMembers: 300,  price: 99 },
    { id: "growth",  name: "Growth",     maxMembers: 1000, price: 199 },
    { id: "pro",     name: "Studio Pro", maxMembers: 5000, price: 349 },
  ];

  function num(v, min, max) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  // Smallest plan that fits the roster, or null above 5,000 members.
  function planFor(members) {
    for (var i = 0; i < PLANS.length; i++) {
      if (members <= PLANS[i].maxMembers) return PLANS[i];
    }
    return null;
  }

  // members: active members; dues: average monthly dues ($);
  // churnPct: share of members who cancel each month (%);
  // savePct: share of those cancellations you expect to keep (%).
  function calculate(input) {
    var members  = Math.round(num(input.members, 0, 100000));
    var dues     = num(input.dues, 0, 10000);
    var churnPct = num(input.churnPct, 0, 100);
    var savePct  = num(input.savePct, 0, 100);

    var lostMembers   = members * churnPct / 100;           // cancellations per month
    var lostMonthly   = lostMembers * dues;                 // dues that stop each month
    var lostYearly    = lostMonthly * 12;                   // one month's cancellations, over a year
    var savedMembers  = lostMembers * savePct / 100;
    var savedMonthly  = savedMembers * dues;
    var plan          = planFor(members);
    var planCost      = plan ? plan.price : null;
    var netMonthly    = planCost == null ? null : savedMonthly - planCost;
    // Members you need to keep each month to cover the plan.
    var breakEven     = planCost == null || dues <= 0 ? null : Math.ceil(planCost / dues);

    return {
      members: members,
      lostMembers: lostMembers,
      lostMonthly: lostMonthly,
      lostYearly: lostYearly,
      savedMembers: savedMembers,
      savedMonthly: savedMonthly,
      plan: plan,
      planCost: planCost,
      netMonthly: netMonthly,
      breakEvenMembers: breakEven,
    };
  }

  var api = { PLANS: PLANS, planFor: planFor, calculate: calculate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PulseROI = api;
})(typeof window !== "undefined" ? window : this);
