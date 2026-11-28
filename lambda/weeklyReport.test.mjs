// Run with: node --test lambda/
import test from "node:test";
import assert from "node:assert/strict";
import { isoWeekId, buildWeeklyReport, weeklyReportSubject, renderWeeklyReportHtml, renderWeeklyReportText, processWeeklyReports } from "./weeklyReport.mjs";

const NOW = new Date("2026-11-30T13:00:00Z"); // Monday 8am New York
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const member = (id, name, value, risk, ai) => ({ rawMemberId: id, profile: { id, name, value, risk, score: 50 }, aiResult: ai });
const memberItems = [
  member("m_1", "Dana Ruiz", 149, "medium", { riskLevel: "high", score: 88, reason: "Skipped her usual Tue and Thu classes two weeks running." }),
  member("m_2", "Sam <Lee>", 99, "high", null),
  member("m_3", "Ari Cole", 129, "medium", { riskLevel: "medium", score: 52, reason: "Visits down from 3 to 1 a week." }),
  member("m_4", "Low Risk", 89, "low", null),
  member("5", "Sample Member", 999, "high", null), // demo id: never counted
];
const outreachItems = [
  { type: "outreach", memberId: "m_9", memberName: "Pat Kim", value: 120, status: "recovered", updatedAt: daysAgo(2) },
  { type: "outreach", memberId: "m_8", memberName: "Old Win", value: 300, status: "recovered", updatedAt: daysAgo(10) },
  { type: "outreach", memberId: "m_2", memberName: "Sam <Lee>", value: 99, status: "sent", savedAt: daysAgo(1) },
  { type: "sendlog", at: daysAgo(1) }, { type: "sendlog", at: daysAgo(3) }, { type: "sendlog", at: daysAgo(9) },
  { type: "conversation", memberId: "m_2", turns: [
    { role: "studio", text: "hi", at: daysAgo(1) },
    { role: "member", via: "sms", text: "busy lately", at: daysAgo(0.5) },
  ] },
  { type: "conversation", memberId: "m_9", handledAt: daysAgo(1), turns: [
    { role: "member", via: "sms", text: "back next week", at: daysAgo(2) },
    { role: "member", via: "sms", text: "thanks", at: daysAgo(1.5) },
  ] },
  { type: "followup", status: "scheduled", dueAt: new Date(NOW.getTime() + 86400000).toISOString() },
];

test("isoWeekId", () => {
  assert.equal(isoWeekId(new Date("2026-11-30T13:00:00Z")), "2026-W49");
  assert.equal(isoWeekId(new Date("2027-01-01T00:00:00Z")), "2026-W53");
});

test("builds the week's numbers for one gym", () => {
  const r = buildWeeklyReport({ memberItems, outreachItems, now: NOW, timezone: "America/New_York" });
  assert.equal(r.rosterSize, 4);                 // demo id excluded
  assert.equal(r.highCount, 2);                  // AI moved Dana to high; Sam high by roster
  assert.equal(r.revenueAtRisk, 149 + 99);
  assert.equal(r.mediumCount, 1);
  assert.equal(r.wonBack, 1);                    // the 10-day-old win is outside the week
  assert.equal(r.savedMonthly, 120);
  assert.equal(r.savedAnnual, 1440);
  assert.equal(r.textsSent, 2);
  assert.equal(r.replies, 3);
  assert.equal(r.membersReplied, 2);
  assert.equal(r.waiting, 1);                    // m_9's thread was handled after its last reply
  assert.equal(r.followupsDue, 1);
  // Sam was already contacted, so the list is Dana (high) then Ari (medium).
  assert.deepEqual(r.toContact.map(m => m.name), ["Dana Ruiz", "Ari Cole"]);
  assert.equal(r.rangeLabel, "Nov 23 to Nov 30");
});

test("a gym with no roster and no activity gets no email", () => {
  assert.equal(buildWeeklyReport({ memberItems: [], outreachItems: [], now: NOW }), null);
});

test("subject leads with money saved, then money at risk", () => {
  const r = buildWeeklyReport({ memberItems, outreachItems, now: NOW });
  assert.match(weeklyReportSubject(r), /won back \$1,440 a year/);
  assert.match(weeklyReportSubject({ ...r, savedMonthly: 0 }), /\$248\/mo is at risk/);
});

test("html escapes member names and links to the dashboard", () => {
  const r = buildWeeklyReport({ memberItems, outreachItems, now: NOW });
  r.toContact.push({ name: "<script>x</script>", score: 90, value: 10, risk: "high", reason: "" });
  r.gymName = "Iron & Oak";
  const html = renderWeeklyReportHtml(r, { dashboardUrl: "https://example.test/app" });
  assert.ok(html.includes("for Iron &amp; Oak"));
  assert.ok(!html.includes("<script>x"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('href="https://example.test/app"'));
  assert.ok(html.includes("$248"));
  const text = renderWeeklyReportText(r, { dashboardUrl: "https://example.test/app" });
  assert.match(text, /Texts sent: 2/);
});

test("weekly run: skips gyms that opted out, have no email or were already sent; sends once", async () => {
  const sent = [];
  const claimed = new Set();
  const gyms = [
    { tenantId: "a", reportEmail: "a@x.test" },
    { tenantId: "b", reportEmail: "b@x.test", weeklyReport: false },
    { tenantId: "c" },
    { tenantId: "d", reportEmail: "d@x.test", lastReportWeek: "2026-W49" },
    { tenantId: "e", reportEmail: "e@x.test" }, // empty gym
  ];
  const deps = {
    loadGymData: async (t) => t === "a" ? { memberItems, outreachItems } : { memberItems: [], outreachItems: [] },
    claimWeek: async (g, w) => { const k = g.tenantId + w; if (claimed.has(k)) return false; claimed.add(k); return true; },
    releaseWeek: async () => {},
    sendEmail: async (m) => { sent.push(m); },
  };
  const s = await processWeeklyReports(gyms, NOW, deps);
  assert.deepEqual(s, { weekId: "2026-W49", sent: 1, skippedOff: 1, skippedNoEmail: 1, skippedEmpty: 1, alreadySent: 1, failed: 0 });
  assert.equal(sent[0].to, "a@x.test");
  // A second run in the same week doesn't email again.
  const again = await processWeeklyReports(gyms, NOW, deps);
  assert.equal(again.sent, 0);
});

test("weekly run: a failed send frees the week so a retry can try again", async () => {
  let released = false;
  const s = await processWeeklyReports([{ tenantId: "a", reportEmail: "a@x.test" }], NOW, {
    loadGymData: async () => ({ memberItems, outreachItems }),
    claimWeek: async () => true,
    releaseWeek: async () => { released = true; },
    sendEmail: async () => { throw new Error("Email address is not verified"); },
  });
  assert.equal(s.failed, 1);
  assert.equal(released, true);
});
