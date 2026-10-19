from datetime import datetime, timezone
from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Mandate(Base):
    """User-defined spending authority delegated to an AI agent. Enforced deterministically."""
    __tablename__ = "mandates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), default="Office supplies agent")
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    per_purchase_limit_cents: Mapped[int] = mapped_column(Integer, default=15000)
    auto_approve_limit_cents: Mapped[int] = mapped_column(Integer, default=5000)
    monthly_limit_cents: Mapped[int] = mapped_column(Integer, default=50000)
    max_purchases_per_day: Mapped[int] = mapped_column(Integer, default=5)
    allowed_categories: Mapped[list] = mapped_column(JSON, default=list)
    trusted_merchants: Mapped[list] = mapped_column(JSON, default=list)
    blocked_merchants: Mapped[list] = mapped_column(JSON, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Purchase(Base):
    __tablename__ = "purchases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    mandate_id: Mapped[int] = mapped_column(Integer)
    sku: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    merchant: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(60))
    quantity: Mapped[int] = mapped_column(Integer)
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    justification: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(20), default="agent")
    # PENDING_APPROVAL, DENIED, ORDER_CREATED, CAPTURED, REJECTED, FAILED
    status: Mapped[str] = mapped_column(String(24), default="PROPOSED")
    policy_decision: Mapped[str] = mapped_column(String(20), default="")
    policy_reasons: Mapped[list] = mapped_column(JSON, default=list)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    risk_factors: Mapped[list] = mapped_column(JSON, default=list)
    provider: Mapped[str] = mapped_column(String(20), default="")  # simulation | sandbox
    provider_order_id: Mapped[str] = mapped_column(String(64), default="")
    approve_url: Mapped[str] = mapped_column(String(500), default="")
    capture_id: Mapped[str] = mapped_column(String(64), default="")
    idempotency_key: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AuditEvent(Base):
    """Append-only, hash-chained log: editing any past row breaks verification."""
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[str] = mapped_column(String(40))
    actor: Mapped[str] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(60))
    purchase_id: Mapped[str] = mapped_column(String(36), default="")
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))


class WebhookEvent(Base):
    __tablename__ = "webhook_events"
    __table_args__ = (UniqueConstraint("event_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(80))
    event_type: Mapped[str] = mapped_column(String(80))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SimOrder(Base):
    """State of the LOCAL SIMULATOR only. Never represents a real PayPal order."""
    __tablename__ = "sim_orders"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(20), default="CREATED")
    capture_id: Mapped[str] = mapped_column(String(64), default="")
    request_id: Mapped[str] = mapped_column(String(80), unique=True)


class UsageRecord(Base):
    __tablename__ = "usage_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    day: Mapped[str] = mapped_column(String(10))
    kind: Mapped[str] = mapped_column(String(30))
    calls: Mapped[int] = mapped_column(Integer, default=0)
