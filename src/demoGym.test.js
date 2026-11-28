import { DEMO_GYM, DEMO_MEMBERS, DEMO_PRESETS, DEMO_REPLY_THREADS, demoOutreachHistory } from "./demoGym";
import { isDemoPhone, buildStats, pickTodaysQueue } from "./retention";

test("the sample studio is a realistic size, across its two locations", () => {
  expect(DEMO_MEMBERS.length).toBe(130);
  const locs = new Set(DEMO_MEMBERS.map((m) => m.location));
  expect([...locs].sort()).toEqual([...DEMO_GYM.locations].sort());
});

test("ids and names are unique", () => {
  expect(new Set(DEMO_MEMBERS.map((m) => m.id)).size).toBe(DEMO_MEMBERS.length);
  expect(new Set(DEMO_MEMBERS.map((m) => m.name)).size).toBe(DEMO_MEMBERS.length);
});

test("no sample member can be texted or emailed for real", () => {
  for (const m of DEMO_MEMBERS) {
    expect(isDemoPhone(m.phone)).toBe(true);
    expect(m.email).toMatch(/@example\.com$/);
  }
  expect(new Set(DEMO_MEMBERS.map((m) => m.phone)).size).toBe(DEMO_MEMBERS.length);
});

test("risk levels follow the score bands: red above 75, yellow 35 to 75, green below 35", () => {
  for (const m of DEMO_MEMBERS) {
    const band = m.score > 75 ? "high" : m.score >= 35 ? "medium" : "low";
    expect([m.name, m.risk]).toEqual([m.name, band]);
  }
  for (const [id, p] of Object.entries(DEMO_PRESETS)) {
    const m = DEMO_MEMBERS.find((x) => x.id === Number(id));
    expect(m).toBeTruthy();
    expect([m.name, p.score, p.riskLevel]).toEqual([m.name, m.score, m.risk]);
    expect(p.message.length).toBeLessThanOrEqual(160);
  }
});

test("revenue at risk and the outreach month tell a believable story", () => {
  const high = DEMO_MEMBERS.filter((m) => m.risk === "high");
  expect(high.reduce((a, m) => a + m.value, 0)).toBe(1638);
  const log = demoOutreachHistory();
  const ids = new Set(DEMO_MEMBERS.map((m) => m.id));
  for (const o of log) expect(ids.has(o.memberId)).toBe(true);
  const stats = Object.fromEntries(buildStats(DEMO_MEMBERS, log).map((s) => [s.label, s.value]));
  expect(stats["Members Recovered"]).toBe("8");
  expect(stats["At-Risk Members"]).toBe("12");
  // The day opens on high-risk members nobody has texted yet.
  const queue = pickTodaysQueue(DEMO_MEMBERS, { outreachLog: log });
  expect(queue.every((m) => m.risk === "high")).toBe(true);
});

test("every texted reply belongs to a member who was texted", () => {
  const texted = new Set(demoOutreachHistory().map((o) => o.memberId));
  for (const t of DEMO_REPLY_THREADS) expect(texted.has(t.memberId)).toBe(true);
});
