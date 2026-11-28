import { shouldShowOnboarding, wantsSignUp, validateProfileForm, applyDefaultPrice, rosterSummary, setupTimeZones } from "./gymSetup";
import { parseMembersCSV, SAMPLE_GYM_CSV } from "./importMembers";

describe("gymSetup", () => {
  test("onboarding shows only for brand-new gyms", () => {
    const fresh = { onboardedAt: null };
    expect(shouldShowOnboarding({ profile: fresh, hasSavedRoster: false, hasOutreach: false })).toBe(true);
    expect(shouldShowOnboarding({ profile: fresh, hasSavedRoster: true, hasOutreach: false })).toBe(false);
    expect(shouldShowOnboarding({ profile: fresh, hasSavedRoster: false, hasOutreach: true })).toBe(false);
    expect(shouldShowOnboarding({ profile: { onboardedAt: "2026-11-26" }, hasSavedRoster: false, hasOutreach: false })).toBe(false);
    expect(shouldShowOnboarding({ profile: null, hasSavedRoster: false, hasOutreach: false })).toBe(false);
  });

  test("signup links", () => {
    expect(wantsSignUp({ search: "?signup", hash: "" })).toBe(true);
    expect(wantsSignUp({ search: "?ref=site&signup=1", hash: "" })).toBe(true);
    expect(wantsSignUp({ search: "", hash: "#signup" })).toBe(true);
    expect(wantsSignUp({ search: "", hash: "#demo" })).toBe(false);
    expect(wantsSignUp({ search: "", hash: "" })).toBe(false);
  });

  test("profile form validation", () => {
    expect(validateProfileForm({ gymName: "Pulse", avgPrice: "$89", timezone: "America/Chicago" }).errors).toEqual({});
    expect(validateProfileForm({ gymName: "Pulse", avgPrice: "$89", timezone: "America/Chicago" }).profile.avgPrice).toBe(89);
    const bad = validateProfileForm({ gymName: " ", avgPrice: "", timezone: "" }).errors;
    expect(Object.keys(bad).sort()).toEqual(["avgPrice", "gymName", "timezone"]);
    expect(validateProfileForm({ gymName: "x", avgPrice: "9000", timezone: "UTC" }).errors.avgPrice).toMatch(/too high/);
  });

  test("average price fills members without a price", () => {
    const { members, filled } = applyDefaultPrice([{ value: 0 }, { value: 120 }, { value: undefined }], 89);
    expect(members.map(m => m.value)).toEqual([89, 120, 89]);
    expect(filled).toBe(2);
    expect(applyDefaultPrice([{ value: 0 }], null).filled).toBe(0);
  });

  test("roster summary from the sample gym", () => {
    const list = parseMembersCSV(SAMPLE_GYM_CSV, Date.parse("2026-06-10T12:00:00Z"));
    const s = rosterSummary(list);
    expect(s.total).toBe(list.length);
    expect(s.atRisk).toBe(list.filter(m => m.risk === "high").length);
    expect(s.revenueAtRisk).toBe(list.filter(m => m.risk === "high").reduce((a, m) => a + m.value, 0));
    expect(s.projectedAnnual).toBe(s.revenueAtRisk * 12);
    expect(s.top.length).toBeLessThanOrEqual(3);
    s.top.forEach(m => expect(m.risk).toBe("high"));
  });

  test("roster summary hints at missing columns", () => {
    const s = rosterSummary(parseMembersCSV("Name\nAna\nBo", Date.now()));
    expect(s.hints.join(" ")).toMatch(/no last-visit dates/);
    expect(s.hints.join(" ")).toMatch(/No phone numbers/);
    expect(rosterSummary([]).hints).toEqual([]);
  });

  test("time zones put the owner's zone first", () => {
    expect(setupTimeZones("Asia/Tokyo")[0]).toBe("Asia/Tokyo");
    expect(setupTimeZones("America/Chicago").filter(z => z === "America/Chicago").length).toBe(1);
  });
});
