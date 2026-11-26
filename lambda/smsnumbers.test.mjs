// Run with: node --test lambda/smsnumbers.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseSender, senderIsReady, senderStatus, helpReply, isBlockedByOptOut, optInKeysToClear,
  validAreaCode, validE164US, canStartPurchase, twilioClient, BUY_LOCK_MS,
} from "./smsnumbers.mjs";

const ready = { phoneNumber: "+15125550100", serviceSid: "MG1", a2pRegistered: true, status: "active" };
const pending = { phoneNumber: "+15125550100", serviceSid: "MG1", a2pRegistered: false, status: "pending_registration" };

test("a gym's own number is used only once it's carrier-registered", () => {
  assert.equal(senderIsReady(ready), true);
  assert.equal(senderIsReady(pending), false);
  assert.equal(senderIsReady(null), false);
  assert.deepEqual(chooseSender(ready, "+18005550000"), { from: "+15125550100", serviceSid: "MG1", own: true });
  assert.deepEqual(chooseSender(pending, "+18005550000"), { from: "+18005550000", own: false });
  assert.deepEqual(chooseSender(null, "+18005550000"), { from: "+18005550000", own: false });
  assert.equal(chooseSender(pending, null), null);
});

test("senderStatus explains each state in plain words", () => {
  assert.equal(senderStatus(null, { purchaseEnabled: true, shared: "+1800" }).state, "none");
  assert.equal(senderStatus(null, { purchaseEnabled: true }).canBuy, true);
  assert.equal(senderStatus({ status: "buying" }).state, "buying");
  assert.equal(senderStatus(pending, { shared: "+1800" }).state, "pending_registration");
  assert.match(senderStatus(pending, { shared: "+1800" }).label, /shared/);
  assert.match(senderStatus(pending).label, /starts once/);
  assert.equal(senderStatus(ready).state, "active");
});

test("HELP names the gym and how to stop", () => {
  assert.match(helpReply(null), /Reply STOP/);
  const r = helpReply({ gymName: "Iron Temple", helpContact: "(512) 555-0199" });
  assert.match(r, /^Iron Temple:/);
  assert.match(r, /Questions\? \(512\) 555-0199/);
  assert.match(r, /Reply STOP to unsubscribe/);
  assert.doesNotMatch(helpReply({ gymName: "A\nB" }), /\n/);
});

test("either opt-out record blocks sending", () => {
  assert.equal(isBlockedByOptOut(null, null), false);
  assert.equal(isBlockedByOptOut({ optedOut: true }, null), true);
  assert.equal(isBlockedByOptOut(null, { optedOut: true }), true);
  assert.equal(isBlockedByOptOut({ optedOut: false }, { optedOut: false }), false);
});

test("START to a gym's number clears the global STOP only if it was that gym's", () => {
  assert.deepEqual(optInKeysToClear("gymA", "+15125550123", null), ["optout#gymA#+15125550123"]);
  assert.deepEqual(optInKeysToClear("gymA", "+15125550123", { optedOut: true, tenantId: "gymA" }),
    ["optout#gymA#+15125550123", "optout#+15125550123"]);
  assert.deepEqual(optInKeysToClear("gymA", "+15125550123", { optedOut: true, tenantId: "gymB" }), ["optout#gymA#+15125550123"]);
  assert.deepEqual(optInKeysToClear("gymA", "+15125550123", { optedOut: true }), ["optout#gymA#+15125550123"]);
});

test("input validation", () => {
  assert.equal(validAreaCode("512"), true);
  assert.equal(validAreaCode("112"), false);
  assert.equal(validAreaCode("51"), false);
  assert.equal(validE164US("+15125550100"), true);
  assert.equal(validE164US("+1512555010"), false);
  assert.equal(validE164US("+447700900000"), false);
});

test("one number per gym, and no double purchase", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  assert.equal(canStartPurchase(null, now).ok, true);
  assert.equal(canStartPurchase(pending, now).ok, false);
  assert.equal(canStartPurchase({ status: "buying", buyingAt: new Date(now - 1000).toISOString() }, now).ok, false);
  assert.equal(canStartPurchase({ status: "buying", buyingAt: new Date(now - BUY_LOCK_MS - 1).toISOString() }, now).ok, true);
  assert.equal(canStartPurchase({ status: "none" }, now).ok, true);
});

test("Twilio client sends the right requests", async () => {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({ url, ...opts });
    const json = url.includes("AvailablePhoneNumbers")
      ? { available_phone_numbers: [{ phone_number: "+15125550100", friendly_name: "(512) 555-0100", locality: "Austin", region: "TX" }] }
      : url.endsWith("/Services") ? { sid: "MG123" }
      : url.includes("IncomingPhoneNumbers") ? { sid: "PN123", phone_number: "+15125550100" }
      : url.endsWith("/Services/MG123") ? { sid: "MG123", us_app_to_person_registered: true }
      : {};
    return { ok: true, status: 200, json: async () => json };
  };
  const tw = twilioClient({ accountSid: "AC1", authToken: "tok", fetchFn });

  const found = await tw.searchLocal("512", 5);
  assert.deepEqual(found[0], { phoneNumber: "+15125550100", friendlyName: "(512) 555-0100", locality: "Austin", region: "TX" });
  assert.match(calls[0].url, /AvailablePhoneNumbers\/US\/Local\.json\?AreaCode=512&SmsEnabled=true&PageSize=5$/);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].headers.Authorization, "Basic " + Buffer.from("AC1:tok").toString("base64"));

  assert.equal((await tw.createService("PulseRetain - Iron", "https://hook")).sid, "MG123");
  const svcBody = new URLSearchParams(calls[1].body);
  assert.equal(svcBody.get("InboundRequestUrl"), "https://hook");
  assert.equal(svcBody.get("UseInboundWebhookOnNumber"), "false");

  const bought = await tw.buyNumber("+15125550100", "PulseRetain - Iron", "https://hook");
  assert.deepEqual(bought, { sid: "PN123", phoneNumber: "+15125550100" });
  assert.equal(new URLSearchParams(calls[2].body).get("SmsUrl"), "https://hook");

  await tw.addNumberToService("MG123", "PN123");
  assert.match(calls[3].url, /Services\/MG123\/PhoneNumbers$/);
  assert.equal(new URLSearchParams(calls[3].body).get("PhoneNumberSid"), "PN123");

  assert.deepEqual(await tw.getService("MG123"), { sid: "MG123", a2pRegistered: true });
});

test("Twilio errors carry Twilio's message", async () => {
  const fetchFn = async () => ({ ok: false, status: 400, json: async () => ({ message: "Number not available", code: 21422 }) });
  const tw = twilioClient({ accountSid: "AC1", authToken: "tok", fetchFn });
  await assert.rejects(() => tw.buyNumber("+15125550100", "x", "y"), /Number not available/);
});
