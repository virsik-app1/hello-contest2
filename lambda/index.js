const https = require("https");
const crypto = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

// ─── DynamoDB setup ───────────────────────────────────────────────────────────
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
const MEMBERS_TABLE  = "pulseretain-members";
const OUTREACH_TABLE = "pulseretain-outreach";
const LEADS_TABLE    = "pulseretain-leads";

// ─── SES setup ────────────────────────────────────────────────────────────────
const ses = new SESClient({ region: "us-east-1" });
// IMPORTANT: this must be YOUR verified email address from SES
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;

// ─── Auth: Cognito JWT verification ───────────────────────────────────────────
// These are PUBLIC identifiers (they already ship in the browser bundle), not
// secrets. Every app action must carry a valid Cognito access/ID token, so a
// stranger with the Function URL can no longer call analyze/send_sms/etc.
const REGION        = "us-east-1";
const USER_POOL_ID  = "us-east-1_aQyubZnZS";
const APP_CLIENT_ID = "3sfqd04nehcblnver7gs5mafnf";
const ISSUER        = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
const JWKS_URL      = `${ISSUER}/.well-known/jwks.json`;

// Actions reachable WITHOUT a login. The public marketing site posts leads with
// no session, so submit_lead stays open; everything else requires auth.
const PUBLIC_ACTIONS = new Set(["submit_lead"]);

// Only these models may be requested through the proxy (defends the Anthropic
// key against being driven as a general-purpose, large-model proxy).
const ALLOWED_MODELS = new Set(["claude-haiku-4-5-20251001"]);
const DEFAULT_MODEL  = "claude-haiku-4-5-20251001";
const MAX_TOKENS_CAP = 1024;

// Optional SMS recipient allowlist (comma-separated phone numbers in any format).
// When set, send_sms may only text these numbers — a hard stop on toll fraud.
// Leave unset to preserve current behavior. Recommended: set it to the phone
// number(s) you actually demo with.
const SMS_ALLOWLIST = (process.env.SMS_ALLOWLIST || "")
  .split(",")
  .map(s => s.replace(/\D/g, "").slice(-10))
  .filter(Boolean);

let jwksCache = null;
async function getJwks(force = false) {
  if (jwksCache && !force) return jwksCache;
  const res = await httpsGet(JWKS_URL);
  jwksCache = JSON.parse(res.body).keys;
  return jwksCache;
}

function b64urlToBuf(s) { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"); }
function b64urlToJson(s) { return JSON.parse(b64urlToBuf(s).toString("utf8")); }

async function verifyCognitoToken(token) {
  if (!token) throw new Error("Missing token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");

  const header  = b64urlToJson(parts[0]);
  const payload = b64urlToJson(parts[1]);

  let jwk = (await getJwks()).find(k => k.kid === header.kid);
  if (!jwk) jwk = (await getJwks(true)).find(k => k.kid === header.kid); // refresh once on rotation
  if (!jwk) throw new Error("Unknown signing key");

  const pubKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), pubKey, b64urlToBuf(parts[2]));
  if (!ok) throw new Error("Bad signature");

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) throw new Error("Token expired");
  if (payload.iss !== ISSUER) throw new Error("Bad issuer");
  // Access tokens carry client_id; ID tokens carry aud. Accept either from our app.
  if (payload.client_id !== APP_CLIENT_ID && payload.aud !== APP_CLIENT_ID) throw new Error("Wrong client");

  return payload;
}

// ─── CORS headers ─────────────────────────────────────────────────────────────
// Security comes from the JWT check, not CORS (CORS only constrains browsers,
// never curl/scripts). We keep "*" so an unknown Amplify domain can't break the
// app, but add Authorization to the allowed headers so the bearer token passes
// preflight. To origin-lock later, swap "*" for your exact app/landing origins.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Helper: read a header case-insensitively ─────────────────────────────────
function getHeader(event, name) {
  const headers = event.headers || {};
  const lower = name.toLowerCase();
  for (const k in headers) if (k.toLowerCase() === lower) return headers[k];
  return undefined;
}

// ─── Helper: HTTPS request ────────────────────────────────────────────────────
function httpsRequest(options, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

// ─── Call Claude ──────────────────────────────────────────────────────────────
async function callClaude(messages, model, maxTokens) {
  const payload = JSON.stringify({ model, max_tokens: maxTokens, messages });
  return httpsRequest(
    {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    payload
  );
}

// ─── Send SMS via Twilio ──────────────────────────────────────────────────────
async function sendSMS(toPhone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone  = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromPhone) {
    throw new Error("Twilio credentials not configured.");
  }

  const payload = new URLSearchParams({ To: toPhone, From: fromPhone, Body: message }).toString();
  const auth    = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const response = await httpsRequest(
    {
      hostname: "api.twilio.com",
      path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${auth}`,
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    payload
  );

  const result = JSON.parse(response.body);
  if (response.statusCode >= 400) throw new Error(result.message || "Twilio error");
  return { sid: result.sid, status: result.status, to: result.to };
}

// ─── DynamoDB helpers ─────────────────────────────────────────────────────────
async function saveMemberResult(memberId, aiResult) {
  await dynamo.send(new PutCommand({
    TableName: MEMBERS_TABLE,
    Item: {
      memberId: String(memberId),
      aiResult,
      updatedAt: new Date().toISOString(),
    },
  }));
}

async function saveOutreachLog(log) {
  await dynamo.send(new PutCommand({
    TableName: OUTREACH_TABLE,
    Item: {
      logId: String(log.id),
      ...log,
      savedAt: new Date().toISOString(),
    },
  }));
}

async function loadAllMemberResults() {
  const result = await dynamo.send(new ScanCommand({ TableName: MEMBERS_TABLE }));
  return result.Items || [];
}

async function loadAllOutreachLogs() {
  const result = await dynamo.send(new ScanCommand({ TableName: OUTREACH_TABLE }));
  return result.Items || [];
}

async function updateOutreachStatus(logId, status) {
  // Load existing item first
  const existing = await dynamo.send(new GetCommand({
    TableName: OUTREACH_TABLE,
    Key: { logId: String(logId) },
  }));
  if (!existing.Item) throw new Error("Log not found");
  await dynamo.send(new PutCommand({
    TableName: OUTREACH_TABLE,
    Item: { ...existing.Item, status, updatedAt: new Date().toISOString() },
  }));
}

// ─── Lead handling: save to DynamoDB + email notification ─────────────────────
async function saveLead(lead) {
  const leadId = String(Date.now());
  const item = {
    leadId,
    name:    lead.name    || "",
    email:   lead.email   || "",
    gym:     lead.gym     || "",
    size:    lead.size    || "",
    plan:    lead.plan    || "Demo request",
    createdAt: new Date().toISOString(),
  };

  // 1. Save to DynamoDB (permanent record)
  await dynamo.send(new PutCommand({ TableName: LEADS_TABLE, Item: item }));

  // 2. Email notification (best-effort — don't fail the whole request if email breaks)
  if (NOTIFY_EMAIL) {
    try {
      const bodyText =
        `New PulseRetain demo request!\n\n` +
        `Name:  ${item.name}\n` +
        `Email: ${item.email}\n` +
        `Gym:   ${item.gym}\n` +
        `Size:  ${item.size}\n` +
        `Plan:  ${item.plan}\n` +
        `Time:  ${item.createdAt}\n`;

      await ses.send(new SendEmailCommand({
        Source: NOTIFY_EMAIL,
        Destination: { ToAddresses: [NOTIFY_EMAIL] },
        Message: {
          Subject: { Data: `🔥 New Demo Request: ${item.gym || item.name}` },
          Body: { Text: { Data: bodyText } },
        },
      }));
    } catch (emailErr) {
      console.error("Email notification failed (lead still saved):", emailErr);
    }
  }

  return { leadId };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // CORS preflight (no auth — the browser sends this before attaching headers)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  // ── Auth gate: every action except the public ones needs a valid login ──────
  // (analyze also triggers on a bare `messages` field, so anything that isn't an
  //  explicitly public action must be authenticated.)
  if (!PUBLIC_ACTIONS.has(body.action)) {
    try {
      const authz = getHeader(event, "authorization") || "";
      const token = authz.replace(/^Bearer\s+/i, "").trim();
      await verifyCognitoToken(token);
    } catch (e) {
      console.warn("Auth rejected:", e.message);
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "Unauthorized" }) };
    }
  }

  try {

    // ── Route: "analyze" — call Claude, save result to DynamoDB ─────────────
    if (body.action === "analyze" || body.messages) {
      if (!process.env.ANTHROPIC_API_KEY) {
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
      }
      // Pin the model to an allowed one and cap output size.
      const model     = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
      const maxTokens = Math.min(Number(body.max_tokens) || 400, MAX_TOKENS_CAP);

      const response = await callClaude(body.messages, model, maxTokens);
      const claudeData = JSON.parse(response.body);

      // Parse and save the AI result to DynamoDB
      if (body.memberId && claudeData.content) {
        const raw   = claudeData.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const aiResult = JSON.parse(match[0]);
          await saveMemberResult(body.memberId, aiResult);
        }
      }

      return {
        statusCode: response.statusCode,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: response.body,
      };
    }

    // ── Route: "send_sms" — send SMS via Twilio ──────────────────────────────
    if (body.action === "send_sms") {
      const { to, message } = body;
      if (!to || !message) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing 'to' or 'message'" }) };
      }
      const cleaned = to.replace(/\D/g, "");
      if (cleaned.length < 10) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid phone number" }) };
      }
      const formattedPhone = cleaned.length === 10 ? `+1${cleaned}` : `+${cleaned}`;

      // Hard stop on toll fraud: when an allowlist is configured, only text it.
      if (SMS_ALLOWLIST.length > 0 && !SMS_ALLOWLIST.includes(cleaned.slice(-10))) {
        return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: "Recipient not on the SMS allowlist" }) };
      }

      const result = await sendSMS(formattedPhone, message);
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, ...result }),
      };
    }

    // ── Route: "save_outreach" — save outreach log to DynamoDB ──────────────
    if (body.action === "save_outreach") {
      await saveOutreachLog(body.log);
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ success: true }),
      };
    }

    // ── Route: "update_outreach_status" — update outcome in DynamoDB ────────
    if (body.action === "update_outreach_status") {
      await updateOutreachStatus(body.logId, body.status);
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ success: true }),
      };
    }

    // ── Route: "submit_lead" — save demo request + email notification ───────
    if (body.action === "submit_lead") {
      const result = await saveLead(body.lead || {});
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, ...result }),
      };
    }

    // ── Route: "load_data" — fetch all saved data on page load ───────────────
    if (body.action === "load_data") {
      const [memberResults, outreachLogs] = await Promise.all([
        loadAllMemberResults(),
        loadAllOutreachLogs(),
      ]);
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ memberResults, outreachLogs }),
      };
    }

    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "Unknown action." }),
    };

  } catch (err) {
    console.error("Lambda error:", err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
