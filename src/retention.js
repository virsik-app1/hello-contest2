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
