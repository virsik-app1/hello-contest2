import { parseCSV, mapRowsToMembers, parseMembersCSV, scoreMember, SAMPLE_GYM_CSV } from "./importMembers";

// Fixed "now" so date math is deterministic: 2026-06-12T00:00:00Z
const NOW = Date.parse("2026-06-12T00:00:00Z");

describe("parseCSV", () => {
  test("handles quoted fields with embedded commas and escaped quotes", () => {
    const rows = parseCSV('Name,Plan\n"Doe, Jane","Unlimited ""Pro"""\nTom,Pack');
    expect(rows[1]).toEqual(["Doe, Jane", 'Unlimited "Pro"']);
    expect(rows[2]).toEqual(["Tom", "Pack"]);
  });
  test("skips fully blank lines", () => {
    expect(parseCSV("Name\nA\n\n\nB").length).toBe(3);
  });
});

describe("scoreMember", () => {
  test("recent + booked ahead → low risk", () => {
    const r = scoreMember({ daysSince: 1, classesBooked: 5, joinedMonths: 20 });
    expect(r.risk).toBe("low");
  });
  test("long absence + missed payment → high risk", () => {
    const r = scoreMember({ daysSince: 12, missedPayments: 2, classesBooked: 0, joinedMonths: 10 });
    expect(r.score).toBeGreaterThanOrEqual(68);
    expect(r.risk).toBe("high");
  });
  test("brand-new member gets an early-life bump", () => {
    const newer = scoreMember({ daysSince: 5, joinedMonths: 1 }).score;
    const older = scoreMember({ daysSince: 5, joinedMonths: 24 }).score;
    expect(newer).toBeGreaterThan(older);
  });
});

describe("mapRowsToMembers", () => {
  const csv =
    "Member Name,Email,Mobile,Membership,Monthly Value,Last Check-in,Member Since,Failed Payments,Upcoming Bookings,Schedule\n" +
    "Jamie Rivera,jamie@x.com,(704) 555-0101,Unlimited Monthly,$79.00,2026-06-10,2024-09-15,0,3,Mon & Wed\n" +
    "Alex Chen,alex@x.com,,10-Class Pack,49,2026-05-23,2025-11-01,2,0,Weekends\n";

  test("auto-detects aliased columns and maps fields", () => {
    const ms = mapRowsToMembers(parseCSV(csv), NOW);
    expect(ms).toHaveLength(2);
    expect(ms[0].name).toBe("Jamie Rivera");
    expect(ms[0].initials).toBe("JR");
    expect(ms[0].email).toBe("jamie@x.com");
    expect(ms[0].plan).toBe("Unlimited Monthly");
    expect(ms[0].value).toBe(79);          // "$79.00" → 79
    expect(ms[0].lastVisit).toBe("2 days ago"); // Jun 10 vs Jun 12
  });

  test("computes risk: lapsed + missed payments → higher than active member", () => {
    const ms = mapRowsToMembers(parseCSV(csv), NOW);
    const jamie = ms.find(m => m.name === "Jamie Rivera"); // recent, booked ahead
    const alex  = ms.find(m => m.name === "Alex Chen");    // 20 days, 2 missed, 0 booked
    expect(alex.score).toBeGreaterThan(jamie.score);
    expect(alex.risk).toBe("high");
  });

  test("falls back to sensible defaults for sparse files", () => {
    const ms = parseMembersCSV("Name\nSolo Member\n", NOW);
    expect(ms[0]).toMatchObject({ name: "Solo Member", plan: "Membership", value: 0, missedPayments: 0 });
    expect(ms[0].lastVisit).toBe("Unknown");
  });

  test("combines first/last name columns and skips nameless rows", () => {
    const ms = parseMembersCSV("First Name,Last Name,Plan\nSam,Lee,Monthly\n,,Monthly\n", NOW);
    expect(ms).toHaveLength(1);
    expect(ms[0].name).toBe("Sam Lee");
  });

  test("ids are sequential starting at 1", () => {
    const ms = mapRowsToMembers(parseCSV(csv), NOW);
    expect(ms.map(m => m.id)).toEqual([1, 2]);
  });
});

describe("SAMPLE_GYM_CSV (the built-in demo roster)", () => {
  const ms = parseMembersCSV(SAMPLE_GYM_CSV, NOW);
  test("parses to 20 members", () => {
    expect(ms).toHaveLength(20);
  });
  test("has a realistic risk spread (some high, some low)", () => {
    const high = ms.filter(m => m.risk === "high").length;
    const low = ms.filter(m => m.risk === "low").length;
    expect(high).toBeGreaterThanOrEqual(4);
    expect(low).toBeGreaterThanOrEqual(4);
  });
  test("every member has a name, plan, value, and score", () => {
    expect(ms.every(m => m.name && m.plan && m.value > 0 && Number.isFinite(m.score))).toBe(true);
  });
});
