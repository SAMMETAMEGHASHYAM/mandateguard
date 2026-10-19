import hmac
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from . import agent, audit, services, usage
from .catalog import CATALOG
from .config import Settings, get_settings
from .db import Base, SessionLocal, engine
from .models import AuditEvent, Mandate, Purchase, SimOrder, WebhookEvent, UsageRecord
from .paypal.factory import build_provider
from .risk import RiskScorer

DEFAULT_MANDATE = dict(
    name="Office supplies agent", currency="USD", per_purchase_limit_cents=15000, auto_approve_limit_cents=5000,
    monthly_limit_cents=50000, max_purchases_per_day=5,
    allowed_categories=["office_supplies", "electronics", "pantry", "cleaning"],
    trusted_merchants=["OfficeDepot Demo", "TonerWorld Demo", "TechMart Demo", "BeanBox Demo", "CleanCo Demo"],
    blocked_merchants=[])


def purchase_dict(p: Purchase) -> dict:
    return {
        "id": p.id, "sku": p.sku, "title": p.title, "merchant": p.merchant, "category": p.category,
        "quantity": p.quantity, "amount_cents": p.amount_cents, "currency": p.currency,
        "justification": p.justification, "source": p.source, "status": p.status,
        "policy_decision": p.policy_decision, "policy_reasons": p.policy_reasons, "risk_score": p.risk_score,
        "risk_factors": p.risk_factors, "provider": p.provider, "simulated": p.provider == "simulation",
        "provider_order_id": p.provider_order_id, "approve_url": p.approve_url, "capture_id": p.capture_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def mandate_dict(m: Mandate) -> dict:
    return {c: getattr(m, c) for c in ("id", "name", "currency", "per_purchase_limit_cents", "auto_approve_limit_cents",
                                         "monthly_limit_cents", "max_purchases_per_day", "allowed_categories",
                                         "trusted_merchants", "blocked_merchants", "active")}


class ProposalIn(BaseModel):
    sku: str
    quantity: int = Field(1, ge=1, le=50)
    justification: str = Field("", max_length=2000)


class GoalIn(BaseModel):
    goal: str = Field(min_length=3, max_length=500)


class MandateIn(BaseModel):
    name: str = Field(max_length=120)
    per_purchase_limit_cents: int = Field(ge=0, le=100_000_000)
    auto_approve_limit_cents: int = Field(ge=0, le=100_000_000)
    monthly_limit_cents: int = Field(ge=0, le=1_000_000_000)
    max_purchases_per_day: int = Field(ge=0, le=1000)
    allowed_categories: list[str]
    trusted_merchants: list[str]
    blocked_merchants: list[str]
    active: bool = True


def create_app(settings: Settings | None = None, session_factory: sessionmaker | None = None, provider=None) -> FastAPI:
    settings = settings or get_settings()
    sf = session_factory or SessionLocal
    bind = sf.kw["bind"]
    provider = provider or build_provider(settings, sf)
    scorer = RiskScorer(settings.risk_model_path)
    limiter = usage.RateLimiter(settings.rate_limit_per_minute)
    plan_cache = usage.TTLCache()

    @asynccontextmanager
    async def lifespan(app):
        from .db import init_db
        init_db(bind)
        with sf() as db:
            if not db.query(Mandate).first():
                db.add(Mandate(**DEFAULT_MANDATE))
                db.commit()
        yield

    app = FastAPI(title="MandateGuard", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_url, "http://localhost:5173"],
                       allow_methods=["*"], allow_headers=["*"])

    def db_dep():
        db = sf()
        try:
            yield db
        finally:
            db.close()

    def role_dep(x_api_key: str = Header(default="")) -> str:
        role = None
        if x_api_key and hmac.compare_digest(x_api_key, settings.owner_api_key):
            role = "owner"
        elif x_api_key and hmac.compare_digest(x_api_key, settings.agent_api_key):
            role = "agent"
        if not role:
            raise HTTPException(401, "Missing or invalid X-API-Key")
        if not limiter.allow(role):
            raise HTTPException(429, "Rate limit exceeded; retry in a minute")
        return role

    def owner_dep(role: str = Depends(role_dep)) -> str:
        if role != "owner":
            raise HTTPException(403, "Owner key required: agents cannot approve, capture or change the mandate")
        return role

    def sim_only():
        if not provider.simulated:
            raise HTTPException(404, "Only available in simulation mode")

    def mandate_of(db: Session) -> Mandate:
        return db.query(Mandate).order_by(Mandate.id).first()

    def wf(fn, *a, **k):
        try:
            return fn(*a, **k)
        except services.WorkflowError as e:
            raise HTTPException(e.status, str(e))

    # ---------------- public/status ----------------
    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.get("/api/status")
    def status(db: Session = Depends(db_dep)):
        calls = usage.llm_calls_today(db)
        return {
            "paypal_mode": provider.name, "simulated": provider.simulated,
            "banner": "SIMULATION: no real PayPal transactions" if provider.simulated else "PayPal SANDBOX (test money)",
            "risk_model": scorer.kind, "risk_data": "synthetic",
            "llm_enabled": bool(settings.anthropic_api_key),
            "llm_calls_today": calls, "llm_daily_budget": settings.llm_daily_call_budget,
            "audit": audit.verify(db),
        }

    @app.get("/api/catalog")
    def catalog(_: str = Depends(role_dep)):
        return [{k: c[k] for k in ("sku", "title", "category", "merchant", "unit_cents")} for c in CATALOG]

    # ---------------- mandate ----------------
    @app.get("/api/mandate")
    def get_mandate(_: str = Depends(role_dep), db: Session = Depends(db_dep)):
        return mandate_dict(mandate_of(db))

    @app.put("/api/mandate")
    def put_mandate(body: MandateIn, _: str = Depends(owner_dep), db: Session = Depends(db_dep)):
        m = mandate_of(db)
        for k, v in body.model_dump().items():
            setattr(m, k, v)
        audit.append(db, "owner", "MANDATE_UPDATED", "", body.model_dump())
        db.commit()
        return mandate_dict(m)

    @app.get("/api/spend")
    def spend(_: str = Depends(role_dep), db: Session = Depends(db_dep)):
        m = mandate_of(db)
        now = datetime.now(timezone.utc)
        services.expire_stale(db, now)
        spent = services.spent_this_month(db, m.id, now)
        counts: dict[str, int] = {}
        for (s,) in db.query(Purchase.status).all():
            counts[s] = counts.get(s, 0) + 1
        return {"month_spent_cents": spent, "monthly_limit_cents": m.monthly_limit_cents, "by_status": counts}

    # ---------------- agent ----------------
    @app.post("/api/agent/plan")
    def agent_plan(body: GoalIn, role: str = Depends(role_dep), db: Session = Depends(db_dep)):
        m = mandate_of(db)
        key = agent.cache_key(body.goal)
        items, source = plan_cache.get(key), "cache"
        if items is None:
            items, source = None, "local"
            if settings.anthropic_api_key and usage.can_call_llm(db, settings.llm_daily_call_budget):
                try:
                    items = agent.plan_llm(body.goal, settings.anthropic_api_key, settings.anthropic_model, settings.llm_timeout_s)
                    source = "llm"
                except Exception:  # timeout / bad JSON / invalid SKU: degrade gracefully, never crash or retry-loop
                    items = None
                usage.record_llm_call(db)  # count the attempt either way
                db.commit()
            if items is None:
                items, source = agent.plan_local(body.goal), "local"
            plan_cache.set(key, items)
        if not items:
            return {"planner": source, "purchases": [], "message": "No matching catalog item within your constraints."}
        out = []
        for it in items:
            p = services.propose(db, provider, scorer, m, sku=it["sku"], quantity=it["quantity"],
                                 justification=agent.justification_for(body.goal, it["sku"]), source="agent", actor=role)
            out.append(purchase_dict(p))
        return {"planner": source, "purchases": out}

    @app.post("/api/proposals")
    def proposals(body: ProposalIn, role: str = Depends(role_dep), db: Session = Depends(db_dep),
                  idempotency_key: str | None = Header(default=None)):
        p = wf(services.propose, db, provider, scorer, mandate_of(db), sku=body.sku, quantity=body.quantity,
               justification=body.justification, source="agent" if role == "agent" else "manual", actor=role,
               idempotency_key=idempotency_key)
        return purchase_dict(p)

    # ---------------- purchases ----------------
    @app.get("/api/purchases")
    def list_purchases(_: str = Depends(role_dep), db: Session = Depends(db_dep)):
        return [purchase_dict(p) for p in db.query(Purchase).order_by(Purchase.created_at.desc()).limit(200)]

    @app.get("/api/purchases/{pid}")
    def one_purchase(pid: str, _: str = Depends(role_dep), db: Session = Depends(db_dep)):
        return purchase_dict(wf(services.get, db, pid))

    @app.post("/api/purchases/{pid}/approve")
    def approve(pid: str, _: str = Depends(owner_dep), db: Session = Depends(db_dep)):
        return purchase_dict(wf(services.approve, db, provider, mandate_of(db), pid, "owner"))

    @app.post("/api/purchases/{pid}/reject")
    def reject(pid: str, _: str = Depends(owner_dep), db: Session = Depends(db_dep)):
        return purchase_dict(wf(services.reject, db, pid, "owner"))

    @app.post("/api/purchases/{pid}/capture")
    def capture(pid: str, _: str = Depends(owner_dep), db: Session = Depends(db_dep)):
        return purchase_dict(wf(services.capture, db, provider, pid, "owner"))

    # ---------------- webhooks ----------------
    @app.post("/api/webhooks/paypal")
    async def webhook(request: Request, db: Session = Depends(db_dep)):
        body = await request.body()
        if not provider.verify_webhook(dict(request.headers), body):
            raise HTTPException(400, "Invalid webhook signature")
        return process_webhook(db, body)

    def process_webhook(db: Session, body: bytes) -> dict:
        try:
            event = json.loads(body)
            event_id, etype = str(event["id"]), str(event["event_type"])
        except (ValueError, KeyError, TypeError):
            raise HTTPException(400, "Malformed event")
        try:
            db.add(WebhookEvent(event_id=event_id, event_type=etype))
            db.flush()
        except IntegrityError:
            db.rollback()
            return {"status": "duplicate_ignored"}
        result = "ignored"
        resource = event.get("resource") or {}
        if etype == "CHECKOUT.ORDER.APPROVED":
            p = db.query(Purchase).filter_by(provider_order_id=str(resource.get("id", ""))).one_or_none()
            if p and p.status == "ORDER_CREATED":
                audit.append(db, "webhook", "BUYER_APPROVED", p.id, {"event_id": event_id})
                db.commit()
                try:  # auto-capture ONLY for purchases already authorised by policy/owner; re-verified with the provider
                    services.capture(db, provider, p.id, "webhook")
                    result = "captured"
                except services.WorkflowError as e:
                    result = f"capture_deferred: {e}"
        elif etype in ("PAYMENT.CAPTURE.DENIED", "CHECKOUT.PAYMENT-APPROVAL.REVERSED"):
            oid = str(resource.get("id", ""))
            p = db.query(Purchase).filter_by(provider_order_id=oid).one_or_none()
            if p and p.status == "ORDER_CREATED":
                p.status = "FAILED"
                audit.append(db, "webhook", "PROVIDER_FAILURE_EVENT", p.id, {"event_type": etype})
                result = "marked_failed"
        db.commit()
        return {"status": result}

    # ---------------- audit ----------------
    @app.get("/api/audit")
    def audit_log(_: str = Depends(role_dep), db: Session = Depends(db_dep)):
        rows = db.query(AuditEvent).order_by(AuditEvent.id.desc()).limit(200).all()
        return [{"id": r.id, "ts": r.ts, "actor": r.actor, "action": r.action, "purchase_id": r.purchase_id,
                 "details": r.details, "hash": r.hash[:12]} for r in rows]

    @app.get("/api/audit/verify")
    def audit_verify(_: str = Depends(role_dep), db: Session = Depends(db_dep)):
        return audit.verify(db)

    # ---------------- simulation-only ----------------
    @app.post("/api/sim/orders/{order_id}/approve")
    def sim_approve(order_id: str, _: str = Depends(owner_dep), db: Session = Depends(db_dep)):
        sim_only()
        try:
            signed = provider.buyer_approve(order_id)
        except Exception as e:
            raise HTTPException(404, str(e))
        assert provider.verify_webhook(signed["headers"], signed["body"])  # same verification path as real webhooks
        return process_webhook(db, signed["body"])

    @app.post("/api/demo/reset")
    def demo_reset(_: str = Depends(owner_dep)):
        sim_only()
        Base.metadata.drop_all(bind)
        Base.metadata.create_all(bind)
        with sf() as db:
            db.add(Mandate(**DEFAULT_MANDATE))
            db.commit()
        plan_cache.data.clear()
        return {"reset": True}

    @app.post("/api/demo/scenario/{name}")
    def demo_scenario(name: str, _: str = Depends(owner_dep), db: Session = Depends(db_dep)):
        sim_only()
        scenarios = {
            "routine": [("PAP-001", 2), ("PEN-001", 1)],
            "needs_approval": [("MON-001", 1)],
            "poisoned_listing": [("PAP-999", 1), ("PAP-999", 10)],
            "blocked_category": [("GFT-001", 1)],
        }
        if name not in scenarios:
            raise HTTPException(404, "Unknown scenario")
        m = mandate_of(db)
        out = []
        for sku, qty in scenarios[name]:
            goal = f"scenario:{name}"
            out.append(purchase_dict(services.propose(db, provider, scorer, m, sku=sku, quantity=qty,
                                                      justification=agent.justification_for(goal, sku),
                                                      source="agent", actor="agent")))
        return {"purchases": out}

    dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
    if os.path.isdir(dist):
        app.mount("/", StaticFiles(directory=dist, html=True), name="ui")
    return app


def get_app() -> FastAPI:  # uvicorn app.main:get_app --factory
    return create_app()
