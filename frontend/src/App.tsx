import { useCallback, useEffect, useState } from "react";
import { api, ApiError, AuditRow, csv, Mandate, money, Purchase, Spend, Status } from "./api";

type Tab = "purchases" | "mandate" | "audit";
const EXAMPLES = ["buy 2 reams of printer paper under $40", "we need coffee beans", "order a monitor for the new hire", "buy a gift card bundle"];
const SCENARIOS: [string, string][] = [
  ["routine", "Routine purchases"], ["needs_approval", "Needs approval"],
  ["poisoned_listing", "Poisoned listing (prompt injection)"], ["blocked_category", "Out-of-mandate category"],
];

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [spend, setSpend] = useState<Spend | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [tab, setTab] = useState<Tab>("purchases");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [goal, setGoal] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [s, sp, m, p, a] = await Promise.all([
        api<Status>("/status"), api<Spend>("/spend"), api<Mandate>("/mandate"),
        api<Purchase[]>("/purchases"), api<AuditRow[]>("/audit"),
      ]);
      setStatus(s); setSpend(sp); setMandate(m); setPurchases(p); setAudit(a);
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [refresh]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ kind: "ok", text: label }); } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Unexpected error" });
    } finally { setBusy(false); await refresh(); }
  };

  const submitGoal = (g: string) => run("Agent proposal evaluated against the mandate.", async () => {
    const r = await api<{ purchases: Purchase[]; message?: string; planner: string }>("/agent/plan", { method: "POST", body: JSON.stringify({ goal: g }) });
    if (!r.purchases.length) throw new ApiError(r.message ?? "Nothing matched.");
    setGoal("");
  });

  return (
    <div className="app">
      <header>
        <div>
          <h1>MandateGuard</h1>
          <p className="tag">Let AI agents shop with PayPal — inside limits you control.</p>
        </div>
        {status && (
          <div className="chips" aria-label="System status">
            <span className={`chip ${status.simulated ? "warn" : "good"}`} title="Payment backend">{status.banner}</span>
            <span className={`chip ${status.audit.valid ? "good" : "bad"}`} title="Hash-chained audit log">
              Audit chain {status.audit.valid ? `verified (${status.audit.checked})` : "BROKEN"}
            </span>
            <span className="chip" title="Advisory risk model; trained on synthetic data">Risk: {status.risk_model} · {status.risk_data} data</span>
            <span className="chip">LLM planner: {status.llm_enabled ? `${status.llm_calls_today}/${status.llm_daily_budget} calls today` : "off (local planner)"}</span>
          </div>
        )}
      </header>

      <div role="status" aria-live="polite" className={`toast ${msg?.kind ?? "hidden"}`}>{msg?.text}</div>

      <main>
        <section className="card" aria-labelledby="agent-h">
          <h2 id="agent-h">1 · Give the agent a goal</h2>
          <form onSubmit={(e) => { e.preventDefault(); if (goal.trim().length >= 3) submitGoal(goal); }}>
            <label htmlFor="goal">What should the agent buy?</label>
            <div className="row">
              <input id="goal" value={goal} maxLength={500} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. buy 2 reams of printer paper under $40" />
              <button className="primary" disabled={busy || goal.trim().length < 3}>Send to agent</button>
            </div>
          </form>
          <div className="chips" aria-label="Example goals">
            {EXAMPLES.map((x) => <button key={x} className="link" disabled={busy} onClick={() => submitGoal(x)}>{x}</button>)}
          </div>
          {status?.simulated && (
            <details>
              <summary>Demo scenarios (simulation only)</summary>
              <div className="chips">
                {SCENARIOS.map(([k, label]) => (
                  <button key={k} disabled={busy} onClick={() => run(`Scenario “${label}” submitted.`, () => api(`/demo/scenario/${k}`, { method: "POST" }))}>{label}</button>
                ))}
                <button className="danger" disabled={busy} onClick={() => confirm("Reset all demo data?") && run("Demo data reset.", () => api("/demo/reset", { method: "POST" }))}>Reset demo data</button>
              </div>
            </details>
          )}
        </section>

        <section className="card" aria-labelledby="spend-h">
          <h2 id="spend-h">Monthly budget</h2>
          {spend && mandate ? <Gauge spend={spend} mandate={mandate} /> : <p className="muted">Loading…</p>}
        </section>

        <nav role="tablist" aria-label="Views">
          {(["purchases", "mandate", "audit"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "tab on" : "tab"} onClick={() => setTab(t)}>
              {t === "purchases" ? `Purchases (${purchases.length})` : t === "mandate" ? "Mandate" : "Audit log"}
            </button>
          ))}
        </nav>

        {tab === "purchases" && (
          purchases.length === 0 ? <div className="card empty"><h3>No purchases yet</h3><p>Send the agent a goal above{status?.simulated ? " or run a demo scenario" : ""}. Every proposal is checked against your mandate before any PayPal order exists.</p></div>
            : purchases.map((p) => <PurchaseCard key={p.id} p={p} busy={busy} run={run} />)
        )}
        {tab === "mandate" && mandate && <MandateForm mandate={mandate} busy={busy} onSave={(m) => run("Mandate saved.", () => api("/mandate", { method: "PUT", body: JSON.stringify(m) }))} />}
        {tab === "audit" && <AuditView rows={audit} />}
      </main>
      <footer>
        Risk scores are advisory (escalate-only) and evaluated on synthetic data. Limits are enforced by deterministic code, never by the model. Prototype — not PCI/GDPR certified.
      </footer>
    </div>
  );
}

function Gauge({ spend, mandate }: { spend: Spend; mandate: Mandate }) {
  const pct = Math.min(100, Math.round((spend.month_spent_cents / Math.max(spend.monthly_limit_cents, 1)) * 100));
  return (
    <div>
      <div className="big">{money(spend.month_spent_cents, mandate.currency)} <span className="muted">of {money(spend.monthly_limit_cents, mandate.currency)}</span></div>
      <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Monthly budget used"><div className={pct > 85 ? "fill hot" : "fill"} style={{ width: `${pct}%` }} /></div>
      <p className="muted small">Auto-approve ≤ {money(mandate.auto_approve_limit_cents)} · hard cap per purchase {money(mandate.per_purchase_limit_cents)} · max {mandate.max_purchases_per_day}/day{mandate.active ? "" : " · MANDATE PAUSED"}</p>
    </div>
  );
}

const BADGE: Record<string, string> = { ALLOW: "good", REQUIRE_APPROVAL: "warn", DENY: "bad" };
const LABEL: Record<string, string> = { ALLOW: "Within mandate", REQUIRE_APPROVAL: "Needs your approval", DENY: "Blocked" };

function PurchaseCard({ p, busy, run }: { p: Purchase; busy: boolean; run: (l: string, f: () => Promise<unknown>) => Promise<void> }) {
  const post = (path: string, label: string) => run(label, () => api(`/purchases/${p.id}/${path}`, { method: "POST" }));
  return (
    <article className="card purchase" aria-label={`${p.title} ${p.status}`}>
      <div className="row between">
        <div>
          <h3>{p.quantity} × {p.title}</h3>
          <p className="muted small">{p.merchant} · {p.category.replace("_", " ")} · proposed by {p.source}</p>
        </div>
        <div className="right"><div className="big">{money(p.amount_cents, p.currency)}</div>
          <span className={`chip ${BADGE[p.policy_decision]}`}>{LABEL[p.policy_decision]}</span></div>
      </div>
      <ul className="reasons">{p.policy_reasons.map((r) => <li key={r.code} className={r.severity}><code>{r.code}</code> {r.message}</li>)}</ul>
      <div className="risk">
        <span className="small">Risk score {p.risk_score.toFixed(2)}</span>
        <div className="bar thin" aria-hidden><div className={p.risk_score >= 0.5 ? "fill hot" : "fill"} style={{ width: `${Math.round(p.risk_score * 100)}%` }} /></div>
        {p.risk_factors.map((f) => <span key={f.factor} className="chip small">{f.detail}</span>)}
      </div>
      <details><summary className="small">Agent justification (untrusted text)</summary><p className="quote">{p.justification}</p></details>
      <div className="row between">
        <span className="status">Status: <b>{p.status.replace("_", " ")}</b>{p.provider_order_id && <> · {p.simulated ? "SIMULATED order" : "PayPal sandbox order"} <code>{p.provider_order_id}</code></>}{p.capture_id && <> · capture <code>{p.capture_id}</code></>}</span>
        <div className="row">
          {p.status === "PENDING_APPROVAL" && <>
            <button className="primary" disabled={busy} onClick={() => post("approve", "Approved — order created.")}>Approve</button>
            <button disabled={busy} onClick={() => post("reject", "Purchase rejected.")}>Reject</button></>}
          {p.status === "ORDER_CREATED" && p.simulated && <button disabled={busy} onClick={() => run("Simulated buyer approval → signed webhook → verified capture.", () => api(`/sim/orders/${p.provider_order_id}/approve`, { method: "POST" }))}>Simulate buyer approval</button>}
          {p.status === "ORDER_CREATED" && !p.simulated && p.approve_url && <a className="btn" href={p.approve_url} target="_blank" rel="noreferrer">Approve in PayPal sandbox ↗</a>}
          {p.status === "ORDER_CREATED" && <button disabled={busy} onClick={() => post("capture", "Capture verified with provider.")}>Verify &amp; capture</button>}
        </div>
      </div>
    </article>
  );
}

function MandateForm({ mandate, onSave, busy }: { mandate: Mandate; onSave: (m: Mandate) => void; busy: boolean }) {
  const [f, setF] = useState(() => ({
    name: mandate.name, per: mandate.per_purchase_limit_cents / 100, auto: mandate.auto_approve_limit_cents / 100,
    monthly: mandate.monthly_limit_cents / 100, daily: mandate.max_purchases_per_day, cats: mandate.allowed_categories.join(", "),
    trusted: mandate.trusted_merchants.join(", "), blocked: mandate.blocked_merchants.join(", "), active: mandate.active,
  }));
  const err = f.auto > f.per ? "Auto-approve limit cannot exceed the per-purchase limit." : f.per > f.monthly ? "Per-purchase limit cannot exceed the monthly limit." : "";
  const n = (k: "per" | "auto" | "monthly" | "daily") => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  return (
    <form className="card grid" onSubmit={(e) => { e.preventDefault(); if (!err) onSave({ ...mandate, name: f.name, per_purchase_limit_cents: Math.round(f.per * 100), auto_approve_limit_cents: Math.round(f.auto * 100), monthly_limit_cents: Math.round(f.monthly * 100), max_purchases_per_day: f.daily, allowed_categories: csv(f.cats), trusted_merchants: csv(f.trusted), blocked_merchants: csv(f.blocked), active: f.active }); }}>
      <h2>Spending mandate</h2>
      <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label>Auto-approve up to ({mandate.currency})<input type="number" min={0} step="0.01" value={f.auto} onChange={n("auto")} /></label>
      <label>Hard cap per purchase<input type="number" min={0} step="0.01" value={f.per} onChange={n("per")} /></label>
      <label>Monthly budget<input type="number" min={0} step="0.01" value={f.monthly} onChange={n("monthly")} /></label>
      <label>Max purchases per day<input type="number" min={0} value={f.daily} onChange={n("daily")} /></label>
      <label>Allowed categories (comma separated)<input value={f.cats} onChange={(e) => setF({ ...f, cats: e.target.value })} /></label>
      <label>Trusted merchants<input value={f.trusted} onChange={(e) => setF({ ...f, trusted: e.target.value })} /></label>
      <label>Blocked merchants<input value={f.blocked} onChange={(e) => setF({ ...f, blocked: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Mandate active (uncheck to pause all agent spending)</label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="primary" disabled={busy || !!err}>Save mandate</button>
    </form>
  );
}

function AuditView({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <div className="card empty"><h3>No audit events yet</h3><p>Every proposal, approval, webhook and capture is recorded here in a tamper-evident hash chain.</p></div>;
  return (
    <div className="card scroll">
      <table>
        <thead><tr><th>#</th><th>Time (UTC)</th><th>Actor</th><th>Action</th><th>Details</th><th>Hash</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td>{r.id}</td><td>{r.ts.slice(11, 19)}</td><td>{r.actor}</td><td><code>{r.action}</code></td>
            <td className="small">{JSON.stringify(r.details).slice(0, 110)}</td><td><code>{r.hash}</code></td></tr>))}</tbody>
      </table>
    </div>
  );
}
