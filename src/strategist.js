// ─── Retention Strategist ─────────────────────────────────────────────────────
// The differentiator beyond per-member alerts: it reads the whole roster (plus
// the AI's per-member reasons, the competitive intel, and outreach outcomes) and
// surfaces BUSINESS-level root causes — "why your gym is leaking members, and
// what to change." Small churn predictors give a score; this gives a diagnosis.
// Pure + deterministic so it can be unit-tested and never depends on a live AI
// call (the per-member reasons that feed it are already AI-generated).

const REASON_LABEL = {
  competitor: "switching to a competitor",
  cost:       "cost / price",
  time:       "time — too busy",
  injury:     "injury or health",
  moving:     "moving away",
  other:      "other reasons",
};

const REASON_ACTION = {
  competitor: "They're comparing you to other gyms — make your edge (community, coaching) explicit in every win-back, not price.",
  cost:       "Surface a pause/hold option BEFORE members reach 'cancel' — it saves price-sensitive members you'd otherwise lose outright.",
  time:       "Promote shorter or more flexible class formats to your time-strapped members.",
  injury:     "Offer a simple 'pause while you heal' — you keep the member instead of losing them.",
  moving:     "Mostly unavoidable; spend your energy on the reasons you can actually change.",
  other:      "Read these replies closely — the real pattern is hiding in them.",
};

function riskOf(m, aiResults) {
  const ai = aiResults && aiResults[m.id];
  if (ai && !ai.error && ["high", "medium", "low"].includes(ai.riskLevel)) return ai.riskLevel;
  return m.risk;
}

const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "Member";

// members: roster array. opts: { aiResults, intel, outreachLog }
export function computeInsights(members, opts = {}) {
  const { aiResults = {}, intel = null, outreachLog = [] } = opts;
  const list = Array.isArray(members) ? members : [];
  const risk = (m) => riskOf(m, aiResults);
  const high = list.filter(m => risk(m) === "high");
  const revenueAtRisk = high.reduce((a, m) => a + (Number(m.value) || 0), 0);
  const findings = [];

  // A. Onboarding / early-life churn (the underserved niche)
  const newMembers = list.filter(m => Number(m.joinedMonths) < 4);
  const newHigh = newMembers.filter(m => risk(m) === "high");
  if (newMembers.length >= 3 && newHigh.length >= 2) {
    const rate = Math.round((newHigh.length / newMembers.length) * 100);
    findings.push({
      id: "onboarding", severity: "high",
      title: "New members are leaking before the habit forms",
      detail: `${newHigh.length} of your ${newMembers.length} newest members (joined under 4 months ago) are already high-risk — a ${rate}% early-life churn rate. Most churn happens in the first 90 days.`,
      action: "Add a structured first-30-days touch: proactively book their 2nd and 3rd class and check in after week one.",
    });
  }

  // B. Revenue concentration — where the dollars actually are
  if (revenueAtRisk > 0) {
    const top = [...high].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)).slice(0, 3);
    findings.push({
      id: "revenue", severity: "high",
      title: `$${revenueAtRisk.toLocaleString()}/mo of revenue is on the line`,
      detail: `Across ${high.length} high-risk member${high.length !== 1 ? "s" : ""}. Highest-value at-risk: ${top.map(m => `${firstName(m.name)} ($${Number(m.value) || 0})`).join(", ")}.`,
      action: "Work your saves highest-value first — same effort, far more revenue protected.",
    });
  }

  // C. Forward-booking is the clearest behavioral signal
  const noBooking = list.filter(m => Number(m.classesBooked) === 0);
  const noBookingHigh = noBooking.filter(m => risk(m) === "high");
  if (noBookingHigh.length >= 2) {
    findings.push({
      id: "booking", severity: "medium",
      title: "Nothing booked ahead is your clearest early warning",
      detail: `${noBooking.length} members have zero upcoming classes, and ${noBookingHigh.length} of them are already high-risk.`,
      action: "Getting one class on the calendar is the single strongest retention lever — prompt a re-book before anything else.",
    });
  }

  // D. Which plan churns worst
  const byPlan = {};
  list.forEach(m => { const p = m.plan || "—"; (byPlan[p] = byPlan[p] || []).push(m); });
  const planRates = Object.entries(byPlan)
    .filter(([, ms]) => ms.length >= 3)
    .map(([p, ms]) => ({ plan: p, rate: ms.filter(m => risk(m) === "high").length / ms.length }))
    .sort((a, b) => b.rate - a.rate);
  if (planRates.length >= 2 && planRates[0].rate >= 0.34 && planRates[0].rate >= planRates[planRates.length - 1].rate * 1.5) {
    const worst = planRates[0], best = planRates[planRates.length - 1];
    findings.push({
      id: "plan", severity: "medium",
      title: `"${worst.plan}" is your leakiest plan`,
      detail: `${Math.round(worst.rate * 100)}% of "${worst.plan}" members are high-risk, vs ${Math.round(best.rate * 100)}% on "${best.plan}".`,
      action: `Examine what "${worst.plan}" is missing — value, flexibility, or onboarding may be weaker there.`,
    });
  }

  // E. Top stated reason for leaving (from the agent's captured intel)
  if (intel && intel.total > 0 && intel.reasons) {
    const top = Object.entries(intel.reasons).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const [reason, n] = top;
      findings.push({
        id: "reason", severity: "info",
        title: `#1 reason members give for leaving: ${REASON_LABEL[reason] || reason}`,
        detail: `${n} member${n !== 1 ? "s" : ""} cited this in their own replies to the AI.`,
        action: REASON_ACTION[reason] || "Address the most common objection head-on.",
      });
    }
  }

  // F. Sharpest competitor
  if (intel && Array.isArray(intel.competitors) && intel.competitors.length) {
    const c = intel.competitors[0];
    findings.push({
      id: "competitor", severity: "info",
      title: `${c.name} is your sharpest competitive threat`,
      detail: `${c.members} member${c.members !== 1 ? "s" : ""} ($${c.monthlyValue}/mo) named ${c.name} when leaving.`,
      action: `Win these back with what ${c.name} can't match — relationships and coaching, not a price war.`,
    });
  }

  // G. Shared schedule among at-risk members
  const slotCount = {};
  high.forEach(m => {
    const s = String(m.usualVisits || "").trim();
    if (s && s !== "—" && s.toLowerCase() !== "unknown") slotCount[s] = (slotCount[s] || 0) + 1;
  });
  const topSlot = Object.entries(slotCount).sort((a, b) => b[1] - a[1])[0];
  if (topSlot && topSlot[1] >= 3) {
    findings.push({
      id: "schedule", severity: "info",
      title: `Several at-risk members share a schedule: ${topSlot[0]}`,
      detail: `${topSlot[1]} of your high-risk members usually came ${topSlot[0]}.`,
      action: "Check whether something changed with those sessions — instructor, time slot, or crowding.",
    });
  }

  // H. Positive reinforcement — recoveries so far
  const recovered = outreachLog.filter(o => o.status === "recovered");
  if (recovered.length >= 1) {
    const saved = recovered.reduce((a, o) => a + (Number(o.value) || 0) * 12, 0);
    findings.push({
      id: "wins", severity: "good",
      title: `You've already saved ${recovered.length} member${recovered.length !== 1 ? "s" : ""}`,
      detail: `≈ $${saved.toLocaleString()}/yr in revenue retained — the system is working.`,
      action: "Keep approving the daily win-backs; the momentum compounds.",
    });
  }

  const rank = { high: 0, medium: 1, info: 2, good: 3 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    atRisk: high.length,
    revenueAtRisk,
    projectedAnnual: revenueAtRisk * 12,
    topLeak: findings.find(f => f.severity === "high" || f.severity === "medium")?.title || null,
    findings,
  };
}
