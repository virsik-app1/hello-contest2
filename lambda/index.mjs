// PulseRetain Lambda — ROLLBACK to the original working version (no auth gate).
// This is the exact code that was running when AI analysis last worked, with
// three minimal patches:
//   1. ES-module syntax (import/export) because the live handler file is
//      index.mjs — classic require/exports crashes on startup there (the 502s).
//   2. HTTP method is read from both Function URL payload formats
//      (event.requestContext.http.method OR event.httpMethod).
//   3. "Authorization" added to allowed CORS headers, so the current frontend
//      (which attaches a login token) passes preflight. The token is ignored.
import https from "https";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// ─── DynamoDB setup ───────────────────────────────────────────────────────────
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
const MEMBERS_TABLE  = "pulseretain-members";
const OUTREACH_TABLE = "pulseretain-outreach";
const LEADS_TABLE    = "pulseretain-leads";

// ─── SES setup ────────────────────────────────────────────────────────────────
const ses = new SESClient({ region: "us-east-1" });
// IMPORTANT: this must be YOUR verified email address from SES
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;

// ─── CORS headers ─────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
export const handler = async (event) => {
  // Read the HTTP method from either Function URL payload format:
  //   v2.0 → event.requestContext.http.method   ·   v1.0 → event.httpMethod
  const method = event.requestContext?.http?.method || event.httpMethod;

  // CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  if (method !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  try {

    // ── Route: "analyze" — call Claude, save result to DynamoDB ─────────────
    if (body.action === "analyze" || body.messages) {
      if (!process.env.ANTHROPIC_API_KEY) {
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
      }
      const response = await callClaude(
        body.messages,
        body.model || "claude-haiku-4-5-20251001",
        body.max_tokens || 400
      );
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
