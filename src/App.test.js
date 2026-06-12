import { buildStats, deriveRisk, isResponse, pickTodaysQueue } from "./retention";

describe("isResponse", () => {
  test("only 'responded' and 'recovered' count as a response", () => {
    expect(isResponse("responded")).toBe(true);
    expect(isResponse("recovered")).toBe(true);
    expect(isResponse("no_response")).toBe(false); // regression guard
    expect(isResponse("sent")).toBe(false);
  });
});

describe("buildStats", () => {
  test("empty log → zeros and 0% response rate", () => {
    const stats = buildStats([], []);
    const byLabel = Object.fromEntries(stats.map(s => [s.label, s.value]));
    expect(byLabel["Members Recovered"]).toBe("0");
    expect(byLabel["Messages Sent"]).toBe("0");
    expect(byLabel["Avg Response Rate"]).toBe("0%");
  });

  test("response rate excludes 'no_response' (the bug we fixed)", () => {
    const log = [
      { status: "sent",        value: 79 },
      { status: "responded",   value: 79 },
      { status: "recovered",   value: 79 },
      { status: "no_response", value: 79 },
    ];
    const byLabel = Object.fromEntries(buildStats([], log).map(s => [s.label, s.value]));
    // 2 of 4 engaged (responded + recovered) → 50%, NOT 75%
    expect(byLabel["Avg Response Rate"]).toBe("50%");
    expect(byLabel["Messages Sent"]).toBe("4");
    expect(byLabel["Members Recovered"]).toBe("1");
    // one recovered member at $79/mo → $948 projected annual
    expect(byLabel["Revenue Saved"]).toBe("$948");
  });

  test("at-risk count reflects high-risk members", () => {
    const members = [{ risk: "high" }, { risk: "high" }, { risk: "low" }];
    const byLabel = Object.fromEntries(buildStats(members, []).map(s => [s.label, s.value]));
    expect(byLabel["At-Risk Members"]).toBe("2");
  });
});

describe("deriveRisk", () => {
  const member = { risk: "medium" };
  test("uses the AI riskLevel when present and valid", () => {
    expect(deriveRisk(member, { riskLevel: "high", score: 85 })).toBe("high");
  });
  test("falls back to baseline risk when AI failed or is missing", () => {
    expect(deriveRisk(member, { error: "boom" })).toBe("medium");
    expect(deriveRisk(member, null)).toBe("medium");
    expect(deriveRisk(member, { riskLevel: "banana" })).toBe("medium");
  });
});

describe("pickTodaysQueue", () => {
  const roster = [
    { id: 1, name: "High Big",   risk: "high",   score: 90, value: 159 },
    { id: 2, name: "High Small", risk: "high",   score: 90, value: 49 },
    { id: 3, name: "Medium",     risk: "medium", score: 55, value: 159 },
    { id: 4, name: "Low",        risk: "low",    score: 10, value: 159 },
  ];

  test("excludes low-risk members", () => {
    const q = pickTodaysQueue(roster, { size: 5 });
    expect(q.find(m => m.id === 4)).toBeUndefined();
  });

  test("ranks high-risk first, then by revenue at risk (score × value)", () => {
    const q = pickTodaysQueue(roster, { size: 3 });
    expect(q.map(m => m.id)).toEqual([1, 2, 3]); // both highs before the medium; bigger $ high first
  });

  test("drops members already contacted or skipped", () => {
    const q = pickTodaysQueue(roster, {
      size: 3,
      outreachLog: [{ memberId: 1, status: "sent" }],
      dismissed: new Set([2]),
    });
    expect(q.map(m => m.id)).toEqual([3]); // 1 contacted, 2 skipped, 4 low → only the medium remains
  });

  test("honors the size cap", () => {
    expect(pickTodaysQueue(roster, { size: 1 })).toHaveLength(1);
  });

  test("respects an AI upgrade from medium to high in ranking", () => {
    const q = pickTodaysQueue(roster, { size: 4, aiResults: { 3: { riskLevel: "high", score: 95 } } });
    expect(q.map(m => m.id)).toContain(3);
  });
});
