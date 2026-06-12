// ─── Pure retention logic ─────────────────────────────────────────────────────
// Extracted from App.js so it can be unit-tested without rendering the app
// (no Amplify config, no network, no CSS imports).

const VALID_RISK = ["high", "medium", "low"];

// A reply or message counts as a "response" only if the member actually engaged.
// "no_response" and "sent" are NOT responses. (Bugfix: the dashboard previously
// counted "no_response" as a response, inflating the response rate.)
export function isResponse(status) {
  return status === "responded" || status === "recovered";
}

// The member's risk category after AI re-scoring. Claude may move a member
// between buckets (e.g. a "medium" member it scores 85 becomes "high"), so the
// displayed pill/colors should follow the AI's riskLevel when we have a valid
// one — otherwise fall back to the roster's baseline risk.
export function deriveRisk(member, ai) {
  if (ai && !ai.error && VALID_RISK.includes(ai.riskLevel)) return ai.riskLevel;
  return member.risk;
}

// "Today's Priorities" — the handful of members the owner should win back today.
// Picks at-risk members not yet contacted (and not skipped), ranked high-risk
// first, then by revenue-weighted urgency (score × $value) so the owner's effort
// protects the most money first.
export function pickTodaysQueue(members, opts = {}) {
  const { aiResults = {}, outreachLog = [], dismissed = new Set(), size = 3 } = opts;
  const contacted = new Set(outreachLog.map(o => o.memberId));
  const riskRank = { high: 0, medium: 1, low: 2 };
  const effScore = (m) => (aiResults[m.id] && !aiResults[m.id].error ? aiResults[m.id].score : m.score) || 0;

  return (Array.isArray(members) ? members : [])
    .filter(m => !contacted.has(m.id) && !dismissed.has(m.id) && deriveRisk(m, aiResults[m.id]) !== "low")
    .sort((a, b) => {
      const ra = riskRank[deriveRisk(a, aiResults[a.id])];
      const rb = riskRank[deriveRisk(b, aiResults[b.id])];
      if (ra !== rb) return ra - rb;                         // high-risk first
      return effScore(b) * (Number(b.value) || 0) - effScore(a) * (Number(a.value) || 0); // then $ at risk
    })
    .slice(0, size);
}

// Dashboard stat cards (dynamic from current state).
export function buildStats(members, outreachLog) {
  const highRisk  = members.filter(m => m.risk === "high").length;
  const recovered = outreachLog.filter(o => o.status === "recovered").length;
  const sent      = outreachLog.length;
  const responded = outreachLog.filter(o => isResponse(o.status)).length;
  const rate      = sent > 0 ? Math.round((responded / sent) * 100) : 0;
  const revSaved  = outreachLog
    .filter(o => o.status === "recovered")
    .reduce((a, o) => a + Number(o.value || 0) * 12, 0);
  return [
    { label: "Members Recovered", value: String(recovered),                 sub: "this month",       accent: false },
    { label: "Revenue Saved",     value: `$${revSaved.toLocaleString()}`,   sub: "projected annual", accent: false },
    { label: "Messages Sent",     value: String(sent),                      sub: "this month",       accent: false },
    { label: "Avg Response Rate", value: `${rate}%`,                        sub: "last 30 days",     accent: false },
    { label: "At-Risk Members",   value: String(highRisk),                  sub: "right now",        accent: true  },
  ];
}
