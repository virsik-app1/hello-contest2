// Gym profile for self-serve onboarding. Pure helpers (no AWS) so they can be
// unit-tested with `node --test lambda/onboarding.test.mjs`.
//
// The profile lives on the existing `settings#<tenant>` item in the outreach
// table, next to the time zone, so no new table or IAM permission is needed:
//   gymName          the studio's display name
//   avgPrice         average monthly membership price in whole dollars; used
//                    as the value for members whose CSV has no price column
//   onboardedAt      ISO time the owner finished (or skipped) first-run setup
//   onboardingSkipped true when they chose "I'll do this later"
import { isValidTimeZone } from "./followups.mjs";

export const GYM_NAME_MAX = 80;
export const AVG_PRICE_MAX = 2000;

// Validate what the setup screen sends. Returns { profile, errors }. Only the
// fields that were sent are returned, so a partial save never blanks others.
export function cleanGymProfile(input = {}) {
  const profile = {};
  const errors = [];

  if (input.gymName !== undefined) {
    const name = String(input.gymName ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
    if (!name) errors.push("Enter your gym's name.");
    else profile.gymName = name.slice(0, GYM_NAME_MAX);
  }

  if (input.avgPrice !== undefined) {
    const n = Number(String(input.avgPrice ?? "").replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0) errors.push("Enter your average monthly membership price.");
    else if (n > AVG_PRICE_MAX) errors.push(`Average price looks too high (max $${AVG_PRICE_MAX}).`);
    else profile.avgPrice = Math.round(n);
  }

  if (input.timezone !== undefined) {
    const tz = String(input.timezone || "");
    if (!isValidTimeZone(tz)) errors.push("Pick a time zone.");
    else profile.timezone = tz;
  }

  return { profile, errors };
}

// DynamoDB UpdateExpression for the cleaned profile plus completion flags.
// `complete` stamps onboardedAt; `skipped` also records that they skipped.
export function buildProfileUpdate(tenantId, profile, { complete = false, skipped = false, now = new Date().toISOString() } = {}) {
  const names = { "#t": "type" };
  const values = { ":type": "settings", ":tid": tenantId, ":now": now };
  const sets = ["#t = :type", "tenantId = :tid", "updatedAt = :now"];
  for (const [k, v] of Object.entries(profile)) {
    names[`#${k}`] = k;
    values[`:${k}`] = v;
    sets.push(`#${k} = :${k}`);
  }
  if (complete || skipped) {
    names["#ob"] = "onboardedAt";
    values[":ob"] = now;
    sets.push("#ob = if_not_exists(#ob, :ob)");
    names["#sk"] = "onboardingSkipped";
    values[":sk"] = !!skipped && !complete;
    sets.push("#sk = :sk");
  }
  return { UpdateExpression: `SET ${sets.join(", ")}`, ExpressionAttributeNames: names, ExpressionAttributeValues: values };
}

// The profile fields returned to the app from a settings item.
export function profileFromItem(item = {}) {
  return {
    gymName: item.gymName || null,
    avgPrice: Number.isFinite(Number(item.avgPrice)) && Number(item.avgPrice) > 0 ? Number(item.avgPrice) : null,
    onboardedAt: item.onboardedAt || null,
    onboardingSkipped: item.onboardingSkipped === true,
  };
}
