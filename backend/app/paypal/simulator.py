"""LOCAL SIMULATOR. Order IDs are prefixed SIM- and the UI shows a SIMULATION banner.
These are NOT real PayPal transactions. It mimics the shape of the Orders v2 flow
(create -> buyer approval -> capture) and signs webhook bodies with HMAC so the same
verification code path is exercised in tests and demos."""
import hashlib
import hmac
import json
import uuid
from typing import Callable, Mapping
from sqlalchemy.orm import Session
from ..models import SimOrder
from .base import CaptureResult, OrderResult, ProviderError


def sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


class SimulatedProvider:
    name = "simulation"
    simulated = True

    def __init__(self, session_factory: Callable[[], Session], webhook_secret: str, public_base_url: str):
        self._sf = session_factory
        self._secret = webhook_secret
        self._base = public_base_url.rstrip("/")

    def create_order(self, *, reference_id, amount_cents, currency, description, request_id) -> OrderResult:
        with self._sf() as db:
            existing = db.query(SimOrder).filter_by(request_id=request_id).one_or_none()
            if existing:  # idempotent on request_id, like PayPal-Request-Id
                return self._to_result(existing)
            o = SimOrder(id=f"SIM-{uuid.uuid4().hex[:12].upper()}", amount_cents=amount_cents,
                         currency=currency, request_id=request_id)
            db.add(o)
            db.commit()
            return self._to_result(o)

    def _to_result(self, o: SimOrder) -> OrderResult:
        return OrderResult(o.id, o.status, f"{self._base}/api/sim/orders/{o.id}/approve", o.amount_cents, o.currency)

    def get_order(self, order_id: str) -> OrderResult:
        with self._sf() as db:
            o = db.get(SimOrder, order_id)
            if not o:
                raise ProviderError("Order not found", status=404)
            return self._to_result(o)

    def buyer_approve(self, order_id: str) -> dict:
        """Simulates the buyer approving at PayPal; returns a signed webhook (body, headers)."""
        with self._sf() as db:
            o = db.get(SimOrder, order_id)
            if not o:
                raise ProviderError("Order not found", status=404)
            if o.status == "CREATED":
                o.status = "APPROVED"
                db.commit()
        event = {"id": f"WH-SIM-{uuid.uuid4().hex[:10].upper()}", "event_type": "CHECKOUT.ORDER.APPROVED",
                 "resource": {"id": order_id}, "simulated": True}
        return self.sign_event(event)

    def sign_event(self, event: dict) -> dict:
        body = json.dumps(event, separators=(",", ":")).encode()
        return {"body": body, "headers": {"x-simulator-signature": sign(self._secret, body)}}

    def capture_order(self, order_id: str, request_id: str) -> CaptureResult:
        with self._sf() as db:
            o = db.get(SimOrder, order_id)
            if not o:
                raise ProviderError("Order not found", status=404)
            if o.status == "COMPLETED":  # idempotent re-capture
                return CaptureResult(o.capture_id, "COMPLETED", o.amount_cents, o.currency)
            if o.status != "APPROVED":
                raise ProviderError(f"Order not approved by buyer (status={o.status})", status=422)
            o.status = "COMPLETED"
            o.capture_id = f"SIMCAP-{uuid.uuid4().hex[:12].upper()}"
            db.commit()
            return CaptureResult(o.capture_id, "COMPLETED", o.amount_cents, o.currency)

    def verify_webhook(self, headers: Mapping[str, str], body: bytes) -> bool:
        sig = headers.get("x-simulator-signature", "")
        return hmac.compare_digest(sig, sign(self._secret, body))
