import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Status } from "../api";
import { Logo } from "./Logo";

export function KeyGate({
  status,
  busy,
  error,
  onSubmit,
}: {
  status: Status | null;
  busy: boolean;
  error: string | null;
  onSubmit: (key: string) => void;
}) {
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);

  return (
    <div className="gate">
      <div className="gate-inner">
        <section className="gate-copy">
          <Logo />
          <p className="eyebrow">Agentic commerce · PayPal Orders v2</p>
          <h1>
            Let an agent shop.
            <br />
            <span>Never let it decide.</span>
          </h1>
          <p className="gate-lede">
            MandateGuard sits between an AI shopping agent and PayPal. The agent
            can only propose. Your mandate decides, a human approves, and every
            payment is captured against a verified PayPal order.
          </p>

          <ul className="gate-points">
            <li>
              <ShieldCheck size={16} aria-hidden />
              Deterministic limits enforced in code — never by the model
            </li>
            <li>
              <Sparkles size={16} aria-hidden />
              Prompt-injection listings escalate to you, not to checkout
            </li>
            <li>
              <KeyRound size={16} aria-hidden />
              Owner key is held in this tab only; never bundled into the UI
            </li>
          </ul>
        </section>

        <section className="gate-panel" aria-labelledby="gate-title">
          <div className="gate-panel-head">
            <span className="gate-icon">
              <KeyRound size={18} aria-hidden />
            </span>
            <div>
              <h2 id="gate-title">Owner access</h2>
              <p>Unlock the mandate console for this browser tab.</p>
            </div>
          </div>

          {status && (
            <div className={`mode-note ${status.simulated ? "is-sim" : "is-live"}`}>
              <span className="dot" />
              {status.simulated
                ? "Simulation mode — no real PayPal transactions"
                : "PayPal sandbox — test money only"}
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (key.trim()) onSubmit(key.trim());
            }}
          >
            <label className="field-label" htmlFor="owner-key">
              Owner API key
            </label>
            <div className="key-input">
              <input
                id="owner-key"
                className="input"
                type={visible ? "text" : "password"}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="OWNER_API_KEY from backend/.env"
                autoComplete="current-password"
                spellCheck={false}
                autoFocus
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setVisible((value) => !value)}
                aria-label={visible ? "Hide key" : "Show key"}
                title={visible ? "Hide key" : "Show key"}
              >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={busy || !key.trim()}
            >
              {busy ? <Loader2 className="spin" size={16} /> : null}
              {busy ? "Checking…" : "Enter workspace"}
            </button>
          </form>

          {status?.simulated && (
            <div className="gate-demo">
              <span>No keys configured yet?</span>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => onSubmit("dev-owner-key")}
                disabled={busy}
              >
                Explore the seeded simulation
              </button>
              <p>
                Uses the documented development key. Starts with a synthetic
                catalog and no real money attached.
              </p>
            </div>
          )}

          <p className="gate-foot">
            Keys are stored in <code>sessionStorage</code> and cleared when the
            tab closes. The owner key can approve and capture; agent keys cannot.
          </p>
        </section>
      </div>
    </div>
  );
}
