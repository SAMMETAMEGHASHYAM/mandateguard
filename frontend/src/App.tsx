import {
  Gauge,
  Lock,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  ApiError,
  clearOwnerKey,
  getOwnerKey,
  publicStatus,
  setOwnerKey,
  verifyOwnerKey,
  type AuditRow,
  type CatalogItem,
  type Mandate,
  type Purchase,
  type Spend,
  type Status,
} from "./api";
import { AgentComposer } from "./components/AgentComposer";
import { AuditView } from "./components/AuditView";
import { BudgetCard } from "./components/BudgetCard";
import { KeyGate } from "./components/KeyGate";
import { Logo } from "./components/Logo";
import { MandateView } from "./components/MandateView";
import { ConfirmDialog } from "./components/Modal";
import { PurchasesView } from "./components/PurchasesView";
import { Toast, type ToastMessage } from "./components/Toast";
import { Badge } from "./components/ui";
import { purchaseCounts, sortPurchases, type PurchaseFilter } from "./lib/purchases";

type Tab = "purchases" | "mandate" | "audit";
type Workspace = {
  spend: Spend;
  mandate: Mandate;
  purchases: Purchase[];
  audit: AuditRow[];
  categories: string[];
};

const TABS: { id: Tab; label: string }[] = [
  { id: "purchases", label: "Purchases" },
  { id: "mandate", label: "Mandate" },
  { id: "audit", label: "Audit log" },
];

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [authState, setAuthState] = useState<"checking" | "locked" | "unlocked">(
    "checking",
  );
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("purchases");
  const [filter, setFilter] = useState<PurchaseFilter>("all");
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const notify = useCallback((kind: ToastMessage["kind"], text: string) => {
    setToast({ id: Date.now(), kind, text });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const lock = useCallback(() => {
    clearOwnerKey();
    setWorkspace(null);
    setAuthState("locked");
    setGateError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await publicStatus();
        if (!cancelled) setStatus(result);
      } catch {
        /* the key gate surfaces connectivity problems when unlocking */
      }

      const key = getOwnerKey();
      if (!key) {
        if (!cancelled) setAuthState("locked");
        return;
      }

      try {
        const ok = await verifyOwnerKey(key);
        if (cancelled) return;
        if (ok) setAuthState("unlocked");
        else {
          clearOwnerKey();
          setAuthState("locked");
        }
      } catch {
        if (!cancelled) setAuthState("locked");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [nextStatus, spend, mandate, purchases, audit, catalog] =
        await Promise.all([
          api<Status>("/status"),
          api<Spend>("/spend"),
          api<Mandate>("/mandate"),
          api<Purchase[]>("/purchases"),
          api<AuditRow[]>("/audit"),
          api<CatalogItem[]>("/catalog"),
        ]);

      setStatus(nextStatus);
      setWorkspace({
        spend,
        mandate,
        purchases: sortPurchases(purchases),
        audit,
        categories: Array.from(new Set(catalog.map((item) => item.category))),
      });
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        lock();
        return;
      }
      setError(
        cause instanceof Error ? cause.message : "Could not load the workspace.",
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, [lock]);

  useEffect(() => {
    if (authState !== "unlocked") return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [authState, refresh]);

  async function unlock(key: string) {
    setGateBusy(true);
    setGateError(null);
    try {
      const ok = await verifyOwnerKey(key);
      if (!ok) {
        setGateError(
          "That key was rejected. Use the OWNER_API_KEY from backend/.env.",
        );
        return;
      }
      setOwnerKey(key);
      setAuthState("unlocked");
    } catch (cause) {
      setGateError(
        cause instanceof Error ? cause.message : "Could not verify the key.",
      );
    } finally {
      setGateBusy(false);
    }
  }

  const run = useCallback(
    async (label: string, action: () => Promise<unknown>, key?: string) => {
      if (key) setBusyKey(key);
      try {
        await action();
        notify("ok", label);
        await refresh(true);
        return true;
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          lock();
          return false;
        }
        notify(
          "err",
          cause instanceof Error ? cause.message : "Unexpected error.",
        );
        return false;
      } finally {
        if (key) setBusyKey(null);
      }
    },
    [lock, notify, refresh],
  );

  async function submitGoal(goal: string) {
    setBusyKey("plan");
    try {
      const result = await api<{
        planner: string;
        purchases: Purchase[];
        message?: string;
      }>("/agent/plan", { method: "POST", body: JSON.stringify({ goal }) });

      if (!result.purchases.length) {
        notify(
          "info",
          result.message ?? "Nothing in the catalog matches that goal.",
        );
        return;
      }

      const pending = result.purchases.filter(
        (purchase) => purchase.status === "PENDING_APPROVAL",
      ).length;
      const denied = result.purchases.filter(
        (purchase) => purchase.status === "DENIED",
      ).length;

      notify(
        denied > 0 ? "info" : "ok",
        `${result.purchases.length} proposal${
          result.purchases.length === 1 ? "" : "s"
        } evaluated · ${pending} need approval · planner: ${result.planner}`,
      );
      setTab("purchases");
      setFilter(pending > 0 ? "approval" : "all");
      await refresh(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        lock();
        return;
      }
      notify(
        "err",
        cause instanceof Error ? cause.message : "The agent could not plan.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  function saveMandate(next: Mandate) {
    const { id: _id, ...payload } = next;
    return run(
      "Mandate saved — new limits are already enforcing.",
      () => api("/mandate", { method: "PUT", body: JSON.stringify(payload) }),
      "mandate",
    );
  }

  async function resetDemo() {
    await run("Demo data reset.", () => api("/demo/reset", { method: "POST" }), "reset");
    setConfirmReset(false);
    setFilter("all");
    setQuery("");
    setTab("purchases");
  }

  const counts = useMemo(
    () => purchaseCounts(workspace?.purchases ?? []),
    [workspace?.purchases],
  );

  if (authState === "checking") {
    return (
      <div className="gate">
        <div className="boot" role="status" aria-label="Checking your workspace">
          <Logo />
          <span className="boot-bar" aria-hidden />
          <p>Checking your workspace…</p>
        </div>
      </div>
    );
  }

  if (authState !== "unlocked") {
    return (
      <KeyGate
        status={status}
        busy={gateBusy}
        error={gateError}
        onSubmit={unlock}
      />
    );
  }

  const pending = counts.approval;
  const statusLabel = status?.simulated
    ? "Simulation · no real money"
    : "PayPal sandbox · test money";

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <Logo />
            <span className="header-divider" aria-hidden />
            <span className="header-tagline">Agent spending guardrails</span>
          </div>

          <div className="header-status">
            <span className={`status-pill ${status?.simulated ? "is-sim" : "is-live"}`}>
              <span className="dot" aria-hidden />
              {statusLabel}
            </span>
            <span
              className={`status-pill ${status?.audit.valid ? "is-good" : "is-bad"}`}
              title="Hash-chained audit log"
            >
              <ShieldCheck size={13} aria-hidden />
              {status?.audit.valid
                ? `Audit verified · ${status.audit.checked}`
                : "Audit unverified"}
            </span>
            <span className="status-pill is-muted" title="Advisory risk model, synthetic data">
              <Gauge size={13} aria-hidden />
              {status?.risk_model ?? "risk model"}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm lock-btn"
              onClick={lock}
              title="Lock this workspace"
            >
              <Lock size={13} aria-hidden />
              Lock
            </button>
          </div>
        </div>
      </header>

      <main className="shell">
        <section className="hero">
          <div>
            <p className="eyebrow">Owner workspace</p>
            <h1>Agent commerce, inside your mandate.</h1>
            <p className="hero-lede">
              The agent can propose. Policy decides. You approve. PayPal
              settles — and everything is written to a tamper-evident log.
            </p>
          </div>
          <div className="hero-stats">
            <div>
              <strong>{counts.approval}</strong>
              <span>need approval</span>
            </div>
            <div>
              <strong>{counts.active}</strong>
              <span>in flight</span>
            </div>
            <div>
              <strong>{counts.paid}</strong>
              <span>paid</span>
            </div>
          </div>
        </section>

        {error && (
          <div className="banner banner-error" role="alert">
            <TriangleAlert size={16} aria-hidden />
            <span>{error}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        )}

        <section className="top-grid">
          <AgentComposer
            busy={busyKey === "plan"}
            simulated={Boolean(status?.simulated)}
            onGoal={submitGoal}
            onScenario={(id) =>
              void run(
                "Demo scenario submitted.",
                () => api(`/demo/scenario/${id}`, { method: "POST" }),
                "plan",
              ).then((ok) => {
                if (!ok) return;
                setTab("purchases");
                setFilter("all");
              })
            }
            onResetRequest={() => setConfirmReset(true)}
          />
          {workspace ? (
            <BudgetCard
              spend={workspace.spend}
              mandate={workspace.mandate}
              onAdjust={() => setTab("mandate")}
            />
          ) : (
            <div className="panel skeleton budget-skeleton" aria-hidden />
          )}
        </section>

        <div className="tabs-bar">
          <nav className="tabs" role="tablist" aria-label="Workspace views">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`tab-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls={`panel-${item.id}`}
                tabIndex={tab === item.id ? 0 : -1}
                className={`tab ${tab === item.id ? "is-on" : ""}`}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                  const index = TABS.findIndex((candidate) => candidate.id === tab);
                  const delta = event.key === "ArrowRight" ? 1 : -1;
                  const next = TABS[(index + delta + TABS.length) % TABS.length]!;
                  setTab(next.id);
                  document.getElementById(`tab-${next.id}`)?.focus();
                }}
              >
                {item.label}
                {item.id === "purchases" && <span className="tab-count">{counts.all}</span>}
                {item.id === "purchases" && pending > 0 && (
                  <span className="tab-alert" aria-label={`${pending} awaiting approval`}>
                    {pending}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <span className="tabs-hint">
            <Sparkles size={13} aria-hidden /> Updates every 8 seconds
          </span>
        </div>

        {pending > 0 && tab === "purchases" && (
          <button
            type="button"
            className="attention"
            onClick={() => setFilter("approval")}
          >
            <span className="attention-icon">
              <TriangleAlert size={16} aria-hidden />
            </span>
            <span>
              <strong>
                {pending} purchase{pending === 1 ? "" : "s"} waiting on you
              </strong>
              <small>Policy escalated these. No PayPal order exists until you approve.</small>
            </span>
            <span className="attention-action">Review →</span>
          </button>
        )}

        <section
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="panel-area"
        >
          {loading && !workspace ? (
            <div className="purchase-list" aria-busy="true">
              <div className="panel skeleton skeleton-card" />
              <div className="panel skeleton skeleton-card" />
            </div>
          ) : (
            <>
              {tab === "purchases" && (
                <PurchasesView
                  purchases={workspace?.purchases ?? []}
                  filter={filter}
                  query={query}
                  counts={counts}
                  busyKey={busyKey}
                  onFilter={setFilter}
                  onQuery={setQuery}
                  onApprove={(p) =>
                    void run(
                      "Approved — PayPal order created.",
                      () => api(`/purchases/${p.id}/approve`, { method: "POST" }),
                      `${p.id}:approve`,
                    )
                  }
                  onReject={(p) =>
                    void run(
                      "Purchase rejected.",
                      () => api(`/purchases/${p.id}/reject`, { method: "POST" }),
                      `${p.id}:reject`,
                    )
                  }
                  onCapture={(p) =>
                    void run(
                      "Capture verified against the provider.",
                      () => api(`/purchases/${p.id}/capture`, { method: "POST" }),
                      `${p.id}:capture`,
                    )
                  }
                  onSimulate={(p) =>
                    void run(
                      "Buyer approved · webhook verified · payment captured.",
                      () =>
                        api(`/sim/orders/${p.provider_order_id}/approve`, {
                          method: "POST",
                        }),
                      `${p.id}:simulate`,
                    )
                  }
                />
              )}

              {tab === "mandate" && workspace && (
                <MandateView
                  mandate={workspace.mandate}
                  categories={workspace.categories}
                  busy={busyKey === "mandate"}
                  onSave={saveMandate}
                />
              )}

              {tab === "audit" && (
                <AuditView rows={workspace?.audit ?? []} status={status} />
              )}
            </>
          )}
        </section>

        <footer className="app-footer">
          <span>
            Risk scores are advisory and evaluated on synthetic data. Limits are
            enforced by deterministic code, never by the model.
          </span>
          <span className="footer-badges">
            <Badge tone="neutral">Prototype</Badge>
            <Badge tone="neutral">Not PCI/GDPR certified</Badge>
          </span>
        </footer>
      </main>

      {toast && <Toast toast={toast} onDismiss={dismissToast} />}

      {confirmReset && (
        <ConfirmDialog
          title="Reset demo data?"
          body={
            <>
              This clears every purchase, order and audit event, and restores
              the default mandate. It cannot be undone.
            </>
          }
          confirmLabel="Reset everything"
          busy={busyKey === "reset"}
          onConfirm={() => void resetDemo()}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
