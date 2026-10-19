"""Deterministic mandate enforcement. Pure functions - no AI, no I/O.
Probabilistic risk scores may only ESCALATE a decision (ALLOW -> REQUIRE_APPROVAL); they can never relax it."""
from dataclasses import dataclass, field

ALLOW, REQUIRE_APPROVAL, DENY = "ALLOW", "REQUIRE_APPROVAL", "DENY"
RISK_ESCALATION_THRESHOLD = 0.5


@dataclass
class Reason:
    code: str
    message: str
    severity: str  # deny | review | info

    def dict(self):
        return {"code": self.code, "message": self.message, "severity": self.severity}


@dataclass
class Context:
    spent_month_cents: int = 0
    purchases_today: int = 0
    merchant_seen_before: bool = False


@dataclass
class Decision:
    decision: str
    reasons: list = field(default_factory=list)


def evaluate(mandate, *, amount_cents: int, currency: str, category: str, merchant: str,
             ctx: Context, risk_score: float = 0.0, injection: bool = False) -> Decision:
    deny: list[Reason] = []
    review: list[Reason] = []
    if not mandate.active:
        deny.append(Reason("MANDATE_INACTIVE", "Mandate is paused; the agent has no spending authority.", "deny"))
    if amount_cents <= 0:
        deny.append(Reason("BAD_AMOUNT", "Amount must be positive.", "deny"))
    if currency != mandate.currency:
        deny.append(Reason("CURRENCY", f"Currency {currency} is not the mandate currency {mandate.currency}.", "deny"))
    if amount_cents > mandate.per_purchase_limit_cents:
        deny.append(Reason("PER_PURCHASE_LIMIT", f"{amount_cents/100:.2f} exceeds per-purchase limit "
                           f"{mandate.per_purchase_limit_cents/100:.2f}.", "deny"))
    if mandate.allowed_categories and category not in mandate.allowed_categories:
        deny.append(Reason("CATEGORY", f"Category '{category}' is outside the mandate.", "deny"))
    if merchant in mandate.blocked_merchants:
        deny.append(Reason("MERCHANT_BLOCKED", f"Merchant '{merchant}' is blocked.", "deny"))
    if ctx.spent_month_cents + amount_cents > mandate.monthly_limit_cents:
        deny.append(Reason("MONTHLY_LIMIT", f"Would raise monthly spend to {(ctx.spent_month_cents+amount_cents)/100:.2f} "
                           f"(limit {mandate.monthly_limit_cents/100:.2f}).", "deny"))
    if ctx.purchases_today >= mandate.max_purchases_per_day:
        deny.append(Reason("DAILY_COUNT", f"Daily purchase cap ({mandate.max_purchases_per_day}) reached.", "deny"))
    if deny:
        return Decision(DENY, [r.dict() for r in deny])

    if amount_cents > mandate.auto_approve_limit_cents:
        review.append(Reason("ABOVE_AUTO_LIMIT", f"Above auto-approve limit {mandate.auto_approve_limit_cents/100:.2f}.", "review"))
    if merchant not in mandate.trusted_merchants:
        review.append(Reason("UNTRUSTED_MERCHANT", f"Merchant '{merchant}' is not on the trusted list.", "review"))
    if injection:
        review.append(Reason("INJECTION_SUSPECTED", "Justification contains instruction-like text (possible prompt injection).", "review"))
    if risk_score >= RISK_ESCALATION_THRESHOLD:
        review.append(Reason("RISK_MODEL", f"Risk model score {risk_score:.2f} >= {RISK_ESCALATION_THRESHOLD} (advisory, escalate only).", "review"))
    if review:
        return Decision(REQUIRE_APPROVAL, [r.dict() for r in review])
    return Decision(ALLOW, [Reason("WITHIN_MANDATE", "Within all mandate limits.", "info").dict()])
