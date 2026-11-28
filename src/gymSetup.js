// ─── First-run setup logic ────────────────────────────────────────────────────
// Pure helpers behind the self-serve onboarding screen (src/Onboarding.js), kept
// apart from React so they can be unit-tested.
import { computeInsights } from "./strategist";

// Whether a signed-in owner should see the guided first-run setup. Owners who
// already have a saved roster or outreach history (everyone who signed up
// before onboarding existed) skip it, as does anyone who finished or skipped.
export function shouldShowOnboarding({ profile, hasSavedRoster, hasOutreach }) {
  if (!profile) return false;                 // settings not loaded (or old Lambda)
  if (profile.onboardedAt) return false;
  return !hasSavedRoster && !hasOutreach;
}

// "?signup" or "#signup" in the address opens the Create Account tab, so the
// marketing site and the demo can link straight to sign-up.
export function wantsSignUp(loc = typeof window !== "undefined" ? window.location : {}) {
  const q = new URLSearchParams(loc.search || "");
  return q.has("signup") || /^#\/?signup\b/.test(loc.hash || "");
}

// Client-side twin of the Lambda's check, so the form can say what's wrong
// before a round trip. Returns { errors: { field: message }, profile }.
export function validateProfileForm({ gymName, avgPrice, timezone }) {
  const errors = {};
  const name = String(gymName || "").trim();
  if (!name) errors.gymName = "Enter your gym's name.";
  const n = Number(String(avgPrice ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) errors.avgPrice = "Enter a price, like 89.";
  else if (n > 2000) errors.avgPrice = "That looks too high. Use the monthly price.";
  if (!timezone) errors.timezone = "Pick a time zone.";
  return { errors, profile: { gymName: name, avgPrice: Math.round(n) || 0, timezone } };
}

// Members whose CSV had no price (value 0) get the gym's average monthly price,
// so revenue at risk isn't $0 for rosters exported without dues.
export function applyDefaultPrice(members, avgPrice) {
  const price = Math.round(Number(avgPrice) || 0);
  let filled = 0;
  const list = (members || []).map(m => {
    if (price > 0 && !(Number(m.value) > 0)) { filled++; return { ...m, value: price }; }
    return m;
  });
  return { members: list, filled };
}

// What the "here's your gym" step shows right after the roster loads.
export function rosterSummary(members) {
  const list = Array.isArray(members) ? members : [];
  const { atRisk, revenueAtRisk, projectedAnnual } = computeInsights(list, {});
  const medium = list.filter(m => m.risk === "medium").length;
  const top = list
    .filter(m => m.risk === "high")
    .sort((a, b) => (Number(b.value) || 0) * b.score - (Number(a.value) || 0) * a.score)
    .slice(0, 3);
  const hints = [];
  if (list.length) {
    const noPhone = list.filter(m => !m.phone).length;
    const noVisit = list.filter(m => !m.lastVisit || m.lastVisit === "Unknown").length;
    if (noVisit === list.length) hints.push("Your file has no last-visit dates, so risk scores are rough. Add a Last Visit column for sharper scores.");
    else if (noVisit > 0) hints.push(`${noVisit} member${noVisit !== 1 ? "s have" : " has"} no last-visit date.`);
    if (noPhone === list.length) hints.push("No phone numbers were found, so you can't text from PulseRetain yet. Add a Phone column to text members.");
    else if (noPhone > 0) hints.push(`${noPhone} member${noPhone !== 1 ? "s have" : " has"} no phone number and can't be texted.`);
  }
  return { total: list.length, atRisk, medium, revenueAtRisk, projectedAnnual, top, hints };
}

// Common time zones for the picker, with the owner's own zone first.
const US_ZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
  "America/Toronto", "America/Vancouver", "Europe/London", "Australia/Sydney",
];
export function setupTimeZones(current) {
  return [...new Set([current, ...US_ZONES].filter(Boolean))];
}
