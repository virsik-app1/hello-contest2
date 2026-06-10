import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { awsConfig } from "./aws-config";
import { buildStats, deriveRisk } from "./retention";
import { useState, useMemo, useEffect } from "react";

Amplify.configure(awsConfig);

// ─── Authenticated API call ───────────────────────────────────────────────────
// Every request to the Lambda carries the signed-in user's Cognito token, so the
// backend can reject anyone who isn't logged in. Keys never touch the browser.
async function apiFetch(payload) {
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

// ─── Member data ────────────────────────────────────────────────────────────
const initialMembers = [
  { id: 1,  name: "Sarah Reynolds",  initials: "SR", plan: "Unlimited Monthly", lastVisit: "9 days ago",  usualVisits: "Tue & Thu",      risk: "high",   score: 91, value: 79,  email: "sarah.r@email.com",  phone: "(704) 555-0192", joinedMonths: 14, missedPayments: 0, classesBooked: 2 },
  { id: 2,  name: "Tom Mitchell",    initials: "TM", plan: "10-Class Pack",     lastVisit: "6 days ago",  usualVisits: "Every Saturday", risk: "high",   score: 78, value: 49,  email: "t.mitchell@email.com", phone: "(704) 555-0341", joinedMonths: 7,  missedPayments: 1, classesBooked: 1 },
  { id: 3,  name: "Jessica Lane",    initials: "JL", plan: "Unlimited Monthly", lastVisit: "4 days ago",  usualVisits: "Mon, Wed, Fri",  risk: "medium", score: 54, value: 79,  email: "jlane@email.com",    phone: "(704) 555-0887", joinedMonths: 22, missedPayments: 0, classesBooked: 4 },
  { id: 4,  name: "Marcus Webb",     initials: "MW", plan: "Unlimited Monthly", lastVisit: "3 days ago",  usualVisits: "Tue & Thu",      risk: "medium", score: 47, value: 79,  email: "m.webb@email.com",   phone: "(704) 555-0654", joinedMonths: 5,  missedPayments: 0, classesBooked: 3 },
  { id: 5,  name: "Priya Nair",      initials: "PN", plan: "5-Class Pack",      lastVisit: "2 days ago",  usualVisits: "Fridays",        risk: "low",    score: 21, value: 29,  email: "p.nair@email.com",   phone: "(704) 555-0223", joinedMonths: 3,  missedPayments: 0, classesBooked: 6 },
  { id: 6,  name: "Derek Collins",   initials: "DC", plan: "Unlimited Monthly", lastVisit: "1 day ago",   usualVisits: "Daily",          risk: "low",    score: 12, value: 79,  email: "d.collins@email.com", phone: "(704) 555-0119", joinedMonths: 36, missedPayments: 0, classesBooked: 8 },
  { id: 7,  name: "Aisha Thompson",  initials: "AT", plan: "Unlimited Monthly", lastVisit: "Today",       usualVisits: "Mon & Wed",      risk: "low",    score: 8,  value: 79,  email: "a.thompson@email.com", phone: "(704) 555-0774", joinedMonths: 18, missedPayments: 0, classesBooked: 7 },
  { id: 8,  name: "Ryan Foster",     initials: "RF", plan: "10-Class Pack",     lastVisit: "8 days ago",  usualVisits: "Weekends",       risk: "high",   score: 83, value: 49,  email: "r.foster@email.com", phone: "(704) 555-0562", joinedMonths: 9,  missedPayments: 2, classesBooked: 0 },
  { id: 9,  name: "Camille Torres",  initials: "CT", plan: "Unlimited Monthly", lastVisit: "11 days ago", usualVisits: "Wed & Fri",      risk: "high",   score: 88, value: 79,  email: "c.torres@email.com", phone: "(704) 555-0338", joinedMonths: 11, missedPayments: 1, classesBooked: 0 },
  { id: 10, name: "Jordan Kim",      initials: "JK", plan: "Unlimited Monthly", lastVisit: "5 days ago",  usualVisits: "Tue & Thu",      risk: "medium", score: 61, value: 79,  email: "j.kim@email.com",    phone: "(704) 555-0491", joinedMonths: 8,  missedPayments: 0, classesBooked: 2 },
];

// ─── Risk config ─────────────────────────────────────────────────────────────
const riskConfig = {
  high:   { label: "High Risk", bg: "#fff1f1", color: "#c0392b", bar: "#e74c3c", border: "#fbc9c9" },
  medium: { label: "Medium",    bg: "#fffbf0", color: "#b7770d", bar: "#f39c12", border: "#fde8a8" },
  low:    { label: "Safe",      bg: "#f0faf4", color: "#1e7e45", bar: "#27ae60", border: "#b6e8c8" },
};

// ─── Lambda URL (all API calls go through here — no secrets in the browser) ───
const LAMBDA_URL = "https://duu25rkvvopryctqwaxzleqxg40nbcqf.lambda-url.us-east-1.on.aws/";

// ─── Claude analysis ──────────────────────────────────────────────────────────
async function runClaudeAnalysis(member) {
  const response = await apiFetch({
      action: "analyze",
      memberId: member.id,
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `You are a fitness studio retention AI. Respond with ONLY a raw JSON object — no markdown, no backticks.

{"riskLevel":"high","score":85,"reason":"Brief 1-sentence churn reason","message":"Personalized SMS under 160 chars","followUpDays":3,"offerType":"class_credit"}

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
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!Array.isArray(data.content)) throw new Error("Unexpected AI response");
  const raw = data.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

// ─── Send real SMS via Lambda → Twilio ───────────────────────────────────────
async function sendRealSMS(toPhone, message) {
  const response = await apiFetch({
      action: "send_sms",
      to: toPhone,
      message,
  });
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  const data = await response.json();
  if (!data.success) throw new Error(data.error || "SMS failed");
  return data;
}

// ─── Claude reply drafting (conversational retention) ────────────────────────
// Reuses the existing secure Lambda "analyze" pass-through — no backend change
// needed. The offset memberId keeps reply drafts from overwriting a member's
// saved churn analysis. No API key ever touches the browser.
async function runClaudeReply(member, originalMessage, memberReply) {
  const response = await apiFetch({
      action: "analyze",
      memberId: 900000 + member.id,
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
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!Array.isArray(data.content)) throw new Error("Unexpected AI response");
  const raw = data.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

// ─── Offer badge labels ───────────────────────────────────────────────────────
const offerLabels = {
  class_credit:            "🎟 Free Class Credit",
  discount_percent:        "💸 10% Discount",
  free_guest_pass:         "👥 Guest Pass",
  personal_trainer_intro:  "💪 PT Session",
  pause_membership:        "⏸ Offer to Pause",
  none:                    null,
};

// ─── Nav tabs ─────────────────────────────────────────────────────────────────
const TABS = ["Dashboard", "Outreach", "Analytics"];

export default function App() {
  const [members]                     = useState(initialMembers);
  const [selected, setSelected]       = useState(null);
  const [aiResults, setAiResults]     = useState({});
  const [loading, setLoading]         = useState({});
  const [analyzing, setAnalyzing]     = useState(false);
  const [activeTab, setActiveTab]     = useState("Dashboard");
  const [outreachLog, setOutreachLog] = useState([]);
  const [filterRisk, setFilterRisk]   = useState("all");
  const [modalMember, setModalMember] = useState(null);
  const [scheduledIds, setScheduledIds] = useState(new Set());
  const [smsSending, setSmsSending]   = useState({});
  const [smsSent, setSmsSent]         = useState(new Set());
  const [toast, setToast]             = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [search, setSearch]           = useState("");
  const [replyText, setReplyText]       = useState({});   // member's pasted reply, keyed by member id
  const [replyDrafts, setReplyDrafts]   = useState({});   // Claude's drafted response, keyed by member id
  const [replyLoading, setReplyLoading] = useState({});
  const [replySending, setReplySending] = useState({});
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);

  // ── Load persisted data from DynamoDB once the user is signed in ──────────
  // (load_data now requires a Cognito token, so we wait for authentication
  //  instead of firing on mount — which also avoids a wasted pre-login call.)
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    async function loadData() {
      try {
        const res  = await apiFetch({ action: "load_data" });
        const data = await res.json();
        if (cancelled) return;

        // Restore AI results
        if (data.memberResults && data.memberResults.length > 0) {
          const restored = {};
          data.memberResults.forEach(item => {
            restored[Number(item.memberId)] = item.aiResult;
          });
          setAiResults(restored);
        }

        // Restore outreach logs
        if (data.outreachLogs && data.outreachLogs.length > 0) {
          const logs = data.outreachLogs.map(l => ({
            id:         Number(l.logId),
            memberId:   Number(l.memberId),
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

  // ── Close the member modal with the Escape key (accessibility) ────────────
  useEffect(() => {
    if (!modalMember) return;
    const onKey = (e) => { if (e.key === "Escape") setModalMember(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalMember]);

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
    showToast(`⬇ Exported ${filename}`);
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
    showToast(`✓ Outreach logged for ${member.name.split(" ")[0]}`);
  }

  async function markStatus(logId, status) {
    setOutreachLog(prev => prev.map(o => o.id === logId ? { ...o, status } : o));
    // Persist status update to DynamoDB
    try {
      await apiFetch({ action: "update_outreach_status", logId, status });
    } catch (err) {
      console.error("Failed to update outreach status:", err);
    }
    if (status === "recovered") showToast("🎉 Member marked as recovered!");
  }

  function scheduleFollowUp(member, ai) {
    setScheduledIds(prev => new Set([...prev, member.id]));
    showToast(`⏰ Follow-up scheduled in ${ai.followUpDays || 3} days for ${member.name.split(" ")[0]}`);
  }

  async function handleSendSMS(member, ai) {
    if (!member.phone) {
      showToast("❌ No phone number on file for " + member.name.split(" ")[0]);
      return;
    }
    setSmsSending(prev => ({ ...prev, [member.id]: true }));
    try {
      await sendRealSMS(member.phone, ai.message);
      setSmsSent(prev => new Set([...prev, member.id]));
      markOutreach(member, ai, true);
      showToast(`📱 SMS sent to ${member.name.split(" ")[0]}!`);
    } catch (err) {
      showToast(`❌ SMS failed: ${err.message}`);
    }
    setSmsSending(prev => ({ ...prev, [member.id]: false }));
  }

  // ── Conversational retention: draft a reply to a member's response ──────────
  async function draftReply(member, ai) {
    const text = (replyText[member.id] || "").trim();
    if (!text) { showToast("Type the member's reply first"); return; }
    setReplyLoading(prev => ({ ...prev, [member.id]: true }));
    try {
      const draft = await runClaudeReply(member, ai?.message || "(prior outreach)", text);
      setReplyDrafts(prev => ({ ...prev, [member.id]: draft }));
    } catch {
      setReplyDrafts(prev => ({ ...prev, [member.id]: { error: "Couldn't draft a reply just now. Please try again." } }));
    }
    setReplyLoading(prev => ({ ...prev, [member.id]: false }));
  }

  async function sendReplySMS(member) {
    const draft = replyDrafts[member.id];
    if (!draft || draft.error) return;
    if (!member.phone) { showToast("❌ No phone number on file for " + member.name.split(" ")[0]); return; }
    setReplySending(prev => ({ ...prev, [member.id]: true }));
    try {
      await sendRealSMS(member.phone, draft.reply);
      showToast(`📱 Reply sent to ${member.name.split(" ")[0]}!`);
    } catch (err) {
      showToast(`❌ Reply failed: ${err.message}`);
    }
    setReplySending(prev => ({ ...prev, [member.id]: false }));
  }

  function copyReply(member) {
    const draft = replyDrafts[member.id];
    if (!draft || draft.error) return;
    if (navigator.clipboard) navigator.clipboard.writeText(draft.reply);
    showToast("📋 Reply copied");
  }

  // ── AI calls ───────────────────────────────────────────────────────────────
  const analyzeAll = async () => {
    setAnalyzing(true);
    const targets = members.filter(m => m.risk === "high");
    for (const m of targets) {
      setLoading(prev => ({ ...prev, [m.id]: true }));
      try {
        const result = await runClaudeAnalysis(m);
        setAiResults(prev => ({ ...prev, [m.id]: result }));
      } catch {
        setAiResults(prev => ({ ...prev, [m.id]: { error: "Couldn't reach the AI just now. Please try again." } }));
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
    } catch {
      setAiResults(prev => ({ ...prev, [member.id]: { error: "Couldn't reach the AI just now. Please try again." } }));
    }
    setLoading(prev => ({ ...prev, [member.id]: false }));
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const stats = useMemo(() => buildStats(members, outreachLog), [members, outreachLog]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(m =>
      (filterRisk === "all" || m.risk === filterRisk) &&
      (q === "" || m.name.toLowerCase().includes(q))
    );
  }, [members, filterRisk, search]);

  const analyticsData = useMemo(() => {
    const riskCounts   = { high: 0, medium: 0, low: 0 };
    const planRevenue  = {};
    let totalRisk      = 0;
    members.forEach(m => {
      riskCounts[m.risk]++;
      planRevenue[m.plan] = (planRevenue[m.plan] || 0) + m.value;
      totalRisk += m.score;
    });
    return {
      riskCounts,
      planRevenue,
      avgRisk: Math.round(totalRisk / members.length),
      atRiskRevenue: members.filter(m => m.risk === "high").reduce((a, m) => a + m.value, 0),
      totalRevenue: members.reduce((a, m) => a + m.value, 0),
    };
  }, [members]);

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div style={{ minHeight: "100vh", background: "#f5f6fa", fontFamily: "'Georgia', serif" }}>

          {/* ── Loading screen ── */}
          {dataLoading && (
            <div style={{ position: "fixed", inset: 0, background: "#1a1a2e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#e74c3c,#c0392b)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <span style={{ color: "#fff", fontSize: 20 }}>⚡</span>
              </div>
              <p style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>PulseRetain</p>
              <p style={{ color: "#aaa", fontSize: 13, margin: 0 }}>Loading your member data...</p>
            </div>
          )}

          {/* ── Header ── */}
          <div style={{ background: "#1a1a2e", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg,#e74c3c,#c0392b)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontSize: 14 }}>⚡</span>
              </div>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>PulseRetain</span>
            </div>

            {/* ── Nav tabs ── */}
            <div style={{ display: "flex", gap: 4 }}>
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    background: activeTab === tab ? "rgba(231,76,60,0.2)" : "transparent",
                    border: "none", color: activeTab === tab ? "#e74c3c" : "#aaa",
                    padding: "6px 16px", borderRadius: 6, cursor: "pointer",
                    fontSize: 13, fontWeight: activeTab === tab ? 700 : 400,
                    transition: "all 0.15s",
                  }}
                >{tab}</button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ color: "#aaa", fontSize: 13 }}>{user?.signInDetails?.loginId}</span>
              <button onClick={signOut} style={{ background: "transparent", border: "1px solid #444", color: "#ccc", padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Sign out</button>
            </div>
          </div>

          {/* ── Toast ── */}
          {toast && (
            <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#1a1a2e", color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
              {toast}
            </div>
          )}

          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

            {/* ════════════════════════════════════════════════════════════
                TAB: DASHBOARD
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "Dashboard" && (
              <>
                {/* Title + AI button */}
                <div style={{ marginBottom: 28, display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#1a1a2e" }}>Member Retention Dashboard</h1>
                    <p style={{ margin: "4px 0 0", color: "#888", fontSize: 14 }}>Pulse Studio · {members.length} active members</p>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {/* Search */}
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search members…"
                      aria-label="Search members by name"
                      style={{ padding: "8px 12px", borderRadius: 20, border: "1px solid #ddd", fontSize: 12, outline: "none", minWidth: 150 }}
                    />
                    {/* Filter pills */}
                    {["all","high","medium","low"].map(f => (
                      <button
                        key={f}
                        onClick={() => setFilterRisk(f)}
                        aria-label={`Filter members by ${f === "all" ? "all" : f} risk`}
                        aria-pressed={filterRisk === f}
                        style={{
                          padding: "7px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                          border: filterRisk === f ? "none" : "1px solid #ddd",
                          background: filterRisk === f
                            ? (f === "all" ? "#1a1a2e" : f === "high" ? "#e74c3c" : f === "medium" ? "#f39c12" : "#27ae60")
                            : "#fff",
                          color: filterRisk === f ? "#fff" : "#555",
                          fontWeight: filterRisk === f ? 700 : 400,
                          textTransform: "capitalize",
                        }}
                      >{f === "all" ? "All" : f}</button>
                    ))}
                    <button
                      onClick={analyzeAll}
                      disabled={analyzing}
                      style={{
                        background: analyzing ? "#ccc" : "linear-gradient(135deg,#e74c3c,#c0392b)",
                        color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px",
                        fontSize: 13, fontWeight: 700, cursor: analyzing ? "not-allowed" : "pointer",
                        boxShadow: analyzing ? "none" : "0 4px 14px rgba(231,76,60,0.35)",
                        whiteSpace: "nowrap",
                      }}
                    >{analyzing ? "⏳ Analyzing..." : "⚡ Run AI Analysis"}</button>
                    <button
                      onClick={exportMembersCSV}
                      aria-label="Export member list as CSV"
                      style={{ background: "#fff", color: "#1a1a2e", border: "1px solid #ddd", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                    >⬇ Export CSV</button>
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 32 }}>
                  {stats.map((s, i) => (
                    <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", borderTop: s.accent ? "3px solid #e74c3c" : "3px solid #1a1a2e" }}>
                      <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: s.accent ? "#e74c3c" : "#1a1a2e" }}>{s.value}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888" }}>{s.label}</p>
                      <p style={{ margin: "1px 0 0", fontSize: 11, color: "#bbb" }}>{s.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Member table */}
                <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", overflow: "hidden" }}>
                  <div style={{ padding: "18px 24px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>Member Risk Monitor</h2>
                    <span style={{ background: "#fff1f1", color: "#c0392b", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>
                      {members.filter(m => m.risk === "high").length} need attention
                    </span>
                  </div>

                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1.2fr 1.5fr 1fr", padding: "10px 24px", background: "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                    {["Member","Plan","Last Visit","Usual Schedule","Risk Score","Status","Actions"].map((h, i) => (
                      <span key={i} style={{ fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</span>
                    ))}
                  </div>

                  {filteredMembers.length === 0 && (
                    <div style={{ padding: "40px 24px", textAlign: "center", color: "#888", fontSize: 13 }}>
                      No members match this filter or search.
                    </div>
                  )}
                  {filteredMembers.map(m => {
                    const ai        = aiResults[m.id];
                    const effRisk   = deriveRisk(m, ai);
                    const rc        = riskConfig[effRisk];
                    const isSelected = selected === m.id;
                    const isLoading  = loading[m.id];
                    const logged    = outreachLog.find(o => o.memberId === m.id);
                    const scheduled = scheduledIds.has(m.id);

                    return (
                      <div key={m.id}>
                        {/* Row */}
                        <div
                          onClick={() => setSelected(isSelected ? null : m.id)}
                          style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1.2fr 1.5fr 1fr", padding: "14px 24px", borderBottom: "1px solid #f7f7f7", cursor: "pointer", background: isSelected ? "#fafbff" : "#fff", transition: "background 0.15s" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: "50%", background: rc.bg, color: rc.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0, border: `1.5px solid ${rc.border}` }}>{m.initials}</div>
                            <div>
                              <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", display: "block" }}>{m.name}</span>
                              {ai && !ai.error && <span style={{ fontSize: 11, color: "#27ae60", fontWeight: 600 }}>✓ AI analyzed</span>}
                              {ai && ai.error && <span style={{ fontSize: 11, color: "#c0392b", fontWeight: 600 }}>⚠ analysis failed</span>}
                              {isLoading && <span style={{ fontSize: 11, color: "#f39c12" }}>⏳ analyzing...</span>}
                              {logged && <span style={{ fontSize: 11, color: "#185fa5", fontWeight: 600 }}>📨 outreach sent</span>}
                              {scheduled && <span style={{ fontSize: 11, color: "#8e44ad" }}> · ⏰ follow-up scheduled</span>}
                            </div>
                          </div>
                          <span style={{ fontSize: 13, color: "#555", display: "flex", alignItems: "center" }}>{m.plan}</span>
                          <span style={{ fontSize: 13, color: effRisk === "high" ? "#c0392b" : "#555", fontWeight: effRisk === "high" ? 600 : 400, display: "flex", alignItems: "center" }}>{m.lastVisit}</span>
                          <span style={{ fontSize: 12, color: "#888", display: "flex", alignItems: "center" }}>{m.usualVisits}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${ai && !ai.error ? ai.score : m.score}%`, height: "100%", background: rc.bar, borderRadius: 3, transition: "width 0.6s ease" }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: rc.color, minWidth: 28 }}>{ai && !ai.error ? ai.score : m.score}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ background: rc.bg, color: rc.color, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, border: `1px solid ${rc.border}` }}>{rc.label}</span>
                          </div>
                          {/* Inline action buttons */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={e => e.stopPropagation()}>
                            {m.risk === "high" && !ai && !isLoading && (
                              <button onClick={e => analyzeOne(m, e)} style={{ fontSize: 10, background: "#fff1f1", border: "1px solid #fbc9c9", color: "#c0392b", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontWeight: 600 }}>
                                Analyze
                              </button>
                            )}
                            {ai && !ai.error && !logged && (
                              <button onClick={() => markOutreach(m, ai)} style={{ fontSize: 10, background: "#e8f4fd", border: "1px solid #b3d9f5", color: "#185fa5", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontWeight: 600 }}>
                                Log Send
                              </button>
                            )}
                            <button onClick={() => setModalMember(m)} style={{ fontSize: 10, background: "#f5f5f5", border: "1px solid #ddd", color: "#555", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
                              View
                            </button>
                          </div>
                        </div>

                        {/* Expanded row */}
                        {isSelected && (
                          <div style={{ padding: "16px 24px 20px", background: "#fafbff", borderBottom: "1px solid #f0f0f0" }}>
                            {isLoading ? (
                              <p style={{ margin: 0, fontSize: 13, color: "#f39c12" }}>⏳ Claude is analyzing {m.name.split(" ")[0]}...</p>
                            ) : ai && ai.error ? (
                              <div style={{ background: "#fff1f1", border: "1px solid #fbc9c9", borderRadius: 10, padding: "14px 16px" }}>
                                <p style={{ margin: "0 0 8px", fontSize: 13, color: "#c0392b", fontWeight: 600 }}>⚠ {ai.error}</p>
                                <button onClick={() => analyzeOne(m)} style={{ background: "linear-gradient(135deg,#e74c3c,#c0392b)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>↻ Try again</button>
                              </div>
                            ) : ai ? (
                              <div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                                  <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "12px 16px" }}>
                                    <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 }}>AI Risk Assessment</p>
                                    <p style={{ margin: 0, fontSize: 13, color: "#333", lineHeight: 1.6 }}>{ai.reason}</p>
                                  </div>
                                  <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "12px 16px" }}>
                                    <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 }}>AI Score</p>
                                    <p style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 700, color: rc.color }}>{ai.score}<span style={{ fontSize: 14, color: "#aaa" }}>/100</span></p>
                                    {ai.offerType && offerLabels[ai.offerType] && (
                                      <span style={{ background: "#f0faf4", color: "#1e7e45", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, border: "1px solid #b6e8c8" }}>
                                        {offerLabels[ai.offerType]}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "12px 16px" }}>
                                    <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 }}>Follow-up Timing</p>
                                    <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a1a2e" }}>{ai.followUpDays || 3}<span style={{ fontSize: 13, color: "#aaa", fontWeight: 400 }}> days</span></p>
                                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "#aaa" }}>If no response</p>
                                  </div>
                                </div>
                                <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 }}>Claude-Generated SMS</p>
                                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#333", lineHeight: 1.6, fontStyle: "italic", marginBottom: 12 }}>
                                  "{ai.message}"
                                </div>
                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                  {!smsSent.has(m.id) ? (
                                    <button
                                      onClick={() => handleSendSMS(m, ai)}
                                      disabled={smsSending[m.id]}
                                      style={{
                                        background: smsSending[m.id] ? "#ccc" : "linear-gradient(135deg,#27ae60,#1e7e45)",
                                        color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px",
                                        fontSize: 12, fontWeight: 600, cursor: smsSending[m.id] ? "not-allowed" : "pointer",
                                        boxShadow: smsSending[m.id] ? "none" : "0 4px 12px rgba(39,174,96,0.35)",
                                      }}
                                    >
                                      {smsSending[m.id] ? "⏳ Sending..." : "📱 Send SMS Now"}
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: 12, color: "#27ae60", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                                      ✓ SMS delivered to {m.phone}
                                    </span>
                                  )}
                                  {!logged && (
                                    <button onClick={() => markOutreach(m, ai)} style={{ background: "linear-gradient(135deg,#185fa5,#0c447c)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                      📨 Log Only (no SMS)
                                    </button>
                                  )}
                                  {!scheduled && (
                                    <button onClick={() => scheduleFollowUp(m, ai)} style={{ background: "#f5f0ff", color: "#8e44ad", border: "1px solid #d7b9f5", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                      ⏰ Schedule Follow-up ({ai.followUpDays || 3}d)
                                    </button>
                                  )}
                                  {logged && (
                                    <span style={{ fontSize: 12, color: "#27ae60", display: "flex", alignItems: "center", gap: 4 }}>✓ Outreach logged {logged.sentAt}</span>
                                  )}
                                </div>
                                <p style={{ margin: "10px 0 0", fontSize: 11, color: "#bbb" }}>SMS sent live via Twilio · Claude AI analysis</p>

                                {/* ── Conversational retention: handle the member's reply ── */}
                                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #e0e0e0" }}>
                                  <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#8e44ad", textTransform: "uppercase", letterSpacing: 0.5 }}>💬 Member replied? Let Claude handle the conversation</p>
                                  <textarea
                                    value={replyText[m.id] || ""}
                                    onChange={e => setReplyText(prev => ({ ...prev, [m.id]: e.target.value }))}
                                    placeholder={`Paste ${m.name.split(" ")[0]}'s reply — e.g. "Honestly it's just gotten too expensive for me right now."`}
                                    aria-label={`Reply received from ${m.name}`}
                                    rows={2}
                                    style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e0d3f5", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none" }}
                                  />
                                  <button
                                    onClick={() => draftReply(m, ai)}
                                    disabled={replyLoading[m.id]}
                                    style={{ marginTop: 8, background: replyLoading[m.id] ? "#ccc" : "linear-gradient(135deg,#8e44ad,#6c3483)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: replyLoading[m.id] ? "not-allowed" : "pointer" }}
                                  >
                                    {replyLoading[m.id] ? "⏳ Claude is drafting..." : "✨ Draft AI Reply"}
                                  </button>

                                  {replyDrafts[m.id] && replyDrafts[m.id].error && (
                                    <p style={{ margin: "10px 0 0", fontSize: 12, color: "#c0392b" }}>⚠ {replyDrafts[m.id].error}</p>
                                  )}

                                  {replyDrafts[m.id] && !replyDrafts[m.id].error && (() => {
                                    const d = replyDrafts[m.id];
                                    const sc = { positive:{bg:"#f0faf4",c:"#1e7e45"}, neutral:{bg:"#eef2f7",c:"#555"}, hesitant:{bg:"#fffbf0",c:"#b7770d"}, leaving:{bg:"#fff1f1",c:"#c0392b"} }[d.sentiment] || { bg:"#eef2f7", c:"#555" };
                                    return (
                                      <div style={{ marginTop: 12, background: "#faf7ff", border: "1px solid #e0d3f5", borderRadius: 10, padding: "12px 14px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                                          <span style={{ background: sc.bg, color: sc.c, fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, textTransform: "capitalize" }}>{d.sentiment || "reply"}</span>
                                          {d.suggestedOffer && offerLabels[d.suggestedOffer] && (
                                            <span style={{ background: "#f0faf4", color: "#1e7e45", fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, border: "1px solid #b6e8c8" }}>{offerLabels[d.suggestedOffer]}</span>
                                          )}
                                        </div>
                                        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: "#8e44ad", textTransform: "uppercase", letterSpacing: 0.5 }}>Claude's suggested reply</p>
                                        <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#333", lineHeight: 1.6, fontStyle: "italic" }}>"{d.reply}"</div>
                                        {d.nextStep && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#666" }}>🧭 {d.nextStep}</p>}
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                                          <button onClick={() => sendReplySMS(m)} disabled={replySending[m.id]} style={{ background: replySending[m.id] ? "#ccc" : "linear-gradient(135deg,#27ae60,#1e7e45)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: replySending[m.id] ? "not-allowed" : "pointer" }}>{replySending[m.id] ? "⏳ Sending..." : "📱 Send Reply"}</button>
                                          <button onClick={() => copyReply(m)} aria-label="Copy drafted reply" style={{ background: "#fff", color: "#8e44ad", border: "1px solid #d7b9f5", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📋 Copy</button>
                                          <button onClick={() => draftReply(m, ai)} aria-label="Redraft reply" style={{ background: "#fff", color: "#555", border: "1px solid #ddd", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>↻ Redraft</button>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#555" }}>Click <strong>Analyze</strong> or <strong>Run AI Analysis</strong> to generate an assessment for {m.name.split(" ")[0]}.</p>
                                <button onClick={() => analyzeOne(m)} style={{ background: "linear-gradient(135deg,#e74c3c,#c0392b)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                                  ⚡ Analyze {m.name.split(" ")[0]} now
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ════════════════════════════════════════════════════════════
                TAB: OUTREACH LOG
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "Outreach" && (
              <>
                <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#1a1a2e" }}>Outreach Log</h1>
                    <p style={{ margin: "4px 0 0", color: "#888", fontSize: 14 }}>Track every message sent and its outcome</p>
                  </div>
                  {outreachLog.length > 0 && (
                    <button onClick={exportOutreachCSV} aria-label="Export outreach log as CSV" style={{ background: "#fff", color: "#1a1a2e", border: "1px solid #ddd", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>⬇ Export CSV</button>
                  )}
                </div>

                {outreachLog.length === 0 ? (
                  <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", padding: "48px 24px", textAlign: "center" }}>
                    <p style={{ fontSize: 32, margin: "0 0 8px" }}>📬</p>
                    <p style={{ fontSize: 16, fontWeight: 600, color: "#1a1a2e", margin: "0 0 4px" }}>No outreach logged yet</p>
                    <p style={{ fontSize: 13, color: "#888", margin: 0 }}>Go to Dashboard → run AI analysis on a high-risk member → click "Log Outreach as Sent"</p>
                  </div>
                ) : (
                  <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 1fr 2fr 1.2fr", padding: "10px 24px", background: "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                      {["Member","Plan","Sent At","Message Preview","Outcome"].map((h, i) => (
                        <span key={i} style={{ fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</span>
                      ))}
                    </div>
                    {outreachLog.map(log => {
                      const statusColors = {
                        sent:      { bg: "#fffbf0", color: "#b7770d", label: "Sent" },
                        responded: { bg: "#e8f4fd", color: "#185fa5", label: "Responded" },
                        recovered: { bg: "#f0faf4", color: "#1e7e45", label: "Recovered ✓" },
                        no_response: { bg: "#f9f9f9", color: "#888", label: "No Response" },
                      };
                      const sc = statusColors[log.status] || statusColors.sent;
                      return (
                        <div key={log.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 1fr 2fr 1.2fr", padding: "14px 24px", borderBottom: "1px solid #f7f7f7", alignItems: "start" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{log.memberName}</span>
                          <span style={{ fontSize: 12, color: "#555" }}>{log.plan} · ${log.value}/mo</span>
                          <span style={{ fontSize: 11, color: "#aaa" }}>{log.sentAt}</span>
                          <span style={{ fontSize: 12, color: "#555", fontStyle: "italic", lineHeight: 1.5 }}>"{log.message.slice(0, 80)}{log.message.length > 80 ? "…" : ""}"</span>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <span style={{ background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, display: "inline-block", textAlign: "center" }}>{sc.label}</span>
                            {log.status === "sent" && (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                <button onClick={() => markStatus(log.id, "responded")} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, border: "1px solid #b3d9f5", background: "#e8f4fd", color: "#185fa5", cursor: "pointer" }}>Responded</button>
                                <button onClick={() => markStatus(log.id, "recovered")} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, border: "1px solid #b6e8c8", background: "#f0faf4", color: "#1e7e45", cursor: "pointer" }}>Recovered</button>
                                <button onClick={() => markStatus(log.id, "no_response")} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, border: "1px solid #ddd", background: "#f9f9f9", color: "#888", cursor: "pointer" }}>No reply</button>
                              </div>
                            )}
                            {log.status === "responded" && (
                              <button onClick={() => markStatus(log.id, "recovered")} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, border: "1px solid #b6e8c8", background: "#f0faf4", color: "#1e7e45", cursor: "pointer" }}>Mark Recovered</button>
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
                TAB: ANALYTICS
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "Analytics" && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#1a1a2e" }}>Retention Analytics</h1>
                  <p style={{ margin: "4px 0 0", color: "#888", fontSize: 14 }}>Revenue at risk, member health, and outreach effectiveness</p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
                  {[
                    { label: "Monthly Revenue at Risk", value: `$${analyticsData.atRiskRevenue}/mo`, sub: `From ${members.filter(m=>m.risk==="high").length} high-risk members`, accent: true },
                    { label: "Total Monthly Revenue",    value: `$${analyticsData.totalRevenue}/mo`, sub: `Across all ${members.length} members`, accent: false },
                    { label: "Avg Churn Risk Score",     value: `${analyticsData.avgRisk}/100`,      sub: "Across all members", accent: analyticsData.avgRisk > 50 },
                    { label: "Outreach Logged",          value: `${outreachLog.length}`,             sub: `${outreachLog.filter(o=>o.status==="recovered").length} recovered`, accent: false },
                  ].map((c, i) => (
                    <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", borderTop: c.accent ? "3px solid #e74c3c" : "3px solid #1a1a2e" }}>
                      <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: c.accent ? "#e74c3c" : "#1a1a2e" }}>{c.value}</p>
                      <p style={{ margin: "3px 0 0", fontSize: 12, color: "#555" }}>{c.label}</p>
                      <p style={{ margin: "1px 0 0", fontSize: 11, color: "#aaa" }}>{c.sub}</p>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {/* Risk breakdown */}
                  <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", padding: "20px 24px" }}>
                    <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>Risk Distribution</h2>
                    {["high","medium","low"].map(r => {
                      const count = analyticsData.riskCounts[r];
                      const pct   = Math.round((count / members.length) * 100);
                      const rc    = riskConfig[r];
                      return (
                        <div key={r} style={{ marginBottom: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 13, color: "#555", textTransform: "capitalize" }}>{r === "high" ? "High Risk" : r === "medium" ? "Medium Risk" : "Low Risk"}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: rc.color }}>{count} members ({pct}%)</span>
                          </div>
                          <div style={{ height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: rc.bar, borderRadius: 4, transition: "width 0.5s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Revenue by plan */}
                  <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", padding: "20px 24px" }}>
                    <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>Revenue by Plan</h2>
                    {Object.entries(analyticsData.planRevenue)
                      .sort((a, b) => b[1] - a[1])
                      .map(([plan, rev]) => {
                        const pct = Math.round((rev / analyticsData.totalRevenue) * 100);
                        return (
                          <div key={plan} style={{ marginBottom: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 12, color: "#555" }}>{plan}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>${rev}/mo ({pct}%)</span>
                            </div>
                            <div style={{ height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: "#1a1a2e", borderRadius: 4 }} />
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Outreach effectiveness */}
                  <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", padding: "20px 24px", gridColumn: "1 / -1" }}>
                    <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>Outreach Effectiveness</h2>
                    {outreachLog.length === 0 ? (
                      <p style={{ fontSize: 13, color: "#aaa" }}>No outreach data yet. Go to Dashboard, analyze members, log some messages, and update their status in the Outreach tab.</p>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                        {[
                          { label: "Sent",        count: outreachLog.length, color: "#b7770d", bg: "#fffbf0" },
                          { label: "Responded",   count: outreachLog.filter(o=>["responded","recovered"].includes(o.status)).length, color: "#185fa5", bg: "#e8f4fd" },
                          { label: "Recovered",   count: outreachLog.filter(o=>o.status==="recovered").length, color: "#1e7e45", bg: "#f0faf4" },
                          { label: "No Response", count: outreachLog.filter(o=>o.status==="no_response").length, color: "#888", bg: "#f9f9f9" },
                        ].map(item => (
                          <div key={item.label} style={{ background: item.bg, borderRadius: 10, padding: "16px 18px", textAlign: "center" }}>
                            <p style={{ margin: 0, fontSize: 32, fontWeight: 700, color: item.color }}>{item.count}</p>
                            <p style={{ margin: "4px 0 0", fontSize: 12, color: item.color, fontWeight: 600 }}>{item.label}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <p style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "#ccc" }}>PulseRetain · Powered by Claude AI · Data synced from Mindbody</p>
          </div>

          {/* ── Member Detail Modal ── */}
          {modalMember && (() => {
            const m  = modalMember;
            const ai = aiResults[m.id];
            const rc = riskConfig[deriveRisk(m, ai)];
            return (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setModalMember(null)}>
                <div role="dialog" aria-modal="true" aria-label={`Member details for ${m.name}`} style={{ background: "#fff", borderRadius: 16, padding: "28px 32px", maxWidth: 480, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: rc.bg, color: rc.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, border: `2px solid ${rc.border}` }}>{m.initials}</div>
                    <div>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>{m.name}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 13, color: "#888" }}>{m.plan} · ${m.value}/mo</p>
                    </div>
                    <button onClick={() => setModalMember(null)} aria-label="Close member details" style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#aaa" }}>×</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    {[
                      { label: "Email",         value: m.email },
                      { label: "Phone",         value: m.phone },
                      { label: "Last Visit",    value: m.lastVisit },
                      { label: "Usual Schedule",value: m.usualVisits },
                      { label: "Member Since",  value: `${m.joinedMonths} months` },
                      { label: "Missed Payments", value: m.missedPayments === 0 ? "None" : `${m.missedPayments}` },
                    ].map(f => (
                      <div key={f.label} style={{ background: "#fafafa", borderRadius: 8, padding: "10px 12px" }}>
                        <p style={{ margin: 0, fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{f.label}</p>
                        <p style={{ margin: "3px 0 0", fontSize: 13, color: "#333", fontWeight: 500 }}>{f.value}</p>
                      </div>
                    ))}
                  </div>
                  {ai && !ai.error ? (
                    <div style={{ background: "#fff8e1", border: "1px solid #fde8a8", borderRadius: 10, padding: "12px 14px" }}>
                      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: "#b7770d", textTransform: "uppercase", letterSpacing: 0.5 }}>AI Churn Insight</p>
                      <p style={{ margin: 0, fontSize: 13, color: "#555", lineHeight: 1.6 }}>{ai.reason}</p>
                    </div>
                  ) : (
                    <button onClick={() => { analyzeOne(m); setModalMember(null); }} style={{ width: "100%", background: "linear-gradient(135deg,#e74c3c,#c0392b)", color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      ⚡ Run AI Analysis for {m.name.split(" ")[0]}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

        </div>
      )}
    </Authenticator>
  );
}