// ═══ PER-GYM TEXTING NUMBERS ══════════════════════════════════════════════════
// Each gym gets its own Twilio phone number inside its own Messaging Service.
// The Messaging Service is what an A2P 10DLC campaign attaches to, so once the
// gym's brand + campaign are approved (Twilio console, see docs/SMS_NUMBERS.md)
// texts from that number are carrier-registered and replies identify the gym
// exactly (by the number they were sent to).
//
// This file is pure logic plus a small Twilio REST client that takes `fetch`
// as a parameter, so it is unit-tested without the network (node --test lambda/).
// It must be deployed next to index.mjs.

// DynamoDB keys (all in the existing pulseretain-outreach table).
export const senderKey    = (tenantId) => `smsnumber#${tenantId}`;  // the gym's number + status
export const numberOwnerKey = (e164)   => `smsowner#${e164}`;       // number → gym (inbound lookup)
export const tenantOptOutKey = (tenantId, phone) => `optout#${tenantId}#${phone}`;
export const tenantContactedKey = (tenantId, phone) => `contacted#${tenantId}#${phone}`;
export const tenantRouteKey = (tenantId, phone) => `route#${tenantId}#${phone}`;

// A purchase that crashed half-way leaves status "buying"; after this long a
// new attempt may take over.
export const BUY_LOCK_MS = 5 * 60 * 1000;

// Is the gym's own number allowed to send yet? US carriers block unregistered
// 10DLC traffic, so we only switch a gym onto its number once Twilio reports the
// Messaging Service as A2P registered.
export function senderIsReady(rec) {
  return !!(rec && rec.phoneNumber && rec.serviceSid && rec.a2pRegistered === true && rec.status === "active");
}

// Which number a text goes out from. `shared` is the old single TWILIO_PHONE_NUMBER.
//   → { from, serviceSid?, own: bool } or null when nothing can send.
export function chooseSender(rec, shared) {
  if (senderIsReady(rec)) return { from: rec.phoneNumber, serviceSid: rec.serviceSid, own: true };
  if (shared) return { from: shared, own: false };
  return null;
}

// Plain-English status for the owner's settings card.
export function senderStatus(rec, { purchaseEnabled = false, shared = null } = {}) {
  if (!rec || !rec.phoneNumber) {
    if (rec && rec.status === "buying") return { state: "buying", label: "Setting up your number…" };
    return {
      state: "none",
      label: shared ? "Texts go out from the shared PulseRetain number." : "No texting number yet.",
      canBuy: purchaseEnabled,
    };
  }
  if (senderIsReady(rec)) return { state: "active", label: "Your number is live. Texts and replies use it." };
  return {
    state: "pending_registration",
    label: shared
      ? "Your number is waiting on carrier registration. Until it's approved, texts go out from the shared PulseRetain number."
      : "Your number is waiting on carrier registration. Texting starts once it's approved.",
  };
}

// HELP must name the sender and say how to get help and how to stop (CTIA).
export function helpReply(rec) {
  const name = clip(rec?.gymName, 60);
  const contact = clip(rec?.helpContact, 80);
  if (!name) return "PulseRetain gym messaging. Reply STOP to unsubscribe. Msg&data rates may apply.";
  return `${name}: member messages. ${contact ? `Questions? ${contact}. ` : ""}Reply STOP to unsubscribe. Msg&data rates may apply.`;
}

// Suppression decision from the two opt-out records:
//   global  = optout#<phone>            (STOP sent to the shared number, applies everywhere)
//   tenant  = optout#<tenant>#<phone>   (STOP sent to this gym's own number)
export function isBlockedByOptOut(globalItem, tenantItem) {
  return !!((globalItem && globalItem.optedOut === true) || (tenantItem && tenantItem.optedOut === true));
}

// When a member texts START to a gym's own number, which opt-out records to clear.
// The tenant record always; the global one only if that STOP was attributed to this
// same gym (it came in on the shared number while this gym was texting them).
export function optInKeysToClear(tenantId, phone, globalItem) {
  const keys = [tenantOptOutKey(tenantId, phone)];
  if (globalItem && globalItem.optedOut === true && globalItem.tenantId === tenantId) keys.push(`optout#${phone}`);
  return keys;
}

export function validAreaCode(v) {
  return /^[2-9]\d{2}$/.test(String(v ?? ""));
}
export function validE164US(v) {
  return /^\+1[2-9]\d{9}$/.test(String(v ?? ""));
}

// Can this gym start a purchase now? Pure check on the current record.
export function canStartPurchase(rec, now = Date.now()) {
  if (rec && rec.phoneNumber) return { ok: false, reason: "This gym already has a texting number." };
  if (rec && rec.status === "buying" && now - Date.parse(rec.buyingAt || 0) < BUY_LOCK_MS) {
    return { ok: false, reason: "A number purchase is already in progress. Try again in a few minutes." };
  }
  return { ok: true };
}

function clip(v, n) { return String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, n); }
export const cleanProfileField = clip;

// ── Twilio REST client (form-encoded, Basic auth). `fetchFn` is injectable. ──
export function twilioClient({ accountSid, authToken, fetchFn = globalThis.fetch }) {
  const auth = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  async function call(method, url, params) {
    const opts = { method, headers: { Authorization: auth } };
    if (params) {
      opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.body = new URLSearchParams(params).toString();
    }
    const res = await fetchFn(url, opts);
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error(data.message || `Twilio request failed (${res.status})`);
      err.status = res.status; err.code = data.code;
      throw err;
    }
    return data;
  }
  const api = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  const msg = "https://messaging.twilio.com/v1";
  return {
    // Free: list local numbers that can text, in an area code.
    async searchLocal(areaCode, limit = 10) {
      const q = new URLSearchParams({ AreaCode: String(areaCode), SmsEnabled: "true", PageSize: String(limit) });
      const d = await call("GET", `${api}/AvailablePhoneNumbers/US/Local.json?${q}`);
      return (d.available_phone_numbers || []).map(n => ({
        phoneNumber: n.phone_number, friendlyName: n.friendly_name, locality: n.locality || "", region: n.region || "",
      }));
    },
    // Free: one Messaging Service per gym (the A2P campaign attaches here).
    async createService(friendlyName, webhookUrl) {
      const d = await call("POST", `${msg}/Services`, {
        FriendlyName: friendlyName, InboundRequestUrl: webhookUrl, InboundMethod: "POST",
        UseInboundWebhookOnNumber: "false", StickySender: "true",
      });
      return { sid: d.sid };
    },
    // COSTS MONEY (monthly number rental). Only called from buy_sms_number.
    async buyNumber(phoneNumber, friendlyName, webhookUrl) {
      const d = await call("POST", `${api}/IncomingPhoneNumbers.json`, {
        PhoneNumber: phoneNumber, FriendlyName: friendlyName, SmsUrl: webhookUrl, SmsMethod: "POST",
      });
      return { sid: d.sid, phoneNumber: d.phone_number };
    },
    async addNumberToService(serviceSid, phoneSid) {
      await call("POST", `${msg}/Services/${serviceSid}/PhoneNumbers`, { PhoneNumberSid: phoneSid });
    },
    // Twilio reports whether the service's A2P campaign is approved.
    async getService(serviceSid) {
      const d = await call("GET", `${msg}/Services/${serviceSid}`);
      return { sid: d.sid, a2pRegistered: d.us_app_to_person_registered === true };
    },
  };
}
