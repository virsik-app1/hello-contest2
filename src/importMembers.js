// ─── CSV member import ────────────────────────────────────────────────────────
// Turns a gym's exported member CSV (Mindbody / Glofox / ABC / PushPress / a
// plain spreadsheet) into PulseRetain member objects, with churn risk scored
// from whatever signals the file contains. Pure + testable: pass `nowMs` so the
// date math is deterministic. Parsing happens in the browser — the roster is
// never uploaded anywhere.

const DAY = 86400000;

// Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes (""),
// and commas/newlines inside quotes.
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = String(text).replace(/^﻿/, ""); // strip BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => String(cell).trim() !== ""));
}

const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, "");

// Candidate header names per field (normalized). First match wins.
const FIELD_ALIASES = {
  name:          ["name", "membername", "fullname", "member", "client", "clientname", "customer"],
  firstName:     ["firstname", "first", "givenname"],
  lastName:      ["lastname", "last", "surname", "familyname"],
  email:         ["email", "emailaddress"],
  phone:         ["phone", "mobile", "cell", "phonenumber", "mobilephone", "cellphone", "mobilenumber", "contact"],
  plan:          ["plan", "membership", "membershiptype", "package", "plantype", "tier", "producttype"],
  value:         ["value", "monthlyvalue", "price", "rate", "monthly", "monthlyfee", "amount", "dues", "mrr", "monthlyrate", "monthlyprice"],
  lastVisit:     ["lastvisit", "lastcheckin", "lastcheckedin", "lastattended", "lastseen", "lastvisitdate", "lastclass", "lastactivity"],
  joinDate:      ["joindate", "joined", "membersince", "startdate", "signupdate", "datejoined", "enrollmentdate", "createddate"],
  missedPayments:["missedpayments", "failedpayments", "declines", "missedpayment", "failedcharges"],
  classesBooked: ["classesbooked", "upcomingbookings", "bookings", "classesbookedahead", "upcoming", "reservations", "futurebookings"],
  schedule:      ["usualschedule", "schedule", "usualvisits", "typicalschedule", "preferreddays", "regularschedule"],
};

function buildColumnMap(headers) {
  const normalized = headers.map(norm);
  const map = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = normalized.findIndex(h => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

function toNumber(v, fallback = 0) {
  if (v == null) return fallback;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

// Returns { display, daysSince } for a last-visit cell that may be a date,
// a "N days ago" phrase, or "today"/"yesterday".
function interpretLastVisit(raw, nowMs) {
  const v = String(raw || "").trim();
  if (!v) return { display: "Unknown", daysSince: null };
  if (/^today$/i.test(v)) return { display: "Today", daysSince: 0 };
  if (/^yesterday$/i.test(v)) return { display: "Yesterday", daysSince: 1 };
  const ago = v.match(/(\d+)\s*day/i);
  if (ago) { const d = parseInt(ago[1], 10); return { display: relativeDays(d), daysSince: d }; }
  const t = Date.parse(v);
  if (!Number.isNaN(t)) {
    const d = Math.max(0, Math.floor((nowMs - t) / DAY));
    return { display: relativeDays(d), daysSince: d };
  }
  return { display: v, daysSince: null }; // unrecognized — keep raw text
}

function relativeDays(d) {
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

function monthsSince(raw, nowMs, fallback = 12) {
  const t = Date.parse(String(raw || "").trim());
  if (Number.isNaN(t)) return fallback;
  return Math.max(0, Math.floor((nowMs - t) / (30.44 * DAY)));
}

function initialsOf(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

// Baseline churn score (0–100, higher = more at risk) from available signals.
// The AI re-scores precisely on demand; this just seeds the dashboard.
export function scoreMember({ daysSince, missedPayments = 0, classesBooked = 0, joinedMonths = 12 }) {
  const d = daysSince == null ? 5 : daysSince;
  let s = Math.min(d * 7, 70);                 // recency dominates
  s += Math.min(missedPayments, 4) * 12;       // each missed payment adds risk
  s -= Math.min(classesBooked, 6) * 5;         // booked-ahead lowers risk
  if (joinedMonths < 4) s += 10;               // early-life churn is higher
  s = Math.max(0, Math.min(100, Math.round(s)));
  const risk = s >= 68 ? "high" : s >= 38 ? "medium" : "low";
  return { score: s, risk };
}

export function mapRowsToMembers(rows, nowMs) {
  if (!rows.length) return [];
  const headers = rows[0];
  const col = buildColumnMap(headers);
  const get = (r, field) => (col[field] != null ? String(r[col[field]] ?? "").trim() : "");

  const members = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    let name = get(r, "name");
    if (!name) {
      const fn = get(r, "firstName"), ln = get(r, "lastName");
      name = [fn, ln].filter(Boolean).join(" ").trim();
    }
    if (!name) continue; // a row with no name isn't a member

    const lv = interpretLastVisit(get(r, "lastVisit"), nowMs);
    const joinedMonths   = monthsSince(get(r, "joinDate"), nowMs);
    const missedPayments = Math.round(toNumber(get(r, "missedPayments"), 0));
    const classesBooked  = Math.round(toNumber(get(r, "classesBooked"), 0));
    const { score, risk } = scoreMember({ daysSince: lv.daysSince, missedPayments, classesBooked, joinedMonths });

    members.push({
      id: members.length + 1,
      name,
      initials: initialsOf(name),
      plan: get(r, "plan") || "Membership",
      lastVisit: lv.display,
      usualVisits: get(r, "schedule") || "—",
      risk,
      score,
      value: Math.round(toNumber(get(r, "value"), 0)),
      email: get(r, "email"),
      phone: get(r, "phone"),
      joinedMonths,
      missedPayments,
      classesBooked,
    });
  }
  return members;
}

export function parseMembersCSV(text, nowMs) {
  return mapRowsToMembers(parseCSV(text), nowMs);
}

// A sample CSV owners can download to see the expected shape.
export const SAMPLE_CSV_HEADERS = ["Name", "Email", "Phone", "Plan", "Monthly Value", "Last Visit", "Join Date", "Missed Payments", "Classes Booked", "Usual Schedule"];
export const SAMPLE_CSV_ROWS = [
  ["Jamie Rivera", "jamie@email.com", "(704) 555-0101", "Unlimited Monthly", "79", "2026-06-02", "2024-09-15", "0", "2", "Mon & Wed"],
  ["Alex Chen", "alex@email.com", "(704) 555-0102", "10-Class Pack", "49", "2026-05-20", "2025-11-01", "1", "0", "Weekends"],
];

// A realistic 20-member boutique-studio roster for one-click demo loading.
// (Mirrors sample-gym-roster.csv in the repo root.)
export const SAMPLE_GYM_CSV = `Name,Email,Phone,Plan,Monthly Value,Last Visit,Join Date,Missed Payments,Classes Booked,Usual Schedule
Maria Gonzalez,maria.gonzalez@gmail.com,(704) 555-0142,Unlimited Monthly,159,2026-06-11,2022-03-14,0,3,Mon/Wed/Fri
James Patterson,jpatterson@outlook.com,(980) 555-0188,Unlimited Monthly,159,2026-05-21,2023-08-02,1,0,Tue & Thu
Aisha Khan,aisha.khan@gmail.com,(704) 555-0119,8-Class Pack,120,2026-06-09,2024-01-20,0,2,Weekends
Tyler Brooks,tyler.brooks@yahoo.com,(980) 555-0233,Unlimited Monthly,159,2026-05-18,2026-04-02,2,0,Mon & Wed
Sofia Romano,sofia.romano@icloud.com,(704) 555-0167,Annual (Monthly),129,2026-06-12,2021-06-01,0,4,Daily
Marcus Lee,marcus.lee@gmail.com,(704) 555-0204,8-Class Pack,120,2026-06-04,2023-02-15,0,1,Tue/Thu
Hannah Wright,hannah.wright@gmail.com,(980) 555-0151,Unlimited Monthly,159,2026-05-24,2024-09-09,0,0,Sat & Sun
Derek Johnson,derek.j@outlook.com,(704) 555-0178,Student Monthly,89,2026-06-10,2025-09-01,0,2,Mon/Wed/Fri
Priya Patel,priya.patel@gmail.com,(980) 555-0126,Unlimited Monthly,159,2026-06-02,2022-11-30,0,1,Tue & Thu
Carlos Mendez,carlos.mendez@yahoo.com,(704) 555-0299,8-Class Pack,120,2026-05-15,2026-05-05,1,0,Weekends
Emma Thompson,emma.thompson@gmail.com,(704) 555-0113,Unlimited Monthly,159,2026-06-11,2021-01-12,0,5,Daily
Nina Volkov,nina.volkov@icloud.com,(980) 555-0244,Annual (Monthly),129,2026-06-05,2023-05-22,0,2,Mon/Wed
Jamal Carter,jamal.carter@gmail.com,(704) 555-0190,Unlimited Monthly,159,2026-05-20,2024-07-18,2,0,Tue/Thu/Sat
Olivia Nguyen,olivia.nguyen@gmail.com,(980) 555-0137,8-Class Pack,120,2026-06-08,2026-05-12,0,1,Fridays
Ryan O'Brien,ryan.obrien@outlook.com,(704) 555-0155,Unlimited Monthly,159,2026-06-03,2022-08-08,0,2,Mon & Wed
Fatima Al-Sayed,fatima.alsayed@gmail.com,(980) 555-0171,Student Monthly,89,2026-06-12,2025-10-14,0,3,Tue/Thu
Greg Sullivan,greg.sullivan@yahoo.com,(704) 555-0182,Unlimited Monthly,159,2026-05-23,2023-12-01,1,0,Weekends
Chloe Bennett,chloe.bennett@gmail.com,(980) 555-0148,8-Class Pack,120,2026-06-05,2024-04-27,0,1,Mon/Wed/Fri
David Kim,david.kim@icloud.com,(704) 555-0163,Annual (Monthly),129,2026-06-09,2021-09-19,0,3,Tue & Thu
Isabella Russo,isabella.russo@gmail.com,(980) 555-0215,Unlimited Monthly,159,2026-06-04,2026-04-20,0,0,Sat & Sun`;
