# Per-gym texting numbers and SMS compliance

## What it does

- **Each gym can get its own Twilio number.** On the Outreach tab, the "Your texting number"
  card lets the owner search an area code, pick a number, enter the gym name and a help
  contact, and press **Get this number**. The Lambda then:
  1. creates a Twilio **Messaging Service** for that gym (free), with inbound messages
     pointed at the Lambda's Function URL,
  2. buys the number (**costs money**, about $1.15/month per number) with its SMS webhook
     pointed at the Lambda too,
  3. adds the number to the gym's Messaging Service (the A2P campaign attaches there),
  4. stores `smsnumber#<gym>` (number, service, status, gym name, help contact) and
     `smsowner#<number>` (number to gym, used for inbound texts) in `pulseretain-outreach`.
- **Buying is switched off** until the Lambda environment variable `ALLOW_NUMBER_PURCHASE`
  is set to `true`. While it's off, the card says "Dedicated numbers are coming soon" and the
  server refuses `buy_sms_number`. Searching available numbers is free and always allowed.
- **A gym's number only sends once the carriers approve it.** US carriers block unregistered
  10DLC traffic, so texts keep going out from the shared `TWILIO_PHONE_NUMBER` until Twilio
  reports the gym's Messaging Service as A2P registered (`us_app_to_person_registered`).
  The card re-checks this every time it loads and flips to **Live** automatically.
  If there is no shared number configured, sends fail with a clear message instead.
- Texts from a live gym number are sent with `From` = the gym's number and
  `MessagingServiceSid` = its service, so they ride on the gym's own campaign.

## Opt-outs (STOP / START / HELP)

| Member texts | To a gym's own number | To the shared number |
|---|---|---|
| STOP (and STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPTOUT) | Suppressed **for that gym** (`optout#<gym>#<phone>`) | Suppressed **for every gym** (`optout#<phone>`), noting which gym last texted them |
| START (YES, UNSTOP, OPTIN) | Clears that gym's record, and the shared-number one only if that STOP was this gym's | Clears the shared-number record |
| HELP / INFO | "*Gym name*: member messages. Questions? *contact*. Reply STOP to unsubscribe. Msg&data rates may apply." | Generic PulseRetain help text |
| Anything else | Filed on that gym's member thread (exact, by the number texted) | Filed on whichever gym texted them last (unchanged) |

- Every send path checks both records before texting: manual **Send** (`send_sms`),
  **Schedule follow-up** (`schedule_followup`), and the **hourly follow-up run** (which cancels the
  follow-up with reason `opted_out`).
- When an owner pastes a member reply that says "stop" into **Draft reply**, that gym's record is set.
- The first text **from each gym** to a member carries "Reply STOP to opt out."
- Twilio also enforces STOP on its side per sender (error 21610); our list is what lets the app
  refuse up front and cancel follow-ups.
- Existing opt-outs (`optout#<phone>`) keep blocking everyone, so nothing already suppressed
  becomes textable after this change.

New Lambda actions (behind Cognito auth): `get_sms_number`, `search_sms_numbers {areaCode}`,
`buy_sms_number {phoneNumber, gymName, helpContact}`, `save_sms_profile {gymName, helpContact}`.

## Deploy steps (by hand)

1. Upload every `lambda/*.mjs` file except the tests (`index`, `followups`, `security`,
   `onboarding`, **and the new `smsnumbers.mjs`**, plus `billing.mjs` if the Stripe PR is merged). Without `smsnumbers.mjs` the
   Lambda fails to start.
2. No new table, no IAM change, no new secrets: it uses the existing `TWILIO_ACCOUNT_SID` /
   `TWILIO_AUTH_TOKEN`. Node 18+ is needed for `fetch` (the function runs nodejs24.x).
3. Leave `ALLOW_NUMBER_PURCHASE` unset until the first gym is ready to register (see below).

## A2P 10DLC registration (Carter, in the Twilio console)

PulseRetain sends texts that members see as coming from *their gym*, and gyms write their own
messages, so Twilio treats PulseRetain as an **ISV**: each gym needs its **own brand and its own
campaign**. Never put two gyms on one campaign. Allow 2 to 4 weeks per gym (brand 3 to 5 business
days, campaign 10 to 15).

**Once, for PulseRetain itself**

1. Upgrade the Twilio account out of trial (trial accounts can't register).
2. Trust Hub → Customer Profiles → create PulseRetain's **Primary Customer Profile** (your legal
   business name, EIN, address, website, authorized contact). Wait for approval.

**For each gym**

1. Collect from the gym: legal business name exactly as on its EIN letter, EIN, business type,
   address, public website, and a contact (name, email, phone). A gym with no EIN registers as a
   **Sole Proprietor** brand (1 number, about 1,000 texts/day to T-Mobile).
2. Trust Hub → create a **Secondary Customer Profile** for the gym under your Primary profile.
3. Messaging → Regulatory Compliance → **register a Brand** with that profile. Low-Volume Standard
   fits most single gyms (under 6,000 texts/day). Standard if they'll send more.
4. In the gym app, press **Get this number** for that gym (with `ALLOW_NUMBER_PURCHASE=true`).
   This creates the gym's Messaging Service, named "PulseRetain - *gym name*".
5. Messaging → Services → open that service → **Compliance info / Register campaign** on the gym's
   brand. Suggested answers:
   - Use case: **Mixed** (or Low Volume Mixed): account notifications plus re-engagement offers.
   - Description: "*Gym name* texts its own members about their membership: check-ins when they
     haven't visited, class and schedule updates, and occasional offers to return. Members are
     current or recently lapsed members who gave their mobile number and agreed to texts when
     they joined."
   - Sample messages (use real ones from the gym, with the gym name):
     "Hi Sam, it's Iron Temple. We've missed you at the 6am class. Want me to hold a spot Thursday? Reply STOP to opt out."
     "Iron Temple: your membership freeze ends Monday. Reply here if you'd like to extend it. Reply STOP to opt out."
   - Opt-in: describe exactly where the gym collects consent, for example "Members tick 'I agree to
     receive texts from Iron Temple' on the membership agreement at the front desk / on
     irontemple.com/join". Carriers reject vague answers like "members opt in".
   - Opt-out: STOP and the other standard keywords. Help: HELP returns the gym name and contact.
   - Embedded links: say yes only if gyms will send links.
6. When the campaign is approved, the gym's card in PulseRetain turns **Live** on its next load and
   texts start coming from the gym's number. No code change or redeploy is needed.

Rough Twilio fees (check twilio.com/en-us/sms/pricing/us before relying on them): number about
$1.15/month, brand registration a few dollars one-time (more for Standard with vetting),
campaign vetting about $15 one-time, campaign about $1.50 to $10/month, plus per-message carrier fees.

## Known limits

- One number per gym. Releasing or changing a number is done in the Twilio console (then delete the
  `smsnumber#<gym>` and `smsowner#<number>` items).
- Everything lives in the main Twilio account. Twilio recommends a **subaccount per gym** for billing
  and compliance isolation; worth doing before many gyms are live.
- Brand and campaign registration is a console step today; it can be automated through Twilio's
  ISV APIs later.
- Toll-free numbers are not offered by the card (they need a separate, faster toll-free verification).

Tests: `node --test lambda/smsnumbers.test.mjs lambda/followups.test.mjs`
