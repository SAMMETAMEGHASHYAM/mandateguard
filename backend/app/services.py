"""Core workflow: proposal -> policy+risk -> (approval) -> PayPal order -> verified capture. Every step is audited."""
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session
from . import audit, policy, risk
from .catalog import BY_SKU
from .models import Mandate, Purchase
from .paypal.base import ProviderError

SPEND_STATES = ("ORDER_CREATED", "CAPTURED")  # reserved + settled both count against the budget
# Only live commitments count toward the daily cap. Rejected, expired and failed
# attempts must not burn the owner's quota.
COUNTED_STATES = ("PENDING_APPROVAL", "ORDER_CREATED", "CAPTURED")


class WorkflowError(Exception):
    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.status = status


ORDER_TTL = timedelta(hours=3)  # PayPal docs: an order must be captured within ~3h of creation; stale orders are released


def expire_stale(db: Session, now: datetime | None = None) -> int:
    """Release budget reserved by orders the buyer never approved in time (status -> EXPIRED)."""
    now = now or datetime.now(timezone.utc)
    n = 0
    for p in db.query(Purchase).filter(Purchase.status == "ORDER_CREATED").all():
        if now - _aware(p.updated_at) > ORDER_TTL:
            p.status = "EXPIRED"
            audit.append(db, "system", "ORDER_EXPIRED", p.id, {"order_id": p.provider_order_id})
            n += 1
    if n:
        db.commit()
    return n


def month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def spent_this_month(db: Session, mandate_id: int, now: datetime, exclude_id: str = "") -> int:
    q = db.query(func.coalesce(func.sum(Purchase.amount_cents), 0)).filter(
        Purchase.mandate_id == mandate_id, Purchase.status.in_(SPEND_STATES), Purchase.created_at >= month_start(now))
    if exclude_id:
        q = q.filter(Purchase.id != exclude_id)
    return int(q.scalar())


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def build_context(db: Session, mandate: Mandate, merchant: str, now: datetime, exclude_id: str = "") -> tuple[policy.Context, int]:
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    base = db.query(Purchase).filter(Purchase.mandate_id == mandate.id, Purchase.status != "DENIED")
    if exclude_id:
        base = base.filter(Purchase.id != exclude_id)
    today = base.filter(Purchase.created_at >= day_start, Purchase.status.in_(COUNTED_STATES)).count()
    last_hour = base.filter(Purchase.created_at >= now - timedelta(hours=1)).count()
    seen = base.filter(Purchase.merchant == merchant, Purchase.status == "CAPTURED").count() > 0
    return policy.Context(spent_this_month(db, mandate.id, now, exclude_id), today, seen), last_hour


def propose(db: Session, provider, scorer: risk.RiskScorer, mandate: Mandate, *, sku: str, quantity: int,
            justification: str, source: str, actor: str, idempotency_key: str | None = None,
            now: datetime | None = None) -> Purchase:
    now = now or datetime.now(timezone.utc)
    expire_stale(db, now)
    if idempotency_key:
        existing = db.query(Purchase).filter_by(idempotency_key=idempotency_key).one_or_none()
        if existing:
            return existing
    item = BY_SKU.get(sku)
    if not item:
        raise WorkflowError(f"Unknown SKU '{sku}'", 422)
    if not (1 <= quantity <= 50):
        raise WorkflowError("Quantity must be 1..50", 422)
    amount = item["unit_cents"] * quantity  # price is NEVER taken from the agent
    ctx, velocity = build_context(db, mandate, item["merchant"], now)
    feats = risk.extract_features(
        amount_cents=amount, mandate=mandate, quantity=quantity, typical_unit_cents=item["typical_cents"],
        unit_cents=item["unit_cents"], new_merchant=not ctx.merchant_seen_before,
        spent_month_cents=ctx.spent_month_cents, velocity_1h=velocity, justification=justification, now=now)
    score = scorer.score(feats)
    decision = policy.evaluate(mandate, amount_cents=amount, currency=mandate.currency, category=item["category"],
                               merchant=item["merchant"], ctx=ctx, risk_score=score,
                               injection=bool(feats["injection_flag"]))
    p = Purchase(id=str(uuid.uuid4()), mandate_id=mandate.id, sku=sku, title=item["title"], merchant=item["merchant"],
                 category=item["category"], quantity=quantity, amount_cents=amount, currency=mandate.currency,
                 justification=justification[:2000], source=source, policy_decision=decision.decision,
                 policy_reasons=decision.reasons, risk_score=round(score, 4), risk_factors=risk.explain(feats),
                 provider=provider.name, idempotency_key=idempotency_key, created_at=now, updated_at=now)
    p.status = {policy.DENY: "DENIED", policy.REQUIRE_APPROVAL: "PENDING_APPROVAL", policy.ALLOW: "PROPOSED"}[decision.decision]
    db.add(p)
    audit.append(db, actor, "PROPOSED", p.id, {"sku": sku, "qty": quantity, "amount_cents": amount,
                                                 "decision": decision.decision, "risk": p.risk_score,
                                                 "reasons": [r["code"] for r in decision.reasons]})
    db.commit()  # persist the decision + audit BEFORE any external call (intent is recorded even if the provider fails)
    if decision.decision == policy.ALLOW:
        _create_order(db, provider, p, actor="policy-engine")
        db.commit()
    return p


def _create_order(db: Session, provider, p: Purchase, actor: str) -> None:
    try:
        o = provider.create_order(reference_id=p.id, amount_cents=p.amount_cents, currency=p.currency,
                                  description=f"{p.quantity} x {p.title}", request_id=f"order-{p.id}")
    except ProviderError as e:
        p.status = "FAILED"
        audit.append(db, actor, "ORDER_FAILED", p.id, {"error": str(e)})
        return
    p.provider_order_id, p.approve_url, p.status = o.order_id, o.approve_url, "ORDER_CREATED"
    audit.append(db, actor, "ORDER_CREATED", p.id, {"order_id": o.order_id, "provider": provider.name})


def get(db: Session, pid: str) -> Purchase:
    p = db.get(Purchase, pid)
    if not p:
        raise WorkflowError("Purchase not found", 404)
    return p


def approve(db: Session, provider, mandate: Mandate, pid: str, actor: str, now: datetime | None = None) -> Purchase:
    now = now or datetime.now(timezone.utc)
    expire_stale(db, now)
    p = get(db, pid)
    if p.status != "PENDING_APPROVAL":
        raise WorkflowError(f"Cannot approve a purchase in state {p.status}")
    # Hard limits are re-checked at approval time: a human cannot approve past the mandate's DENY rules.
    ctx, _ = build_context(db, mandate, p.merchant, now, exclude_id=p.id)
    d = policy.evaluate(mandate, amount_cents=p.amount_cents, currency=p.currency, category=p.category,
                        merchant=p.merchant, ctx=ctx)
    if d.decision == policy.DENY:
        p.status, p.policy_decision, p.policy_reasons = "DENIED", d.decision, d.reasons
        audit.append(db, actor, "APPROVAL_BLOCKED", p.id, {"reasons": [r["code"] for r in d.reasons]})
        db.commit()
        raise WorkflowError("Mandate limits no longer allow this purchase: " + d.reasons[0]["message"])
    audit.append(db, actor, "APPROVED_BY_OWNER", p.id, {})
    db.commit()
    _create_order(db, provider, p, actor)
    db.commit()
    return p


def reject(db: Session, pid: str, actor: str) -> Purchase:
    p = get(db, pid)
    if p.status != "PENDING_APPROVAL":
        raise WorkflowError(f"Cannot reject a purchase in state {p.status}")
    p.status = "REJECTED"
    audit.append(db, actor, "REJECTED_BY_OWNER", p.id, {})
    db.commit()
    return p


def capture(db: Session, provider, pid: str, actor: str) -> Purchase:
    """Capture only after the PROVIDER confirms buyer approval and the amount matches. A browser redirect is never trusted."""
    p = get(db, pid)
    if p.status == "CAPTURED":
        return p  # idempotent
    if p.status != "ORDER_CREATED":
        raise WorkflowError(f"Cannot capture a purchase in state {p.status}")
    try:
        order = provider.get_order(p.provider_order_id)
        if order.status != "APPROVED":
            raise WorkflowError(f"Buyer has not approved the order yet (PayPal status: {order.status})")
        if order.amount_cents != p.amount_cents or order.currency != p.currency:
            p.status = "FAILED"
            audit.append(db, actor, "AMOUNT_MISMATCH", p.id, {"expected": p.amount_cents, "got": order.amount_cents})
            db.commit()
            raise WorkflowError("Provider amount does not match the approved purchase; capture refused.")
        cap = provider.capture_order(p.provider_order_id, request_id=f"capture-{p.id}")
    except ProviderError as e:
        audit.append(db, actor, "CAPTURE_ERROR", p.id, {"error": str(e)})
        db.commit()
        raise WorkflowError(f"Payment provider error: {e}", 502)
    if cap.status != "COMPLETED":
        audit.append(db, actor, "CAPTURE_NOT_COMPLETED", p.id, {"status": cap.status})
        db.commit()
        raise WorkflowError(f"Capture returned status {cap.status}", 502)
    p.status, p.capture_id = "CAPTURED", cap.capture_id
    audit.append(db, actor, "CAPTURED", p.id, {"capture_id": cap.capture_id, "provider": provider.name})
    db.commit()
    return p
