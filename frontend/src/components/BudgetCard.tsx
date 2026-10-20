import { ArrowUpRight, PauseCircle, ShieldCheck } from "lucide-react";
import { money, type Mandate, type Spend } from "../api";
import { percent } from "../lib/format";
import { Badge } from "./ui";

export function BudgetCard({
  spend,
  mandate,
  onAdjust,
}: {
  spend: Spend;
  mandate: Mandate;
  onAdjust: () => void;
}) {
  const used = percent(spend.month_spent_cents, Math.max(spend.monthly_limit_cents, 1));
  const remaining = Math.max(0, spend.monthly_limit_cents - spend.month_spent_cents);
  const hot = used >= 85;

  return (
    <section className="panel budget" aria-labelledby="budget-title">
      <div className="panel-head">
        <div>
          <p className="kicker">This month</p>
          <h2 id="budget-title">Spending mandate</h2>
        </div>
        {mandate.active ? (
          <Badge tone="good" dot>
            Active
          </Badge>
        ) : (
          <Badge tone="warn" dot>
            <PauseCircle size={12} aria-hidden /> Paused
          </Badge>
        )}
      </div>

      <div className="budget-figure">
        <span className="budget-spent">{money(spend.month_spent_cents, mandate.currency)}</span>
        <span className="budget-limit">
          of {money(spend.monthly_limit_cents, mandate.currency)}
        </span>
      </div>

      <div
        className={`meter ${hot ? "meter-hot" : ""}`}
        role="progressbar"
        aria-label="Monthly budget used"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${used}%` }} />
      </div>
      <div className="meter-caption">
        <span>{used}% used</span>
        <span>{money(remaining, mandate.currency)} left</span>
      </div>

      <dl className="limit-list">
        <div>
          <dt>Auto-approve</dt>
          <dd>≤ {money(mandate.auto_approve_limit_cents, mandate.currency)}</dd>
        </div>
        <div>
          <dt>Hard cap</dt>
          <dd>{money(mandate.per_purchase_limit_cents, mandate.currency)} / purchase</dd>
        </div>
        <div>
          <dt>Daily cap</dt>
          <dd>{mandate.max_purchases_per_day} purchases</dd>
        </div>
      </dl>

      <div className="budget-foot">
        <span>
          <ShieldCheck size={13} aria-hidden /> Enforced server-side, not by the model
        </span>
        <button type="button" className="text-link" onClick={onAdjust}>
          Adjust <ArrowUpRight size={13} aria-hidden />
        </button>
      </div>
    </section>
  );
}
