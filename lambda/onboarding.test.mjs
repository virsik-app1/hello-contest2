import test from "node:test";
import assert from "node:assert/strict";
import { cleanGymProfile, buildProfileUpdate, profileFromItem } from "./onboarding.mjs";

test("cleanGymProfile accepts a full profile", () => {
  const { profile, errors } = cleanGymProfile({ gymName: "  Iron  Works <b>Gym</b> ", avgPrice: "$89.50", timezone: "America/Denver" });
  assert.deepEqual(errors, []);
  assert.deepEqual(profile, { gymName: "Iron Works bGym/b", avgPrice: 90, timezone: "America/Denver" });
});

test("cleanGymProfile reports each bad field", () => {
  const { profile, errors } = cleanGymProfile({ gymName: "   ", avgPrice: "free", timezone: "Mars/Base" });
  assert.deepEqual(profile, {});
  assert.equal(errors.length, 3);
  assert.equal(cleanGymProfile({ avgPrice: 0 }).errors.length, 1);
  assert.equal(cleanGymProfile({ avgPrice: 5000 }).errors.length, 1);
});

test("cleanGymProfile only returns fields that were sent", () => {
  assert.deepEqual(cleanGymProfile({ avgPrice: 120 }), { profile: { avgPrice: 120 }, errors: [] });
  assert.deepEqual(cleanGymProfile({}), { profile: {}, errors: [] });
  assert.equal(cleanGymProfile({ gymName: "x".repeat(200) }).profile.gymName.length, 80);
});

test("buildProfileUpdate sets fields and completion once", () => {
  const u = buildProfileUpdate("t1", { gymName: "Pulse", avgPrice: 99 }, { complete: true, now: "2026-11-26T00:00:00Z" });
  assert.match(u.UpdateExpression, /#gymName = :gymName/);
  assert.match(u.UpdateExpression, /#ob = if_not_exists\(#ob, :ob\)/);
  assert.equal(u.ExpressionAttributeValues[":sk"], false);
  assert.equal(u.ExpressionAttributeValues[":tid"], "t1");
  const s = buildProfileUpdate("t1", {}, { skipped: true });
  assert.equal(s.ExpressionAttributeValues[":sk"], true);
  const plain = buildProfileUpdate("t1", { avgPrice: 50 });
  assert.doesNotMatch(plain.UpdateExpression, /onboarded|#ob/);
});

test("profileFromItem fills blanks", () => {
  assert.deepEqual(profileFromItem(undefined), { gymName: null, avgPrice: null, onboardedAt: null, onboardingSkipped: false });
  assert.deepEqual(profileFromItem({ gymName: "A", avgPrice: 80, onboardedAt: "x", onboardingSkipped: true }), { gymName: "A", avgPrice: 80, onboardedAt: "x", onboardingSkipped: true });
});
