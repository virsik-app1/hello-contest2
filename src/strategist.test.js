import { computeInsights } from "./strategist";

const M = (over) => ({
  id: Math.random(), name: "Test Member", plan: "Unlimited Monthly", value: 100,
  risk: "low", joinedMonths: 24, classesBooked: 3, usualVisits: "Mon & Wed", ...over,
});

describe("computeInsights", () => {
  test("healthy roster → no findings", () => {
    const r = computeInsights([M({ risk: "low" }), M({ risk: "low" })]);
    expect(r.atRisk).toBe(0);
    expect(r.findings).toHaveLength(0);
  });

  test("revenue at risk sums high-risk members and is the top finding", () => {
    const r = computeInsights([
      M({ name: "Rich Riskey", risk: "high", value: 159 }),
      M({ name: "Mid Risk", risk: "high", value: 89 }),
      M({ risk: "low", value: 100 }),
    ]);
    expect(r.atRisk).toBe(2);
    expect(r.revenueAtRisk).toBe(248);
    expect(r.projectedAnnual).toBe(248 * 12);
    expect(r.findings[0].id).toBe("revenue"); // high severity, sorted first
  });

  test("flags onboarding leak when new members are disproportionately high-risk", () => {
    const roster = [
      M({ joinedMonths: 1, risk: "high" }),
      M({ joinedMonths: 2, risk: "high" }),
      M({ joinedMonths: 3, risk: "low" }),
      M({ joinedMonths: 30, risk: "low" }),
    ];
    const ids = computeInsights(roster).findings.map(f => f.id);
    expect(ids).toContain("onboarding");
  });

  test("flags zero-booking signal", () => {
    const roster = [
      M({ risk: "high", classesBooked: 0 }),
      M({ risk: "high", classesBooked: 0 }),
      M({ risk: "low", classesBooked: 4 }),
    ];
    expect(computeInsights(roster).findings.map(f => f.id)).toContain("booking");
  });

  test("flags the leakiest plan", () => {
    const roster = [
      ...Array.from({ length: 4 }, () => M({ plan: "8-Class Pack", risk: "high", classesBooked: 1 })),
      ...Array.from({ length: 4 }, () => M({ plan: "Unlimited Monthly", risk: "low" })),
    ];
    const plan = computeInsights(roster).findings.find(f => f.id === "plan");
    expect(plan).toBeTruthy();
    expect(plan.title).toContain("8-Class Pack");
  });

  test("uses AI riskLevel over baseline when present", () => {
    const roster = [M({ id: 7, risk: "low", value: 159 })];
    const r = computeInsights(roster, { aiResults: { 7: { riskLevel: "high" } } });
    expect(r.atRisk).toBe(1);
    expect(r.revenueAtRisk).toBe(159);
  });

  test("surfaces competitive intel (top reason + competitor)", () => {
    const intel = {
      total: 3,
      reasons: { competitor: 2, cost: 1, time: 0, injury: 0, moving: 0, other: 0 },
      competitors: [{ name: "F45", members: 2, monthlyValue: 318 }],
    };
    const ids = computeInsights([M({ risk: "low" })], { intel }).findings.map(f => f.id);
    expect(ids).toContain("reason");
    expect(ids).toContain("competitor");
  });

  test("celebrates recoveries", () => {
    const r = computeInsights([M({ risk: "low" })], { outreachLog: [{ status: "recovered", value: 159 }] });
    const win = r.findings.find(f => f.id === "wins");
    expect(win).toBeTruthy();
    expect(win.severity).toBe("good");
  });
});
