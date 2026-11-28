// ─── Demo mode ("/#demo") ─────────────────────────────────────────────────────
// Used for sales demos and opened from the QR code on the research poster.
// Visitors see the full owner dashboard with a fictional boutique studio
// (see demoGym.js), without creating an account. Nothing in demo
// mode touches the server: AI results are pre-written, texts are never sent,
// and replies/insights live only in this browser tab. That keeps the demo free
// to run, fast on conference Wi-Fi, and impossible to abuse.

import { DEMO_GYM, DEMO_MEMBERS, DEMO_PRESETS, DEMO_PAST_DEPARTURES, DEMO_REPLY_THREADS, demoMember, demoOutreachHistory } from "./demoGym";

export function isDemoMode(hash = typeof window !== "undefined" ? window.location.hash : "") {
  return /^#\/?demo(?:$|[/?&])/.test(hash || "");
}

export const IS_DEMO = isDemoMode();

// Leave the demo for the real sign-in / sign-up screen (same page, no hash).
export function exitDemoToSignUp() {
  window.location.replace(window.location.origin + window.location.pathname + "?signup");
}

export function demoUrl() {
  return window.location.origin + window.location.pathname + "#demo";
}

// From the sign-in screen: switch this tab into the demo. Demo mode is decided
// when the page loads, so the page reloads on the demo address.
export function enterDemo() {
  window.location.assign(demoUrl());
  window.location.reload();
}

// Start the demo over: every demo change lives only in this tab's memory, so a
// reload puts the studio back exactly as it started. Handy between sales calls.
export function resetDemo() {
  window.location.reload();
}

export { DEMO_GYM, DEMO_MEMBERS };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const firstName = (m) => String(m.name || "there").split(" ")[0];

// Hand-written analyses for the sample studio's at-risk members, so the story
// a prospect reads is as good as a live AI run.
const PRESET = DEMO_PRESETS;

// Works for any member (e.g. the bigger sample gym roster): builds a specific,
// believable reason and message from the member's own data.
function generatedAnalysis(m) {
  const score = Math.max(0, Math.min(100, Number(m.score) || 0));
  const riskLevel = m.risk || (score >= 70 ? "high" : score >= 40 ? "medium" : "low");
  const bits = [];
  if (m.lastVisit) bits.push(`last visit ${String(m.lastVisit).toLowerCase()}`);
  if (m.usualVisits) bits.push(`usually comes ${m.usualVisits}`);
  if (Number(m.missedPayments) > 0) bits.push(`${m.missedPayments} missed payment${Number(m.missedPayments) > 1 ? "s" : ""}`);
  if (m.classesBooked !== undefined && m.classesBooked !== "") bits.push(`${m.classesBooked} classes booked ahead`);
  const facts = bits.join(", ");
  const reason = riskLevel === "low"
    ? `Attending steadily (${facts || "no warning signs"}). No action needed.`
    : `Visits have dropped off (${facts || "fewer check-ins than usual"}), a common early sign of cancelling.`;
  const offerType = riskLevel === "high" ? "class_credit" : "none";
  const message = riskLevel === "low"
    ? `Hi ${firstName(m)}! Thanks for being such a regular. You're crushing it. See you at your next class!`
    : `Hi ${firstName(m)}, we've missed you! ${riskLevel === "high" ? "Your next class is on us. " : ""}Want me to save you a spot this week?`;
  return { riskLevel, score, reason, message, followUpDays: riskLevel === "high" ? 2 : 4, offerType };
}

export function demoAnalysisFor(member) {
  return PRESET[member.id] ? { ...PRESET[member.id] } : generatedAnalysis(member);
}

// Simulated AI run: a short pause so the "Analyzing…" state is visible.
export async function demoAnalyze(member) {
  await wait(650 + Math.random() * 450);
  return demoAnalysisFor(member);
}

// Results shown the moment the demo opens, so Today's Priorities is ready.
export function demoInitialAiResults(members) {
  const out = {};
  for (const m of members) if (PRESET[m.id]) out[m.id] = demoAnalysisFor(m);
  return out;
}

// A month of outreach history: members won back, replies, and texts still
// waiting on an answer, so the Outreach and Insights tabs look like a real gym's.
export function demoInitialOutreach() {
  return demoOutreachHistory();
}

// ── Reply conversations + competitive intel (kept in memory for this tab) ────
const convs = {};      // memberId → turns
const intelByMember = {}; // memberId → { departureReason, competitor, memberName, memberValue }

// Members who already left and said why, so Insights has a story on first open.
const SEED_INTEL = DEMO_PAST_DEPARTURES;

const KNOWN_GYMS = [
  "Planet Fitness", "Orangetheory", "Orange Theory", "CrossFit", "LA Fitness", "Equinox", "Crunch",
  "Anytime Fitness", "Gold's Gym", "Golds Gym", "24 Hour Fitness", "Lifetime", "Life Time", "F45",
  "SoulCycle", "Peloton", "CorePower", "Pure Barre", "YMCA", "Barry's", "Club Pilates", "Burn Boot Camp",
];

function findCompetitor(text) {
  const lower = text.toLowerCase();
  const hit = KNOWN_GYMS.find((g) => lower.includes(g.toLowerCase()));
  if (hit) return hit === "Orange Theory" ? "Orangetheory" : hit === "Golds Gym" ? "Gold's Gym" : hit === "Life Time" ? "Lifetime" : hit;
  const m = text.match(/(?:switch(?:ing)? to|join(?:ing|ed)?|going to|signed up (?:at|with|for)|trying)\s+(?:the\s+)?([A-Z][\w'&]*(?:\s+[A-Z0-9][\w'&]*){0,3})/);
  return m ? m[1].trim() : null;
}

// Rule-based stand-in for the live reply agent. Mirrors its playbook: empathy
// first, a fair option for real obstacles, no selling on injury/anger/STOP.
function draftFor(member, text) {
  const t = text.toLowerCase();
  const name = firstName(member);
  const competitor = findCompetitor(text);
  const has = (...w) => w.some((x) => t.includes(x));

  if (/^\s*(stop|unsubscribe|quit|cancel texts?)\s*[.!]?\s*$/i.test(text) || has("stop texting", "stop messaging")) {
    return { sentiment: "leaving", reply: "Understood. You won't get any more texts from us. Take care!", suggestedOffer: "none",
      nextStep: "Member opted out. Do not text again.", escalate: true, departureReason: "other", competitor: null };
  }
  if (has("injur", "hurt", "surgery", "sick", "pregnan", "doctor", "physio")) {
    return { sentiment: "hesitant", reply: `Oh no, ${name}, so sorry to hear that. Your health comes first. We can pause your membership so you're not paying while you recover. Want me to set that up?`,
      suggestedOffer: "pause_membership", nextStep: "Check in personally and offer a free pause while they heal.", escalate: true, departureReason: "injury", competitor: null };
  }
  if (has("moving", "relocat", "new city", "moved")) {
    return { sentiment: "leaving", reply: `Congrats on the move, ${name}! Thank you for being part of the studio. I can pause or close your membership, whichever is easier. Just say the word.`,
      suggestedOffer: "none", nextStep: "Process a clean pause or cancellation and thank them.", escalate: false, departureReason: "moving", competitor: null };
  }
  if (has("rude", "terrible", "angry", "dirty", "worst", "unacceptable", "complain")) {
    return { sentiment: "leaving", reply: `${name}, I'm really sorry. That's not the experience we want for you. Could I call you today to make it right?`,
      suggestedOffer: "none", nextStep: "Call the member personally today. No offers, just listen.", escalate: true, departureReason: "other", competitor: null };
  }
  if (competitor || has("expensive", "price", "afford", "cost", "money", "cheaper", "budget")) {
    const cost = has("expensive", "price", "afford", "cost", "money", "cheaper", "budget");
    return { sentiment: "hesitant",
      reply: `Totally understand, ${name}. Budgets are real. Before you decide, we can pause your membership for a month at no cost so you keep your spot. Want me to do that?`,
      suggestedOffer: "pause_membership",
      nextStep: competitor ? `Offer the pause. ${competitor} is cheaper, so lead with your coaching and community.` : "Offer the free one-month pause before any discount.",
      escalate: false, departureReason: competitor ? "competitor" : cost ? "cost" : "other", competitor: competitor || null };
  }
  if (/\b(busy|time|schedule|work|kids|travel)/.test(t)) {
    return { sentiment: "hesitant", reply: `Totally get it, ${name}. Life gets busy! We just added early 6am and lunchtime classes. Want me to save you a spot in one this week?`,
      suggestedOffer: "class_credit", nextStep: "Suggest a class time that fits their schedule.", escalate: false, departureReason: "time", competitor: null };
  }
  if (/\b(yes|yeah|sure|sounds good|see you|thanks|thank you|ok|okay|will do|i'll be there)\b/.test(t)) {
    return { sentiment: "positive", reply: `Amazing, ${name}! Can't wait to see you. I'll save your spot.`,
      suggestedOffer: "none", nextStep: "Book their class and mark them as responded.", escalate: false, departureReason: "none", competitor: null };
  }
  return { sentiment: "neutral", reply: `Thanks for getting back to us, ${name}! Anything we can do to make it easier to come in? Happy to help however we can.`,
    suggestedOffer: "none", nextStep: "Follow up in a few days if there's no reply.", escalate: false, departureReason: "none", competitor: null };
}

export async function demoDraftReply(member, memberMessage, originalOutreach) {
  await wait(900 + Math.random() * 500);
  const turns = convs[member.id] ? [...convs[member.id]] : [];
  const now = new Date().toISOString();
  if (turns.length === 0 && originalOutreach) turns.push({ role: "studio", text: String(originalOutreach), at: now });
  // Same retry guard as the live agent: re-drafting the latest member text
  // (e.g. from the replies inbox) doesn't add it to the thread twice.
  const last = turns[turns.length - 1];
  if (!(last && last.role === "member" && last.text === String(memberMessage))) {
    turns.push({ role: "member", text: String(memberMessage), at: now });
  }
  const draft = draftFor(member, String(memberMessage));
  if (draft.departureReason !== "none" || draft.competitor) {
    intelByMember[member.id] = { departureReason: draft.departureReason, competitor: draft.competitor,
      memberName: member.name, memberValue: Number(member.value) || 0 };
  }
  convs[member.id] = turns;
  return { success: true, draft, turns };
}

export function demoGetConversation(memberId) {
  return convs[memberId] ? [...convs[memberId]] : [];
}

export function demoLogReplySent(member, text) {
  const turns = convs[member.id] ? [...convs[member.id]] : [];
  turns.push({ role: "studio", text: String(text), at: new Date().toISOString() });
  convs[member.id] = turns;
  return turns;
}

export function demoCompetitiveIntel() {
  const all = [...SEED_INTEL, ...Object.values(intelByMember)];
  const reasons = { competitor: 0, cost: 0, time: 0, injury: 0, moving: 0, other: 0 };
  const compMap = {};
  let lostToCompetitorsRevenue = 0;
  for (const c of all) {
    if (reasons[c.departureReason] !== undefined) reasons[c.departureReason]++;
    if (c.departureReason === "competitor") lostToCompetitorsRevenue += c.memberValue;
    if (c.competitor) {
      if (!compMap[c.competitor]) compMap[c.competitor] = { name: c.competitor, members: 0, monthlyValue: 0, memberNames: [] };
      compMap[c.competitor].members++;
      compMap[c.competitor].monthlyValue += c.memberValue;
      compMap[c.competitor].memberNames.push(c.memberName);
    }
  }
  const competitors = Object.values(compMap).sort((a, b) => b.members - a.members || b.monthlyValue - a.monthlyValue);
  return { total: all.length, reasons, competitors, lostToCompetitorsRevenue };
}

// ── Texted replies inbox (Outreach tab) ──────────────────────────────────────
// Live, member texts arrive through the Twilio webhook and are pre-drafted on
// the server. The demo seeds one so visitors see what an owner would wake up to.
const handledAt = {}; // memberId → ISO time the owner marked it handled
let inboxSeeded = false;
function seedDemoInbox() {
  if (inboxSeeded) return;
  inboxSeeded = true;
  const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  for (const t of DEMO_REPLY_THREADS) {
    const m = demoMember(t.memberId);
    if (!m) continue;
    const opening = PRESET[t.memberId] ? PRESET[t.memberId].message : "Hi " + firstName(m) + ", we've missed you! Want me to save you a spot this week?";
    const from = "+1" + String(m.phone).replace(/\D/g, "");
    convs[t.memberId] = [
      { role: "studio", text: opening, at: hoursAgo(t.sentHoursAgo) },
      { role: "member", text: t.text, at: hoursAgo(t.repliedHoursAgo), via: "sms", from },
    ];
    if (t.studioReply) convs[t.memberId].push({ role: "studio", text: t.studioReply, at: hoursAgo(t.repliedHoursAgo - 0.5) });
    if (t.handled) handledAt[t.memberId] = hoursAgo(t.repliedHoursAgo - 0.5);
  }
}

export async function demoInbox() {
  seedDemoInbox();
  await wait(300);
  return Object.entries(convs)
    .map(([memberId, turns]) => {
      const sms = turns.filter((t) => t.role === "member" && t.via === "sms");
      if (sms.length === 0) return null;
      const lastMember = [...turns].reverse().find((t) => t.role === "member");
      const last = turns[turns.length - 1];
      const member = demoMember(Number(memberId)) || { name: "Member" };
      return {
        memberId, memberName: member.name, phone: sms[sms.length - 1].from, member,
        needsReply: last.role === "member" && !(handledAt[memberId] >= lastMember.at),
        lastMemberAt: lastMember.at, turns: turns.slice(-12),
        draft: last.role === "member" ? { ...draftFor(member, lastMember.text), forAt: lastMember.at } : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.lastMemberAt).localeCompare(String(a.lastMemberAt)));
}

export function demoMarkReplyHandled(memberId) {
  handledAt[memberId] = new Date().toISOString();
}
