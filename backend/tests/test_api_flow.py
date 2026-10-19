import json
import pytest
from pydantic import ValidationError
from app.config import Settings
from tests.conftest import AGENT, OWNER


def scenario(c, name): return c.post(f"/api/demo/scenario/{name}", headers=OWNER).json()["purchases"]


def test_auth_required_and_roles(client):
    assert client.get("/api/mandate").status_code == 401
    assert client.get("/api/mandate", headers={"X-API-Key": "wrong"}).status_code == 401
    p = scenario(client, "needs_approval")[0]
    assert client.post(f"/api/purchases/{p['id']}/approve", headers=AGENT).status_code == 403
    assert client.put("/api/mandate", headers=AGENT, json={}).status_code == 403


def test_status_labels_simulation(client):
    s = client.get("/api/status").json()
    assert s["simulated"] and "SIMULATION" in s["banner"] and s["risk_data"] == "synthetic"


def test_within_mandate_auto_creates_simulated_order_then_full_capture_via_webhook(client):
    p = scenario(client, "routine")[0]
    assert p["policy_decision"] == "ALLOW" and p["status"] == "ORDER_CREATED"
    assert p["provider_order_id"].startswith("SIM-") and p["simulated"]
    # capture before buyer approval must be refused (provider state is the source of truth)
    r = client.post(f"/api/purchases/{p['id']}/capture", headers=OWNER)
    assert r.status_code == 409 and "not approved" in r.json()["detail"]
    # buyer approves -> signed webhook -> verified -> auto-capture
    r = client.post(f"/api/sim/orders/{p['provider_order_id']}/approve", headers=OWNER)
    assert r.json()["status"] == "captured"
    got = client.get(f"/api/purchases/{p['id']}", headers=OWNER).json()
    assert got["status"] == "CAPTURED" and got["capture_id"].startswith("SIMCAP-")


def test_webhook_rejects_bad_signature_and_deduplicates(client):
    p = scenario(client, "routine")[0]
    ev = {"id": "WH-1", "event_type": "CHECKOUT.ORDER.APPROVED", "resource": {"id": p["provider_order_id"]}}
    body = json.dumps(ev)
    assert client.post("/api/webhooks/paypal", content=body, headers={"x-simulator-signature": "bad"}).status_code == 400
    assert client.post("/api/webhooks/paypal", content=body).status_code == 400
    # first complete the normal flow through the simulator path
    client.post(f"/api/sim/orders/{p['provider_order_id']}/approve", headers=OWNER)
    # replay of an already-processed event id is ignored
    from app.paypal.simulator import sign
    raw = json.dumps({"id": "WH-DUP", "event_type": "CHECKOUT.ORDER.APPROVED", "resource": {"id": p["provider_order_id"]}}, separators=(",", ":")).encode()
    h = {"x-simulator-signature": sign("dev-only-simulator-secret", raw)}
    assert client.post("/api/webhooks/paypal", content=raw, headers=h).status_code == 200
    assert client.post("/api/webhooks/paypal", content=raw, headers=h).json()["status"] == "duplicate_ignored"


def test_poisoned_listing_is_escalated_and_oversize_denied(client):
    single, bulk = scenario(client, "poisoned_listing")
    assert single["policy_decision"] == "REQUIRE_APPROVAL" and single["status"] == "PENDING_APPROVAL"
    codes = {r["code"] for r in single["policy_reasons"]}
    assert {"INJECTION_SUSPECTED", "UNTRUSTED_MERCHANT"} <= codes
    assert single["provider_order_id"] == ""            # no order was created without a human
    assert bulk["policy_decision"] == "DENY" and bulk["status"] == "DENIED"
    assert "PER_PURCHASE_LIMIT" in {r["code"] for r in bulk["policy_reasons"]}


def test_blocked_category_denied(client):
    p = scenario(client, "blocked_category")[0]
    assert p["status"] == "DENIED" and p["provider_order_id"] == ""


def test_owner_approval_flow_and_reject(client):
    a, = scenario(client, "needs_approval")
    assert a["status"] == "PENDING_APPROVAL"
    r = client.post(f"/api/purchases/{a['id']}/approve", headers=OWNER).json()
    assert r["status"] == "ORDER_CREATED" and r["provider_order_id"].startswith("SIM-")
    b = client.post("/api/proposals", headers=AGENT, json={"sku": "MON-001", "quantity": 1}).json()
    assert client.post(f"/api/purchases/{b['id']}/reject", headers=OWNER).json()["status"] == "REJECTED"
    assert client.post(f"/api/purchases/{b['id']}/approve", headers=OWNER).status_code == 409


def test_monthly_budget_enforced_across_purchases(client):
    m = client.get("/api/mandate", headers=OWNER).json()
    m.update(monthly_limit_cents=5000, auto_approve_limit_cents=5000)
    for k in ("id",): m.pop(k)
    assert client.put("/api/mandate", headers=OWNER, json=m).status_code == 200
    first = client.post("/api/proposals", headers=AGENT, json={"sku": "PAP-002", "quantity": 1}).json()   # 39.99
    assert first["status"] == "ORDER_CREATED"
    second = client.post("/api/proposals", headers=AGENT, json={"sku": "PAP-002", "quantity": 1}).json()  # would reach 79.98
    assert second["status"] == "DENIED" and "MONTHLY_LIMIT" in {r["code"] for r in second["policy_reasons"]}


def test_approval_cannot_override_mandate_limits(client):
    a, = scenario(client, "needs_approval")  # 129.99 pending
    m = client.get("/api/mandate", headers=OWNER).json(); m.pop("id")
    m["per_purchase_limit_cents"] = 5000
    client.put("/api/mandate", headers=OWNER, json=m)
    r = client.post(f"/api/purchases/{a['id']}/approve", headers=OWNER)
    assert r.status_code == 409
    assert client.get(f"/api/purchases/{a['id']}", headers=OWNER).json()["status"] == "DENIED"


def test_idempotency_key_prevents_duplicate_purchases(client):
    h = {**AGENT, "Idempotency-Key": "k-123"}
    a = client.post("/api/proposals", headers=h, json={"sku": "PEN-001", "quantity": 1}).json()
    b = client.post("/api/proposals", headers=h, json={"sku": "PEN-001", "quantity": 1}).json()
    assert a["id"] == b["id"] and len(client.get("/api/purchases", headers=OWNER).json()) == 1


def test_agent_cannot_set_price_or_unknown_sku_and_validation(client):
    assert client.post("/api/proposals", headers=AGENT, json={"sku": "NOPE", "quantity": 1}).status_code == 422
    assert client.post("/api/proposals", headers=AGENT, json={"sku": "PEN-001", "quantity": 0}).status_code == 422
    p = client.post("/api/proposals", headers=AGENT, json={"sku": "PEN-001", "quantity": 3, "amount_cents": 1}).json()
    assert p["amount_cents"] == 3 * 1099  # extra 'amount_cents' field is ignored; price comes from catalog


def test_agent_plan_endpoint_local_planner(client):
    r = client.post("/api/agent/plan", headers=AGENT, json={"goal": "buy 2 reams of printer paper under $40"}).json()
    assert r["planner"] == "local" and r["purchases"][0]["sku"] == "PAP-001" and r["purchases"][0]["amount_cents"] == 1798
    assert client.post("/api/agent/plan", headers=AGENT, json={"goal": "buy 2 reams of printer paper under $40"}).json()["planner"] == "cache"
    assert client.post("/api/agent/plan", headers=AGENT, json={"goal": "qqqq zzzz"}).json()["purchases"] == []


def test_audit_trail_covers_workflow_and_verifies(client):
    p = scenario(client, "routine")[0]
    client.post(f"/api/sim/orders/{p['provider_order_id']}/approve", headers=OWNER)
    actions = [e["action"] for e in client.get("/api/audit", headers=OWNER).json()]
    assert {"PROPOSED", "ORDER_CREATED", "BUYER_APPROVED", "CAPTURED"} <= set(actions)
    assert client.get("/api/audit/verify", headers=OWNER).json()["valid"] is True


def test_demo_reset_clears_state(client):
    scenario(client, "routine")
    assert client.post("/api/demo/reset", headers=OWNER).json() == {"reset": True}
    assert client.get("/api/purchases", headers=OWNER).json() == []
    assert client.get("/api/mandate", headers=OWNER).status_code == 200


def test_rate_limiter():
    from app.usage import RateLimiter
    t = [0.0]
    rl = RateLimiter(2, clock=lambda: t[0])
    assert rl.allow("k") and rl.allow("k") and not rl.allow("k")
    t[0] = 61
    assert rl.allow("k")


def test_config_safety_guards():
    with pytest.raises(RuntimeError, match="Live PayPal"):
        Settings(paypal_base_url="https://api-m.paypal.com").validate_safety()
    with pytest.raises(RuntimeError, match="Sandbox mode requires"):
        Settings(paypal_mode="sandbox").validate_safety()
    with pytest.raises(RuntimeError, match="non-default"):
        Settings(paypal_mode="sandbox", paypal_client_id="a", paypal_client_secret="b", paypal_webhook_id="c").validate_safety()
    Settings(paypal_mode="sandbox", paypal_client_id="a", paypal_client_secret="b", paypal_webhook_id="c",
             owner_api_key="x" * 20, agent_api_key="y" * 20).validate_safety()


def test_stale_unapproved_order_expires_and_releases_budget(client):
    from datetime import datetime, timedelta, timezone
    from app import services
    from app.models import Purchase
    ps = scenario(client, "routine")  # two auto-approved orders
    p = ps[0]
    assert client.get("/api/spend", headers=OWNER).json()["month_spent_cents"] == sum(x["amount_cents"] for x in ps)
    with client.sf() as db:
        assert services.expire_stale(db, datetime.now(timezone.utc) + timedelta(hours=2)) == 0   # still within TTL
        assert services.expire_stale(db, datetime.now(timezone.utc) + timedelta(hours=4)) == 2   # past TTL
        assert db.get(Purchase, p["id"]).status == "EXPIRED"
    assert client.get("/api/spend", headers=OWNER).json()["month_spent_cents"] == 0
    r = client.post(f"/api/purchases/{p['id']}/capture", headers=OWNER)
    assert r.status_code == 409
