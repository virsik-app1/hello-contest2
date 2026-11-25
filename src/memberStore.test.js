import { isStableId, newMemberId, withStableIds, normalizeMemberId, restoreResults } from "./memberStore";

describe("memberStore", () => {
  test("new ids are stable-format and unique", () => {
    const a = newMemberId(), b = newMemberId();
    expect(isStableId(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  test("numeric sample ids are not stable ids; Mindbody ids are", () => {
    expect(isStableId(1)).toBe(false);
    expect(isStableId("1")).toBe(false);
    expect(isStableId("mb-123-456")).toBe(true);
  });

  test("withStableIds replaces 1,2,3 but keeps existing stable ids", () => {
    const out = withStableIds([{ id: 1, name: "A" }, { id: "m_keep", name: "B" }]);
    expect(isStableId(out[0].id)).toBe(true);
    expect(out[1].id).toBe("m_keep");
  });

  test("normalizeMemberId", () => {
    expect(normalizeMemberId("3")).toBe(3);
    expect(normalizeMemberId("m_x")).toBe("m_x");
  });

  test("restoreResults ignores results for members not on the roster (e.g. legacy 1,2,3)", () => {
    const members = [{ id: "m_a" }];
    const res = restoreResults([
      { memberId: "m_a", aiResult: { score: 80 } },
      { memberId: "1", aiResult: { score: 10 } },
    ], members);
    expect(res).toEqual({ m_a: { score: 80 } });
  });
});
