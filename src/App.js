import { Amplify } from "aws-amplify";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { awsConfig } from "./aws-config";
import { useState } from "react";

Amplify.configure(awsConfig);

const members = [
  { id: 1, name: "Sarah Reynolds", initials: "SR", plan: "Unlimited Monthly", lastVisit: "9 days ago", usualVisits: "Tue & Thu", risk: "high", score: 91, value: 79 },
  { id: 2, name: "Tom Mitchell", initials: "TM", plan: "10-Class Pack", lastVisit: "6 days ago", usualVisits: "Every Saturday", risk: "high", score: 78, value: 49 },
  { id: 3, name: "Jessica Lane", initials: "JL", plan: "Unlimited Monthly", lastVisit: "4 days ago", usualVisits: "Mon, Wed, Fri", risk: "medium", score: 54, value: 79 },
  { id: 4, name: "Marcus Webb", initials: "MW", plan: "Unlimited Monthly", lastVisit: "3 days ago", usualVisits: "Tue & Thu", risk: "medium", score: 47, value: 79 },
  { id: 5, name: "Priya Nair", initials: "PN", plan: "5-Class Pack", lastVisit: "2 days ago", usualVisits: "Fridays", risk: "low", score: 21, value: 29 },
  { id: 6, name: "Derek Collins", initials: "DC", plan: "Unlimited Monthly", lastVisit: "1 day ago", usualVisits: "Daily", risk: "low", score: 12, value: 79 },
  { id: 7, name: "Aisha Thompson", initials: "AT", plan: "Unlimited Monthly", lastVisit: "Today", usualVisits: "Mon & Wed", risk: "low", score: 8, value: 79 },
  { id: 8, name: "Ryan Foster", initials: "RF", plan: "10-Class Pack", lastVisit: "8 days ago", usualVisits: "Weekends", risk: "high", score: 83, value: 49 },
];

const riskConfig = {
  high:   { label: "High Risk",   bg: "#fff1f1", color: "#c0392b", bar: "#e74c3c", dot: "#e74c3c" },
  medium: { label: "Medium",      bg: "#fffbf0", color: "#b7770d", bar: "#f39c12", dot: "#f39c12" },
  low:    { label: "Safe",        bg: "#f0faf4", color: "#1e7e45", bar: "#27ae60", dot: "#27ae60" },
};

const stats = [
  { label: "Members Recovered",  value: "11",     sub: "this month" },
  { label: "Revenue Saved",      value: "$5,940",  sub: "this month" },
  { label: "Messages Sent",      value: "38",     sub: "this month" },
  { label: "Avg Response Rate",  value: "79%",    sub: "last 30 days" },
  { label: "At-Risk Members",    value: "3",      sub: "right now" },
];

export default function App() {
  const [selected, setSelected] = useState(null);

  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div style={{ minHeight: "100vh", background: "#f5f6fa", fontFamily: "'Georgia', serif" }}>

          {/* Header */}
          <div style={{ background: "#1a1a2e", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg,#e74c3c,#c0392b)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontSize: 14 }}>⚡</span>
              </div>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>PulseRetain</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ color: "#aaa", fontSize: 13 }}>{user?.signInDetails?.loginId}</span>
              <button onClick={signOut} style={{ background: "transparent", border: "1px solid #444", color: "#ccc", padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Sign out</button>
            </div>
          </div>

          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

            {/* Page title */}
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#1a1a2e" }}>Member Retention Dashboard</h1>
              <p style={{ margin: "4px 0 0", color: "#888", fontSize: 14 }}>Pulse Studio · May 2026 · 150 active members</p>
            </div>

            {/* Stats bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 32 }}>
              {stats.map((s, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", borderTop: i === 4 ? "3px solid #e74c3c" : "3px solid #1a1a2e" }}>
                  <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: i === 4 ? "#e74c3c" : "#1a1a2e" }}>{s.value}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888" }}>{s.label}</p>
                  <p style={{ margin: "1px 0 0", fontSize: 11, color: "#bbb" }}>{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Member table */}
            <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", overflow: "hidden" }}>
              <div style={{ padding: "18px 24px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>Member Risk Monitor</h2>
                <span style={{ background: "#fff1f1", color: "#c0392b", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>3 need attention</span>
              </div>

              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1.2fr 1.5fr", padding: "10px 24px", background: "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                {["Member", "Plan", "Last Visit", "Usual Schedule", "Risk Score", "Status"].map((h, i) => (
                  <span key={i} style={{ fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</span>
                ))}
              </div>

              {/* Rows */}
              {members.map((m) => {
                const rc = riskConfig[m.risk];
                const isSelected = selected === m.id;
                return (
                  <div key={m.id}>
                    <div
                      onClick={() => setSelected(isSelected ? null : m.id)}
                      style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1.2fr 1.5fr", padding: "14px 24px", borderBottom: "1px solid #f7f7f7", cursor: "pointer", background: isSelected ? "#fafbff" : "#fff", transition: "background 0.15s" }}
                    >
                      {/* Name */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: rc.bg, color: rc.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{m.initials}</div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>{m.name}</span>
                      </div>
                      {/* Plan */}
                      <span style={{ fontSize: 13, color: "#555", display: "flex", alignItems: "center" }}>{m.plan}</span>
                      {/* Last visit */}
                      <span style={{ fontSize: 13, color: m.risk === "high" ? "#c0392b" : "#555", fontWeight: m.risk === "high" ? 600 : 400, display: "flex", alignItems: "center" }}>{m.lastVisit}</span>
                      {/* Schedule */}
                      <span style={{ fontSize: 12, color: "#888", display: "flex", alignItems: "center" }}>{m.usualVisits}</span>
                      {/* Score bar */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${m.score}%`, height: "100%", background: rc.bar, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: rc.color, minWidth: 28 }}>{m.score}</span>
                      </div>
                      {/* Badge */}
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ background: rc.bg, color: rc.color, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>{rc.label}</span>
                      </div>
                    </div>

                    {/* Expanded row — AI message preview */}
                    {isSelected && (
                      <div style={{ padding: "14px 24px 18px", background: "#fafbff", borderBottom: "1px solid #f0f0f0" }}>
                        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>AI Re-engagement Message</p>
                        <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#333", lineHeight: 1.6, fontStyle: "italic" }}>
                          {m.risk === "high"
                            ? `"Hey ${m.name.split(" ")[0]}! We noticed you haven't made it to ${m.usualVisits} lately — everything okay? We'd love to see you back. Here's 20% off your next class this week: [booking link]"`
                            : m.risk === "medium"
                            ? `"Hi ${m.name.split(" ")[0]}, just checking in — we've missed seeing you! Your usual spot on ${m.usualVisits} is waiting. Book anytime: [booking link]"`
                            : `"Thanks for being such a consistent member, ${m.name.split(" ")[0]}! See you ${m.usualVisits} as always. 💪"`
                          }
                        </div>
                        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#bbb" }}>Click any high-risk member to preview their personalized message · Sent automatically via SMS</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "#ccc" }}>PulseRetain · Powered by Claude AI · Data synced from Mindbody</p>
          </div>
        </div>
      )}
    </Authenticator>
  );
}