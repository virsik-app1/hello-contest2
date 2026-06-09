# Conversational Reply Feature

## What it is (your differentiator)
When an at-risk member **replies** to a win-back text ("too expensive," "I've been traveling"), PulseRetain has **Claude draft the studio's response** — a warm, personalized reply, a suggested offer (including "⏸ Offer to Pause"), and a one-line "what to do next." The owner approves, copies, or sends in one tap. No competitor handles the *reply* side of the conversation. This is the headline.

## Where it lives
Dashboard → click an analyzed member → expanded panel → **"💬 Member replied?"** box → type the reply → **✨ Draft AI Reply**.

## Backend: nothing to do ✅
It reuses your existing secure Lambda `analyze` pass-through, so **no AWS/Lambda change is required**. To keep things clean, reply drafts use a separate ID range, so they never overwrite a member's saved churn analysis. Keys stay server-side as always.

## To make it live
Just push the frontend (one command — see chat). Amplify redeploys in ~2–3 min.

## How to verify
Log in → analyze a high-risk member → type a reply like *"It's just gotten too expensive"* → **Draft AI Reply**. You should see a sentiment badge, Claude's suggested reply, an offer, and a next-step tip.

## Demo tip
Your strongest 30 seconds: "Claude flagged her, wrote the win-back text… she replied that it's too expensive… now watch Claude handle the objection and suggest pausing instead of cancelling — the owner just taps send." That's what separates you from every churn *predictor* on the market.
