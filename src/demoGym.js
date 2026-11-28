// ─── Sample studio for demo mode ("/#demo") ──────────────────────────────────
// A fictional two-location boutique studio, sized and priced like a real one,
// so a sales demo shows believable numbers: about 130 members, roughly $1,600 a
// month at risk, a month of outreach history with members already won back, and
// a few texted replies waiting for the owner. Everything here is made up. Every
// phone number is a fictional 555 number and every email is @example.com, so
// nothing in this file can ever reach a real person.
//
// The roster is fixed (a seeded generator fills in the steady members), so the
// demo tells the same story on every run.

export const DEMO_GYM = {
  name: "Copper Ridge Studio",
  locations: ["South End", "NoDa"],
};

// Monthly membership prices for a boutique studio.
const PLAN = {
  unlimited: { plan: "Unlimited Monthly", value: 179 },
  eight:     { plan: "8 Classes / Month", value: 139 },
  four:      { plan: "4 Classes / Month", value: 89 },
  founding:  { plan: "Founding Unlimited", value: 149 },
};

const ago = (d) => (d === 0 ? "Today" : d === 1 ? "1 day ago" : `${d} days ago`);
const initialsOf = (name) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const emailOf = (name) => name.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/, ".").replace(/\s+/g, "") + "@example.com";

let phoneSeq = 100;
function member(id, name, planKey, days, usualVisits, risk, score, extra) {
  const p = PLAN[planKey];
  phoneSeq += 1;
  return {
    id, name, initials: initialsOf(name), plan: p.plan, value: p.value,
    lastVisit: ago(days), usualVisits, risk, score,
    email: emailOf(name), phone: `(704) 555-${String(phoneSeq).padStart(4, "0")}`,
    joinedMonths: 12, missedPayments: 0, classesBooked: 2, location: "South End",
    ...extra,
  };
}

// ── High risk (score above 75): the people the demo opens on ───────────────
// Three share Tue & Thu mornings (a class that lost its regular coach), four
// joined in the last few months, and the 4-class plan leaks the most. The
// Insights tab picks those patterns up on its own.
const HIGH = [
  member(101, "Natalie Brooks",  "unlimited", 12, "Tue & Thu mornings", "high", 92, { joinedMonths: 16, classesBooked: 0 }),
  member(102, "Chris Delgado",   "unlimited", 10, "Mon, Wed, Fri",      "high", 89, { joinedMonths: 2,  classesBooked: 0, location: "NoDa" }),
  member(103, "Kevin Osei",      "four",      16, "Sundays",            "high", 87, { joinedMonths: 1,  classesBooked: 0 }),
  member(104, "Megan O'Neill",   "eight",     14, "Tue & Thu mornings", "high", 86, { joinedMonths: 9,  classesBooked: 0, missedPayments: 1 }),
  member(105, "Isaiah Grant",    "four",      13, "Tuesday evenings",   "high", 85, { joinedMonths: 2,  classesBooked: 0, location: "NoDa" }),
  member(106, "Andre Wallace",   "unlimited",  9, "Weekends",           "high", 84, { joinedMonths: 3,  classesBooked: 1, missedPayments: 1, location: "NoDa" }),
  member(107, "Sofia Ramirez",   "eight",      9, "Mon & Wed evenings", "high", 83, { joinedMonths: 13, classesBooked: 0, missedPayments: 2, location: "NoDa" }),
  member(108, "Hannah Cho",      "four",      18, "Saturdays",          "high", 81, { joinedMonths: 7,  classesBooked: 0 }),
  member(109, "Lauren Pierce",   "founding",  11, "Tue & Thu mornings", "high", 80, { joinedMonths: 31, classesBooked: 0, location: "NoDa" }),
  member(110, "Paige Sullivan",  "eight",     10, "Mon & Wed evenings", "high", 79, { joinedMonths: 6,  classesBooked: 0, missedPayments: 1, location: "NoDa" }),
  member(111, "Ben Hartley",     "four",      21, "Fridays",            "high", 78, { joinedMonths: 5,  classesBooked: 0, missedPayments: 1 }),
  member(112, "Grace Whitfield", "unlimited",  8, "Most weekdays",      "high", 77, { joinedMonths: 24, classesBooked: 1 }),
];

// ── Medium risk (35 to 75): drifting, several already contacted ────────────
const MEDIUM = [
  member(121, "Jasmine Patel",   "eight",      7, "Tue & Thu evenings", "medium", 72, { joinedMonths: 10, classesBooked: 1, location: "NoDa" }),
  member(122, "Derek Huang",     "unlimited",  8, "Mon, Wed, Fri",      "medium", 68, { joinedMonths: 19, classesBooked: 0 }),
  member(123, "Olivia Bennett",  "eight",      6, "Weekday evenings",   "medium", 64, { joinedMonths: 8,  classesBooked: 1 }),
  member(124, "Tyler Morrison",  "four",       8, "Saturdays",          "medium", 66, { joinedMonths: 4,  classesBooked: 1, location: "NoDa" }),
  member(125, "Rachel Kim",      "unlimited",  6, "Mon & Wed mornings", "medium", 58, { joinedMonths: 14, classesBooked: 2 }),
  member(126, "Jordan Ellis",    "eight",      7, "Weekends",           "medium", 61, { joinedMonths: 6,  classesBooked: 1, location: "NoDa" }),
  member(127, "Brianna Scott",   "four",       9, "Thursdays",          "medium", 70, { joinedMonths: 3,  classesBooked: 0 }),
  member(128, "Michael Torres",  "unlimited",  5, "Tue & Thu mornings", "medium", 55, { joinedMonths: 27, classesBooked: 2, location: "NoDa" }),
  member(129, "Emily Nguyen",    "eight",      6, "Mon & Wed evenings", "medium", 52, { joinedMonths: 11, classesBooked: 2 }),
  member(130, "Samuel Reyes",    "unlimited",  5, "Weekday mornings",   "medium", 47, { joinedMonths: 8,  classesBooked: 2, location: "NoDa" }),
  member(131, "Ava Mitchell",    "four",       7, "Sundays",            "medium", 63, { joinedMonths: 5,  classesBooked: 1 }),
  member(132, "Caleb Foster",    "eight",      6, "Tue & Thu evenings", "medium", 49, { joinedMonths: 15, classesBooked: 2, location: "NoDa" }),
  member(133, "Zoe Anderson",    "unlimited",  5, "Most weekdays",      "medium", 44, { joinedMonths: 21, classesBooked: 3 }),
  member(134, "Nathan Brooks",   "eight",      6, "Weekends",           "medium", 57, { joinedMonths: 7,  classesBooked: 1 }),
  member(135, "Maya Robinson",   "founding",   5, "Mon, Wed, Fri",      "medium", 41, { joinedMonths: 33, classesBooked: 2, location: "NoDa" }),
  member(136, "Ethan Clarke",    "unlimited",  6, "Weekday evenings",   "medium", 53, { joinedMonths: 9,  classesBooked: 1 }),
  member(137, "Chloe Martinez",  "eight",      5, "Tue & Thu mornings", "medium", 46, { joinedMonths: 12, classesBooked: 2, location: "NoDa" }),
  member(138, "Owen Price",      "four",       6, "Saturdays",          "medium", 59, { joinedMonths: 4,  classesBooked: 1 }),
  member(139, "Lily Hayes",      "unlimited",  5, "Mon & Wed mornings", "medium", 38, { joinedMonths: 17, classesBooked: 3, location: "NoDa" }),
  member(140, "Dylan Cooper",    "eight",      7, "Weekday evenings",   "medium", 62, { joinedMonths: 6,  classesBooked: 1 }),
];

// ── Members won back over the last month (now steady again) ────────────────
const WON_BACK = [
  member(151, "Marcus Reid",     "unlimited", 1, "Tue & Thu evenings", "low", 22, { joinedMonths: 13, classesBooked: 4 }),
  member(152, "Kayla Jenkins",   "eight",     2, "Mon & Wed mornings", "low", 28, { joinedMonths: 7,  classesBooked: 3, location: "NoDa" }),
  member(153, "Victor Alvarez",  "unlimited", 1, "Most weekdays",      "low", 18, { joinedMonths: 22, classesBooked: 5 }),
  member(154, "Erin Walsh",      "founding",  3, "Weekends",           "low", 31, { joinedMonths: 30, classesBooked: 2, location: "NoDa" }),
  member(155, "Jamal Carter",    "eight",     2, "Weekday evenings",   "low", 26, { joinedMonths: 5,  classesBooked: 3 }),
  member(156, "Allison Park",    "unlimited", 0, "Mon, Wed, Fri",      "low", 15, { joinedMonths: 11, classesBooked: 6, location: "NoDa" }),
  member(157, "Noah Simmons",    "four",      4, "Saturdays",          "low", 33, { joinedMonths: 3,  classesBooked: 2 }),
  member(158, "Rebecca Lowe",    "unlimited", 1, "Tue & Thu mornings", "low", 19, { joinedMonths: 26, classesBooked: 4, location: "NoDa" }),
];

// ── Everyone else: steady, low-risk regulars from a seeded generator ───────
const FIRST = ["Abby", "Adam", "Alexis", "Amir", "Anna", "Ari", "Bella", "Blake", "Brooke", "Cameron", "Carmen", "Cole",
  "Dana", "Devin", "Elena", "Eli", "Emma", "Evan", "Faith", "Gabe", "Gianna", "Hailey", "Henry", "Imani", "Ivy",
  "Jack", "Jade", "Jenna", "Julian", "Kara", "Kyle", "Leah", "Leo", "Lucy", "Luis", "Mia", "Miles", "Nadia", "Nina",
  "Omar", "Piper", "Quinn", "Reese", "Riley", "Ruby", "Ryan", "Sara", "Sean", "Simone", "Talia", "Theo", "Tessa",
  "Uma", "Vanessa", "Wes", "Willa", "Xavier", "Yasmin", "Zach", "Priya", "Hector", "Joy", "Dev", "Mara", "Rosa"];
const LAST = ["Adams", "Baker", "Bishop", "Bryant", "Campbell", "Chen", "Coleman", "Diaz", "Dixon", "Edwards", "Ferguson",
  "Fisher", "Garcia", "Gibson", "Graham", "Hall", "Harper", "Hughes", "Jackson", "James", "Kelly", "Khan", "Lambert",
  "Lee", "Lopez", "Marshall", "Mason", "Meyer", "Moore", "Murphy", "Nelson", "Ortiz", "Owens", "Palmer", "Perry",
  "Powell", "Quinn", "Rivera", "Ross", "Russell", "Sanders", "Shaw", "Singh", "Stewart", "Thomas", "Turner", "Vaughn",
  "Ward", "Watson", "West", "Wright", "Young"];
const STEADY_SCHEDULES = ["Mon, Wed, Fri", "Tue & Thu mornings", "Tue & Thu evenings", "Weekends", "Mon & Wed evenings",
  "Most weekdays", "Saturdays", "Weekday mornings", "Mon & Wed mornings", "Daily"];
// Weighted plan mix: unlimited is the core of a boutique studio.
const STEADY_PLANS = ["unlimited", "unlimited", "unlimited", "unlimited", "eight", "eight", "eight", "founding"];

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function steadyMembers(count) {
  const rnd = seeded(20261126);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const used = new Set([...HIGH, ...MEDIUM, ...WON_BACK].map((m) => m.name));
  const out = [];
  let id = 201;
  while (out.length < count) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (used.has(name)) continue;
    used.add(name);
    out.push(member(id++, name, pick(STEADY_PLANS), Math.floor(rnd() * 4), pick(STEADY_SCHEDULES), "low",
      5 + Math.floor(rnd() * 27), {
        joinedMonths: rnd() < 0.12 ? 1 + Math.floor(rnd() * 3) : 4 + Math.floor(rnd() * 40),
        classesBooked: 2 + Math.floor(rnd() * 7),
        location: rnd() < 0.55 ? "South End" : "NoDa",
      }));
  }
  return out;
}

export const DEMO_MEMBERS = [...HIGH, ...MEDIUM, ...WON_BACK, ...steadyMembers(90)];

// ── Hand-written analyses: what the AI says about each at-risk member ──────
export const DEMO_PRESETS = {
  101: { riskLevel: "high", score: 92, followUpDays: 2, offerType: "class_credit",
    reason: "A 16-month regular at Tue & Thu morning class who hasn't been in for 12 days and has nothing booked. Her class lost its usual coach this month.",
    message: "Hi Natalie! We've missed you at Tue/Thu mornings. Coach Dani is back on that class next week. Your next one's on us. Save you a spot?" },
  102: { riskLevel: "high", score: 89, followUpDays: 2, offerType: "personal_trainer_intro",
    reason: "Joined 2 months ago, went 3 times a week, and has now gone quiet for 10 days with nothing booked. New members who stall this early rarely come back on their own.",
    message: "Hey Chris, how are the first couple months treating you? Want a free 20-min session with a coach to set your next goal? Pick any time this week." },
  103: { riskLevel: "high", score: 87, followUpDays: 2, offerType: "free_guest_pass",
    reason: "Brand new member (1 month) on the 4-class plan. Came twice, then nothing for 16 days and no classes booked.",
    message: "Hi Kevin! Sunday class has a great crew. Bring a friend this weekend on us so you've got a workout buddy. Want me to book you both?" },
  104: { riskLevel: "high", score: 86, followUpDays: 3, offerType: "class_credit",
    reason: "Tue & Thu morning regular for 9 months. Two weeks without a visit, one missed payment, and nothing booked ahead.",
    message: "Hi Megan, Tue/Thu mornings haven't been the same without you! Your next class is on the house. Want me to put you down for Thursday?" },
  105: { riskLevel: "high", score: 85, followUpDays: 2, offerType: "class_credit",
    reason: "Joined 2 months ago for Tuesday evening class and hasn't been back in 13 days. Nothing booked.",
    message: "Hey Isaiah, we missed you Tuesday night! Your next class is on us. Want me to hold you a spot this Tuesday at 6?" },
  106: { riskLevel: "high", score: 84, followUpDays: 3, offerType: "pause_membership",
    reason: "3-month member, weekends only, 9 days since last visit and a missed payment. Cost or schedule may be getting in the way.",
    message: "Hi Andre! Weekends get busy. If you need a breather, we can pause your membership free for a month so you keep your rate. Want that?" },
  107: { riskLevel: "high", score: 83, followUpDays: 2, offerType: "discount_percent",
    reason: "Year-long Mon & Wed evening member with 2 missed payments and no bookings. Price is the likely issue.",
    message: "Hi Sofia, we'd hate to lose you on Mon/Wed nights. Here's 15% off next month while things settle. Want me to book Wednesday?" },
  108: { riskLevel: "high", score: 81, followUpDays: 3, offerType: "class_credit",
    reason: "Saturday-only member who hasn't been in for 18 days, the longest gap since she joined. Nothing booked.",
    message: "Hi Hannah! Saturday class misses you. Your next one is on us. Want me to save you a spot this weekend?" },
  109: { riskLevel: "high", score: 80, followUpDays: 3, offerType: "none",
    reason: "Founding member (31 months) from Tue & Thu mornings, 11 days out with nothing booked. Same class as two other drifting members.",
    message: "Lauren, you've been with us since day one and we miss you on Tue/Thu mornings. Anything we can do better? I'd love to hear it." },
  110: { riskLevel: "high", score: 79, followUpDays: 3, offerType: "discount_percent",
    reason: "Mon & Wed evening member, 10 days since a visit, a missed payment and no classes booked.",
    message: "Hi Paige! We miss you at Mon/Wed evening class. Here's 10% off next month to get back in the groove. See you Monday?" },
  111: { riskLevel: "high", score: 78, followUpDays: 3, offerType: "class_credit",
    reason: "Friday regular who hasn't been in for 3 weeks and missed a payment on the 4-class plan.",
    message: "Hey Ben, Fridays aren't the same without you! Your next class is free. Want me to put you in this Friday?" },
  112: { riskLevel: "high", score: 77, followUpDays: 3, offerType: "none",
    reason: "Two-year member who usually comes most weekdays. 8 days without a visit is unusual for her, with only 1 class booked.",
    message: "Hi Grace! Haven't seen you in a bit and wanted to check in. Everything okay? We'd love to see you back this week." },
  121: { riskLevel: "medium", score: 72, followUpDays: 4, offerType: "pause_membership",
    reason: "Tue & Thu evening member, 7 days since her last visit and only 1 class booked.",
    message: "Hi Jasmine! Haven't seen you at Tue/Thu evening class this week. Everything okay? Want me to save you a spot Thursday?" },
  122: { riskLevel: "medium", score: 68, followUpDays: 4, offerType: "none",
    reason: "Long-time Mon/Wed/Fri regular who has skipped a full week with nothing booked.",
    message: "Hey Derek, we missed you this week! Is the Mon/Wed/Fri schedule still working? Happy to help you find a time." },
  123: { riskLevel: "medium", score: 64, followUpDays: 4, offerType: "class_credit",
    reason: "Evening member whose visits dropped from 2 a week to 1 over the last month.",
    message: "Hi Olivia! Noticed evenings have been tough lately. Want me to save you a spot in Thursday's 6pm? It's on us." },
};

export const DEMO_TODAY_INITIAL_IDS = HIGH.map((m) => m.id);

// ── Outreach history over the last month ──────────────────────────────────
// [memberId, days ago, status, message]
const HISTORY = [
  [151, 27, "recovered",   "Hey Marcus, we missed you at Tue/Thu evening class! Your next one is on us. Want me to save you a spot?"],
  [153, 25, "recovered",   "Hi Victor, haven't seen you in a couple weeks. Everything okay? We'd love to have you back this week."],
  [158, 24, "recovered",   "Hi Rebecca! Tue/Thu mornings miss you. Your next class is on the house. See you Thursday?"],
  [152, 22, "recovered",   "Hi Kayla! Mornings get busy. Want me to save you a spot Wednesday at 7? Your next class is on us."],
  [154, 20, "recovered",   "Erin, you've been with us since the start and we miss you. We can pause your membership free if you need a breather."],
  [155, 17, "recovered",   "Hey Jamal! Want a free 20-min session with a coach to set your next goal? Pick any evening this week."],
  [156, 14, "recovered",   "Hi Allison! Haven't seen you since last week. Your next class is on us whenever you're ready."],
  [157, 11, "recovered",   "Hi Noah! Saturday class has a great crew. Bring a friend this weekend on us?"],
  [125, 19, "no_response", "Hi Rachel! We missed you at Mon/Wed mornings. Want me to save you a spot this week?"],
  [130, 16, "no_response", "Hey Samuel, haven't seen you in a bit. Everything okay? We'd love to see you back."],
  [133, 13, "no_response", "Hi Zoe! Checking in. Want me to book you into Wednesday's class?"],
  [135, 12, "no_response", "Maya, we miss you on Mon/Wed/Fri! Your next class is on us."],
  [139, 10, "no_response", "Hi Lily! Mornings miss you. Want me to save you a spot Monday?"],
  [137, 9,  "no_response", "Hi Chloe, haven't seen you at Tue/Thu mornings lately. Everything okay?"],
  [132, 8,  "no_response", "Hey Caleb! Tue/Thu evenings miss you. Your next class is on us."],
  [121, 3,  "responded",   DEMO_PRESETS[121].message],
  [122, 2,  "responded",   DEMO_PRESETS[122].message],
  [123, 2,  "responded",   DEMO_PRESETS[123].message],
  [128, 6,  "responded",   "Hi Michael! Tue/Thu mornings miss you. Coach Dani is back next week. Want a spot?"],
  [129, 5,  "responded",   "Hi Emily! Haven't seen you at Mon/Wed evenings this week. Want me to save you a spot?"],
  [136, 4,  "responded",   "Hey Ethan, evenings get busy! Want me to save you a spot Thursday at 6? It's on us."],
  [126, 2,  "sent",        "Hey Jordan! We missed you last weekend. Want me to save you a spot Saturday?"],
  [131, 1,  "sent",        "Hi Ava! Sunday class misses you. Your next one is on us. See you this weekend?"],
  [134, 1,  "sent",        "Hey Nathan, haven't seen you in a week. Everything okay? We'd love to see you Saturday."],
  [140, 1,  "sent",        "Hi Dylan! Want me to save you a spot in Thursday's 6pm? Your next class is on us."],
];

const byId = Object.fromEntries(DEMO_MEMBERS.map((m) => [m.id, m]));
export function demoMember(id) { return byId[id] || null; }

export function demoOutreachHistory(now = Date.now()) {
  const day = 24 * 60 * 60 * 1000;
  return HISTORY.map(([memberId, days, status, message], i) => {
    const m = byId[memberId];
    return {
      id: 9000 + i, memberId, memberName: m.name, plan: m.plan, value: m.value, message,
      // Spread send times through the studio's day so the log looks real.
      sentAt: new Date(now - days * day - ((i * 37) % 300) * 60 * 1000).toLocaleString(),
      status, followUpDays: 3, smsSent: true,
    };
  }).sort((a, b) => b.id - a.id);
}

// ── Texted replies waiting for the owner (Outreach tab inbox) ──────────────
export const DEMO_REPLY_THREADS = [
  { memberId: 121, sentHoursAgo: 72, repliedHoursAgo: 1,
    text: "Honestly it's the price. The YMCA by my apartment is $45 a month and I'm trying to save" },
  { memberId: 122, sentHoursAgo: 48, repliedHoursAgo: 4,
    text: "Hurt my back deadlifting, doctor says 3 or 4 weeks off. Not quitting, just can't come in" },
  { memberId: 123, sentHoursAgo: 46, repliedHoursAgo: 9,
    text: "My job switched me to early shifts so the 6pm classes don't fit my schedule anymore" },
  { memberId: 151, sentHoursAgo: 27 * 24, repliedHoursAgo: 27 * 24 - 3, handled: true,
    text: "Yes! Been slammed at work. Save me a spot Thursday",
    studioReply: "Amazing, Marcus! You're in for Thursday at 6. See you there." },
];

// Members who left over the last few months and told us why (feeds Insights).
export const DEMO_PAST_DEPARTURES = [
  { departureReason: "competitor", competitor: "FlexFit 24", memberName: "Dana Ortiz",   memberValue: 139 },
  { departureReason: "competitor", competitor: "FlexFit 24", memberName: "Luis Moreno",  memberValue: 89 },
  { departureReason: "competitor", competitor: "FlexFit 24", memberName: "Tara Quinn",   memberValue: 179 },
  { departureReason: "cost",       competitor: null,         memberName: "Kate Hall",    memberValue: 179 },
  { departureReason: "cost",       competitor: null,         memberName: "Paul Grant",   memberValue: 139 },
  { departureReason: "time",       competitor: null,         memberName: "Ben Price",    memberValue: 89 },
  { departureReason: "moving",     competitor: null,         memberName: "Holly Vance",  memberValue: 179 },
];
