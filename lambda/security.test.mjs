// Run with: node --test lambda/
import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedSmsDestination, cleanLead, cleanOutreachLog, isSafeMemberId, windowKey, clientIp, safeErrorMessage, metricLine } from "./security.mjs";

test("SMS only to valid US/Canada numbers", () => {
  assert.equal(isAllowedSmsDestination("+17045550192"), true);
  assert.equal(isAllowedSmsDestination("+14165551234"), true);   // Toronto
  assert.equal(isAllowedSmsDestination("+447911123456"), false); // UK
  assert.equal(isAllowedSmsDestination("+2348012345678"), false); // premium-fraud style
  assert.equal(isAllowedSmsDestination("+11234567890"), false);  // area code can't start with 1
  assert.equal(isAllowedSmsDestination("+1704055019"), false);   // too short
  assert.equal(isAllowedSmsDestination(null), false);
});

test("cleanLead trims, caps, validates and catches the honeypot", () => {
  const r = cleanLead({ name: "  Dana\r\nX ", email: "dana@gym.com", gym: "g".repeat(500) });
  assert.equal(r.lead.name, "Dana X");
  assert.equal(r.lead.gym.length, 150);
  assert.equal(r.lead.plan, "Demo request");
  assert.ok(cleanLead({ name: "a", email: "not-an-email" }).error);
  assert.ok(cleanLead({}).error);
  assert.deepEqual(cleanLead({ name: "bot", email: "b@b.co", website: "http://spam" }), { spam: true });
});

test("cleanOutreachLog keeps plain fields and drops reserved or nested ones", () => {
  const out = cleanOutreachLog({ id: 1732650000000, memberId: "m_abc", message: "hi", status: "sent", smsSent: true,
    tenantId: "someone-else", logID: "x", nested: { a: 1 }, "bad key": 1 });
  assert.deepEqual(out, { id: 1732650000000, memberId: "m_abc", message: "hi", status: "sent", smsSent: true });
  assert.equal(cleanOutreachLog({ id: "conv-1" }), null);
  assert.equal(cleanOutreachLog({ id: "a#b" }), null);
  assert.equal(cleanOutreachLog(null), null);
  assert.equal(cleanOutreachLog({ id: 1, status: "hacked" }).status, "sent");
  const big = {}; for (let i = 0; i < 20; i++) big["f" + i] = "x".repeat(1000);
  assert.equal(cleanOutreachLog({ id: 1, ...big }), null);
});

test("member ids", () => {
  assert.equal(isSafeMemberId(3), true);
  assert.equal(isSafeMemberId("m_123e4567-e89b"), true);
  assert.equal(isSafeMemberId("mb-99-100"), true);
  assert.equal(isSafeMemberId("a#b"), false);
  assert.equal(isSafeMemberId(""), false);
  assert.equal(isSafeMemberId({}), false);
});

test("rate-limit windows", () => {
  const a = windowKey("tenant", "t1", 60, 120_000);
  const b = windowKey("tenant", "t1", 60, 179_999);
  const c = windowKey("tenant", "t1", 60, 180_000);
  assert.equal(a.key, b.key);
  assert.notEqual(a.key, c.key);
  assert.ok(a.expiresAt > 180);
  assert.equal(clientIp({ requestContext: { http: { sourceIp: "1.2.3.4" } } }), "1.2.3.4");
  assert.equal(clientIp({}), "unknown");
});

test("errors and metrics", () => {
  assert.match(safeErrorMessage("abcdef123456"), /reference abcdef12/);
  assert.doesNotMatch(safeErrorMessage(), /reference/);
  const m = JSON.parse(metricLine("ServerError", 1, 5));
  assert.equal(m.ServerError, 1);
  assert.equal(m._aws.CloudWatchMetrics[0].Namespace, "PulseRetain");
});
