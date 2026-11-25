// PulseRetain — scheduled follow-ups and per-gym time zones.
//
// Pure logic only: no AWS SDK imports, so it runs under `node --test` with no
// install. index.mjs supplies the DynamoDB / Twilio functions as `deps`.
//
// DEPLOY NOTE: the Lambda now needs BOTH lambda/index.mjs and this file
// (lambda/followups.mjs) side by side. See docs/FOLLOWUPS.md.

export const DEFAULT_TZ = "America/New_York";

// GUESS: follow-ups go out at 10am in the gym's own time zone on the due day —
// late enough to not feel early, well inside the 8am–9pm texting window.
export const FOLLOWUP_SEND_HOUR = 10;

export const MIN_FOLLOWUP_DAYS = 1;
export const MAX_FOLLOWUP_DAYS = 30;
// After this many failed Twilio attempts a follow-up is marked "failed".
export const MAX_SEND_ATTEMPTS = 3;

export const followupKey = (tenantId, memberId) => `followup#${tenantId}#${memberId}`;
export const settingsKey = (tenantId) => `settings#${tenantId}`;

// True when `tz` is an IANA zone name the runtime understands ("America/Chicago").
export function isValidTimeZone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; }
  catch { return false; }
}

// The wall-clock parts of `date` as seen in `tz`.
function zonedParts(date, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const get = (t) => Number(parts.find(p => p.type === t).value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

export function localHour(date, tz) {
  return zonedParts(date, tz).hour;
}

// Quiet hours for one gym: true = texting is NOT allowed right now in `tz`.
export function isQuietHoursIn(now, tz, start = 8, end = 21) {
  const hour = localHour(now, isValidTimeZone(tz) ? tz : DEFAULT_TZ);
  return !(hour >= start && hour < end);
}

// Offset (ms) of `tz` from UTC at instant `date`.
function tzOffsetMs(date, tz) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// The UTC instant for a wall-clock time in `tz` (handles DST: re-checks the
// offset at the resulting instant).
export function zonedTimeToUtc(year, month, day, hour, tz) {
  const guess = Date.UTC(year, month - 1, day, hour);
  let ts = guess - tzOffsetMs(new Date(guess), tz);
  const off2 = tzOffsetMs(new Date(ts), tz);
  ts = guess - off2;
  return new Date(ts);
}

export function clampFollowUpDays(days) {
  const n = Math.round(Number(days));
  if (!Number.isFinite(n)) return 3; // the dashboard's own default
  return Math.min(MAX_FOLLOWUP_DAYS, Math.max(MIN_FOLLOWUP_DAYS, n));
}

// When a follow-up scheduled `now` with `days` should go out: that many
// calendar days later (in the gym's zone) at FOLLOWUP_SEND_HOUR local time.
export function computeDueAt(now, days, tz, sendHour = FOLLOWUP_SEND_HOUR) {
  const zone = isValidTimeZone(tz) ? tz : DEFAULT_TZ;
  const p = zonedParts(now, zone);
  // Date.UTC normalises day overflow (e.g. Nov 30 + 3 → Dec 3).
  const target = new Date(Date.UTC(p.year, p.month - 1, p.day + clampFollowUpDays(days)));
  return zonedTimeToUtc(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), sendHour, zone);
}

// GUESS: the default follow-up wording when the owner doesn't supply one. Kept
// short (one SMS segment) and with no offer, since the first text already made one.
export function defaultFollowUpText(memberName) {
  const first = String(memberName || "").trim().split(/\s+/)[0] || "there";
  return `Hi ${first}, just checking in after our last message. We'd love to see you back this week. Reply here if there's anything we can help with!`;
}

// True if the member has texted the studio since the follow-up was scheduled —
// then a canned follow-up would talk over a live conversation, so we cancel it.
export function memberRepliedSince(turns, sinceIso) {
  if (!Array.isArray(turns) || !sinceIso) return false;
  return turns.some(t => t && t.role === "member" && t.at && t.at > sinceIso);
}

// Run every due follow-up once, applying the same checks as a manual send:
// opt-out, gym-local quiet hours, daily texting quota, first-contact STOP
// footer, contacted mark and audit log. Each item is claimed atomically first
// so two overlapping runs can never text a member twice.
//
// deps: {
//   getTimeZone(tenantId) → tz, isOptedOut(phone), getConversationTurns(tenantId, memberId),
//   cancel(item, reason) (before claim), claim(item) → bool,
//   release(item, fields) / finish(item, status, fields) (after claim),
//   consumeQuota(tenantId) → bool, isFirstContact(phone), sendSMS(phone, text) → {sid},
//   markContacted(phone), logSend(tenantId, phone, text, extra),
//   quietStart, quietEnd, enforceQuietHours, optOutFooter, maxChars
// }
export async function processDueFollowups(items, now, deps) {
  const summary = { due: 0, sent: 0, cancelled: 0, deferred: 0, failed: 0 };
  const nowIso = now.toISOString();
  for (const item of items) {
    if (item.type !== "followup" || item.status !== "scheduled" || !(item.dueAt <= nowIso)) continue;
    summary.due++;
    try {
      const tz = await deps.getTimeZone(item.tenantId);

      if (await deps.isOptedOut(item.phone)) {
        await deps.cancel(item, "opted_out"); summary.cancelled++; continue;
      }
      const turns = await deps.getConversationTurns(item.tenantId, item.memberId);
      if (memberRepliedSince(turns, item.scheduledAt)) {
        await deps.cancel(item, "member_replied"); summary.cancelled++; continue;
      }
      // Quiet hours in THIS gym's zone: leave it scheduled, a later run sends it.
      if (deps.enforceQuietHours && isQuietHoursIn(now, tz, deps.quietStart, deps.quietEnd)) {
        summary.deferred++; continue;
      }
      if (!(await deps.claim(item))) continue; // another run got it first
      // Daily quota: if spent, hand it back for tomorrow's runs.
      if (!(await deps.consumeQuota(item.tenantId))) {
        await deps.release(item, { lastDeferReason: "quota" }); summary.deferred++; continue;
      }

      let outText = String(item.message);
      const first = await deps.isFirstContact(item.phone);
      if (first && !/\bstop\b/i.test(outText) && outText.length + 1 + deps.optOutFooter.length <= deps.maxChars) {
        outText = `${outText} ${deps.optOutFooter}`;
      }

      let result;
      try {
        result = await deps.sendSMS(item.phone, outText);
      } catch (e) {
        const attempts = (Number(item.attempts) || 0) + 1;
        if (attempts >= MAX_SEND_ATTEMPTS) { await deps.finish(item, "failed", { attempts, lastError: String(e.message || e).slice(0, 300) }); summary.failed++; }
        else { await deps.release(item, { attempts, lastError: String(e.message || e).slice(0, 300) }); summary.deferred++; }
        continue;
      }
      await deps.markContacted(item.phone);
      await deps.logSend(item.tenantId, item.phone, outText, { sid: result?.sid, firstContact: first, followup: true, memberId: String(item.memberId) });
      await deps.finish(item, "sent", { sid: result?.sid || null, sentAt: new Date().toISOString(), sentText: outText });
      summary.sent++;
    } catch (e) {
      console.error("follow-up run failed for", item.logID, e.message);
      summary.failed++;
    }
  }
  return summary;
}
