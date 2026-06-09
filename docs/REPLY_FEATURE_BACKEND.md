# Conversational Reply Feature — what's done & the one backend step

## What this feature is (your differentiator)

When an at-risk member **replies** to a win-back text ("too expensive," "I've been traveling," "thinking of cancelling"), PulseRetain lets **Claude draft the studio's response** — a warm, personalized reply plus a suggested offer and a one-line "what to do next" — for the owner to approve, copy, or send in one tap. No competitor (Keepme, Glofox, Gleantap, PredictStay, 1club) handles the *reply* side of the conversation. This is the headline.

## What's already built (frontend — done, tested, deploy-safe)

In `src/App.js`, inside each analyzed member's expanded panel on the Dashboard, there's now a **"💬 Member replied?"** section:
- A box to enter the member's reply.
- **"✨ Draft AI Reply"** → calls Claude (through your secure Lambda) and shows: a **sentiment** badge, **Claude's suggested reply**, a **suggested offer** (now including "⏸ Offer to Pause"), and a **🧭 next-step** tip.
- Buttons: **📱 Send Reply** (via Twilio), **📋 Copy**, **↻ Redraft**.

It calls your Lambda with a new action, `draft_reply`. The production build compiles cleanly under `CI=true`, so the frontend is safe to deploy now. The feature simply stays inactive until the backend step below is added.

## The one backend step: add a `draft_reply` action to your Lambda

Your Lambda already does this exact thing for the `analyze` action (calls Claude, returns the response). We just need a twin that **doesn't save to DynamoDB** (so member churn analyses aren't overwritten).

### Easiest path (recommended — reuses your working code)
1. Open your Lambda `pulseretain-claude-proxy` in the AWS console.
2. Find the block that handles `action === "analyze"`.
3. **Copy it**, and in the copy:
   - change the action it matches from `"analyze"` to `"draft_reply"`,
   - **remove the line(s) that save to DynamoDB** (the part that writes the result to `pulseretain-members`). Keep everything that calls Claude and returns the response.
4. Deploy the Lambda.

That's it — it inherits your exact API key, model call, and CORS headers.

### Or, a self-contained version (if you'd rather add fresh code)
Add this case to your action router (match it to your Lambda's existing style and **use the same env var name your `analyze` code uses for the key**):

```js
if (body.action === "draft_reply") {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,   // <-- match your existing key variable
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: body.model || "claude-haiku-4-5-20251001",
      max_tokens: body.max_tokens || 500,
      messages: body.messages,
    }),
  });
  const data = await resp.json();
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",            // <-- match your analyze CORS headers
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),                       // returns { content: [...] }, same shape as analyze
  };
}
```

### How to verify it works
1. Push the frontend (your normal `git push`) and let Amplify redeploy.
2. In the live app: log in → analyze a high-risk member → in the expanded panel, type a reply like *"It's just gotten too expensive"* → **Draft AI Reply**.
3. You should see a sentiment badge, a suggested reply, and a next-step tip. If it errors, the `draft_reply` action isn't live on the Lambda yet.

## Why a new action instead of reusing `analyze`
Your `analyze` action saves its result to DynamoDB keyed by member. If reply-drafting reused it, each drafted reply would **overwrite that member's saved churn analysis**. A separate `draft_reply` action keeps the two clean and independent.

## Demo tip
This is your strongest 30 seconds: "Claude flagged her, wrote the win-back text… she replied that it's too expensive… now watch Claude handle the objection and suggest pausing instead of cancelling — the owner just taps send." That's the moment that separates you from every churn-*predictor* on the market.
