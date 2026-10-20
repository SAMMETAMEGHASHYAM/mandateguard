import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { money, type Purchase } from "../api";
import { relativeTime } from "../lib/format";
import { decisionMeta, riskTone, statusMeta, type Tone } from "../lib/purchases";
import { CopyButton } from "./ui";

const severityIcon = {
  deny: XCircle,
  review: AlertTriangle,
  info: CheckCircle2,
};

const severityTone: Record<string, Tone> = {
  deny: "bad",
  review: "warn",
  info: "good",
};

export function PurchaseCard({
  purchase,
  busyKey,
  onApprove,
  onReject,
  onCapture,
  onSimulate,
}: {
  purchase: Purchase;
  busyKey: string | null;
  onApprove: (purchase: Purchase) => void;
  onReject: (purchase: Purchase) => void;
  onCapture: (purchase: Purchase) => void;
  onSimulate: (purchase: Purchase) => void;
}) {
  const status = statusMeta(purchase.status);
  const decision = decisionMeta(purchase.policy_decision);
  const risk = riskTone(purchase.risk_score);

  const approveBusy = busyKey === `${purchase.id}:approve`;
  const rejectBusy = busyKey === `${purchase.id}:reject`;
  const captureBusy = busyKey === `${purchase.id}:capture`;
  const simulateBusy = busyKey === `${purchase.id}:simulate`;
  const anyBusy = Boolean(busyKey?.startsWith(`${purchase.id}:`));

  return (
    <article className={`purchase purchase-${status.tone}`} aria-label={`${purchase.title} — ${status.label}`}>
      <header className="purchase-head">
        <span className="merchant-mark" aria-hidden>
          {purchase.merchant.slice(0, 2).toUpperCase()}
        </span>
        <div className="purchase-title">
          <h3>
            {purchase.quantity} × {purchase.title}
          </h3>
          <p>
            {purchase.merchant} · {purchase.category.replace(/_/g, " ")} ·{" "}
            {purchase.source === "agent" ? "agent proposal" : `${purchase.source} proposal`}
          </p>
        </div>
        <div className="purchase-amount">
          <strong>{money(purchase.amount_cents, purchase.currency)}</strong>
          <span className={`badge badge-${decision.tone}`}>{decision.label}</span>
        </div>
      </header>

      <div className="purchase-meta">
        <span className={`badge badge-${status.tone}`}>{status.label}</span>
        <span className="meta-muted">
          <Clock3 size={12} aria-hidden /> {relativeTime(purchase.created_at)}
        </span>
        {purchase.provider_order_id && (
          <span className="meta-id">
            <span>{purchase.simulated ? "SIM" : "PayPal"}</span>
            <code>{purchase.provider_order_id}</code>
            <CopyButton
              value={purchase.provider_order_id}
              label="Copy order ID"
            />
          </span>
        )}
        {purchase.capture_id && (
          <span className="meta-id">
            <span>Capture</span>
            <code>{purchase.capture_id}</code>
            <CopyButton value={purchase.capture_id} label="Copy capture ID" />
          </span>
        )}
      </div>

      {purchase.policy_reasons.length > 0 && (
        <ul className="reasons">
          {purchase.policy_reasons.map((reason) => {
            const Icon = severityIcon[reason.severity as keyof typeof severityIcon] ?? ShieldCheck;
            return (
              <li
                key={reason.code}
                className={`reason reason-${severityTone[reason.severity] ?? "neutral"}`}
              >
                <Icon size={14} aria-hidden />
                <span>
                  <code>{reason.code}</code> {reason.message}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="risk-row">
        <div className="risk-label">
          <ShieldAlert size={14} aria-hidden />
          <span>Risk</span>
          <strong className={`tone-${risk}`}>{purchase.risk_score.toFixed(2)}</strong>
          <small>advisory</small>
        </div>
        <div
          className={`meter meter-thin meter-${risk}`}
          role="img"
          aria-label={`Risk score ${purchase.risk_score.toFixed(2)} of 1`}
        >
          <span style={{ width: `${Math.round(purchase.risk_score * 100)}%` }} />
        </div>
        <div className="risk-factors">
          {purchase.risk_factors.slice(0, 4).map((factor) => (
            <span key={factor.factor} className="factor" title={factor.factor}>
              {factor.detail}
            </span>
          ))}
          {purchase.risk_factors.length === 0 && (
            <span className="factor factor-quiet">no elevated factors</span>
          )}
        </div>
      </div>

      <details className="justification">
        <summary>Agent justification · untrusted text</summary>
        <p>{purchase.justification || "No justification supplied."}</p>
      </details>

      {(purchase.status === "PENDING_APPROVAL" ||
        purchase.status === "ORDER_CREATED") && (
        <footer className="purchase-actions">
          <span className="action-note">
            {purchase.status === "PENDING_APPROVAL"
              ? "Policy escalated this to you. No PayPal order exists yet."
              : purchase.simulated
                ? "Simulated order — approval runs the same signed-webhook path as PayPal."
                : "Buyer approval happens on PayPal. Capture is verified server-side."}
          </span>
          <div className="action-buttons">
            {purchase.status === "PENDING_APPROVAL" && (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onApprove(purchase)}
                  disabled={anyBusy}
                >
                  {approveBusy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                  Approve
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onReject(purchase)}
                  disabled={anyBusy}
                >
                  {rejectBusy ? <Loader2 size={14} className="spin" /> : <XCircle size={14} />}
                  Reject
                </button>
              </>
            )}

            {purchase.status === "ORDER_CREATED" && purchase.simulated && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => onSimulate(purchase)}
                disabled={anyBusy}
              >
                {simulateBusy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                Simulate buyer approval
              </button>
            )}

            {purchase.status === "ORDER_CREATED" && !purchase.simulated && purchase.approve_url && (
              <a
                className="btn btn-primary btn-sm"
                href={purchase.approve_url}
                target="_blank"
                rel="noreferrer"
              >
                Approve in PayPal sandbox <ExternalLink size={13} />
              </a>
            )}

            {purchase.status === "ORDER_CREATED" && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onCapture(purchase)}
                disabled={anyBusy}
              >
                {captureBusy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                Verify &amp; capture
              </button>
            )}
          </div>
        </footer>
      )}
    </article>
  );
}
