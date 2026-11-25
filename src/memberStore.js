// Stable member ids and helpers for the server-saved roster.
// Imported and hand-added members get "m_<random>" ids that never repeat, so a
// saved analysis or conversation can only ever attach to the member it was
// made for. The built-in sample roster keeps its small numeric ids and is never
// saved server-side (see lambda/index.mjs isStableMemberId).

export const STABLE_ID_RE = /^(m_|mb-)[A-Za-z0-9_-]{1,80}$/;

export function isStableId(id) {
  return typeof id === "string" && STABLE_ID_RE.test(id);
}

export function newMemberId() {
  const c = typeof window !== "undefined" ? window.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return "m_" + c.randomUUID();
  // Fallback for very old browsers: time + randomness, still unique enough.
  return "m_" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}

// Give every member a stable id (keeps one they already have).
export function withStableIds(list) {
  return list.map(m => (isStableId(m.id) ? m : { ...m, id: newMemberId() }));
}

// Ids come back from the server as strings. Sample members' ids are numbers in
// the app, so turn "3" back into 3 and leave stable ids alone.
export function normalizeMemberId(v) {
  const s = String(v ?? "");
  return /^\d+$/.test(s) ? Number(s) : s;
}

// Rebuild the analysis map from load_data, keeping only results whose member is
// on the saved roster.
export function restoreResults(memberResults, members) {
  const ids = new Set(members.map(m => m.id));
  const out = {};
  for (const item of memberResults || []) {
    if (ids.has(item.memberId) && item.aiResult) out[item.memberId] = item.aiResult;
  }
  return out;
}
