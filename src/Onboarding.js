// ─── Self-serve first-run setup ───────────────────────────────────────────────
// Shown full-screen to a brand-new gym right after sign-up: (1) gym profile,
// (2) member roster CSV, (3) who is about to quit and what it costs. The App
// passes in its design tokens and the calls that save to the server, so this
// file has no network code of its own. Logic lives in gymSetup.js.
import { useState, useRef } from "react";
import { parseMembersCSV, SAMPLE_GYM_CSV } from "./importMembers";
import { validateProfileForm, applyDefaultPrice, rosterSummary, setupTimeZones } from "./gymSetup";

const STEPS = ["Your gym", "Your members", "Who's at risk"];

export default function Onboarding({ initialProfile = {}, onSaveProfile, onRoster, onFinish, onSkip, onDownloadTemplate, isMobile, ui }) {
  const { T, btn, SERIF, SANS, Logo } = ui;
  const browserTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    gymName: initialProfile.gymName || "",
    avgPrice: initialProfile.avgPrice ? String(initialProfile.avgPrice) : "",
    timezone: initialProfile.timezone || browserTz || "America/New_York",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [importNote, setImportNote] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const field = { width: "100%", boxSizing: "border-box", border: `1px solid ${T.line}`, borderRadius: 8, padding: "11px 12px", fontSize: 15, fontFamily: SANS, color: T.ink, background: "#fff", outline: "none" };
  const label = { display: "block", fontSize: 13, fontWeight: 600, color: T.ink, margin: "0 0 6px" };
  const help  = { margin: "6px 0 0", fontSize: 12, color: T.muted, lineHeight: 1.5 };
  const errStyle = { margin: "6px 0 0", fontSize: 12, color: T.redDark };

  async function saveProfile(e) {
    e.preventDefault();
    const { errors: errs, profile } = validateProfileForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true); setServerError(null);
    try {
      await onSaveProfile(profile);
      setStep(1);
    } catch (err) {
      setServerError(`Couldn't save your gym: ${err.message}`);
    } finally { setBusy(false); }
  }

  async function loadRoster(text, labelText) {
    setServerError(null); setImportNote(null);
    let parsed;
    try { parsed = parseMembersCSV(text, Date.now()); }
    catch { setServerError("Couldn't read that file. Export it as a CSV (comma-separated) and try again."); return; }
    if (!parsed.length) { setServerError("No members found. The file needs a header row with at least a Name column."); return; }
    const { members, filled } = applyDefaultPrice(parsed, validateProfileForm(form).profile.avgPrice);
    setBusy(true);
    try {
      const saved = await onRoster(members, labelText);
      setSummary(rosterSummary(members));
      const notes = [];
      if (filled) notes.push(`${filled} member${filled !== 1 ? "s" : ""} had no price in the file, so we used your average of $${validateProfileForm(form).profile.avgPrice}/month.`);
      if (saved === false) notes.push("Your roster is loaded, but it couldn't be saved to the server yet, so it may reset when you reload.");
      setImportNote(notes.join(" ") || null);
      setStep(2);
    } catch (err) {
      setServerError(`Couldn't load your roster: ${err.message}`);
    } finally { setBusy(false); }
  }

  function readFile(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setServerError("That file is over 10 MB. Export only active members and try again."); return; }
    const reader = new FileReader();
    reader.onload = () => loadRoster(String(reader.result || ""), file.name);
    reader.onerror = () => setServerError("Couldn't read that file.");
    reader.readAsText(file);
  }

  async function finish() {
    setBusy(true);
    try { await onFinish(); } finally { setBusy(false); }
  }

  const card = { background: "#fff", border: `1px solid ${T.line}`, borderRadius: 14, padding: isMobile ? "22px 18px" : "32px 36px" };
  const h1 = { margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: isMobile ? 24 : 28, color: T.ink, lineHeight: 1.2 };
  const lead = { margin: "8px 0 24px", fontSize: 15, color: T.body, lineHeight: 1.55 };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="setup-title"
      style={{ position: "fixed", inset: 0, zIndex: 9000, background: T.page, overflowY: "auto", fontFamily: SANS, color: T.body }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: isMobile ? "20px 16px 48px" : "40px 24px 64px" }}>

        {/* Brand + skip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isMobile ? 20 : 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={26} />
            <span style={{ fontFamily: SERIF, fontSize: 18, color: T.ink }}>PulseRetain</span>
          </div>
          {step < 2 && (
            <button onClick={onSkip} disabled={busy}
              style={{ background: "none", border: "none", color: T.muted, fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: SANS }}>
              I'll do this later
            </button>
          )}
        </div>

        {/* Progress */}
        <ol aria-label="Setup progress" style={{ listStyle: "none", margin: "0 0 18px", padding: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined}>
              <div style={{ height: 4, borderRadius: 2, background: i < step ? T.green : i === step ? T.ink : T.line }} />
              <p style={{ margin: "8px 0 0", fontSize: 12, fontWeight: i === step ? 600 : 400, color: i === step ? T.ink : T.muted }}>
                {i + 1}. {s}
              </p>
            </li>
          ))}
        </ol>

        <div style={card}>
          {serverError && (
            <p role="alert" style={{ margin: "0 0 18px", padding: "10px 12px", background: T.redTint, color: T.redDark, borderRadius: 8, fontSize: 13, lineHeight: 1.5 }}>{serverError}</p>
          )}

          {/* ── Step 1: gym profile ── */}
          {step === 0 && (
            <form onSubmit={saveProfile} noValidate>
              <h1 id="setup-title" style={h1}>Welcome. Let's set up your gym.</h1>
              <p style={lead}>Three quick steps, about five minutes. At the end you'll see which members are likely to cancel and how much revenue that puts at risk.</p>

              <div style={{ marginBottom: 18 }}>
                <label htmlFor="setup-name" style={label}>Gym or studio name</label>
                <input id="setup-name" autoFocus value={form.gymName} maxLength={80} placeholder="Northside Strength"
                  onChange={e => { setForm(f => ({ ...f, gymName: e.target.value })); setErrors(x => ({ ...x, gymName: undefined })); }} style={field}
                  aria-invalid={!!errors.gymName} aria-describedby={errors.gymName ? "setup-name-err" : undefined} />
                {errors.gymName && <p id="setup-name-err" style={errStyle}>{errors.gymName}</p>}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.4fr", gap: 18, marginBottom: 24 }}>
                <div>
                  <label htmlFor="setup-price" style={label}>Average monthly membership</label>
                  <div style={{ position: "relative" }}>
                    <span aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.muted, fontSize: 15 }}>$</span>
                    <input id="setup-price" inputMode="decimal" value={form.avgPrice} placeholder="89"
                      onChange={e => { setForm(f => ({ ...f, avgPrice: e.target.value })); setErrors(x => ({ ...x, avgPrice: undefined })); }} style={{ ...field, paddingLeft: 26 }}
                      aria-invalid={!!errors.avgPrice} aria-describedby="setup-price-help" />
                  </div>
                  {errors.avgPrice ? <p style={errStyle}>{errors.avgPrice}</p>
                    : <p id="setup-price-help" style={help}>Used for members whose export has no price.</p>}
                </div>
                <div>
                  <label htmlFor="setup-tz" style={label}>Time zone</label>
                  <select id="setup-tz" value={form.timezone} onChange={e => { setForm(f => ({ ...f, timezone: e.target.value })); setErrors(x => ({ ...x, timezone: undefined })); }} style={{ ...field, cursor: "pointer" }}>
                    {setupTimeZones(form.timezone).map(z => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                  </select>
                  {errors.timezone ? <p style={errStyle}>{errors.timezone}</p>
                    : <p style={help}>Texts are only sent during daytime hours here.</p>}
                </div>
              </div>

              <button type="submit" disabled={busy} style={btn("primary", { width: isMobile ? "100%" : "auto", padding: "12px 22px", fontSize: 15, opacity: busy ? 0.6 : 1 })}>
                {busy ? "Saving…" : "Continue"}
              </button>
            </form>
          )}

          {/* ── Step 2: roster ── */}
          {step === 1 && (
            <div>
              <h1 id="setup-title" style={h1}>Add your members</h1>
              <p style={lead}>Export your active members from Mindbody, Glofox, PushPress, ABC or a spreadsheet as a CSV and drop it here. We read names, phone numbers, plans, prices and last visit dates, whatever your file has.</p>

              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); readFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
                style={{ border: `2px dashed ${dragOver ? T.purple : T.line}`, background: dragOver ? T.purpleTint : T.soft, borderRadius: 12, padding: isMobile ? "28px 16px" : "40px 24px", textAlign: "center", transition: "background 0.15s" }}>
                <p style={{ margin: "0 0 14px", fontSize: 15, color: T.ink, fontWeight: 600 }}>{busy ? "Reading your members…" : isMobile ? "Choose your member CSV" : "Drag your member CSV here"}</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} aria-label="Member CSV file"
                  onChange={e => { readFile(e.target.files && e.target.files[0]); e.target.value = ""; }} />
                <button onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}
                  style={btn("primary", { padding: "11px 20px", fontSize: 14, opacity: busy ? 0.6 : 1 })}>Choose file</button>
                <p style={{ ...help, marginTop: 12 }}>Your file is read in your browser. Members are saved to your private account only.</p>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
                <button onClick={() => setStep(0)} disabled={busy} style={btn("ghost", { padding: "8px 0" })}>Back</button>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={onDownloadTemplate} disabled={busy} style={btn("secondary")}>Download a template</button>
                  <button onClick={() => loadRoster(SAMPLE_GYM_CSV, "sample gym")} disabled={busy} style={btn("secondary")}>Try sample members</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: results ── */}
          {step === 2 && summary && (
            <div>
              <p style={{ margin: 0, fontSize: 13, color: T.muted }}>{form.gymName.trim()} · {summary.total} member{summary.total !== 1 ? "s" : ""} loaded</p>
              <h1 id="setup-title" style={{ ...h1, marginTop: 8 }}>
                {summary.atRisk > 0 ? `${summary.atRisk} member${summary.atRisk !== 1 ? "s are" : " is"} likely to cancel` : "Nobody is at high risk right now"}
              </h1>

              <div style={{ borderLeft: `4px solid ${summary.revenueAtRisk > 0 ? T.red : T.green}`, padding: "4px 0 4px 16px", margin: "20px 0 22px" }}>
                <p style={{ margin: 0, fontSize: 13, color: T.muted }}>Revenue at risk</p>
                <p style={{ margin: "4px 0 0", fontFamily: SERIF, fontSize: isMobile ? 40 : 48, lineHeight: 1, color: summary.revenueAtRisk > 0 ? T.redDark : T.green }}>
                  ${summary.revenueAtRisk.toLocaleString()}<span style={{ fontSize: 18, color: T.muted }}> /month</span>
                </p>
                {summary.revenueAtRisk > 0 && <p style={{ margin: "8px 0 0", fontSize: 14, color: T.body }}>That's ${summary.projectedAnnual.toLocaleString()} a year if they leave.{summary.medium > 0 ? ` Another ${summary.medium} member${summary.medium !== 1 ? "s are" : " is"} worth watching.` : ""}</p>}
              </div>

              {summary.top.length > 0 && (
                <>
                  <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: T.ink }}>Start with these</p>
                  <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0, border: `1px solid ${T.line}`, borderRadius: 10 }}>
                    {summary.top.map((m, i) => (
                      <li key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderTop: i ? `1px solid ${T.line}` : "none" }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.ink }}>{m.name}</p>
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: T.muted }}>Last visit {String(m.lastVisit).toLowerCase()}{m.missedPayments > 0 ? ` · ${m.missedPayments} missed payment${m.missedPayments !== 1 ? "s" : ""}` : ""}</p>
                        </div>
                        <p style={{ margin: 0, fontFamily: SERIF, fontSize: 17, color: T.redDark, whiteSpace: "nowrap" }}>${m.value}<span style={{ fontFamily: SANS, fontSize: 11, color: T.muted }}> /mo</span></p>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {(importNote || summary.hints.length > 0) && (
                <div style={{ background: T.orangeTint, borderRadius: 8, padding: "10px 12px", margin: "0 0 20px" }}>
                  {importNote && <p style={{ margin: 0, fontSize: 13, color: T.body, lineHeight: 1.5 }}>{importNote}</p>}
                  {summary.hints.map(h => <p key={h} style={{ margin: importNote ? "6px 0 0" : "0 0 4px", fontSize: 13, color: T.body, lineHeight: 1.5 }}>{h}</p>)}
                </div>
              )}

              <p style={{ margin: "0 0 18px", fontSize: 14, color: T.body, lineHeight: 1.55 }}>
                On your dashboard, PulseRetain drafts a personal text for each of them. You review it, then send it with one tap.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={finish} disabled={busy} style={btn("primary", { padding: "12px 22px", fontSize: 15, width: isMobile ? "100%" : "auto", opacity: busy ? 0.6 : 1 })}>
                  {busy ? "Opening…" : "Go to my dashboard"}
                </button>
                <button onClick={() => { setSummary(null); setStep(1); }} disabled={busy} style={btn("ghost")}>Use a different file</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
