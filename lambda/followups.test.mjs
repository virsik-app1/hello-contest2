// Run with: node --test lambda/
import test from "node:test";
import assert from "node:assert/strict";
import { isValidTimeZone, isQuietHoursIn, computeDueAt, clampFollowUpDays, defaultFollowUpText, memberRepliedSince, processDueFollowups } from "./followups.mjs";

test("isValidTimeZone", () => {
  assert.equal(isValidTimeZone("America/Chicago"), true);
  assert.equal(isValidTimeZone("Mars/Olympus"), false);
  assert.equal(isValidTimeZone(""), false);
  assert.equal(isValidTimeZone(null), false);
});

test("quiet hours follow each gym's own zone", () => {
  const t = new Date("2026-11-25T13:30:00Z"); // 8:30 NY, 5:30 LA
  assert.equal(isQuietHoursIn(t, "America/New_York"), false);
  assert.equal(isQuietHoursIn(t, "America/Los_Angeles"), true);
  const late = new Date("2026-11-26T03:30:00Z"); // 22:30 NY, 19:30 LA
  assert.equal(isQuietHoursIn(late, "America/New_York"), true);
  assert.equal(isQuietHoursIn(late, "America/Los_Angeles"), false);
  assert.equal(isQuietHoursIn(t, "bogus"), false); // falls back to New York
});

test("computeDueAt lands at 10am local N days later", () => {
  const now = new Date("2026-11-25T18:00:00Z");
  assert.equal(computeDueAt(now, 3, "America/New_York").toISOString(), "2026-11-28T15:00:00.000Z");
  assert.equal(computeDueAt(now, 3, "America/Los_Angeles").toISOString(), "2026-11-28T18:00:00.000Z");
  // Late evening in LA is already the next day in UTC; the local date counts.
  const laEvening = new Date("2026-11-26T06:30:00Z"); // Nov 25, 22:30 LA
  assert.equal(computeDueAt(laEvening, 1, "America/Los_Angeles").toISOString(), "2026-11-26T18:00:00.000Z");
  // Month rollover and DST start (Mar 8 2026 in the US).
  assert.equal(computeDueAt(new Date("2026-03-06T15:00:00Z"), 3, "America/New_York").toISOString(), "2026-03-09T14:00:00.000Z");
});

test("clampFollowUpDays", () => {
  assert.equal(clampFollowUpDays(0), 1);
  assert.equal(clampFollowUpDays(99), 30);
  assert.equal(clampFollowUpDays("x"), 3);
  assert.equal(clampFollowUpDays(4.4), 4);
});

test("defaultFollowUpText uses the first name and fits one segment", () => {
  const t = defaultFollowUpText("Sarah Reynolds");
  assert.match(t, /^Hi Sarah,/);
  assert.ok(t.length <= 160);
});

test("memberRepliedSince", () => {
  const turns = [{ role: "studio", at: "2026-11-25T10:00:00Z" }, { role: "member", at: "2026-11-24T10:00:00Z" }];
  assert.equal(memberRepliedSince(turns, "2026-11-25T00:00:00Z"), false);
  turns.push({ role: "member", at: "2026-11-26T09:00:00Z" });
  assert.equal(memberRepliedSince(turns, "2026-11-25T00:00:00Z"), true);
});

function fakeDeps(over = {}) {
  const calls = { sent: [], cancelled: [], finished: [], released: [], logs: [] };
  const deps = {
    getTimeZone: async () => "America/New_York",
    isOptedOut: async () => false,
    getConversationTurns: async () => [],
    cancel: async (item, reason) => calls.cancelled.push([item.memberId, reason]),
    claim: async () => true,
    release: async (item, f) => calls.released.push([item.memberId, f]),
    finish: async (item, status, f) => calls.finished.push([item.memberId, status, f]),
    consumeQuota: async () => true,
    isFirstContact: async () => false,
    sendSMS: async (phone, text) => { calls.sent.push([phone, text]); return { sid: "SM1" }; },
    markContacted: async () => {},
    logSend: async (...a) => calls.logs.push(a),
    quietStart: 8, quietEnd: 21, enforceQuietHours: true,
    optOutFooter: "Reply STOP to opt out.", maxChars: 480,
    ...over,
  };
  return { deps, calls };
}
const noonNY = new Date("2026-11-28T17:00:00Z");
const item = (over = {}) => ({ type: "followup", status: "scheduled", tenantId: "t1", memberId: "7", phone: "+17045550000",
  message: "Hi Sam, checking in!", scheduledAt: "2026-11-25T18:00:00Z", dueAt: "2026-11-28T15:00:00.000Z", ...over });

test("sends a due follow-up and records it", async () => {
  const { deps, calls } = fakeDeps();
  const s = await processDueFollowups([item()], noonNY, deps);
  assert.deepEqual(s, { due: 1, sent: 1, cancelled: 0, deferred: 0, failed: 0 });
  assert.equal(calls.sent[0][1], "Hi Sam, checking in!");
  assert.equal(calls.finished[0][1], "sent");
  assert.equal(calls.logs[0][3].followup, true);
});

test("skips items that are not due yet", async () => {
  const { deps, calls } = fakeDeps();
  const s = await processDueFollowups([item({ dueAt: "2026-11-29T15:00:00.000Z" })], noonNY, deps);
  assert.equal(s.due, 0); assert.equal(calls.sent.length, 0);
});

test("opted-out member is cancelled, never texted", async () => {
  const { deps, calls } = fakeDeps({ isOptedOut: async () => true });
  await processDueFollowups([item()], noonNY, deps);
  assert.equal(calls.sent.length, 0);
  assert.deepEqual(calls.cancelled[0], ["7", "opted_out"]);
});

test("member who replied since scheduling is cancelled", async () => {
  const { deps, calls } = fakeDeps({ getConversationTurns: async () => [{ role: "member", at: "2026-11-26T12:00:00Z" }] });
  await processDueFollowups([item()], noonNY, deps);
  assert.equal(calls.sent.length, 0);
  assert.deepEqual(calls.cancelled[0], ["7", "member_replied"]);
});

test("quiet hours in the gym's zone defer without claiming", async () => {
  let claimed = false;
  const { deps, calls } = fakeDeps({ getTimeZone: async () => "America/Los_Angeles", claim: async () => (claimed = true) });
  const s = await processDueFollowups([item({ dueAt: "2026-11-28T13:00:00.000Z" })], new Date("2026-11-28T14:00:00Z"), deps); // 6am LA
  assert.equal(s.deferred, 1); assert.equal(claimed, false); assert.equal(calls.sent.length, 0);
});

test("already claimed by another run is skipped", async () => {
  const { deps, calls } = fakeDeps({ claim: async () => false });
  await processDueFollowups([item()], noonNY, deps);
  assert.equal(calls.sent.length, 0);
});

test("quota spent hands it back for later", async () => {
  const { deps, calls } = fakeDeps({ consumeQuota: async () => false });
  const s = await processDueFollowups([item()], noonNY, deps);
  assert.equal(s.deferred, 1); assert.equal(calls.sent.length, 0);
  assert.equal(calls.released[0][1].lastDeferReason, "quota");
});

test("first contact gets the STOP footer", async () => {
  const { deps, calls } = fakeDeps({ isFirstContact: async () => true });
  await processDueFollowups([item()], noonNY, deps);
  assert.equal(calls.sent[0][1], "Hi Sam, checking in! Reply STOP to opt out.");
});

test("Twilio failure retries, then fails after 3 attempts", async () => {
  const boom = async () => { throw new Error("twilio down"); };
  let r = fakeDeps({ sendSMS: boom });
  await processDueFollowups([item()], noonNY, r.deps);
  assert.equal(r.calls.released[0][1].attempts, 1);
  r = fakeDeps({ sendSMS: boom });
  const s = await processDueFollowups([item({ attempts: 2 })], noonNY, r.deps);
  assert.equal(s.failed, 1); assert.equal(r.calls.finished[0][1], "failed");
});
