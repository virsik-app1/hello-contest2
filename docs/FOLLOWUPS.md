# Scheduled follow-ups and per-gym time zones

## What it does

- **Schedule Follow-up** on the dashboard now books a real text. The Lambda saves a
  `followup#<gym>#<member>` item in `pulseretain-outreach` that is due *N* days later
  (the AI's `followUpDays`, clamped to 1–30) at **10:00 am in the gym's time zone**.
  Scheduling again for the same member replaces the pending one.
- An **hourly EventBridge rule** invokes the Lambda, which sends every due follow-up
  through the same checks as a manual send:
  1. opted out → cancelled, never texted
  2. member has texted back since it was scheduled → cancelled (the reply agent owns the conversation)
  3. inside quiet hours *in that gym's zone* → left for a later run
  4. daily texting quota spent → handed back, retried on later runs
  5. first contact → "Reply STOP to opt out." footer added
  6. contacted mark + `sendlog` audit item written, follow-up marked `sent`
  Each follow-up is claimed with a conditional write first, so overlapping runs can't double-text.
  Twilio errors are retried on the next two runs, then marked `failed`.
- Marking an outreach **Recovered** cancels that member's pending follow-up; the dashboard
  also shows the send time with a **Cancel** button.
- Sample members (555 numbers) and the `/#demo` mode never schedule a real text.
- **Per-gym time zone** (`settings#<gym>` item). Manual sends and follow-ups use it for the
  8am–9pm window. A gym with no saved zone gets the owner's browser zone on first sign-in;
  it can be changed on the Outreach tab. `QUIET_HOURS_TZ` remains the fallback.

New Lambda actions (all behind Cognito auth): `get_settings`, `save_settings {timezone}`,
`schedule_followup {memberId, memberName, phone, followUpDays, message?}`,
`cancel_followup {memberId}`, `list_followups`.

## Deploy steps (by hand, once)

1. **Lambda code:** upload `lambda/index.mjs` **and the new `lambda/followups.mjs`** side by side
   (in the console editor: File → New File → `followups.mjs`, paste, Deploy). Without the second
   file the Lambda fails to start.
2. **Schedule:** EventBridge → Rules → Create rule → *Schedule* → `rate(1 hour)` → target: this
   Lambda function, input left as the default event. (Or EventBridge Scheduler with payload
   `{"pulseretainJob":"send_followups"}`.) The console adds the invoke permission for you.
3. **Timeout:** raise the Lambda timeout to at least 60 s so a run with many due texts finishes.
4. No new table and no IAM change: everything uses the existing outreach table and the
   Scan/Get/Put/Update permissions the Lambda already has.

## Known limits (v1)

- The hourly run Scans the whole outreach table. Fine at beta size; add a GSI on `type`/`dueAt` later.
- Follow-ups store the phone number at schedule time and key on the dashboard's member id. When
  server-side members with stable ids land, the same key just carries the stable id.
- The follow-up wording is a fixed friendly check-in (`defaultFollowUpText`); the owner can't edit it in the UI yet.
- If the Lambda crashes mid-send an item can stay in `sending` and won't be retried (chosen over risking a double text).

Tests: `node --test lambda/followups.test.mjs`
