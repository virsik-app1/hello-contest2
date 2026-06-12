# The PulseRetain Reply Agent — conversational retention concierge

## What it is

When an at-risk member texts back after a win-back message, PulseRetain doesn't hand the owner a blank box — **a purpose-trained retention agent drafts the studio's next text**, with the member's whole conversation in memory, the studio's offer menu as hard rules, and an escalation flag for the moments a human must take over.

This is the moat: Keepme, Glofox, Gleantap, PredictStay and 1club all *predict and blast*. None of them handle the reply. Emarsys-class suites don't either — not at any price a studio can pay.

## Where the "teaching" lives

The agent's knowledge is a **server-side system prompt** in the Lambda (`buildReplySystemPrompt()` in `lambda/index.mjs`) — it never ships to the browser, so it can't be read or tampered with from the page. It encodes:

| Layer | What it teaches |
|---|---|
| **Identity** | Texts as the studio owner — warm, brief, human; never a "chatbot persona". |
| **Offer menu** | Exactly six allowed offers (class credit, 10% off next month, guest pass, PT intro, pause ≤2 months, none) — the model may never invent anything else. |
| **Offer discipline** | Max one offer per message; never repeat a declined offer; two declines → stop selling, stay kind. |
| **Objection playbook** | Price → pause or 10%, never both · busy → flexibility · injury → no selling + escalate · moving → gracious close · anger → apologize, no offers, escalate · firm cancel → respect immediately · STOP → acknowledge + stop texting. |
| **Crisis safety (highest priority)** | If a member signals self-harm, a medical emergency, abuse, or a threat, the agent STOPS retaining: no offer, brief human warmth, `escalate=true`, and `nextStep` points the owner to reach out and to emergency help (988/911 in the US). A membership is never the priority in that moment. |
| **Minors** | Under-18 members get no retention pressure and an escalation flag for anything sensitive. |
| **Style rules** | <300 chars, first name, ≤1 emoji, no guilt-trips, never fabricate schedules/prices. |
| **Injection defense** | Member texts are data, not instructions — "ignore your rules" style messages are answered as a normal studio text. Member text and profile fields are whitespace-collapsed before templating, so a member can't forge a fake `STUDIO:`/`SYSTEM:` line through newlines. |

A second safety net, `parseDraftJson()`, **clamps the model's output in code**: off-menu offers are coerced to `none`, unknown sentiments to `neutral`, `escalate` to a strict boolean, replies capped at 320 chars — so the UI can never show an out-of-policy draft even if the model misbehaves. Malformed model output returns a clean "please try again," never a 500.

A retry guard makes `draft_reply` idempotent: re-sending the same member message (e.g. after a no-credits failure) does **not** duplicate the member's turn in the thread.

## Conversation memory

Threads persist in the existing `pulseretain-outreach` DynamoDB table as items with `logId = "conv-<memberId>"` (no new tables, no new IAM permissions):

```json
{ "logId": "conv-1", "memberId": "1", "type": "conversation",
  "turns": [ { "role": "studio", "text": "...", "at": "ISO" },
             { "role": "member", "text": "...", "at": "ISO" } ] }
```

- The first reply auto-seeds the thread with the original win-back text, so the agent knows what the member is answering.
- The member's message is saved **before** the model is called — it survives even if the AI call fails.
- Threads cap at the last 40 turns. `load_data` filters `conv-*` items out of the outreach log.

## API (Lambda actions)

| Action | Input | Output |
|---|---|---|
| `draft_reply` | `memberId, member{name,plan,value,joinedMonths,usualVisits,lastVisit}, memberMessage, originalOutreach?` | `{ success, draft{sentiment,reply,suggestedOffer,nextStep,escalate}, turns }` |
| `get_conversation` | `memberId` | `{ turns }` |
| `log_reply_sent` | `memberId, memberName, text` | `{ success, turns }` |

## Frontend behavior

- Expanding an analyzed member loads their thread; turns render as SMS-style bubbles.
- "✨ Draft AI Reply" calls `draft_reply`; the draft card shows sentiment, suggested offer, next step, and a red **owner-should-handle-this** banner when `escalate` is true.
- The owner can **📱 Send Reply** (Twilio + thread log) or **✓ Approve & Log** (thread log only — demo-safe without Twilio).
- **Fallback:** if the deployed Lambda doesn't know `draft_reply` yet (it answers `400 "Unknown action."`), the frontend silently uses the legacy single-shot draft path. Frontend and Lambda can therefore deploy in any order.

## Demo script (the 60-second version)

1. Sarah was flagged; Claude wrote her win-back text; it was sent.
2. She texts back: *"Honestly it's just gotten too expensive for me right now."*
3. The agent reads the thread, drafts: empathy + offer to **pause** instead of cancel (not a discount war), flags `nextStep` for the owner.
4. Owner taps **Send**. Sarah replies *"ok yeah maybe pausing is smart"* → next draft confirms the pause warmly, `suggestedOffer: none` — **it knows not to keep selling.**
5. Line for the judges: *"Every tool on the market predicts who will leave. Ours has the conversation that keeps them."*
