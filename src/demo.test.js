import { isDemoMode, demoAnalysisFor, demoDraftReply, demoCompetitiveIntel, demoLogReplySent, demoGetConversation } from "./demo";

test("only #demo opens the no-login demo", () => {
  expect(isDemoMode("#demo")).toBe(true);
  expect(isDemoMode("#/demo")).toBe(true);
  expect(isDemoMode("")).toBe(false);
  expect(isDemoMode("#member-demo")).toBe(false);
  expect(isDemoMode("#demonstration")).toBe(false);
});

test("every member gets a usable analysis", () => {
  expect(demoAnalysisFor({ id: 1, name: "Sarah Reynolds" }).message).toMatch(/Sarah/);
  const g = demoAnalysisFor({ id: 999, name: "Pat Lee", risk: "high", score: 80, lastVisit: "10 days ago" });
  expect(g.riskLevel).toBe("high");
  expect(g.message).toMatch(/Pat/);
});

test("a price + competitor reply offers a pause and feeds the Competitors tab", async () => {
  const before = demoCompetitiveIntel().total;
  const member = { id: 1, name: "Sarah Reynolds", value: 79 };
  const res = await demoDraftReply(member, "Honestly it's gotten too expensive, I'm thinking of switching to Planet Fitness.", "Hi Sarah!");
  expect(res.draft.suggestedOffer).toBe("pause_membership");
  expect(res.draft.competitor).toBe("Planet Fitness");
  expect(res.turns.map(t => t.role)).toEqual(["studio", "member"]);
  const intel = demoCompetitiveIntel();
  expect(intel.total).toBe(before + 1);
  expect(intel.competitors.some(c => c.name === "Planet Fitness")).toBe(true);
  demoLogReplySent(member, "Totally understand");
  expect(demoGetConversation(1)).toHaveLength(3);
});

test("STOP is respected with no offer", async () => {
  const res = await demoDraftReply({ id: 2, name: "Tom Mitchell", value: 49 }, "STOP", "Hey Tom");
  expect(res.draft.suggestedOffer).toBe("none");
  expect(res.draft.escalate).toBe(true);
});

test("the replies inbox shows a texted reply with a draft until it's handled", async () => {
  const { demoInbox, demoMarkReplyHandled } = await import("./demo");
  let threads = await demoInbox();
  const ryan = threads.find((t) => t.memberId === "8");
  expect(ryan.needsReply).toBe(true);
  expect(ryan.draft.suggestedOffer).toBe("pause_membership");
  expect(ryan.draft.competitor).toBe("Planet Fitness");
  // Re-drafting the same member text must not duplicate it in the thread.
  const before = demoGetConversation(8).length;
  await demoDraftReply({ id: 8, name: "Ryan Foster" }, ryan.turns[ryan.turns.length - 1].text);
  expect(demoGetConversation(8).length).toBe(before);
  await new Promise((r) => setTimeout(r, 5));
  demoMarkReplyHandled("8");
  threads = await demoInbox();
  expect(threads.find((t) => t.memberId === "8").needsReply).toBe(false);
});
