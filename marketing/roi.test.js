// Run with: node --test marketing/
const test = require("node:test");
const assert = require("node:assert");
const { calculate, planFor } = require("./roi.js");

test("monthly and yearly loss from churn", () => {
  const r = calculate({ members: 400, dues: 80, churnPct: 4, savePct: 20 });
  assert.strictEqual(r.lostMembers, 16);
  assert.strictEqual(r.lostMonthly, 1280);
  assert.strictEqual(r.lostYearly, 15360);
  assert.strictEqual(r.savedMembers, 3.2);
  assert.strictEqual(r.savedMonthly, 256);
});

test("picks the smallest plan that fits and nets it out", () => {
  const r = calculate({ members: 400, dues: 80, churnPct: 4, savePct: 20 });
  assert.strictEqual(r.plan.id, "growth");
  assert.strictEqual(r.netMonthly, 256 - 199);
  assert.strictEqual(r.breakEvenMembers, 3);
});

test("plan boundaries", () => {
  assert.strictEqual(planFor(300).id, "starter");
  assert.strictEqual(planFor(301).id, "growth");
  assert.strictEqual(planFor(1000).id, "growth");
  assert.strictEqual(planFor(5000).id, "pro");
  assert.strictEqual(planFor(5001), null);
});

test("large rosters have no list price", () => {
  const r = calculate({ members: 8000, dues: 60, churnPct: 3, savePct: 20 });
  assert.strictEqual(r.plan, null);
  assert.strictEqual(r.netMonthly, null);
  assert.strictEqual(r.breakEvenMembers, null);
});

test("bad input is clamped, never NaN", () => {
  const r = calculate({ members: "abc", dues: -5, churnPct: 250, savePct: "" });
  assert.strictEqual(r.members, 0);
  assert.strictEqual(r.lostMonthly, 0);
  assert.ok(Number.isFinite(r.lostYearly));
  assert.strictEqual(r.breakEvenMembers, null);
});
