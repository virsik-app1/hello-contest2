// Billing page and trial banner. Plans, prices and status all come from the
// Lambda's `get_billing` route; Stripe Checkout and the Customer Portal are
// hosted by Stripe, so no card details ever touch this app.

// Sample billing for the no-login demo (/#demo).
export const DEMO_BILLING = {
  status: "trial", stripeStatus: null, tier: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
  hasCustomer: false, trialDays: 14, trialDaysLeft: 9, trialEndsAt: null, memberCount: 186,
  recommendedTier: "starter", configured: false, testMode: false, demo: true,
  tiers: [
    { id: "starter", name: "Starter",    maxMembers: 300,  blurb: "Single studio, up to 300 members",    suggestedMonthly: 99,  price: null, fits: true },
    { id: "growth",  name: "Growth",     maxMembers: 1000, blurb: "Busy gym, up to 1,000 members",       suggestedMonthly: 199, price: null, fits: true },
    { id: "pro",     name: "Studio Pro", maxMembers: 5000, blurb: "Multi-location, up to 5,000 members", suggestedMonthly: 349, price: null, fits: true },
  ],
};

const fmtDate = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
};

export function formatPrice(tier) {
  if (tier.price) {
    const { amount, currency, interval } = tier.price;
    const money = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
    return { main: money, unit: `/ ${interval}`, suggested: false };
  }
  return { main: `$${tier.suggestedMonthly}`, unit: "/ month", suggested: true };
}

// The one-line banner shown above every tab, or null when nothing needs saying.
// tone: "bad" (red) or "mid" (yellow).
export function billingBanner(b) {
  if (!b || b.demo) return null;
  if (b.status === "past_due") return { tone: "bad", text: "Your last payment didn't go through. Update your card to keep PulseRetain running.", cta: "Update card", action: "portal" };
  if (b.status === "trial_ended") return { tone: "bad", text: "Your free trial has ended. Choose a plan to keep texting members.", cta: "Choose a plan", action: "billing" };
  if (b.status === "canceled") return { tone: "bad", text: "Your subscription has ended. Choose a plan to pick up where you left off.", cta: "Choose a plan", action: "billing" };
  if (b.status === "trial" && b.trialDaysLeft <= 7) {
    const days = b.trialDaysLeft === 1 ? "1 day" : `${b.trialDaysLeft} days`;
    return { tone: "mid", text: `Your free trial ends in ${days}.`, cta: "Choose a plan", action: "billing" };
  }
  return null;
}

export function statusSummary(b) {
  const tierName = b.tiers?.find(t => t.id === b.tier)?.name || "Your plan";
  switch (b.status) {
    case "trial":
      return { tone: "neutral", title: "Free trial", detail: `${b.trialDaysLeft} of ${b.trialDays} days left${b.trialEndsAt ? `, ends ${fmtDate(b.trialEndsAt)}` : ""}. No card needed until you choose a plan.` };
    case "trial_ended":
      return { tone: "bad", title: "Trial ended", detail: "Choose a plan below to keep using PulseRetain." };
    case "active":
      if (b.stripeStatus === "trialing" && b.stripeTrialEnd)
        return { tone: "good", title: `${tierName} plan`, detail: `Subscribed. Your first charge is on ${fmtDate(b.stripeTrialEnd)}, when your free trial ends.` };
      if (b.cancelAtPeriodEnd)
        return { tone: "mid", title: `${tierName} plan`, detail: `Cancels on ${fmtDate(b.currentPeriodEnd)}. You can turn renewal back on in Manage billing.` };
      return { tone: "good", title: `${tierName} plan`, detail: b.currentPeriodEnd ? `Renews on ${fmtDate(b.currentPeriodEnd)}.` : "Active." };
    case "past_due":
      return { tone: "bad", title: `${tierName} plan, payment failed`, detail: "Stripe will retry the card. Update it in Manage billing to avoid an interruption." };
    case "canceled":
      return { tone: "bad", title: "Subscription ended", detail: "Choose a plan below to start again." };
    default:
      return { tone: "neutral", title: "Billing", detail: "" };
  }
}

export default function BillingPage({ billing, error, busy, onCheckout, onPortal, onRetry, isMobile, ui }) {
  const { T, btn, SERIF, eyebrow, panel, accentPanel, SectionHead } = ui;

  if (error) {
    return (
      <div style={{ ...panel, padding: 20 }}>
        <p style={{ margin: 0, fontSize: 14, color: T.redDark }}>Couldn't load billing: {error}</p>
        <button onClick={onRetry} style={btn("secondary", { marginTop: 12 })}>Try again</button>
      </div>
    );
  }
  if (!billing) return <p style={{ fontSize: 14, color: T.muted }}>Loading billing…</p>;

  const s = statusSummary(billing);
  const toneColor = { bad: T.red, mid: T.amber, good: T.greenMid, neutral: T.purple }[s.tone];
  const toneText  = { bad: T.redDark, mid: T.amberDark, good: T.green, neutral: T.ink }[s.tone];
  const subscribed = ["active", "past_due"].includes(billing.status);
  const canPick = !subscribed && (billing.configured || billing.demo); // demo buttons lead to sign-up
  const trialPct = billing.status === "trial" ? (billing.trialDaysLeft / billing.trialDays) * 100 : 0;

  return (
    <>
      <SectionHead isMobile={isMobile} title="Billing"
        sub={`Plans are priced by how many members you track. You have ${billing.memberCount.toLocaleString("en-US")} on your roster.`}
        right={billing.hasCustomer && !billing.demo && (
          <button onClick={onPortal} disabled={!!busy} style={btn("secondary", { opacity: busy ? 0.6 : 1 })}>
            {busy === "portal" ? "Opening…" : "Manage billing"}
          </button>
        )} />

      {billing.testMode && (
        <p role="note" style={{ margin: "0 0 12px", fontSize: 13, color: "#a85410", background: T.orangeTint, border: "1px solid #f6d3b0", borderRadius: 8, padding: "8px 12px" }}>
          Stripe test mode. Use card 4242 4242 4242 4242, any future date and any CVC. No real money moves.
        </p>
      )}
      {!billing.configured && !billing.demo && (
        <p role="note" style={{ margin: "0 0 12px", fontSize: 13, color: T.muted, background: T.soft, border: `1px solid ${T.line}`, borderRadius: 8, padding: "8px 12px" }}>
          Stripe isn't connected yet, so plans can't be bought. Prices shown are suggestions.
        </p>
      )}

      {/* Current status */}
      <div style={{ background: "#fff", border: `1px solid ${T.line}`, borderLeft: `3px solid ${toneColor}`, borderRadius: 10, padding: isMobile ? "14px 14px" : "16px 20px", marginBottom: 20 }}>
        <p style={eyebrow}>Current plan</p>
        <p style={{ margin: "4px 0 0", fontFamily: SERIF, fontSize: 22, color: toneText }}>{s.title}</p>
        {s.detail && <p style={{ margin: "4px 0 0", fontSize: 13, color: T.body, lineHeight: 1.5 }}>{s.detail}</p>}
        {billing.status === "trial" && (
          <div style={{ height: 6, background: T.soft, borderRadius: 3, overflow: "hidden", marginTop: 12, maxWidth: 360 }}>
            <div style={{ width: `${Math.max(0, Math.min(100, trialPct))}%`, height: "100%", background: trialPct > 50 ? T.purple : T.orange, borderRadius: 3 }} />
          </div>
        )}
      </div>

      {/* Plans */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 14 }}>
        {billing.tiers.map(t => {
          const p = formatPrice(t);
          const recommended = t.id === billing.recommendedTier;
          const current = subscribed && t.id === billing.tier;
          return (
            <div key={t.id} style={{ ...(recommended || current ? accentPanel(current ? T.greenMid : T.purple) : panel), padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: T.ink }}>{t.name}</p>
                {current ? <span style={{ fontSize: 11, fontWeight: 600, color: T.green, background: T.greenTint, padding: "2px 8px", borderRadius: 10 }}>Current</span>
                  : recommended && <span style={{ fontSize: 11, fontWeight: 600, color: "#6c3483", background: T.purpleTint, padding: "2px 8px", borderRadius: 10 }}>Fits your roster</span>}
              </div>
              <p style={{ margin: 0 }}>
                <span style={{ fontFamily: SERIF, fontSize: 30, color: T.ink }}>{p.main}</span>
                <span style={{ fontSize: 13, color: T.muted, marginLeft: 4 }}>{p.unit}</span>
                {p.suggested && <span style={{ display: "block", fontSize: 11, color: T.faint, marginTop: 2 }}>Suggested price</span>}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: T.body, lineHeight: 1.5 }}>{t.blurb}</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.muted, lineHeight: 1.7 }}>
                <li>Up to {t.maxMembers.toLocaleString("en-US")} members</li>
                <li>AI risk scoring and drafted texts</li>
                <li>Two-way SMS with reply capture</li>
                {t.id === "pro" && <li>All locations in one dashboard</li>}
              </ul>
              <div style={{ marginTop: "auto", paddingTop: 6 }}>
                {current ? null : !t.fits ? (
                  <p style={{ margin: 0, fontSize: 12, color: T.faint }}>Too small for your roster</p>
                ) : (
                  <button onClick={() => onCheckout(t.id)} disabled={!canPick || !!busy}
                    style={btn(recommended ? "primary" : "secondary", { width: "100%", padding: "10px 0", opacity: !canPick || busy ? 0.55 : 1, cursor: !canPick || busy ? "not-allowed" : "pointer" })}>
                    {busy === t.id ? "Opening checkout…" : billing.demo ? "Sign up to choose" : subscribed ? "Change in Manage billing" : `Choose ${t.name}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 12, color: T.faint, lineHeight: 1.5 }}>
        Payments are handled by Stripe. Choosing a plan during your free trial won't charge you until the trial ends. Cancel any time in Manage billing.
      </p>
    </>
  );
}

export function BillingBanner({ banner, onAction, pad, ui }) {
  const { T, btn, SANS } = ui;
  if (!banner) return null;
  const bad = banner.tone === "bad";
  return (
    <div role="status" style={{ background: bad ? T.redTint : T.amberTint, borderBottom: `1px solid ${bad ? "#f5c6c0" : "#f1e2a8"}`, padding: `9px ${pad}`, display: "flex", justifyContent: "center", alignItems: "center", gap: 12, flexWrap: "wrap", fontFamily: SANS, fontSize: 13, color: bad ? T.redDark : T.amberDark, textAlign: "center" }}>
      <span>{banner.text}</span>
      <button onClick={onAction} style={btn(bad ? "primary" : "secondary", { padding: "5px 12px", fontSize: 12 })}>{banner.cta}</button>
    </div>
  );
}
