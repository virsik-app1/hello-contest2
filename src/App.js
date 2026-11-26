import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import { Authenticator, useAuthenticator, ThemeProvider } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { awsConfig } from "./aws-config";
import { buildStats, deriveRisk, isDemoPhone, pickTodaysQueue } from "./retention";
import { parseMembersCSV, SAMPLE_CSV_HEADERS, SAMPLE_CSV_ROWS, SAMPLE_GYM_CSV } from "./importMembers";
import { isStableId, newMemberId, withStableIds, normalizeMemberId, restoreResults } from "./memberStore";
import { computeInsights } from "./strategist";
import { IS_DEMO, exitDemoToSignUp, demoAnalyze, demoDraftReply, demoGetConversation, demoLogReplySent, demoCompetitiveIntel, demoInitialAiResults, demoInitialOutreach, demoInbox, demoMarkReplyHandled } from "./demo";
import { listLocations, filterByLocation, summarizeLocations, ALL_LOCATIONS } from "./locations";
import { aiErrorText } from "./aiErrors";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";

Amplify.configure(awsConfig);

// ─── Responsive helper ────────────────────────────────────────────────────────
// The app is entirely inline-styled (no CSS media queries), so we detect a phone
// viewport in JS and switch layouts. ~640px catches phones in portrait.
function useIsMobile(breakpoint = 640) {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    setIsMobile(mq.matches);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange); };
  }, [query]);
  return isMobile;
}

// ─── "Add to Home Screen" install prompt ──────────────────────────────────────
// Android/desktop Chrome: capture the native beforeinstallprompt and trigger it
// on tap. iOS Safari has no such API, so we show the manual Share → Add steps.
function useInstallPrompt() {
  const [deferred, setDeferred]   = useState(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onBIP = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isIOSSafari = isIOS && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  const isStandalone =
    installed ||
    (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    (typeof navigator !== "undefined" && navigator.standalone === true);

  const promptInstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* user dismissed */ }
    setDeferred(null);
  };

  return { canInstall: !!deferred, isIOSSafari, isStandalone, promptInstall };
}

// ─── Authenticated API call ───────────────────────────────────────────────────
// Every request to the Lambda carries the signed-in user's Cognito token, so the
// backend can reject anyone who isn't logged in. Keys never touch the browser.
async function apiFetch(payload) {
  if (IS_DEMO) return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  let auth = {};
  try {
    const token = (await fetchAuthSession()).tokens?.accessToken?.toString();
    if (token) auth = { Authorization: `Bearer ${token}` };
  } catch { /* not signed in yet — request will be rejected by the server */ }
  return fetch(LAMBDA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify(payload),
  });
}

// Prefer the server's own explanation (daily limit reached, member opted out,
// quiet hours…) over a bare status code.
async function serverError(response) {
  let msg = `Server returned ${response.status}`;
  try { const d = await response.json(); if (d && d.error) msg = d.error; } catch { /* non-JSON body */ }
  return new Error(msg);
}

// ─── Follow-up / time zone display helpers ───────────────────────────────────
// Only saved roster members with a real number get an automatic text; the demo,
// sample roster and 555 numbers just get a reminder.
function canAutoFollowUp(m) {
  return !IS_DEMO && !!m.phone && !isDemoPhone(m.phone) && isStableId(m.id);
}
// "Sat, Nov 28, 10:00 AM" in the gym's zone (falls back to the browser's).
function formatDue(iso, tz) {
  if (!iso) return "";
  const opts = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  try { return new Date(iso).toLocaleString(undefined, { ...opts, timeZone: tz || undefined }); }
  catch { return new Date(iso).toLocaleString(undefined, opts); }
}
// North American zones first (where gyms are today), then the current one if not listed.
const COMMON_TZS = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "America/Puerto_Rico", "America/Toronto", "America/Vancouver", "America/Halifax",
  "Europe/London", "Australia/Sydney"];
function timeZoneOptions(current) {
  return current && !COMMON_TZS.includes(current) ? [current, ...COMMON_TZS] : COMMON_TZS;
}

// ─── Member data ────────────────────────────────────────────────────────────
const initialMembers = [
  { id: 1,  name: "Sarah Reynolds",  initials: "SR", plan: "Unlimited Monthly", lastVisit: "9 days ago",  usualVisits: "Tue & Thu",      risk: "high",   score: 91, value: 79,  email: "sarah.r@email.com",  phone: "(704) 555-0192", joinedMonths: 14, missedPayments: 0, classesBooked: 2, location: "Downtown" },
  { id: 2,  name: "Tom Mitchell",    initials: "TM", plan: "10-Class Pack",     lastVisit: "6 days ago",  usualVisits: "Every Saturday", risk: "high",   score: 78, value: 49,  email: "t.mitchell@email.com", phone: "(704) 555-0341", joinedMonths: 7,  missedPayments: 1, classesBooked: 1, location: "Downtown" },
  { id: 3,  name: "Jessica Lane",    initials: "JL", plan: "Unlimited Monthly", lastVisit: "4 days ago",  usualVisits: "Mon, Wed, Fri",  risk: "medium", score: 54, value: 79,  email: "jlane@email.com",    phone: "(704) 555-0887", joinedMonths: 22, missedPayments: 0, classesBooked: 4, location: "Downtown" },
  { id: 4,  name: "Marcus Webb",     initials: "MW", plan: "Unlimited Monthly", lastVisit: "3 days ago",  usualVisits: "Tue & Thu",      risk: "medium", score: 47, value: 79,  email: "m.webb@email.com",   phone: "(704) 555-0654", joinedMonths: 5,  missedPayments: 0, classesBooked: 3, location: "Downtown" },
  { id: 5,  name: "Priya Nair",      initials: "PN", plan: "5-Class Pack",      lastVisit: "2 days ago",  usualVisits: "Fridays",        risk: "low",    score: 21, value: 29,  email: "p.nair@email.com",   phone: "(704) 555-0223", joinedMonths: 3,  missedPayments: 0, classesBooked: 6, location: "Northside" },
  { id: 6,  name: "Derek Collins",   initials: "DC", plan: "Unlimited Monthly", lastVisit: "1 day ago",   usualVisits: "Daily",          risk: "low",    score: 12, value: 79,  email: "d.collins@email.com", phone: "(704) 555-0119", joinedMonths: 36, missedPayments: 0, classesBooked: 8, location: "Northside" },
  { id: 7,  name: "Aisha Thompson",  initials: "AT", plan: "Unlimited Monthly", lastVisit: "Today",       usualVisits: "Mon & Wed",      risk: "low",    score: 8,  value: 79,  email: "a.thompson@email.com", phone: "(704) 555-0774", joinedMonths: 18, missedPayments: 0, classesBooked: 7, location: "Northside" },
  { id: 8,  name: "Ryan Foster",     initials: "RF", plan: "10-Class Pack",     lastVisit: "8 days ago",  usualVisits: "Weekends",       risk: "high",   score: 83, value: 49,  email: "r.foster@email.com", phone: "(704) 555-0562", joinedMonths: 9,  missedPayments: 2, classesBooked: 0, location: "West End" },
  { id: 9,  name: "Camille Torres",  initials: "CT", plan: "Unlimited Monthly", lastVisit: "11 days ago", usualVisits: "Wed & Fri",      risk: "high",   score: 88, value: 79,  email: "c.torres@email.com", phone: "(704) 555-0338", joinedMonths: 11, missedPayments: 1, classesBooked: 0, location: "West End" },
  { id: 10, name: "Jordan Kim",      initials: "JK", plan: "Unlimited Monthly", lastVisit: "5 days ago",  usualVisits: "Tue & Thu",      risk: "medium", score: 61, value: 79,  email: "j.kim@email.com",    phone: "(704) 555-0491", joinedMonths: 8,  missedPayments: 0, classesBooked: 2, location: "West End" },
];

// ─── Risk config ─────────────────────────────────────────────────────────────
const riskConfig = {
  high:   { label: "High",      bg: "#fff1f1", color: "#c0392b", bar: "#e74c3c", border: "#fbc9c9" },
  medium: { label: "Medium",    bg: "#fffbf0", color: "#b7770d", bar: "#f39c12", border: "#fde8a8" },
  low:    { label: "Low",       bg: "#f0faf4", color: "#1e7e45", bar: "#27ae60", border: "#b6e8c8" },
};

// ─── Lambda URL (all API calls go through here — no secrets in the browser) ───
const LAMBDA_URL = "https://duu25rkvvopryctqwaxzleqxg40nbcqf.lambda-url.us-east-1.on.aws/";

// ─── Claude analysis ──────────────────────────────────────────────────────────
async function runClaudeAnalysis(member) {
  if (IS_DEMO) return demoAnalyze(member);
  const response = await apiFetch({
      action: "analyze",
      // Only roster members with a stable id get their analysis saved; sample
      // members (ids 1–10) are analysed but not stored, so nothing mis-attaches.
      ...(isStableId(member.id) ? { memberId: member.id } : {}),
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `You are a fitness studio retention AI. Respond with ONLY a raw JSON object — no markdown, no backticks.

{"riskLevel":"high","score":85,"reason":"One sentence naming the SPECIFIC behavioral change, not a generic label — e.g. 'Has skipped her usual Tue & Thu classes two weeks running and stopped booking ahead.'","message":"Personalized SMS under 160 chars that references their specific situation","followUpDays":3,"offerType":"class_credit"}

offerType must be one of: class_credit, discount_percent, free_guest_pass, personal_trainer_intro, none

Member:
Name: ${member.name}
Plan: ${member.plan} ($${member.value}/mo)
Last visit: ${member.lastVisit}
Usual schedule: ${member.usualVisits}
Months as member: ${member.joinedMonths}
Missed payments: ${member.missedPayments}
Classes booked ahead: ${member.classesBooked}
Current risk score: ${member.score}/100`
      }]
  });
  if (!response.ok) throw await serverError(response);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!Array.isArray(data.content)) throw new Error("Unexpected AI response");
  const raw = data.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

// ─── Send real SMS via Lambda → Twilio ───────────────────────────────────────
// Sample members have fictional 555 numbers that no carrier can deliver to, so
// those sends are simulated (and labelled as such) instead of failing.
// Passing the member lets the server file their text replies on the right
// thread (Twilio only tells us the sender's phone number).
async function sendRealSMS(toPhone, message, member) {
  if (IS_DEMO) { await new Promise(r => setTimeout(r, 700)); return { success: true, simulated: true }; } // demo never texts anyone
  if (isDemoPhone(toPhone)) {
    await new Promise(r => setTimeout(r, 700));
    return { success: true, simulated: true };
  }
  const response = await apiFetch({
      action: "send_sms",
      to: toPhone,
      message,
      ...(member ? {
        memberId: member.id,
        member: { name: member.name, plan: member.plan, value: member.value, joinedMonths: member.joinedMonths, usualVisits: member.usualVisits, lastVisit: member.lastVisit },
      } : {}),
  });
  if (!response.ok) throw await serverError(response);
  const data = await response.json();
  if (!data.success) throw new Error(data.error || "SMS failed");
  return data;
}

// ─── Claude reply drafting (conversational retention) ────────────────────────
// Reuses the existing secure Lambda "analyze" pass-through — no backend change
// needed. No memberId is sent, so the draft is never saved over the member's
// churn analysis. No API key ever touches the browser.
async function runClaudeReply(member, originalMessage, memberReply) {
  const response = await apiFetch({
      action: "analyze",
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `You are a fitness studio owner's retention assistant. A member is at risk of cancelling. The studio already texted them this win-back message: "${originalMessage}". The member just replied: "${memberReply}".

Write the studio's next text back. Be warm, human, and specific to what they said — never pushy. If they raise a real obstacle (cost, time, injury, moving away), respond with empathy and offer a fair option. Respond with ONLY a raw JSON object — no markdown, no backticks:

{"sentiment":"positive|neutral|hesitant|leaving","reply":"the studio's reply text, under 300 characters","suggestedOffer":"class_credit|discount_percent|free_guest_pass|personal_trainer_intro|pause_membership|none","nextStep":"one short sentence telling the owner what to do next"}

Member: ${member.name}, on ${member.plan} ($${member.value}/mo), ${member.joinedMonths} months as a member.`
      }]
  });
  if (!response.ok) throw await serverError(response);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!Array.isArray(data.content)) throw new Error("Unexpected AI response");
  const raw = data.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

// ─── Reply agent API (new Lambda "draft_reply") ───────────────────────────────
// Tries the dedicated conversational-agent backend first. Returns null if the
// deployed Lambda doesn't know the action yet (not upgraded), so the caller
// can fall back to the legacy inline-prompt path — pushing this frontend can
// never break the live app.
async function draftReplyAgent(member, memberMessage, originalOutreach) {
  if (IS_DEMO) return demoDraftReply(member, memberMessage, originalOutreach);
  const res = await apiFetch({
    action: "draft_reply",
    memberId: member.id,
    member: {
      name: member.name, plan: member.plan, value: member.value,
      joinedMonths: member.joinedMonths, usualVisits: member.usualVisits, lastVisit: member.lastVisit,
    },
    memberMessage,
    originalOutreach,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 400 && data.error === "Unknown action.") return null; // old Lambda
  if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
  return data; // { success, draft, turns }
}

// ─── Roster persistence (Lambda "save_members" / "delete_members") ────────────
// Returns true when saved, false when the deployed Lambda is older and doesn't
// store rosters yet (so the app keeps working, just without saving).
async function saveRoster(members, mode = "replace") {
  if (IS_DEMO) return true;
  const res = await apiFetch({ action: "save_members", mode, members });
  const data = await res.json().catch(() => ({}));
  if (res.status === 400 && data.error === "Unknown action.") return false;
  if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
  return true;
}

async function clearSavedRoster() {
  if (IS_DEMO) return true;
  const res = await apiFetch({ action: "delete_members", all: true });
  const data = await res.json().catch(() => ({}));
  if (res.status === 400 && data.error === "Unknown action.") return false;
  if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
  return true;
}

async function fetchConversation(memberId) {
  if (IS_DEMO) return demoGetConversation(memberId);
  const res = await apiFetch({ action: "get_conversation", memberId });
  if (!res.ok) return null; // old Lambda or error — thread UI just stays hidden
  const data = await res.json().catch(() => null);
  return data && Array.isArray(data.turns) ? data.turns : null;
}

async function logReplySent(member, text) {
  if (IS_DEMO) return demoLogReplySent(member, text);
  const res = await apiFetch({ action: "log_reply_sent", memberId: member.id, memberName: member.name, text });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data && Array.isArray(data.turns) ? data.turns : null;
}

// Member text replies captured by the Twilio webhook, each with Claude's
// pre-drafted answer. Returns null on an older Lambda (section stays hidden).
async function fetchInbox() {
  if (IS_DEMO) return demoInbox();
  const res = await apiFetch({ action: "get_inbox" });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data && Array.isArray(data.threads) ? data.threads : null;
}

async function markReplyHandled(memberId) {
  if (IS_DEMO) return demoMarkReplyHandled(memberId);
  const res = await apiFetch({ action: "mark_reply_handled", memberId });
  if (!res.ok) throw await serverError(res);
}

// Competitive Intelligence — aggregates where/why members say they're leaving
// (consent-based, from their own replies; never location tracking).
async function fetchCompetitiveIntel() {
  if (IS_DEMO) return demoCompetitiveIntel();
  const res = await apiFetch({ action: "get_competitive_intel" });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ─── Offer badge labels ───────────────────────────────────────────────────────
const offerLabels = {
  class_credit:            "Free class",
  discount_percent:        "10% off",
  free_guest_pass:         "Guest pass",
  personal_trainer_intro:  "Free PT session",
  pause_membership:        "Pause membership",
  none:                    null,
};

// ─── Nav tabs ─────────────────────────────────────────────────────────────────
const TABS = ["Today", "Outreach", "Insights"];

// Labels for the competitive-intel "why they leave" breakdown
const reasonMeta = {
  competitor: { label: "Joined a competitor", color: "#c0392b", bg: "#fff1f1" },
  cost:       { label: "Cost / price",        color: "#b7770d", bg: "#fffbf0" },
  time:       { label: "Time / too busy",     color: "#8e44ad", bg: "#f5f0ff" },
  injury:     { label: "Injury / health",     color: "#185fa5", bg: "#e8f4fd" },
  moving:     { label: "Moving away",         color: "#1e7e45", bg: "#f0faf4" },
  other:      { label: "Other",               color: "#777",    bg: "#f4f4f4" },
};

// ─── Branded sign-in (custom Amplify Authenticator theme + hero) ──────────────
const pulseTheme = {
  name: "pulseretain",
  tokens: {
    colors: {
      brand: {
        primary: {
          10: "#fff1f1", 20: "#fde0de", 40: "#f1948a", 60: "#ec7063",
          80: "#e74c3c", 90: "#c0392b", 100: "#a93226",
        },
      },
    },
    components: {
      authenticator: {
        router: { borderWidth: "0", boxShadow: "0 18px 50px rgba(0,0,0,0.22)" },
      },
      button: {
        primary: {
          backgroundColor: "#e74c3c",
          _hover:  { backgroundColor: "#c0392b" },
          _focus:  { backgroundColor: "#c0392b" },
          _active: { backgroundColor: "#a93226" },
        },
      },
      tabs: {
        item: {
          color: "#888",
          _active: { color: "#c0392b", borderColor: "#c0392b" },
          _hover:  { color: "#c0392b" },
        },
      },
    },
  },
};

const authComponents = {
  Header() {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px 14px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Logo size={50} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 31, letterSpacing: 0.5 }}>PulseRetain</span>
        </div>
        <p style={{ color: "#cfd0e8", fontSize: 15, margin: "0 auto", maxWidth: 370, lineHeight: 1.55 }}>
          Spot the members about to quit, and send the text that wins them back.
        </p>
      </div>
    );
  },
  Footer() {
    return (
      <div style={{ textAlign: "center", padding: "18px 20px 40px" }}>
        <p style={{ color: "#8a8ba8", fontSize: 12, margin: 0 }}>Member retention for fitness studios</p>
      </div>
    );
  },
};

// Demo mode skips sign-in entirely; everyone else gets the normal Cognito login.
const DEMO_USER = { signInDetails: { loginId: "Demo gym · sample data" } };
function AuthGate({ children }) {
  if (IS_DEMO) return children({ signOut: exitDemoToSignUp, user: DEMO_USER });
  return <Authenticator components={authComponents}>{children}</Authenticator>;
}

// ─── Design tokens (minimal look: brand navy + red, lots of white) ──────────
// Brand colors and Georgia stay; color is reserved for money and risk so the
// numbers that matter stand out against a quiet page.
const T = {
  ink:      "#1a1a2e",   // brand navy: text, primary buttons
  body:     "#3d3d50",
  muted:    "#6b6b80",
  faint:    "#9a9aae",
  line:     "#e7e7ee",
  soft:     "#f3f3f7",
  page:     "#f6f5fa",
  red:      "#e74c3c",   // brand red: bad news (money at risk, high risk)
  redDark:  "#c0392b",
  redTint:  "#fdeeec",
  amber:    "#e0a800",   // yellow: in-between (risk score 35 to 75)
  amberDark:"#9a7400",
  amberTint:"#fdf7e1",
  green:    "#1e7e45",   // green: good news (won back, low risk)
  greenMid: "#27ae60",
  greenTint:"#e9f7ef",
  purple:   "#8e44ad",   // PulseRetain accents
  purpleTint:"#f5eefa",
  orange:   "#e67e22",
  orangeTint:"#fdf1e5",
};
const ACCENT_GRADIENT = `linear-gradient(90deg, ${"#8e44ad"}, ${"#e67e22"})`;

// AI risk score bands: above 75 is red, 35 to 75 is yellow, below 35 is green.
function scoreTone(score) {
  const n = Number(score) || 0;
  if (n > 75) return { color: T.redDark, dot: T.red, bg: T.redTint, label: "High" };
  if (n >= 35) return { color: T.amberDark, dot: T.amber, bg: T.amberTint, label: "Medium" };
  return { color: T.green, dot: T.greenMid, bg: T.greenTint, label: "Low" };
}
const riskTone = { high: scoreTone(100), medium: scoreTone(50), low: scoreTone(0) };
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS  = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function btn(variant = "secondary", extra = {}) {
  const base = { fontFamily: SANS, fontSize: 13, fontWeight: 600, borderRadius: 8, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap", lineHeight: 1.2 };
  const v = {
    primary:   { background: T.ink, color: "#fff", border: `1px solid ${T.ink}` },
    send:      { background: T.greenMid, color: "#fff", border: `1px solid ${T.greenMid}` },
    log:       { background: T.purpleTint, color: "#6c3483", border: "1px solid #e2cdf0" },
    draft:     { background: T.purple, color: "#fff", border: `1px solid ${T.purple}` },
    remind:    { background: T.orangeTint, color: "#a85410", border: "1px solid #f6d3b0" },
    secondary: { background: "#fff", color: T.ink, border: `1px solid ${T.line}` },
    ghost:     { background: "transparent", color: T.muted, border: "1px solid transparent" },
  }[variant];
  return { ...base, ...v, ...extra };
}

const eyebrow = { margin: 0, fontSize: 12, fontWeight: 500, color: T.muted, letterSpacing: 0.2 };
const panel   = { background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" };
// Panels get a thin purple or orange top edge (PulseRetain accent colors).
const accentPanel = (color) => ({ ...panel, borderTop: `3px solid ${color}` });

function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="512" height="512" rx="112" fill="#1a1a2e" />
      <path d="M64 268 H170 L208 196 L268 332 L312 268 H372" fill="none" stroke="#e74c3c" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M300 132 L236 290 H300 L276 392 L392 226 H320 L356 132 Z" fill="#e74c3c" />
    </svg>
  );
}

function RiskTag({ risk, score }) {
  const tone = score !== undefined ? scoreTone(score) : (riskTone[risk] || riskTone.low);
  return (
    <span style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: tone.color, background: tone.bg, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: tone.dot, flexShrink: 0 }} />
      {score !== undefined ? tone.label : (riskConfig[risk]?.label || risk)}
      {score !== undefined && <span style={{ fontWeight: 700 }}>{score}</span>}
    </span>
  );
}

function Bar({ pct, color = T.ink }) {
  return (
    <div style={{ height: 6, background: T.soft, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );
}

function Stat({ label, value, sub, accent, tone, isMobile }) {
  const t = accent ? "bad" : tone;
  const c = t === "bad" ? { edge: T.red, bg: T.redTint, text: T.redDark }
          : t === "good" ? { edge: T.greenMid, bg: T.greenTint, text: T.green }
          : t === "mid" ? { edge: T.amber, bg: T.amberTint, text: T.amberDark }
          : { edge: T.purple, bg: "#fff", text: T.ink };
  return (
    <div style={{ background: c.bg, border: `1px solid ${T.line}`, borderLeft: `3px solid ${c.edge}`, borderRadius: 10, padding: isMobile ? "10px 12px" : "12px 16px" }}>
      <p style={eyebrow}>{label}</p>
      <p style={{ margin: "4px 0 0", fontFamily: SERIF, fontSize: isMobile ? 22 : 26, color: c.text, lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ margin: "3px 0 0", fontSize: 12, color: T.muted }}>{sub}</p>}
    </div>
  );
}

function SectionHead({ title, sub, right, isMobile }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-end", flexDirection: isMobile ? "column" : "row", gap: 12, marginBottom: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 20, fontWeight: 400, color: T.ink }}>{title}</h2>
        {sub && <p style={{ margin: "4px 0 0", fontSize: 13, color: T.muted }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function Chevron({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", color: T.faint }}>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const install = useInstallPrompt();
  const [installDismissed, setInstallDismissed] = useState(() => {
    try { return localStorage.getItem("pulseretain-install-dismissed") === "1"; } catch { return false; }
  });
  const showInstall = !IS_DEMO && !install.isStandalone && !installDismissed && (install.canInstall || install.isIOSSafari);
  function dismissInstall() {
    setInstallDismissed(true);
    try { localStorage.setItem("pulseretain-install-dismissed", "1"); } catch { /* private mode */ }
  }
  const [members, setMembers]         = useState(initialMembers);
  const [usingImported, setUsingImported] = useState(false);
  const importInputRef                = useRef(null);
  const [showData, setShowData]       = useState(false);    // "Add members" modal
  const [dataTab, setDataTab]         = useState("sample");  // sample | upload | paste | single
  const [pasteText, setPasteText]     = useState("");
  const blankMember = { name: "", plan: "", value: "", lastVisit: "", joinDate: "", missedPayments: "", classesBooked: "", schedule: "", email: "", phone: "", location: "" };
  const [addForm, setAddForm]         = useState(blankMember);
  const [selected, setSelected]       = useState(null);
  const [aiResults, setAiResults]     = useState(() => (IS_DEMO ? demoInitialAiResults(initialMembers) : {}));
  const [loading, setLoading]         = useState({});
  const [analyzing, setAnalyzing]     = useState(false);
  const [activeTab, setActiveTab]     = useState("Today");
  const [outreachLog, setOutreachLog] = useState(() => (IS_DEMO ? demoInitialOutreach() : []));
  const [filterRisk, setFilterRisk]   = useState("all");
  const [filterLocation, setFilterLocation] = useState(ALL_LOCATIONS); // multi-location: which site is in view
  const [modalMember, setModalMember] = useState(null);
  const [scheduledIds, setScheduledIds] = useState(new Set());
  const [followupDue, setFollowupDue]   = useState({});   // member id → ISO time the follow-up text goes out
  const [gymTz, setGymTz]               = useState(null); // gym's time zone (quiet hours + follow-up timing)
  const [reportPrefs, setReportPrefs]   = useState(null); // { weeklyReport, reportEmail } for the Monday email
  const [testReportBusy, setTestReportBusy] = useState(false);
  const [smsSending, setSmsSending]   = useState({});
  const [smsSent, setSmsSent]         = useState(new Set());
  const [intel, setIntel]             = useState(null);   // competitive-intel aggregate
  const [intelLoading, setIntelLoading] = useState(false);
  const [dismissedToday, setDismissedToday] = useState(new Set()); // "Today's 3" skips
  const [toast, setToast]             = useState(null);
  const [dataLoading, setDataLoading] = useState(!IS_DEMO);
  const [search, setSearch]           = useState("");
  const [replyText, setReplyText]       = useState({});   // member's pasted reply, keyed by member id
  const [replyDrafts, setReplyDrafts]   = useState({});   // Claude's drafted response, keyed by member id
  const [replyLoading, setReplyLoading] = useState({});
  const [replySending, setReplySending] = useState({});
  const [convs, setConvs]               = useState({});   // conversation threads, keyed by member id
  const [inbox, setInbox]               = useState(null); // texted replies awaiting the owner (null = not loaded / unsupported)
  const [inboxEdits, setInboxEdits]     = useState({});   // owner's edits to a drafted answer, keyed by member id
  const [inboxBusy, setInboxBusy]       = useState({});   // in-flight action per member id
  const waitingReplies = (inbox || []).filter(t => t.needsReply).length;
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);

  // ── Load persisted data from DynamoDB once the user is signed in ──────────
  // (load_data now requires a Cognito token, so we wait for authentication
  //  instead of firing on mount — which also avoids a wasted pre-login call.)
  useEffect(() => {
    if (IS_DEMO || authStatus !== "authenticated") return;
    let cancelled = false;
    async function loadData() {
      try {
        const res  = await apiFetch({ action: "load_data" });
        const data = await res.json();
        if (cancelled) return;

        // Restore the saved roster and its analyses. Results for members who
        // aren't on the saved roster (e.g. old ones keyed 1, 2, 3) are dropped,
        // so they can never attach to the sample members.
        if (Array.isArray(data.members) && data.members.length > 0) {
          setMembers(data.members);
          setUsingImported(true);
          setAiResults(restoreResults(data.memberResults, data.members));
        }

        // Restore outreach logs
        if (data.outreachLogs && data.outreachLogs.length > 0) {
          const logs = data.outreachLogs.map(l => ({
            id:         Number(l.logId),
            memberId:   normalizeMemberId(l.memberId),
            memberName: l.memberName,
            plan:       l.plan,
            value:      l.value,
            message:    l.message,
            sentAt:     l.sentAt,
            status:     l.status,
            followUpDays: l.followUpDays,
            smsSent:    l.smsSent === true || l.smsSent === "true",
          }));
          setOutreachLog(logs);

          // Restore smsSent set — only members who actually received a text,
          // so the "Send SMS Now" button doesn't wrongly reappear after reload.
          const sentIds = new Set(logs.filter(l => l.smsSent).map(l => l.memberId));
          setSmsSent(sentIds);
        }
      } catch (err) {
        console.error("Failed to load saved data:", err);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [authStatus]);

  // ── Gym time zone + pending follow-ups ────────────────────────────────────
  // GUESS: a gym that has never chosen a time zone gets the owner's browser zone
  // saved on first sign-in (they can change it on the Outreach tab).
  useEffect(() => {
    if (IS_DEMO || authStatus !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await (await apiFetch({ action: "get_settings" })).json();
        let tz = settings.timezone;
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!tz && browserTz) {
          const r = await apiFetch({ action: "save_settings", timezone: browserTz });
          tz = r.ok ? browserTz : settings.effectiveTimezone;
        }
        if (!cancelled) setGymTz(tz || settings.effectiveTimezone || null);
        if (!cancelled && typeof settings.weeklyReport === "boolean") setReportPrefs({ weeklyReport: settings.weeklyReport, reportEmail: settings.reportEmail || null });
        const { followups = [] } = await (await apiFetch({ action: "list_followups" })).json();
        if (cancelled) return;
        const pending = followups.filter(f => f.status === "scheduled" || f.status === "sending");
        setScheduledIds(new Set(pending.map(f => normalizeMemberId(f.memberId))));
        setFollowupDue(Object.fromEntries(pending.map(f => [normalizeMemberId(f.memberId), f.dueAt])));
      } catch (err) {
        console.error("Failed to load follow-ups/settings:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [authStatus]);

  async function changeGymTz(tz) {
    const prev = gymTz;
    setGymTz(tz);
    try {
      const r = await apiFetch({ action: "save_settings", timezone: tz });
      if (!r.ok) throw await serverError(r);
      showToast(`Texting hours now follow ${tz.replace(/_/g, " ")}`);
    } catch (err) {
      setGymTz(prev);
      showToast(`Couldn't save time zone: ${err.message}`);
    }
  }

  async function toggleWeeklyReport(on) {
    const prev = reportPrefs;
    setReportPrefs(p => ({ ...p, weeklyReport: on }));
    try {
      const r = await apiFetch({ action: "save_report_prefs", weeklyReport: on });
      if (!r.ok) throw await serverError(r);
      showToast(on ? "Weekly email report turned on" : "Weekly email report turned off");
    } catch (err) {
      setReportPrefs(prev);
      showToast(`Couldn't save: ${err.message}`);
    }
  }

  async function sendTestReport() {
    setTestReportBusy(true);
    try {
      const r = await apiFetch({ action: "send_test_report" });
      if (!r.ok) throw await serverError(r);
      const { sentTo } = await r.json();
      showToast(`This week's report is on its way to ${sentTo}`);
    } catch (err) {
      showToast(`Couldn't send the report: ${err.message}`);
    } finally {
      setTestReportBusy(false);
    }
  }

  // ── Load a member's conversation thread when their row is expanded ────────
  useEffect(() => {
    if (!selected || convs[selected] !== undefined) return;
    let cancelled = false;
    fetchConversation(selected).then(turns => {
      if (!cancelled) setConvs(prev => ({ ...prev, [selected]: turns || [] }));
    });
    return () => { cancelled = true; };
  }, [selected, convs]);

  // ── Texted replies inbox: load after sign-in, refresh every minute while the
  //    Outreach tab is open so new replies show up without a reload ─────────
  const refreshInbox = useCallback(async () => {
    try {
      const threads = await fetchInbox();
      if (threads) setInbox(threads);
    } catch (err) { console.error("Failed to load replies:", err); }
  }, []);
  useEffect(() => {
    if (!IS_DEMO && authStatus !== "authenticated") return;
    refreshInbox();
  }, [authStatus, refreshInbox]);
  useEffect(() => {
    if (activeTab !== "Outreach") return;
    refreshInbox();
    const t = setInterval(refreshInbox, 60000);
    return () => clearInterval(t);
  }, [activeTab, refreshInbox]);

  // ── Close the member modal with the Escape key (accessibility) ────────────
  useEffect(() => {
    if (!modalMember) return;
    const onKey = (e) => { if (e.key === "Escape") setModalMember(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalMember]);

  // ── Load competitive intelligence for the Competitors & Strategist tabs ────
  useEffect(() => {
    if (activeTab !== "Insights") return;
    let cancelled = false;
    setIntelLoading(true);
    fetchCompetitiveIntel().then(data => {
      if (!cancelled) { setIntel(data); setIntelLoading(false); }
    });
    return () => { cancelled = true; };
  }, [activeTab, outreachLog]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ── Export helper: turn rows into a downloadable CSV file ──────────────────
  function downloadCSV(filename, headers, rows) {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filename}`);
  }

  function exportMembersCSV() {
    downloadCSV(
      "pulseretain-members.csv",
      ["Name", "Plan", "Risk", "Score", "Last Visit", "Usual Schedule", "Value/mo", "Missed Payments"],
      filteredMembers.map(m => [m.name, m.plan, riskConfig[m.risk].label, (aiResults[m.id]?.score ?? m.score), m.lastVisit, m.usualVisits, m.value, m.missedPayments])
    );
  }

  function exportOutreachCSV() {
    downloadCSV(
      "pulseretain-outreach.csv",
      ["Member", "Plan", "Value/mo", "Sent At", "Status", "Message"],
      outreachLog.map(l => [l.memberName, l.plan, l.value, l.sentAt, l.status, l.message])
    );
  }

  // ── Bring in a real member roster (parsed entirely in-browser) ─────────────
  // Replace the whole roster and reset the view so trends reflect it at once.
  function applyRoster(parsed, label) {
    const list = withStableIds(parsed);
    setMembers(list);
    setUsingImported(true);
    setSelected(null);
    setAiResults({});              // clear demo analyses; these are real members now
    setFilterRisk("all");
    setSearch("");
    setShowData(false);
    setActiveTab("Today");
    showToast(`Loaded ${list.length} members${label ? ` · ${label}` : ""}`);
    saveRoster(list, "replace")
      .then(ok => { if (!ok) showToast("Roster loaded, but the server can't save it yet. It will reset on reload."); })
      .catch(err => showToast(`Roster loaded but not saved: ${err.message}`));
  }

  function loadSampleGym() {
    applyRoster(parseMembersCSV(SAMPLE_GYM_CSV, Date.now()), "sample gym");
  }

  function loadPastedRoster() {
    const list = parseMembersCSV(pasteText, Date.now());
    if (!list.length) { showToast("No members found. Include a header row with at least a Name column."); return; }
    applyRoster(list);
    setPasteText("");
  }

  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseMembersCSV(reader.result, Date.now());
        if (!imported.length) { showToast("No members found. The file needs at least a Name column."); return; }
        applyRoster(imported, file.name);
      } catch {
        showToast("Couldn't read that CSV. Make sure it's a comma-separated export.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";             // let the same file be re-imported
  }

  // Add a single member by hand — reuses the CSV mapper so scoring is identical.
  function addSingleMember() {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const f = addForm;
    const row = [f.name, f.email, f.phone, f.plan, f.value, f.lastVisit, f.joinDate, f.missedPayments, f.classesBooked, f.schedule, f.location];
    const csv = SAMPLE_CSV_HEADERS.map(esc).join(",") + "\n" + row.map(esc).join(",");
    const parsed = parseMembersCSV(csv, Date.now());
    if (!parsed.length) { showToast("Add at least a name"); return; }
    const added = { ...parsed[0], id: newMemberId() };
    // Adding to the sample roster starts a real one: the sample members
    // themselves aren't saved, so they'd vanish on reload anyway.
    const startingFresh = !usingImported;
    const next = startingFresh ? [added] : [...members, added];
    setMembers(next);
    if (startingFresh) { setAiResults({}); setSelected(null); }
    setUsingImported(true);
    setAddForm(blankMember);
    showToast(`Added ${added.name}`);
    saveRoster(startingFresh ? next : [added], startingFresh ? "replace" : "upsert")
      .then(ok => { if (!ok) showToast("Member added, but the server can't save it yet. It will reset on reload."); })
      .catch(err => showToast(`${added.name} added but not saved: ${err.message}`));
  }

  function resetToDemo() {
    if (!IS_DEMO && !window.confirm("Remove your saved roster and go back to the demo members? Saved analyses for these members are deleted too.")) return;
    clearSavedRoster().catch(err => showToast(`Couldn't remove the saved roster: ${err.message}`));
    setMembers(initialMembers);
    setUsingImported(false);
    setSelected(null);
    setAiResults({});
    showToast("Restored the demo roster");
  }

  function downloadImportTemplate() {
    downloadCSV("pulseretain-import-template.csv", SAMPLE_CSV_HEADERS, SAMPLE_CSV_ROWS);
  }

  async function markOutreach(member, ai, smsWasSent = false) {
    const already = outreachLog.find(o => o.memberId === member.id && o.status === "sent");
    if (already) { showToast("Message already logged for " + member.name.split(" ")[0]); return; }
    const log = {
      id: Date.now(),
      memberId: member.id,
      memberName: member.name,
      plan: member.plan,
      value: member.value,
      message: ai.message,
      sentAt: new Date().toLocaleString(),
      status: "sent",
      followUpDays: ai.followUpDays || 3,
      smsSent: smsWasSent,
    };
    setOutreachLog(prev => [...prev, log]);
    // Save to DynamoDB
    try {
      await apiFetch({ action: "save_outreach", log });
    } catch (err) {
      console.error("Failed to save outreach log:", err);
    }
    showToast(`Outreach logged for ${member.name.split(" ")[0]}`);
  }

  async function markStatus(logId, status) {
    setOutreachLog(prev => prev.map(o => o.id === logId ? { ...o, status } : o));
    // Persist status update to DynamoDB
    try {
      await apiFetch({ action: "update_outreach_status", logId, status });
    } catch (err) {
      console.error("Failed to update outreach status:", err);
    }
    if (status === "recovered") {
      showToast("Marked as won back");
      // A won-back member shouldn't get the "we miss you" follow-up.
      const memberId = outreachLog.find(o => o.id === logId)?.memberId;
      if (memberId != null && scheduledIds.has(memberId)) cancelFollowUp(memberId, true);
    }
  }

  // Schedules a real follow-up text: the server sends it N days from now at
  // 10am gym time, after re-checking opt-out, quiet hours and the daily limit.
  // Demo mode, the sample roster and 555 numbers stay a local reminder only.
  async function scheduleFollowUp(member, ai) {
    const first = member.name.split(" ")[0];
    const days  = ai.followUpDays || 3;
    if (!canAutoFollowUp(member)) {
      setScheduledIds(prev => new Set([...prev, member.id]));
      showToast(`Reminder set to follow up with ${first} in ${days} days${member.phone ? " (sample member, no real text)" : " (no phone on file)"}`);
      return;
    }
    try {
      const r = await apiFetch({
        action: "schedule_followup", memberId: member.id, memberName: member.name, phone: member.phone, followUpDays: days,
        member: { name: member.name, plan: member.plan, value: member.value, joinedMonths: member.joinedMonths, usualVisits: member.usualVisits, lastVisit: member.lastVisit },
      });
      if (!r.ok) throw await serverError(r);
      const { followup } = await r.json();
      setScheduledIds(prev => new Set([...prev, member.id]));
      setFollowupDue(prev => ({ ...prev, [member.id]: followup.dueAt }));
      showToast(`Follow-up text to ${first} goes out ${formatDue(followup.dueAt, followup.timezone)}`);
    } catch (err) {
      showToast(`Couldn't schedule follow-up: ${err.message}`);
    }
  }

  async function cancelFollowUp(memberId, quiet = false) {
    setScheduledIds(prev => { const n = new Set(prev); n.delete(memberId); return n; });
    setFollowupDue(prev => { const n = { ...prev }; delete n[memberId]; return n; });
    try { await apiFetch({ action: "cancel_followup", memberId }); }
    catch (err) { console.error("Failed to cancel follow-up:", err); }
    if (!quiet) showToast("Follow-up cancelled");
  }

  async function handleSendSMS(member, ai) {
    if (!member.phone) {
      showToast("No phone number on file for " + member.name.split(" ")[0]);
      return;
    }
    setSmsSending(prev => ({ ...prev, [member.id]: true }));
    try {
      const res = await sendRealSMS(member.phone, ai.message, member);
      setSmsSent(prev => new Set([...prev, member.id]));
      await markOutreach(member, ai, true); // finish logging first so its toast doesn't replace this one
      showToast(res.simulated
        ? `Text to ${member.name.split(" ")[0]} logged (${IS_DEMO ? "demo" : "sample member"}, no real text sent)`
        : `Text sent to ${member.name.split(" ")[0]}`);
    } catch (err) {
      showToast(`Text failed: ${err.message}`);
    }
    setSmsSending(prev => ({ ...prev, [member.id]: false }));
  }

  // ── Conversational retention: draft a reply to a member's response ──────────
  async function draftReply(member, ai) {
    const text = (replyText[member.id] || "").trim();
    if (!text) { showToast("Type the member's reply first"); return; }
    setReplyLoading(prev => ({ ...prev, [member.id]: true }));
    try {
      // Agent backend first (multi-turn memory + server-side guardrails)…
      const agent = await draftReplyAgent(member, text, ai?.message);
      if (agent) {
        setReplyDrafts(prev => ({ ...prev, [member.id]: agent.draft }));
        setConvs(prev => ({ ...prev, [member.id]: agent.turns }));
        setReplyText(prev => ({ ...prev, [member.id]: "" })); // message is in the thread now
      } else {
        // …fallback for the not-yet-upgraded Lambda: legacy single-shot draft.
        const draft = await runClaudeReply(member, ai?.message || "(prior outreach)", text);
        setReplyDrafts(prev => ({ ...prev, [member.id]: draft }));
      }
    } catch (err) {
      setReplyDrafts(prev => ({ ...prev, [member.id]: { error: err.message || "Couldn't draft a reply just now. Please try again." } }));
    }
    setReplyLoading(prev => ({ ...prev, [member.id]: false }));
  }

  // Record the approved studio text on the thread (works with or without SMS).
  async function recordReplyOnThread(member, text) {
    const turns = await logReplySent(member, text);
    if (turns) setConvs(prev => ({ ...prev, [member.id]: turns }));
    setReplyDrafts(prev => ({ ...prev, [member.id]: null })); // draft consumed either way
  }

  async function sendReplySMS(member) {
    const draft = replyDrafts[member.id];
    if (!draft || draft.error) return;
    if (!member.phone) { showToast("No phone number on file for " + member.name.split(" ")[0]); return; }
    setReplySending(prev => ({ ...prev, [member.id]: true }));
    try {
      const res = await sendRealSMS(member.phone, draft.reply, member);
      await recordReplyOnThread(member, draft.reply);
      showToast(res.simulated
        ? `Reply to ${member.name.split(" ")[0]} logged (${IS_DEMO ? "demo" : "sample member"}, no real text sent)`
        : `Reply sent to ${member.name.split(" ")[0]}`);
    } catch (err) {
      showToast(`Reply failed: ${err.message}`);
    }
    setReplySending(prev => ({ ...prev, [member.id]: false }));
  }

  async function approveReplyNoSMS(member) {
    const draft = replyDrafts[member.id];
    if (!draft || draft.error) return;
    await recordReplyOnThread(member, draft.reply);
    showToast(`Reply logged for ${member.name.split(" ")[0]}`);
  }

  function copyReply(member) {
    const draft = replyDrafts[member.id];
    if (!draft || draft.error) return;
    if (navigator.clipboard) navigator.clipboard.writeText(draft.reply);
    showToast("Reply copied");
  }

  // ── Texted replies inbox actions ──────────────────────────────────────────
  // The roster member if we still have them loaded, else the profile the
  // server saved when the gym texted them.
  function inboxMember(th) {
    const m = members.find(x => String(x.id) === String(th.memberId));
    return m || { ...(th.member || {}), id: th.memberId, name: th.memberName || th.member?.name || "Member", phone: th.phone };
  }
  function inboxText(th) {
    return inboxEdits[th.memberId] ?? th.draft?.reply ?? "";
  }
  async function inboxAction(th, fn) {
    setInboxBusy(prev => ({ ...prev, [th.memberId]: true }));
    try { await fn(); } catch (err) { showToast(err.message); }
    setInboxBusy(prev => ({ ...prev, [th.memberId]: false }));
  }
  function afterInboxReply(th, member, turns) {
    if (turns) setConvs(prev => ({ ...prev, [member.id]: turns }));
    setInboxEdits(prev => { const n = { ...prev }; delete n[th.memberId]; return n; });
    return refreshInbox();
  }
  const sendInboxReply = (th) => inboxAction(th, async () => {
    const text = inboxText(th).trim();
    if (!text) { showToast("Write a reply first"); return; }
    const member = inboxMember(th);
    const phone = th.phone || member.phone;
    if (!phone) { showToast("No phone number on file for " + member.name.split(" ")[0]); return; }
    const res = await sendRealSMS(phone, text, member);
    await afterInboxReply(th, member, await logReplySent(member, text));
    showToast(res.simulated
      ? `Reply to ${member.name.split(" ")[0]} logged (${IS_DEMO ? "demo" : "sample member"}, no real text sent)`
      : `Reply sent to ${member.name.split(" ")[0]}`);
  });
  const logInboxReply = (th) => inboxAction(th, async () => {
    const text = inboxText(th).trim();
    if (!text) { showToast("Write a reply first"); return; }
    const member = inboxMember(th);
    await afterInboxReply(th, member, await logReplySent(member, text));
    showToast(`Reply logged for ${member.name.split(" ")[0]} (not texted)`);
  });
  const redraftInboxReply = (th) => inboxAction(th, async () => {
    const member = inboxMember(th);
    const lastMember = [...th.turns].reverse().find(t => t.role === "member");
    if (!lastMember) return;
    const agent = await draftReplyAgent(member, lastMember.text, null);
    if (!agent) throw new Error("Drafting isn't available on this server yet");
    setInbox(prev => (prev || []).map(x => x.memberId === th.memberId ? { ...x, draft: { ...agent.draft, forAt: lastMember.at } } : x));
    setInboxEdits(prev => { const n = { ...prev }; delete n[th.memberId]; return n; });
  });
  const handledInboxReply = (th) => inboxAction(th, async () => {
    await markReplyHandled(th.memberId);
    await refreshInbox();
  });

  // ── AI calls ───────────────────────────────────────────────────────────────
  const analyzeAll = async () => {
    // Default view → the high-risk members. With a filter or search active →
    // exactly the members on screen (fixes: filtering to Medium and clicking
    // "Run AI Analysis" used to do nothing).
    const defaultView = filterRisk === "all" && search.trim() === "";
    const targets = filteredMembers.filter(m => (defaultView ? m.risk === "high" : true));
    if (targets.length === 0) { showToast("No members in this view to analyze"); return; }
    setAnalyzing(true);
    for (const m of targets) {
      setLoading(prev => ({ ...prev, [m.id]: true }));
      try {
        const result = await runClaudeAnalysis(m);
        setAiResults(prev => ({ ...prev, [m.id]: result }));
      } catch (err) {
        setAiResults(prev => ({ ...prev, [m.id]: { error: aiErrorText(err) } }));
      }
      setLoading(prev => ({ ...prev, [m.id]: false }));
    }
    setAnalyzing(false);
  };

  const analyzeOne = async (member, e) => {
    if (e) e.stopPropagation();
    setLoading(prev => ({ ...prev, [member.id]: true }));
    try {
      const result = await runClaudeAnalysis(member);
      setAiResults(prev => ({ ...prev, [member.id]: result }));
    } catch (err) {
      setAiResults(prev => ({ ...prev, [member.id]: { error: aiErrorText(err) } }));
    }
    setLoading(prev => ({ ...prev, [member.id]: false }));
  };

  // ── "Today's 3" queue actions ──────────────────────────────────────────────
  function skipForToday(member) {
    setDismissedToday(prev => new Set([...prev, member.id]));
  }

  // Prep every queued member that hasn't been analyzed yet (one tap → all ready)
  const prepTodaysQueue = async () => {
    const pending = todaysQueue.filter(m => !aiResults[m.id] && !loading[m.id]);
    if (!pending.length) return;
    setAnalyzing(true);
    for (const m of pending) {
      setLoading(prev => ({ ...prev, [m.id]: true }));
      try {
        const result = await runClaudeAnalysis(m);
        setAiResults(prev => ({ ...prev, [m.id]: result }));
      } catch (err) {
        setAiResults(prev => ({ ...prev, [m.id]: { error: aiErrorText(err) } }));
      }
      setLoading(prev => ({ ...prev, [m.id]: false }));
    }
    setAnalyzing(false);
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  // ── Multi-location lens ──────────────────────────────────────────────────
  // Owners with several sites get a global location selector; every derived
  // value below is computed from the members at the selected site. "all" keeps
  // the whole roster, so single-location gyms behave exactly as before.
  const locations       = useMemo(() => listLocations(members), [members]);
  const locationSummary = useMemo(() => summarizeLocations(members), [members]);
  const scopedMembers   = useMemo(() => filterByLocation(members, filterLocation), [members, filterLocation]);

  const stats = useMemo(() => buildStats(scopedMembers, outreachLog), [scopedMembers, outreachLog]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedMembers.filter(m =>
      (filterRisk === "all" || m.risk === filterRisk) &&
      (q === "" || m.name.toLowerCase().includes(q))
    );
  }, [scopedMembers, filterRisk, search]);

  const analyticsData = useMemo(() => {
    const riskCounts   = { high: 0, medium: 0, low: 0 };
    const planRevenue  = {};
    let totalRisk      = 0;
    scopedMembers.forEach(m => {
      riskCounts[m.risk]++;
      planRevenue[m.plan] = (planRevenue[m.plan] || 0) + m.value;
      totalRisk += m.score;
    });
    return {
      riskCounts,
      planRevenue,
      avgRisk: scopedMembers.length ? Math.round(totalRisk / scopedMembers.length) : 0,
      atRiskRevenue: scopedMembers.filter(m => m.risk === "high").reduce((a, m) => a + m.value, 0),
      totalRevenue: scopedMembers.reduce((a, m) => a + m.value, 0),
    };
  }, [scopedMembers]);

  const insights = useMemo(
    () => computeInsights(scopedMembers, { aiResults, intel, outreachLog }),
    [scopedMembers, aiResults, intel, outreachLog]
  );

  const todaysQueue = useMemo(
    () => pickTodaysQueue(scopedMembers, { aiResults, outreachLog, dismissed: dismissedToday, size: 3 }),
    [scopedMembers, aiResults, outreachLog, dismissedToday]
  );

  // ══════════════════════════════════════════════════════════════════════════
  const firstOf = (m) => m.name.split(" ")[0];
  // "Usually Tue & Thu" reads fine, "Usually Every Saturday" doesn't.
  const usually = (s) => (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(s || "") ? s : String(s || "").toLowerCase());
  const shortDate = (s) => {
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };
  const pad = isMobile ? "16px" : "32px";
  const riskCounts = { all: scopedMembers.length, high: 0, medium: 0, low: 0 };
  scopedMembers.forEach(m => { riskCounts[m.risk] = (riskCounts[m.risk] || 0) + 1; });
  const statByLabel = Object.fromEntries(stats.map(s => [s.label, s.value]));
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const outreachCounts = {
    sent:      outreachLog.length,
    responded: outreachLog.filter(o => ["responded", "recovered"].includes(o.status)).length,
    recovered: outreachLog.filter(o => o.status === "recovered").length,
    noReply:   outreachLog.filter(o => o.status === "no_response").length,
  };

  // Expanded detail under a member row: why they're at risk, the drafted text,
  // and the reply helper. Kept as one function so the table stays readable.
  function renderMemberDetail(m) {
    const ai = aiResults[m.id];
    const isLoading = loading[m.id];
    const logged = outreachLog.find(o => o.memberId === m.id);
    const scheduled = scheduledIds.has(m.id);
    const wrap = { padding: isMobile ? "16px" : "20px 24px 24px", background: T.page, borderBottom: `1px solid ${T.line}` };

    if (isLoading) return <div style={wrap}><p style={{ margin: 0, fontSize: 13, color: T.muted }}>Analyzing {firstOf(m)}…</p></div>;
    if (ai && ai.error) return (
      <div style={wrap}>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: T.redDark }}>{ai.error}</p>
        <button onClick={() => analyzeOne(m)} style={btn("secondary")}>Try again</button>
      </div>
    );
    if (!ai) return (
      <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <p style={{ margin: 0, fontSize: 13, color: T.muted }}>No analysis yet for {firstOf(m)}.</p>
        <button onClick={() => analyzeOne(m)} style={btn("draft")}>Analyze {firstOf(m)}</button>
        <button onClick={() => setModalMember(m)} style={btn("ghost")}>Contact details</button>
      </div>
    );

    const d = replyDrafts[m.id];
    const sentimentColor = { positive: T.green, hesitant: T.amber, leaving: T.redDark }[d?.sentiment] || T.muted;
    return (
      <div style={wrap}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.3fr", gap: isMobile ? 20 : 40 }}>
          <div>
            <p style={eyebrow}>Why {firstOf(m)} is at risk</p>
            <p style={{ margin: "6px 0 16px", fontSize: 14, color: T.body, lineHeight: 1.6 }}>{ai.reason}</p>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
              <div><p style={eyebrow}>Risk score</p><p style={{ margin: "4px 0 0", fontSize: 15, color: T.ink }}>{ai.score} / 100</p></div>
              {ai.offerType && offerLabels[ai.offerType] && (
                <div><p style={eyebrow}>Suggested offer</p><p style={{ margin: "4px 0 0", fontSize: 15, color: T.ink }}>{offerLabels[ai.offerType]}</p></div>
              )}
              <div><p style={eyebrow}>Follow up</p><p style={{ margin: "4px 0 0", fontSize: 15, color: T.ink }}>after {ai.followUpDays || 3} days</p></div>
            </div>
          </div>
          <div>
            <p style={eyebrow}>Suggested text</p>
            <p style={{ margin: "6px 0 14px", fontSize: 14, color: T.body, lineHeight: 1.6, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 14px" }}>{ai.message}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {!smsSent.has(m.id) ? (
                <button onClick={() => handleSendSMS(m, ai)} disabled={smsSending[m.id]} style={btn("send", smsSending[m.id] ? { opacity: 0.5, cursor: "not-allowed" } : {})}>{smsSending[m.id] ? "Sending…" : "Send text"}</button>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 600, color: T.green, background: T.greenTint, padding: "6px 12px", borderRadius: 8 }}>Texted {m.phone}</span>
              )}
              {!logged && <button onClick={() => markOutreach(m, ai)} style={btn("log")}>Log as sent</button>}
              {!scheduled && <button onClick={() => scheduleFollowUp(m, ai)} style={btn("remind")}>{canAutoFollowUp(m) ? `Text a follow-up in ${ai.followUpDays || 3} days` : `Remind me in ${ai.followUpDays || 3} days`}</button>}
              <button onClick={() => setModalMember(m)} style={btn("ghost")}>Contact details</button>
            </div>
            {logged && <p style={{ margin: "10px 0 0", fontSize: 12, color: T.faint }}>Logged {logged.sentAt}</p>}
            {scheduled && followupDue[m.id] && (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "#a85410", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                Follow-up text goes out {formatDue(followupDue[m.id], gymTz)}
                <button onClick={() => cancelFollowUp(m.id)} style={btn("ghost", { padding: "4px 8px", fontSize: 12 })}>Cancel</button>
              </p>
            )}
          </div>
        </div>

        {/* Member replied? Draft the next text */}
        <div style={{ marginTop: 22, paddingTop: 20, borderTop: `1px solid ${T.line}` }}>
          <p style={{ ...eyebrow, color: T.ink, fontWeight: 600, fontSize: 13 }}>Did {firstOf(m)} reply?</p>
          <p style={{ margin: "2px 0 12px", fontSize: 13, color: T.muted }}>Texted replies show up in Outreach automatically. You can also paste one here.</p>

          {(convs[m.id] || []).length > 0 && (
            <div role="log" aria-label={`Conversation with ${m.name}`} style={{ maxHeight: 240, overflowY: "auto", marginBottom: 12, padding: "12px 14px", background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {convs[m.id].map((t, i) => (
                <div key={i} style={{ alignSelf: t.role === "member" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                  <p style={{ margin: "0 0 3px", fontSize: 11, color: T.faint, textAlign: t.role === "member" ? "right" : "left" }}>{t.role === "member" ? firstOf(m) : "Studio"}</p>
                  <div style={{ background: t.role === "member" ? T.soft : "#eef0f6", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: T.body, lineHeight: 1.5 }}>{t.text}</div>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={replyText[m.id] || ""}
            onChange={e => setReplyText(prev => ({ ...prev, [m.id]: e.target.value }))}
            placeholder={`e.g. "Honestly it's just gotten too expensive for me right now."`}
            aria-label={`Reply received from ${m.name}`}
            rows={2}
            style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: SANS, resize: "vertical", outline: "none", background: "#fff", color: T.body }}
          />
          <button onClick={() => draftReply(m, ai)} disabled={replyLoading[m.id]} style={btn("draft", { marginTop: 8, ...(replyLoading[m.id] ? { opacity: 0.5, cursor: "not-allowed" } : {}) })}>
            {replyLoading[m.id] ? "Drafting…" : "Draft a reply"}
          </button>

          {d && d.error && <p style={{ margin: "10px 0 0", fontSize: 13, color: T.redDark }}>{d.error}</p>}
          {d && !d.error && (
            <div style={{ marginTop: 14, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 10, fontSize: 13 }}>
                <span style={{ color: T.muted }}>Tone: <span style={{ color: sentimentColor, textTransform: "capitalize" }}>{d.sentiment || "reply"}</span></span>
                {d.suggestedOffer && offerLabels[d.suggestedOffer] && <span style={{ color: T.muted }}>Offer: <span style={{ color: T.ink }}>{offerLabels[d.suggestedOffer]}</span></span>}
              </div>
              {d.escalate && <p style={{ margin: "0 0 10px", fontSize: 13, color: T.redDark }}>We recommend you handle this one personally.</p>}
              <p style={{ margin: 0, fontSize: 14, color: T.body, lineHeight: 1.6 }}>{d.reply}</p>
              {d.nextStep && <p style={{ margin: "10px 0 0", fontSize: 13, color: T.muted }}>Next step: {d.nextStep}</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button onClick={() => sendReplySMS(m)} disabled={replySending[m.id]} style={btn("send", replySending[m.id] ? { opacity: 0.5, cursor: "not-allowed" } : {})}>{replySending[m.id] ? "Sending…" : "Send reply"}</button>
                <button onClick={() => approveReplyNoSMS(m)} aria-label="Approve and log reply without sending SMS" style={btn("log")}>Log as sent</button>
                <button onClick={() => copyReply(m)} aria-label="Copy drafted reply" style={btn("ghost")}>Copy</button>
                <button onClick={() => draftReply(m, ai)} aria-label="Redraft reply" style={btn("ghost")}>Redraft</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
    <ThemeProvider theme={pulseTheme}>
    <div className="pulse-auth-bg" style={{ minHeight: "100vh", background: "linear-gradient(165deg,#15152b 0%,#1a1a2e 45%,#262652 100%)" }}>
    <AuthGate>
      {({ signOut, user }) => (
        <div style={{ minHeight: "100vh", background: T.page, fontFamily: SANS, color: T.body }}>

          {/* ── Loading screen ── */}
          {dataLoading && (
            <div style={{ position: "fixed", inset: 0, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 9999 }}>
              <Logo size={40} />
              <p style={{ margin: 0, fontSize: 14, color: T.muted }}>Loading your members…</p>
            </div>
          )}

          {/* ── Header ── */}
          <header style={{ background: "#fff", borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, zIndex: 100 }}>
            <div style={{ maxWidth: 1120, margin: "0 auto", padding: `0 ${pad}`, display: "flex", alignItems: "center", gap: isMobile ? 12 : 40, height: 60 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Logo size={26} />
                <span style={{ fontFamily: SERIF, fontSize: 18, color: T.ink }}>PulseRetain</span>
              </div>
              {!isMobile && (
                <nav style={{ display: "flex", gap: 28, height: "100%" }}>
                  {TABS.map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} aria-current={activeTab === tab ? "page" : undefined}
                      style={{ background: "none", border: "none", borderBottom: `2px solid ${activeTab === tab ? T.ink : "transparent"}`, padding: "0 2px", height: "100%", cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: activeTab === tab ? 600 : 400, color: activeTab === tab ? T.ink : T.muted }}>
                      {tab}{tab === "Outreach" && waitingReplies > 0 && <span aria-label={`${waitingReplies} replies waiting`} style={{ marginLeft: 6, background: T.red, color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>{waitingReplies}</span>}
                    </button>
                  ))}
                </nav>
              )}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
                {!isMobile && <span style={{ fontSize: 13, color: T.faint }}>{user?.signInDetails?.loginId}</span>}
                <button onClick={signOut} style={btn("secondary", { padding: "6px 12px", fontWeight: 500 })}>{IS_DEMO ? "Sign up" : "Sign out"}</button>
              </div>
            </div>
            {isMobile && (
              <nav style={{ display: "flex", borderTop: `1px solid ${T.line}` }}>
                {TABS.map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} aria-current={activeTab === tab ? "page" : undefined}
                    style={{ flex: 1, background: "none", border: "none", borderBottom: `2px solid ${activeTab === tab ? T.ink : "transparent"}`, padding: "11px 0", cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: activeTab === tab ? 600 : 400, color: activeTab === tab ? T.ink : T.muted }}>
                    {tab}{tab === "Outreach" && waitingReplies > 0 && <span aria-label={`${waitingReplies} replies waiting`} style={{ marginLeft: 6, background: T.red, color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>{waitingReplies}</span>}
                  </button>
                ))}
              </nav>
            )}
            <div style={{ height: 3, background: ACCENT_GRADIENT }} />
          </header>

          {/* ── Demo note (public no-login demo) ── */}
          {IS_DEMO && (
            <div role="note" style={{ background: T.soft, borderBottom: `1px solid ${T.line}`, padding: `9px ${pad}`, fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 1.5 }}>
              You're viewing a demo gym with sample members. No texts are sent.{" "}
              <button onClick={exitDemoToSignUp} style={{ background: "none", border: "none", padding: 0, fontFamily: SANS, fontSize: 13, color: T.ink, fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>Sign up to use your own members</button>
            </div>
          )}

          {/* ── Toast ── */}
          {toast && (
            <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: T.ink, color: "#fff", padding: "10px 18px", borderRadius: 8, fontSize: 13, zIndex: 9999, width: "max-content", maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", textAlign: "center" }}>
              {toast}
            </div>
          )}

          <main style={{ maxWidth: 1120, margin: "0 auto", padding: isMobile ? "18px 16px 40px" : "28px 32px 48px" }}>

            {/* ════════════════════════════════════════════════════════════
                TAB: TODAY  (revenue at risk → who to text → everyone else)
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "Today" && (
              <>
                {/* Page title + location picker */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: isMobile ? 14 : 18 }}>
                  <p style={{ margin: 0, fontSize: 13, color: T.muted }}>
                    {todayLabel} · {usingImported ? "Your roster" : "Pulse Studio"} · {scopedMembers.length} members{filterLocation !== ALL_LOCATIONS ? ` at ${filterLocation}` : ""}
                    {usingImported && <button onClick={resetToDemo} style={{ marginLeft: 10, background: "none", border: "none", color: T.muted, fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0 }}>Reset to demo</button>}
                  </p>
                  {locations.length > 1 && (
                    <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} aria-label="Filter members by location"
                      style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", fontFamily: SANS, fontSize: 13, color: T.ink, cursor: "pointer" }}>
                      <option value={ALL_LOCATIONS}>All locations</option>
                      {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                    </select>
                  )}
                </div>

                {/* Headline: revenue at risk */}
                <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.25fr 1fr", gap: isMobile ? 14 : 20, alignItems: "stretch", marginBottom: isMobile ? 24 : 32 }}>
                  <div style={{ background: "#fff", border: `1px solid ${T.line}`, borderLeft: `4px solid ${T.red}`, borderRadius: 12, padding: isMobile ? "18px 16px" : "22px 26px" }}>
                    <p style={{ ...eyebrow, fontSize: 14 }}>Revenue at risk</p>
                    <p style={{ margin: "8px 0 0", fontFamily: SERIF, fontSize: isMobile ? 44 : 56, lineHeight: 1, color: insights.revenueAtRisk > 0 ? T.redDark : T.ink }}>
                      ${insights.revenueAtRisk.toLocaleString()}<span style={{ fontSize: isMobile ? 18 : 22, color: T.muted }}> /month</span>
                    </p>
                    <p style={{ margin: "12px 0 0", fontSize: 15, color: T.body, lineHeight: 1.55, maxWidth: 520 }}>
                      {insights.atRisk > 0
                        ? <>That's <strong style={{ color: T.ink }}>${insights.projectedAnnual.toLocaleString()} a year</strong> from {insights.atRisk} member{insights.atRisk !== 1 ? "s" : ""} who are likely to cancel. Start with the people below.</>
                        : "No members are at high risk right now."}
                    </p>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr", gap: 12 }}>
                    <Stat isMobile={isMobile} tone="good" label="Members won back" value={statByLabel["Members Recovered"]} sub="this month" />
                    <Stat isMobile={isMobile} tone="good" label="Revenue saved" value={statByLabel["Revenue Saved"]} sub="per year" />
                    <Stat isMobile={isMobile} tone="good" label="Reply rate" value={statByLabel["Avg Response Rate"]} sub={`${outreachLog.length} texts sent`} />
                    <Stat isMobile={isMobile} accent label="Members at risk" value={insights.atRisk} sub="high risk right now" />
                  </div>
                </section>

                {/* Reach out today */}
                <section style={{ marginBottom: isMobile ? 28 : 32 }}>
                  <SectionHead isMobile={isMobile}
                    title="Reach out today"
                    sub={todaysQueue.length ? "Highest revenue at risk first. Review the text, then send it." : undefined}
                    right={todaysQueue.some(m => !aiResults[m.id]) && (
                      <button onClick={prepTodaysQueue} disabled={analyzing} style={btn("draft", analyzing ? { opacity: 0.5, cursor: "not-allowed" } : {})}>{analyzing ? "Drafting…" : "Draft all messages"}</button>
                    )} />
                  <div style={accentPanel(T.purple)}>
                    {todaysQueue.length === 0 ? (
                      <p style={{ margin: 0, padding: "32px 24px", fontSize: 14, color: T.muted, textAlign: "center" }}>You're all caught up. Nobody needs a message today.</p>
                    ) : todaysQueue.map((m, idx) => {
                      const ai = aiResults[m.id];
                      const ready = ai && !ai.error;
                      const isLoading = loading[m.id];
                      return (
                        <div key={m.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "230px 1fr auto", gap: isMobile ? 14 : 32, padding: isMobile ? "14px 16px" : "16px 24px", borderTop: idx ? `1px solid ${T.line}` : "none", alignItems: "start" }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: T.ink }}>{m.name}</p>
                            <p style={{ margin: "4px 0 0", fontSize: 13, color: T.muted }}>Last visit {m.lastVisit.toLowerCase()}</p>
                            <p style={{ margin: "2px 0 0", fontSize: 13, color: T.muted }}>Usually {usually(m.usualVisits)}</p>
                            <p style={{ margin: "10px 0 0", fontFamily: SERIF, fontSize: 19, color: T.redDark }}>${m.value}<span style={{ fontFamily: SANS, fontSize: 12, color: T.muted }}> /mo at risk</span></p>
                            {m.missedPayments > 0 && <p style={{ margin: "2px 0 0", fontSize: 12, color: T.muted }}>{m.missedPayments} missed payment{m.missedPayments !== 1 ? "s" : ""}</p>}
                          </div>
                          <div>
                            {isLoading ? (
                              <p style={{ margin: 0, fontSize: 14, color: T.muted }}>Writing a message…</p>
                            ) : ready ? (
                              <>
                                <p style={eyebrow}>Suggested text</p>
                                <p style={{ margin: "6px 0 0", fontSize: 14, color: T.body, lineHeight: 1.55, background: T.page, borderLeft: `3px solid ${T.purple}`, borderRadius: 6, padding: "8px 12px" }}>{ai.message}</p>
                              </>
                            ) : (
                              <p style={{ margin: 0, fontSize: 14, color: T.faint }}>{ai && ai.error ? ai.error : "No message drafted yet."}</p>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
                            {ready ? (
                              <>
                                {!smsSent.has(m.id) && <button onClick={() => handleSendSMS(m, ai)} disabled={smsSending[m.id]} style={btn("send", smsSending[m.id] ? { opacity: 0.5, cursor: "not-allowed" } : {})}>{smsSending[m.id] ? "Sending…" : "Send text"}</button>}
                                <button onClick={() => markOutreach(m, ai)} style={btn("log")}>Log as sent</button>
                              </>
                            ) : (
                              <button onClick={() => analyzeOne(m)} disabled={isLoading} style={btn("draft", isLoading ? { opacity: 0.5, cursor: "not-allowed" } : {})}>Draft message</button>
                            )}
                            <button onClick={() => skipForToday(m)} aria-label={`Skip ${m.name} for today`} style={btn("ghost")}>Skip</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* All members */}
                <section>
                  <SectionHead isMobile={isMobile}
                    title="All members"
                    sub={`${riskCounts.high} high risk · ${riskCounts.medium} medium · ${riskCounts.low} low`}
                    right={
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={analyzeAll} disabled={analyzing} style={btn("log", analyzing ? { opacity: 0.5, cursor: "not-allowed" } : {})}>{analyzing ? "Analyzing…" : "Analyze members"}</button>
                        <button onClick={exportMembersCSV} aria-label="Export member list as CSV" style={btn("ghost")}>Export CSV</button>
                        <button onClick={() => setShowData(true)} aria-label="Add or import your gym's members" style={btn("secondary")}>Add members</button>
                      </div>
                    } />

                  <div style={accentPanel(T.orange)}>
                    {/* Toolbar: risk filter + search */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: isMobile ? "12px 16px" : "12px 24px", borderBottom: `1px solid ${T.line}` }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {["all", "high", "medium", "low"].map(f => (
                          <button key={f} onClick={() => setFilterRisk(f)} aria-pressed={filterRisk === f} aria-label={`Filter members by ${f} risk`}
                            style={{ background: filterRisk === f ? (f === "all" ? T.soft : riskTone[f].bg) : "transparent", border: "none", borderRadius: 6, padding: "6px 10px", fontFamily: SANS, fontSize: 13, cursor: "pointer", color: filterRisk === f ? (f === "all" ? T.ink : riskTone[f].color) : T.muted, fontWeight: filterRisk === f ? 600 : 400 }}>
                            {f === "all" ? "All" : riskConfig[f].label} <span style={{ color: T.faint, fontWeight: 400 }}>{riskCounts[f]}</span>
                          </button>
                        ))}
                      </div>
                      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name" aria-label="Search members by name"
                        style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${T.line}`, fontFamily: SANS, fontSize: isMobile ? 16 : 13, outline: "none", width: isMobile ? "100%" : 220, boxSizing: "border-box", color: T.ink }} />
                    </div>

                    {!isMobile && (
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 1fr 1.1fr 0.8fr 1fr 20px", gap: 12, padding: "8px 24px", borderBottom: `1px solid ${T.line}`, background: T.page }}>
                        {["Member", "Plan", "Last visit", "Usual schedule", "Monthly", "Risk", ""].map((h, i) => (
                          <span key={i} style={{ fontSize: 12, color: T.faint }}>{h}</span>
                        ))}
                      </div>
                    )}

                    {filteredMembers.length === 0 && (
                      <p style={{ margin: 0, padding: "36px 24px", textAlign: "center", color: T.muted, fontSize: 14 }}>No members match this filter or search.</p>
                    )}
                    {filteredMembers.map(m => {
                      const ai = aiResults[m.id];
                      const effRisk = deriveRisk(m, ai);
                      const score = ai && !ai.error ? ai.score : m.score;
                      const isSelected = selected === m.id;
                      const logged = outreachLog.find(o => o.memberId === m.id);
                      const status = loading[m.id] ? "Analyzing…" : logged ? "Contacted" : ai && ai.error ? "Analysis failed" : ai ? "Message ready" : null;
                      const meta = [locations.length > 1 ? m.location : null, status, scheduledIds.has(m.id) ? "Follow-up set" : null].filter(Boolean).join(" · ");
                      return (
                        <div key={m.id}>
                          <div onClick={() => setSelected(isSelected ? null : m.id)} role="button" tabIndex={0} aria-expanded={isSelected}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(isSelected ? null : m.id); } }}
                            style={isMobile
                              ? { padding: "14px 16px", borderBottom: `1px solid ${T.line}`, cursor: "pointer", background: isSelected ? T.page : "#fff" }
                              : { display: "grid", gridTemplateColumns: "2fr 1.4fr 1fr 1.1fr 0.8fr 1fr 20px", gap: 12, alignItems: "center", padding: "10px 24px", borderBottom: `1px solid ${T.line}`, cursor: "pointer", background: isSelected ? T.page : "#fff" }}>
                            {isMobile ? (
                              <>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                  <span style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>{m.name}</span>
                                  <RiskTag risk={effRisk} score={score} />
                                </div>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: T.muted }}>{m.plan} · last visit {m.lastVisit.toLowerCase()} · ${m.value}/mo</p>
                                {meta && <p style={{ margin: "2px 0 0", fontSize: 12, color: T.faint }}>{meta}</p>}
                              </>
                            ) : (
                              <>
                                <div>
                                  <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{m.name}</span>
                                  {meta && <span style={{ display: "block", fontSize: 12, color: logged ? T.green : ai && !ai.error ? T.purple : T.faint, marginTop: 2 }}>{meta}</span>}
                                </div>
                                <span style={{ fontSize: 14 }}>{m.plan}</span>
                                <span style={{ fontSize: 14, color: effRisk === "high" ? T.ink : T.body }}>{m.lastVisit}</span>
                                <span style={{ fontSize: 14, color: T.muted }}>{m.usualVisits}</span>
                                <span style={{ fontSize: 14 }}>${m.value}</span>
                                <RiskTag risk={effRisk} score={score} />
                                <Chevron open={isSelected} />
                              </>
                            )}
                          </div>
                          {isSelected && renderMemberDetail(m)}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {/* ════════════════════════════════════════════════════════════
                TAB: OUTREACH  (log of everyone contacted)
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "Outreach" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                  <div>
                    <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: isMobile ? 26 : 32, fontWeight: 400, color: T.ink }}>Outreach</h1>
                    <p style={{ margin: "6px 0 0", fontSize: 14, color: T.muted }}>Everyone you've contacted and how it went.</p>
                    {!IS_DEMO && gymTz && (
                      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: T.muted, flexWrap: "wrap" }}>
                        Texts only go out 8am to 9pm in
                        <select value={gymTz} onChange={e => changeGymTz(e.target.value)} aria-label="Gym time zone" style={{ fontFamily: SANS, fontSize: isMobile ? 16 : 13, padding: "5px 8px", borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", color: T.ink, maxWidth: "100%" }}>
                          {timeZoneOptions(gymTz).map(z => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                        </select>
                      </label>
                    )}
                    {!IS_DEMO && reportPrefs && (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, fontSize: 13, color: T.muted, flexWrap: "wrap" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input type="checkbox" checked={reportPrefs.weeklyReport} onChange={e => toggleWeeklyReport(e.target.checked)} />
                          Weekly email report{reportPrefs.reportEmail ? ` to ${reportPrefs.reportEmail}` : ""}, Mondays
                        </label>
                        {reportPrefs.reportEmail && (
                          <button onClick={sendTestReport} disabled={testReportBusy} style={{ background: "none", border: "none", padding: 0, fontFamily: SANS, fontSize: 13, color: T.purple, textDecoration: "underline", cursor: testReportBusy ? "default" : "pointer" }}>
                            {testReportBusy ? "Sending..." : "Send me this week's now"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {outreachLog.length > 0 && <button onClick={exportOutreachCSV} aria-label="Export outreach log as CSV" style={btn("secondary")}>Export CSV</button>}
                </div>

                {outreachLog.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                    <Stat isMobile={isMobile} label="Texts sent" value={outreachCounts.sent} />
                    <Stat isMobile={isMobile} tone="mid" label="Replied" value={outreachCounts.responded} />
                    <Stat isMobile={isMobile} tone="good" label="Won back" value={outreachCounts.recovered} />
                    <Stat isMobile={isMobile} tone="good" label="Revenue saved" value={statByLabel["Revenue Saved"]} sub="per year" />
                  </div>
                )}

                {/* ── Member replies: texts captured automatically, with a drafted answer ── */}
                {inbox && inbox.length > 0 && (() => {
                  const waiting = inbox.filter(t => t.needsReply);
                  const done = inbox.filter(t => !t.needsReply).slice(0, 5);
                  const toneColor = { positive: T.green, hesitant: T.amberDark, leaving: T.redDark };
                  const when = (iso) => { try { return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
                  const firstName = (th) => String(th.memberName || "Member").split(" ")[0];
                  return (
                    <section aria-label="Member replies" style={{ marginBottom: 28 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                        <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 20, fontWeight: 400, color: T.ink }}>Member replies</h2>
                        {waiting.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: T.redDark, background: T.redTint, padding: "2px 10px", borderRadius: 20 }}>{waiting.length} waiting</span>}
                      </div>
                      <p style={{ margin: "0 0 14px", fontSize: 14, color: T.muted }}>Texts members send back land here with a drafted answer. Nothing is sent until you approve it.</p>
                      {waiting.length === 0 && (
                        <div style={{ ...panel, padding: "16px 20px", fontSize: 14, color: T.muted, marginBottom: 12 }}>All caught up. No replies waiting.</div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {waiting.map(th => {
                          const busy = !!inboxBusy[th.memberId];
                          const d = th.draft;
                          const dim = busy ? { opacity: 0.5, cursor: "not-allowed" } : {};
                          return (
                            <div key={th.memberId} style={{ ...accentPanel(d?.escalate ? T.red : T.orange), padding: isMobile ? "14px 16px" : "18px 22px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                                <span style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>{th.memberName || "Member"}</span>
                                <span style={{ fontSize: 12, color: T.faint }}>Replied {when(th.lastMemberAt)}</span>
                              </div>
                              <div role="log" aria-label={`Conversation with ${th.memberName}`} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                                {th.turns.slice(-4).map((t, i) => (
                                  <div key={i} style={{ alignSelf: t.role === "member" ? "flex-end" : "flex-start", maxWidth: isMobile ? "88%" : "75%" }}>
                                    <p style={{ margin: "0 0 3px", fontSize: 11, color: T.faint, textAlign: t.role === "member" ? "right" : "left" }}>{t.role === "member" ? firstName(th) : "Studio"}</p>
                                    <div style={{ background: t.role === "member" ? T.soft : "#eef0f6", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: T.body, lineHeight: 1.5 }}>{t.text}</div>
                                  </div>
                                ))}
                              </div>
                              {d?.escalate && <p style={{ margin: "0 0 10px", fontSize: 13, color: T.redDark }}>We recommend you handle this one personally.</p>}
                              {d ? (
                                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 8, fontSize: 13 }}>
                                  <span style={{ color: T.muted }}>Tone: <span style={{ color: toneColor[d.sentiment] || T.muted, textTransform: "capitalize" }}>{d.sentiment || "reply"}</span></span>
                                  {offerLabels[d.suggestedOffer] && <span style={{ color: T.muted }}>Offer: <span style={{ color: T.ink }}>{offerLabels[d.suggestedOffer]}</span></span>}
                                </div>
                              ) : (
                                <p style={{ margin: "0 0 8px", fontSize: 13, color: T.muted }}>No draft yet. Draft one, or write your own reply.</p>
                              )}
                              <textarea
                                aria-label={`Your reply to ${th.memberName}`}
                                value={inboxText(th)}
                                onChange={e => setInboxEdits(prev => ({ ...prev, [th.memberId]: e.target.value }))}
                                rows={3} maxLength={480}
                                style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: SANS, resize: "vertical", outline: "none", background: "#fff", color: T.body, lineHeight: 1.5 }}
                              />
                              {d?.nextStep && <p style={{ margin: "8px 0 0", fontSize: 13, color: T.muted }}>Next step: {d.nextStep}</p>}
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                                <button disabled={busy} onClick={() => sendInboxReply(th)} style={btn("send", dim)}>{busy ? "Working…" : "Send reply"}</button>
                                <button disabled={busy} onClick={() => logInboxReply(th)} aria-label="Log reply without sending a text" style={btn("log", dim)}>Log as sent</button>
                                <button disabled={busy} onClick={() => redraftInboxReply(th)} style={btn(d ? "ghost" : "draft", dim)}>{d ? "Redraft" : "Draft a reply"}</button>
                                <button disabled={busy} onClick={() => handledInboxReply(th)} style={btn("ghost", dim)}>Mark handled</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {done.length > 0 && (
                        <details style={{ marginTop: 12, fontSize: 13, color: T.muted }}>
                          <summary style={{ cursor: "pointer" }}>Recently answered ({done.length})</summary>
                          {done.map(th => (
                            <p key={th.memberId} style={{ margin: 0, padding: "8px 0", borderBottom: `1px solid ${T.line}` }}>
                              <span style={{ color: T.ink, fontWeight: 600 }}>{th.memberName}</span>: “{(th.turns.filter(t => t.role === "member").pop()?.text || "").slice(0, 80)}”
                            </p>
                          ))}
                        </details>
                      )}
                    </section>
                  );
                })()}


                {outreachLog.length === 0 ? (
                  <div style={{ ...panel, padding: "48px 24px", textAlign: "center" }}>
                    <p style={{ fontSize: 16, color: T.ink, margin: "0 0 6px", fontFamily: SERIF }}>No outreach yet</p>
                    <p style={{ fontSize: 14, color: T.muted, margin: 0 }}>Texts you send or log from the Today page will show up here.</p>
                  </div>
                ) : (
                  <div style={accentPanel(T.purple)}>
                    {!isMobile && (
                      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 2.4fr 1.4fr", gap: 16, padding: "8px 24px", borderBottom: `1px solid ${T.line}`, background: T.page }}>
                        {["Member", "Sent", "Message", "Outcome"].map(h => <span key={h} style={{ fontSize: 12, color: T.faint }}>{h}</span>)}
                      </div>
                    )}
                    {[...outreachLog].reverse().map(log => {
                      const statusMeta = {
                        sent:        { label: "Waiting for reply", dot: T.purple,   color: "#6c3483", bg: T.purpleTint },
                        responded:   { label: "Replied",           dot: T.amber,    color: T.amberDark, bg: T.amberTint },
                        recovered:   { label: "Won back",          dot: T.greenMid, color: T.green, bg: T.greenTint },
                        no_response: { label: "No reply",          dot: T.red,      color: T.redDark, bg: T.redTint },
                      };
                      const sc = statusMeta[log.status] || statusMeta.sent;
                      const link = (v) => btn(v, { fontSize: 12, padding: "4px 10px", borderRadius: 6 });
                      return (
                        <div key={log.id} style={isMobile
                          ? { display: "flex", flexDirection: "column", gap: 6, padding: "16px", borderBottom: `1px solid ${T.line}` }
                          : { display: "grid", gridTemplateColumns: "1.4fr 1fr 2.4fr 1.4fr", gap: 16, padding: "12px 24px", borderBottom: `1px solid ${T.line}`, alignItems: "start" }}>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, display: "block" }}>{log.memberName}</span>
                            <span style={{ fontSize: 12, color: T.faint }}>{log.plan} · ${log.value}/mo</span>
                          </div>
                          <span style={{ fontSize: 13, color: T.muted }}>{shortDate(log.sentAt)}</span>
                          <span style={{ fontSize: 13, color: T.body, lineHeight: 1.55 }}>{log.message}</span>
                          <div>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: sc.color, background: sc.bg, padding: "3px 10px", borderRadius: 20 }}>
                              <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc.dot }} />{sc.label}
                            </span>
                            {log.status === "recovered" && <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 600, color: T.green }}>${(Number(log.value || 0) * 12).toLocaleString()}/yr kept</p>}
                            {log.status === "sent" && (
                              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                                <button onClick={() => markStatus(log.id, "responded")} style={link("remind")}>Replied</button>
                                <button onClick={() => markStatus(log.id, "recovered")} style={link("send")}>Won back</button>
                                <button onClick={() => markStatus(log.id, "no_response")} style={link("secondary")}>No reply</button>
                              </div>
                            )}
                            {log.status === "responded" && (
                              <div style={{ marginTop: 6 }}><button onClick={() => markStatus(log.id, "recovered")} style={link("send")}>Mark won back</button></div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ════════════════════════════════════════════════════════════
                TAB: INSIGHTS  (analytics + strategist + competitors)
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "Insights" && (() => {
              const reasons = intel?.reasons || {};
              const competitors = intel?.competitors || [];
              const reasonsTotal = Object.values(reasons).reduce((a, b) => a + b, 0);
              const maxMembers = Math.max(1, ...competitors.map(c => c.members));
              const total = scopedMembers.length || 1;
              const sevLabel = {
                high:   { text: "Act now", color: T.redDark,   bg: T.redTint },
                medium: { text: "Watch",   color: T.amberDark, bg: T.amberTint },
                info:   { text: "Insight", color: "#6c3483",   bg: T.purpleTint },
                good:   { text: "Working", color: T.green,     bg: T.greenTint },
              };
              const card = (c) => ({ ...accentPanel(c), padding: isMobile ? "14px 16px" : "18px 22px" });
              const h3 = { margin: "0 0 14px", fontFamily: SERIF, fontSize: 17, fontWeight: 400, color: T.ink };
              const rowLabel = { display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 };
              return (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: isMobile ? 26 : 32, fontWeight: 400, color: T.ink }}>Insights</h1>
                    <p style={{ margin: "6px 0 0", fontSize: 14, color: T.muted }}>Where your revenue is, why members leave, and what to change.</p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
                    <Stat isMobile={isMobile} label="Revenue at risk" value={`$${insights.revenueAtRisk.toLocaleString()}/mo`} sub={`$${insights.projectedAnnual.toLocaleString()} a year`} accent={insights.revenueAtRisk > 0} />
                    <Stat isMobile={isMobile} label="Monthly revenue" value={`$${analyticsData.totalRevenue.toLocaleString()}`} sub={`${scopedMembers.length} members`} />
                    <Stat isMobile={isMobile} tone={analyticsData.avgRisk > 75 ? "bad" : analyticsData.avgRisk >= 35 ? "mid" : "good"} label="Average risk score" value={`${analyticsData.avgRisk}`} sub="out of 100" />
                    <Stat isMobile={isMobile} tone="good" label="Won back" value={outreachCounts.recovered} sub={`${statByLabel["Revenue Saved"]} a year`} />
                  </div>

                  {/* What to change (strategist) */}
                  <section style={{ marginBottom: 28 }}>
                    <SectionHead isMobile={isMobile} title="What to change" sub="Patterns across your roster, most urgent first." />
                    {insights.findings.length === 0 ? (
                      <div style={{ ...panel, padding: "36px 24px", textAlign: "center", fontSize: 14, color: T.muted }}>Nothing stands out yet. Add your members or analyze them to see patterns here.</div>
                    ) : (
                      <div style={accentPanel(T.purple)}>
                        {insights.findings.map((f, i) => {
                          const sv = sevLabel[f.severity] || sevLabel.info;
                          return (
                            <div key={f.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "90px 1fr", gap: isMobile ? 4 : 20, padding: isMobile ? "14px 16px" : "14px 22px", borderTop: i ? `1px solid ${T.line}` : "none", alignItems: "start" }}>
                              <span style={{ justifySelf: "start", fontSize: 12, fontWeight: 600, color: sv.color, background: sv.bg, padding: "3px 10px", borderRadius: 20 }}>{sv.text}</span>
                              <div>
                                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: T.ink }}>{f.title}</p>
                                <p style={{ margin: "4px 0 0", fontSize: 14, color: T.body, lineHeight: 1.6 }}>{f.detail}</p>
                                <p style={{ margin: "6px 0 0", fontSize: 14, color: T.muted, lineHeight: 1.6 }}>Next step: <span style={{ color: T.ink }}>{f.action}</span></p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Revenue and risk breakdown */}
                  <section style={{ marginBottom: 28 }}>
                    <SectionHead isMobile={isMobile} title="Members and revenue" />
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                      <div style={card(T.purple)}>
                        <h3 style={h3}>Members by risk</h3>
                        {["high", "medium", "low"].map(r => {
                          const count = analyticsData.riskCounts[r];
                          const pct = Math.round((count / total) * 100);
                          return (
                            <div key={r} style={{ marginBottom: 16 }}>
                              <div style={rowLabel}><span>{riskConfig[r].label} risk</span><span style={{ color: riskTone[r].color, fontWeight: 600 }}>{count} · {pct}%</span></div>
                              <Bar pct={pct} color={riskTone[r].dot} />
                            </div>
                          );
                        })}
                      </div>
                      <div style={card(T.orange)}>
                        <h3 style={h3}>Revenue by plan</h3>
                        {Object.entries(analyticsData.planRevenue).sort((a, b) => b[1] - a[1]).map(([plan, rev]) => {
                          const pct = analyticsData.totalRevenue ? Math.round((rev / analyticsData.totalRevenue) * 100) : 0;
                          return (
                            <div key={plan} style={{ marginBottom: 16 }}>
                              <div style={rowLabel}><span>{plan}</span><span style={{ color: T.muted }}>${rev.toLocaleString()}/mo · {pct}%</span></div>
                              <Bar pct={pct} color={T.purple} />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {locationSummary.length > 1 && (
                      <div style={{ ...accentPanel(T.purple), marginTop: 16, overflowX: "auto" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 12, padding: "8px 24px", borderBottom: `1px solid ${T.line}`, minWidth: 420, background: T.page }}>
                          {["Location", "Members", "High risk", "Revenue"].map(h => <span key={h} style={{ fontSize: 12, color: T.faint }}>{h}</span>)}
                        </div>
                        {locationSummary.map(loc => (
                          <button key={loc.location} onClick={() => { setFilterLocation(loc.location); setActiveTab("Today"); }}
                            style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 12, width: "100%", minWidth: 420, textAlign: "left", background: "#fff", border: "none", borderBottom: `1px solid ${T.line}`, padding: "10px 24px", fontFamily: SANS, fontSize: 14, color: T.body, cursor: "pointer" }}>
                            <span style={{ color: T.ink, fontWeight: 600 }}>{loc.location}</span>
                            <span>{loc.total}</span>
                            <span style={{ color: loc.high > 0 ? T.redDark : T.green, fontWeight: 600 }}>{loc.high}</span>
                            <span>${loc.revenue.toLocaleString()}/mo</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Outreach results */}
                  <section style={{ marginBottom: 28 }}>
                    <SectionHead isMobile={isMobile} title="Outreach results" />
                    <div style={{ ...card(T.orange), display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 20 }}>
                      <Stat isMobile={isMobile} label="Texts sent" value={outreachCounts.sent} />
                      <Stat isMobile={isMobile} tone="mid" label="Replied" value={outreachCounts.responded} />
                      <Stat isMobile={isMobile} tone="good" label="Won back" value={outreachCounts.recovered} />
                      <Stat isMobile={isMobile} tone="bad" label="No reply" value={outreachCounts.noReply} />
                    </div>
                  </section>

                  {/* Why members leave (competitive intel) */}
                  <section>
                    <SectionHead isMobile={isMobile} title="Why members leave" sub="From what members tell you in their replies. No location tracking." />
                    {intelLoading && !intel ? (
                      <div style={{ ...panel, padding: "36px 24px", textAlign: "center", fontSize: 14, color: T.muted }}>Loading…</div>
                    ) : !intel || intel.total === 0 ? (
                      <div style={{ ...panel, padding: "36px 24px", textAlign: "center", fontSize: 14, color: T.muted }}>When a member replies and says why they're leaving or where they're going, it shows up here.</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                        <div style={card(T.purple)}>
                          <h3 style={h3}>Reasons given</h3>
                          {Object.entries(reasons).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([key, n]) => {
                            const pct = Math.round((n / reasonsTotal) * 100);
                            return (
                              <div key={key} style={{ marginBottom: 16 }}>
                                <div style={rowLabel}><span>{reasonMeta[key]?.label || key}</span><span style={{ color: T.muted }}>{n} · {pct}%</span></div>
                                <Bar pct={pct} color={T.orange} />
                              </div>
                            );
                          })}
                          <p style={{ margin: "4px 0 0", fontSize: 12, color: T.faint }}>{intel.total} member{intel.total !== 1 ? "s" : ""} shared a reason</p>
                        </div>
                        <div style={card(T.orange)}>
                          <h3 style={h3}>Gyms they named</h3>
                          {competitors.length === 0 ? (
                            <p style={{ margin: 0, fontSize: 14, color: T.muted }}>No other gym named yet.</p>
                          ) : competitors.map(c => (
                            <div key={c.name} style={{ marginBottom: 16 }}>
                              <div style={rowLabel}><span style={{ color: T.ink }}>{c.name}</span><span style={{ color: T.muted }}>{c.members} member{c.members !== 1 ? "s" : ""} · ${c.monthlyValue}/mo</span></div>
                              <Bar pct={Math.round((c.members / maxMembers) * 100)} color={T.red} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                </>
              );
            })()}

            <p style={{ textAlign: "center", marginTop: 32, fontSize: 12, color: T.faint }}>PulseRetain{IS_DEMO || !usingImported ? " · Sample roster" : ""}</p>
          </main>

          {/* ── Add / Import Members Modal ── */}
          {showData && (() => {
            const inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 14, fontFamily: SANS, outline: "none", color: T.ink };
            const tabBtn = (key, label) => (
              <button key={key} onClick={() => setDataTab(key)} style={{ flex: 1, background: dataTab === key ? "#fff" : "transparent", color: dataTab === key ? T.ink : T.muted, border: "none", boxShadow: dataTab === key ? "0 1px 2px rgba(0,0,0,0.08)" : "none", borderRadius: 6, padding: "7px 6px", fontFamily: SANS, fontSize: 13, fontWeight: dataTab === key ? 600 : 400, cursor: "pointer" }}>{label}</button>
            );
            const addFields = [
              { key: "name", label: "Full name", ph: "Jordan Smith", full: true },
              { key: "plan", label: "Plan", ph: "Unlimited Monthly" },
              { key: "value", label: "Monthly value ($)", ph: "159" },
              { key: "lastVisit", label: "Last visit", ph: "2026-06-08 or 5 days ago" },
              { key: "joinDate", label: "Member since", ph: "2024-03-01" },
              { key: "missedPayments", label: "Missed payments", ph: "0" },
              { key: "classesBooked", label: "Classes booked ahead", ph: "2" },
              { key: "schedule", label: "Usual schedule", ph: "Mon & Wed" },
              { key: "location", label: "Location", ph: "Downtown" },
              { key: "email", label: "Email (optional)", ph: "jordan@email.com" },
              { key: "phone", label: "Phone (optional)", ph: "(704) 555-0100" },
            ];
            return (
              <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }} onClick={() => setShowData(false)}>
                <div role="dialog" aria-modal="true" aria-label="Add members" style={{ background: "#fff", borderRadius: 14, padding: "26px 28px", maxWidth: 560, width: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", fontFamily: SANS }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                    <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 22, fontWeight: 400, color: T.ink }}>Add members</h2>
                    <span style={{ marginLeft: 10, fontSize: 13, color: T.faint }}>{members.length} on your roster</span>
                    <button autoFocus onClick={() => setShowData(false)} aria-label="Close" style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 22, cursor: "pointer", color: T.faint }}>×</button>
                  </div>
                  <p style={{ margin: "0 0 18px", fontSize: 14, color: T.muted, lineHeight: 1.5 }}>Bring in your member list. It's read in your browser and never uploaded.</p>

                  <div style={{ display: "flex", gap: 2, marginBottom: 20, background: T.soft, borderRadius: 8, padding: 3 }}>
                    {tabBtn("sample", "Sample gym")}
                    {tabBtn("upload", "Upload CSV")}
                    {tabBtn("paste", "Paste list")}
                    {tabBtn("single", "Add one")}
                  </div>

                  {dataTab === "sample" && (
                    <div>
                      <p style={{ fontSize: 14, color: T.body, lineHeight: 1.6, margin: "0 0 16px" }}>Load a 20-member sample studio with a mix of at-risk, drifting and loyal members.</p>
                      <button onClick={loadSampleGym} style={btn("primary")}>Load sample gym</button>
                    </div>
                  )}

                  {dataTab === "upload" && (
                    <div>
                      <input ref={importInputRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ display: "none" }} aria-hidden="true" />
                      <p style={{ fontSize: 14, color: T.body, lineHeight: 1.6, margin: "0 0 16px" }}>Upload a CSV exported from Mindbody, Glofox, ABC, PushPress or any spreadsheet. Columns are detected automatically.</p>
                      <button onClick={() => importInputRef.current && importInputRef.current.click()} style={btn("primary")}>Choose CSV file</button>
                    </div>
                  )}

                  {dataTab === "paste" && (
                    <div>
                      <p style={{ fontSize: 14, color: T.body, margin: "0 0 8px" }}>Paste rows from your spreadsheet, including the header row.</p>
                      <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
                        placeholder={"Name, Plan, Monthly Value, Last Visit, Join Date, Missed Payments, Classes Booked\nJordan Smith, Unlimited Monthly, 159, 2026-06-08, 2024-03-01, 0, 2"}
                        rows={7} style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
                      <button onClick={loadPastedRoster} disabled={!pasteText.trim()} style={btn("primary", { marginTop: 10, ...(!pasteText.trim() ? { opacity: 0.4, cursor: "not-allowed" } : {}) })}>Load these members</button>
                    </div>
                  )}

                  {dataTab === "single" && (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                        {addFields.map(f => (
                          <div key={f.key} style={{ gridColumn: f.full ? "1 / -1" : "auto" }}>
                            <label style={{ display: "block", fontSize: 12, color: T.muted, marginBottom: 4 }}>{f.label}</label>
                            <input value={addForm[f.key]} onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={inputStyle} />
                          </div>
                        ))}
                      </div>
                      <button onClick={addSingleMember} disabled={!addForm.name.trim()} style={btn("primary", { marginTop: 16, ...(!addForm.name.trim() ? { opacity: 0.4, cursor: "not-allowed" } : {}) })}>Add member</button>
                    </div>
                  )}

                  <div style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 12 }}>
                    <button onClick={downloadImportTemplate} style={{ background: "none", color: T.ink, border: "none", fontFamily: SANS, fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0 }}>Download CSV template</button>
                    {usingImported && <button onClick={resetToDemo} style={{ marginLeft: "auto", background: "none", color: T.muted, border: "none", fontFamily: SANS, fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0 }}>Reset to demo roster</button>}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Member Detail Modal ── */}
          {modalMember && (() => {
            const m  = modalMember;
            const ai = aiResults[m.id];
            return (
              <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setModalMember(null)}>
                <div role="dialog" aria-modal="true" aria-label={`Member details for ${m.name}`} style={{ background: "#fff", borderRadius: 14, padding: "26px 28px", maxWidth: 480, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", fontFamily: SANS }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
                    <div>
                      <p style={{ margin: 0, fontFamily: SERIF, fontSize: 22, color: T.ink }}>{m.name}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 14, color: T.muted }}>{m.plan} · ${m.value}/mo</p>
                    </div>
                    <button autoFocus onClick={() => setModalMember(null)} aria-label="Close member details" style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 22, cursor: "pointer", color: T.faint }}>×</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px", marginBottom: 20 }}>
                    {[
                      { label: "Email",           value: m.email },
                      { label: "Phone",           value: m.phone },
                      { label: "Last visit",      value: m.lastVisit },
                      { label: "Usual schedule",  value: m.usualVisits },
                      { label: "Member for",      value: `${m.joinedMonths} months` },
                      { label: "Missed payments", value: m.missedPayments === 0 ? "None" : `${m.missedPayments}` },
                    ].map(f => (
                      <div key={f.label}>
                        <p style={eyebrow}>{f.label}</p>
                        <p style={{ margin: "3px 0 0", fontSize: 14, color: T.ink, wordBreak: "break-word" }}>{f.value || "—"}</p>
                      </div>
                    ))}
                  </div>
                  {ai && !ai.error ? (
                    <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
                      <p style={eyebrow}>Why they're at risk</p>
                      <p style={{ margin: "4px 0 0", fontSize: 14, color: T.body, lineHeight: 1.6 }}>{ai.reason}</p>
                    </div>
                  ) : (
                    <button onClick={() => { analyzeOne(m); setModalMember(null); }} style={btn("primary", { width: "100%", padding: "11px 0" })}>Analyze {firstOf(m)}</button>
                  )}
                </div>
              </div>
            );
          })()}

        </div>
      )}
    </AuthGate>
    </div>
    </ThemeProvider>

    {/* ── "Add to Home Screen" prompt (overlays login + app) ── */}
    {showInstall && (
      <div role="dialog" aria-label="Install PulseRetain" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9998, background: "#1a1a2e", color: "#fff", padding: "12px 16px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 -4px 24px rgba(0,0,0,0.32)" }}>
        <img src={`${process.env.PUBLIC_URL || ""}/apple-touch-icon.png`} alt="" width={38} height={38} style={{ borderRadius: 9, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Install PulseRetain</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#b9b9d6", lineHeight: 1.4 }}>
            {install.canInstall
              ? "Add it to your home screen for the full-screen app."
              : "Tap the Share icon, then “Add to Home Screen.”"}
          </p>
        </div>
        {install.canInstall ? (
          <button onClick={install.promptInstall} style={{ background: "#e74c3c", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>Install</button>
        ) : (
          <svg width="20" height="24" viewBox="0 0 20 24" fill="none" stroke="#fff" strokeWidth="1.7" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M10 2 V14 M6 6 L10 2 L14 6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 10 H3 V22 H17 V10 H15" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <button onClick={dismissInstall} aria-label="Dismiss install prompt" style={{ background: "transparent", border: "none", color: "#9a9ab5", fontSize: 22, cursor: "pointer", flexShrink: 0, lineHeight: 1, padding: "0 2px" }}>×</button>
      </div>
    )}
    </>
  );
}