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

test("the replies inbox opens with three waiting replies, each with a sensible draft", async () => {
  const { demoInbox, demoMarkReplyHandled } = await import("./demo");
  let threads = await demoInbox();
  const waiting = threads.filter((t) => t.needsReply);
  expect(waiting.map((t) => t.memberName).sort()).toEqual(["Derek Huang", "Jasmine Patel", "Olivia Bennett"]);
  const byName = Object.fromEntries(threads.map((t) => [t.memberName, t]));
  expect(byName["Jasmine Patel"].draft.suggestedOffer).toBe("pause_membership");
  expect(byName["Jasmine Patel"].draft.competitor).toBe("YMCA");
  expect(byName["Derek Huang"].draft.departureReason).toBe("injury");
  expect(byName["Olivia Bennett"].draft.departureReason).toBe("time");
  expect(byName["Marcus Reid"].needsReply).toBe(false);
  // Re-drafting the same member text must not duplicate it in the thread.
  const jasmine = byName["Jasmine Patel"];
  const before = demoGetConversation(121).length;
  await demoDraftReply({ id: 121, name: "Jasmine Patel" }, jasmine.turns[jasmine.turns.length - 1].text);
  expect(demoGetConversation(121).length).toBe(before);
  await new Promise((r) => setTimeout(r, 5));
  demoMarkReplyHandled("121");
  threads = await demoInbox();
  expect(threads.find((t) => t.memberId === "121").needsReply).toBe(false);
});
