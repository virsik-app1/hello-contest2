// Weekly retention email for gym owners.
// Pure logic (no AWS calls) so it can be unit-tested with node:test; index.mjs
// supplies the DynamoDB/SES/Cognito pieces. Sent every Monday by an EventBridge
// rule whose input is {"pulseretainJob":"weekly_report"} (see docs/WEEKLY_REPORT.md).

export const REPORT_JOB = "weekly_report";
export const DEFAULT_DASHBOARD_URL = "https://main.d2yk3ai4m6puu9.amplifyapp.com";
const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_RISK = ["high", "medium", "low"];
const STABLE_ID_RE = /^(m_|mb-)/;

// Brand palette (matches the dashboard's T tokens in src/App.js).
const C = {
  ink: "#1a1a2e", body: "#3d3d50", muted: "#6b6b80", faint: "#9a9aae", line: "#e7e7ee",
  soft: "#f3f3f7", page: "#f6f5fa", red: "#e74c3c", redDark: "#c0392b", redTint: "#fdeeec",
  amberDark: "#9a7400", amberTint: "#fdf7e1", green: "#1e7e45", greenTint: "#e9f7ef",
  purple: "#8e44ad", orange: "#e67e22",
};
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS  = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// "2026-W48" (ISO week, UTC). Used so a gym gets at most one report per week
// even if the rule fires twice or the Lambda is retried.
export function isoWeekId(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const inWindow = (iso, start, end) => typeof iso === "string" && iso >= start && iso < end;
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
const num = (v) => Number(v) || 0;

function riskOf(profile, ai) {
  if (ai && !ai.error && VALID_RISK.includes(ai.riskLevel)) return ai.riskLevel;
  return VALID_RISK.includes(profile?.risk) ? profile.risk : "low";
}
function scoreOf(profile, ai) {
  if (ai && !ai.error && Number.isFinite(Number(ai.score))) return Number(ai.score);
  return num(profile?.score);
}

// Builds the numbers for one gym's report. Returns null when the gym has no
// roster and nothing happened this week (nothing worth emailing).
//   memberItems   – the gym's pulseretain-members items ({ rawMemberId, profile, aiResult })
//   outreachItems – the gym's pulseretain-outreach items (outreach, sendlog, conversation, followup…)
export function buildWeeklyReport({ memberItems = [], outreachItems = [], now = new Date(), timezone = "America/New_York", gymName = "" }) {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 7 * DAY_MS).toISOString();

  const outreach = outreachItems.filter(i => i.type === "outreach");
  const contacted = new Set(outreach.map(o => String(o.memberId)));

  // Roster: saved members only (sample/demo ids are never stored).
  const roster = memberItems
    .filter(i => i.profile && STABLE_ID_RE.test(String(i.rawMemberId || "")))
    .map(i => ({ id: String(i.rawMemberId), p: i.profile, ai: i.aiResult || null }))
    .map(m => ({ ...m, risk: riskOf(m.p, m.ai), score: scoreOf(m.p, m.ai), value: num(m.p.value) }));
  const high = roster.filter(m => m.risk === "high");
  const medium = roster.filter(m => m.risk === "medium");
  const revenueAtRisk = high.reduce((a, m) => a + m.value, 0);

  // Won back this week: outreach marked recovered during the window.
  const recovered = outreach.filter(o => o.status === "recovered" && inWindow(o.updatedAt || o.savedAt, start, end));
  const savedMonthly = recovered.reduce((a, o) => a + num(o.value), 0);

  // Texts: every send (manual or scheduled follow-up) writes a sendlog item.
  const textsSent = outreachItems.filter(i => i.type === "sendlog" && inWindow(i.at, start, end)).length;

  // Replies: texted member turns received this week, and threads still waiting.
  let replies = 0;
  const repliedMembers = new Set();
  let waiting = 0;
  for (const c of outreachItems.filter(i => i.type === "conversation")) {
    const turns = Array.isArray(c.turns) ? c.turns : [];
    for (const t of turns) {
      if (t.role === "member" && t.via === "sms" && inWindow(t.at, start, end)) { replies++; repliedMembers.add(String(c.memberId)); }
    }
    const last = turns[turns.length - 1];
    const hasSms = turns.some(t => t.role === "member" && t.via === "sms");
    if (hasSms && last && last.role === "member" && !(c.handledAt && c.handledAt >= last.at)) waiting++;
  }

  const followupsDue = outreachItems.filter(i => i.type === "followup" && i.status === "scheduled"
    && i.dueAt >= end && i.dueAt < new Date(now.getTime() + 7 * DAY_MS).toISOString()).length;

  // Who to contact: high/medium risk not contacted yet, high first, then score x value.
  const rank = { high: 0, medium: 1, low: 2 };
  const toContact = roster
    .filter(m => m.risk !== "low" && !contacted.has(m.id))
    .sort((a, b) => (rank[a.risk] - rank[b.risk]) || (b.score * b.value - a.score * a.value))
    .slice(0, 3)
    .map(m => ({
      name: String(m.p.name || "Member").slice(0, 80),
      score: Math.round(m.score), value: m.value, risk: m.risk,
      reason: String((m.ai && !m.ai.error && m.ai.reason) || m.p.lastVisit && `Last visit: ${m.p.lastVisit}` || "").slice(0, 200),
    }));

  const activity = recovered.length + textsSent + replies;
  if (roster.length === 0 && activity === 0) return null;

  return {
    weekId: isoWeekId(now), start, end, timezone, gymName: String(gymName || "").trim().slice(0, 80),
    rangeLabel: rangeLabel(new Date(start), new Date(now.getTime() - 1), timezone),
    rosterSize: roster.length,
    revenueAtRisk, highCount: high.length, mediumCount: medium.length,
    wonBack: recovered.length, wonBackNames: recovered.map(o => String(o.memberName || o.name || "")).filter(Boolean).slice(0, 5),
    savedMonthly, savedAnnual: savedMonthly * 12,
    textsSent, replies, membersReplied: repliedMembers.size, waiting, followupsDue,
    toContact,
  };
}

function rangeLabel(from, to, tz) {
  const f = (d) => { try { return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz }); } catch { return d.toISOString().slice(0, 10); } };
  return `${f(from)} to ${f(to)}`;
}

export function weeklyReportSubject(r) {
  if (r.savedMonthly > 0) return `You won back ${money(r.savedAnnual)} a year in memberships this week`;
  if (r.revenueAtRisk > 0) return `${money(r.revenueAtRisk)}/mo is at risk: your weekly retention report`;
  return "Your weekly retention report";
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function scoreColors(score) {
  if (score > 75) return { fg: C.redDark, bg: C.redTint };
  if (score >= 35) return { fg: C.amberDark, bg: C.amberTint };
  return { fg: C.green, bg: C.greenTint };
}

function statCell(label, value, sub, tone) {
  const color = tone === "good" ? C.green : tone === "bad" ? C.redDark : C.ink;
  return `<td width="50%" valign="top" style="padding:6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:10px;background:#ffffff;">
      <tr><td style="padding:14px 16px;">
        <div style="font-family:${SANS};font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:0.06em;">${esc(label)}</div>
        <div style="font-family:${SERIF};font-size:28px;line-height:1.2;color:${color};margin-top:6px;">${esc(value)}</div>
        ${sub ? `<div style="font-family:${SANS};font-size:12px;color:${C.muted};margin-top:2px;">${esc(sub)}</div>` : ""}
      </td></tr>
    </table>
  </td>`;
}

// Email-client-safe HTML: tables, inline styles, no external images or fonts.
export function renderWeeklyReportHtml(r, { dashboardUrl = DEFAULT_DASHBOARD_URL } = {}) {
  const url = esc(dashboardUrl);
  const atRiskColor = r.revenueAtRisk > 0 ? C.redDark : C.ink;
  const riskLine = r.highCount > 0
    ? `${plural(r.highCount, "member is", "members are")} high risk right now${r.mediumCount ? `, and ${r.mediumCount} more ${r.mediumCount === 1 ? "is" : "are"} slipping` : ""}.`
    : r.rosterSize > 0 ? "No members are high risk right now." : "Import your roster to start tracking risk.";

  const contactRows = r.toContact.map(m => {
    const sc = scoreColors(m.score);
    return `<tr><td style="padding:12px 0;border-top:1px solid ${C.line};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="top" style="font-family:${SANS};">
          <div style="font-size:15px;color:${C.ink};font-weight:600;">${esc(m.name)}</div>
          ${m.reason ? `<div style="font-size:13px;color:${C.body};margin-top:3px;line-height:1.45;">${esc(m.reason)}</div>` : ""}
        </td>
        <td valign="top" align="right" style="font-family:${SANS};white-space:nowrap;padding-left:12px;">
          <span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${sc.bg};color:${sc.fg};font-size:12px;font-weight:600;">Risk ${m.score}</span>
          <div style="font-size:12px;color:${C.muted};margin-top:4px;">${money(m.value)}/mo</div>
        </td>
      </tr></table>
    </td></tr>`;
  }).join("");

  const waitingBlock = r.waiting > 0
    ? `<tr><td style="padding:0 24px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border-left:3px solid ${C.purple};border-radius:6px;"><tr><td style="padding:12px 16px;font-family:${SANS};font-size:14px;color:${C.body};">
        <strong style="color:${C.ink};">${plural(r.waiting, "reply is", "replies are")} waiting for you.</strong> Answer them on the Outreach tab.
      </td></tr></table></td></tr>`
    : "";

  const wonBackSub = r.wonBack > 0
    ? (r.wonBackNames.length ? r.wonBackNames.join(", ") : plural(r.wonBack, "member", "members"))
    : "none marked this week";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(weeklyReportSubject(r))}</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(`${money(r.revenueAtRisk)}/mo at risk, ${money(r.savedAnnual)} a year saved, ${r.textsSent} texts sent, ${r.replies} replies.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${C.line};">
  <tr><td style="background:${C.ink};padding:20px 24px;">
    <span style="font-family:${SERIF};font-size:22px;color:#ffffff;">PulseRetain</span>
    <span style="font-family:${SANS};font-size:13px;color:#c9c9d6;padding-left:10px;">Weekly retention report${r.gymName ? ` for ${esc(r.gymName)}` : ""}</span>
  </td></tr>
  <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.purple};background-image:linear-gradient(90deg,${C.purple},${C.orange});">&nbsp;</td></tr>

  <tr><td style="padding:24px 24px 4px;font-family:${SANS};">
    <div style="font-size:13px;color:${C.muted};">${esc(r.rangeLabel)}</div>
    <div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:0.06em;margin-top:18px;">Revenue at risk</div>
    <div style="font-family:${SERIF};font-size:44px;line-height:1.1;color:${atRiskColor};margin-top:6px;">${money(r.revenueAtRisk)}<span style="font-size:18px;color:${C.muted};"> /month</span></div>
    <div style="font-size:14px;color:${C.body};margin-top:6px;">${esc(riskLine)}</div>
  </td></tr>

  <tr><td style="padding:16px 18px 8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${statCell("Revenue saved", money(r.savedAnnual), r.savedMonthly ? `a year (${money(r.savedMonthly)}/mo)` : "a year", r.savedMonthly ? "good" : null)}
          ${statCell("Members won back", String(r.wonBack), wonBackSub, r.wonBack ? "good" : null)}</tr>
      <tr>${statCell("Texts sent", String(r.textsSent), r.followupsDue ? `${plural(r.followupsDue, "follow-up", "follow-ups")} booked for this week` : "this week", null)}
          ${statCell("Replies", String(r.replies), r.membersReplied ? `from ${plural(r.membersReplied, "member", "members")}` : "this week", null)}</tr>
    </table>
  </td></tr>

  ${waitingBlock}

  ${r.toContact.length ? `<tr><td style="padding:16px 24px 4px;font-family:${SANS};">
    <div style="font-family:${SERIF};font-size:20px;color:${C.ink};">Who to contact this week</div>
    <div style="font-size:13px;color:${C.muted};margin-top:4px;">Not contacted yet, highest revenue at risk first.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">${contactRows}</table>
  </td></tr>` : ""}

  <tr><td align="left" style="padding:20px 24px 28px;">
    <a href="${url}" style="display:inline-block;background:${C.ink};color:#ffffff;font-family:${SANS};font-size:15px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:10px;">Open your dashboard</a>
  </td></tr>

  <tr><td style="padding:16px 24px;border-top:1px solid ${C.line};font-family:${SANS};font-size:12px;color:${C.faint};line-height:1.5;">
    You get this report every Monday morning. To stop it, open the Outreach tab in your <a href="${url}" style="color:${C.muted};">dashboard</a> and untick "Weekly email report".
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function renderWeeklyReportText(r, { dashboardUrl = DEFAULT_DASHBOARD_URL } = {}) {
  const lines = [
    `PulseRetain weekly retention report${r.gymName ? ` for ${r.gymName}` : ""} (${r.rangeLabel})`,
    "",
    `Revenue at risk: ${money(r.revenueAtRisk)}/month (${r.highCount} high-risk, ${r.mediumCount} slipping)`,
    `Revenue saved: ${money(r.savedAnnual)} a year (${money(r.savedMonthly)}/mo)`,
    `Members won back: ${r.wonBack}${r.wonBackNames.length ? ` (${r.wonBackNames.join(", ")})` : ""}`,
    `Texts sent: ${r.textsSent}`,
    `Replies: ${r.replies}${r.membersReplied ? ` from ${plural(r.membersReplied, "member", "members")}` : ""}`,
  ];
  if (r.waiting) lines.push(`Waiting for you: ${plural(r.waiting, "reply", "replies")}`);
  if (r.toContact.length) {
    lines.push("", "Who to contact this week:");
    for (const m of r.toContact) lines.push(`- ${m.name}: risk ${m.score}, ${money(m.value)}/mo${m.reason ? `. ${m.reason}` : ""}`);
  }
  lines.push("", `Open your dashboard: ${dashboardUrl}`, "", `To stop these emails, untick "Weekly email report" on the Outreach tab.`);
  return lines.join("\n");
}

// Orchestrates one weekly run. All I/O is injected so it can be tested offline.
//   gyms: settings items ({ tenantId, reportEmail, weeklyReport, timezone, lastReportWeek })
//   deps: { loadGymData(tenantId) -> {memberItems, outreachItems}, claimWeek(gym, weekId) -> bool,
//           releaseWeek(gym, weekId), sendEmail({to, subject, html, text}), dashboardUrl }
export async function processWeeklyReports(gyms, now, deps) {
  const weekId = isoWeekId(now);
  const summary = { weekId, sent: 0, skippedOff: 0, skippedNoEmail: 0, skippedEmpty: 0, alreadySent: 0, failed: 0 };
  for (const gym of gyms) {
    if (gym.weeklyReport === false) { summary.skippedOff++; continue; }
    if (!gym.reportEmail) { summary.skippedNoEmail++; continue; }
    if (gym.lastReportWeek === weekId) { summary.alreadySent++; continue; }
    try {
      const data = await deps.loadGymData(gym.tenantId);
      const report = buildWeeklyReport({ ...data, now, timezone: gym.timezone || undefined, gymName: gym.gymName });
      if (!report) { summary.skippedEmpty++; continue; }
      if (!(await deps.claimWeek(gym, weekId))) { summary.alreadySent++; continue; }
      try {
        await deps.sendEmail({
          to: gym.reportEmail,
          subject: weeklyReportSubject(report),
          html: renderWeeklyReportHtml(report, { dashboardUrl: deps.dashboardUrl }),
          text: renderWeeklyReportText(report, { dashboardUrl: deps.dashboardUrl }),
        });
        summary.sent++;
      } catch (e) {
        await deps.releaseWeek(gym, weekId).catch(() => {});
        throw e;
      }
    } catch (e) {
      summary.failed++;
      console.warn(`weekly report failed for a gym: ${e.message}`);
    }
  }
  return summary;
}
