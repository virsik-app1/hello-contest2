// ─── Multi-location helpers ─────────────────────────────────────────────────
// Pure + testable logic behind the owner dashboard's "who is where" filtering,
// so an owner with several gym locations can scope the whole dashboard to one
// site. Kept out of App.js so it can be unit-tested without the UI.

export const ALL_LOCATIONS = "all";

// Distinct, sorted list of location names present in the roster (blanks dropped).
export function listLocations(members) {
  return [...new Set((members || []).map(m => (m && m.location) || "").filter(Boolean))].sort();
}

// Members at a given location. "all" (or an empty value) returns everyone.
export function filterByLocation(members, location) {
  if (!location || location === ALL_LOCATIONS) return members || [];
  return (members || []).filter(m => m && m.location === location);
}

// Per-location rollup for the dashboard overview: { location, total, high, revenue }.
// Members with no location are grouped under "Unassigned". Sorted by name.
export function summarizeLocations(members) {
  const map = new Map();
  for (const m of members || []) {
    const loc = (m && m.location) || "Unassigned";
    const cur = map.get(loc) || { location: loc, total: 0, high: 0, revenue: 0 };
    cur.total += 1;
    if (m && m.risk === "high") cur.high += 1;
    cur.revenue += Number(m && m.value) || 0;
    map.set(loc, cur);
  }
  return [...map.values()].sort((a, b) => a.location.localeCompare(b.location));
}
