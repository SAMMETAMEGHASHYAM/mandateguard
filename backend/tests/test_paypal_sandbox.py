import json
import httpx
import pytest
from app.paypal.base import ProviderError
from app.paypal.sandbox import SandboxProvider


def make(handler, **kw):
    return SandboxProvider("cid", "sec", "WH-ID", "https://api-m.sandbox.paypal.com", "http://r", "http://c",
                           transport=httpx.MockTransport(handler), sleep=lambda s: None, **kw)


def base_handler(extra):
    calls = []

    def h(req: httpx.Request):
        calls.append(req)
        if req.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "TOK", "expires_in": 3000})
        return extra(req, calls)
    return h, calls


def test_create_order_sends_request_id_and_parses_payer_action():
    def extra(req, calls):
        body = json.loads(req.content)
        assert body["intent"] == "CAPTURE"
        assert body["purchase_units"][0]["amount"] == {"currency_code": "USD", "value": "19.98"}
        assert req.headers["PayPal-Request-Id"] == "order-1"
        assert req.headers["Authorization"] == "Bearer TOK"
        return httpx.Response(201, json={"id": "5O190127TN364715T", "status": "PAYER_ACTION_REQUIRED",
                                         "links": [{"rel": "payer-action", "href": "https://sandbox.paypal.com/checkoutnow?token=X"}]})
    h, _ = base_handler(extra)
    o = make(h).create_order(reference_id="p1", amount_cents=1998, currency="USD", description="d", request_id="order-1")
    assert o.order_id == "5O190127TN364715T" and o.approve_url.endswith("token=X") and o.amount_cents == 1998


def test_get_order_parses_amount_and_status():
    h, _ = base_handler(lambda r, c: httpx.Response(200, json={"id": "O1", "status": "APPROVED",
                        "purchase_units": [{"amount": {"currency_code": "USD", "value": "5.00"}}], "links": []}))
    o = make(h).get_order("O1")
    assert (o.status, o.amount_cents) == ("APPROVED", 500)


def test_capture_parses_capture_object():
    h, _ = base_handler(lambda r, c: httpx.Response(201, json={"status": "COMPLETED", "purchase_units": [{"payments": {"captures": [
        {"id": "CAP1", "status": "COMPLETED", "amount": {"currency_code": "USD", "value": "5.00"}}]}}]}))
    c = make(h).capture_order("O1", "cap-1")
    assert (c.capture_id, c.status, c.amount_cents) == ("CAP1", "COMPLETED", 500)


def test_retries_503_then_succeeds_with_same_request_id():
    seen = []

    def extra(req, calls):
        seen.append(req.headers.get("PayPal-Request-Id"))
        return httpx.Response(503) if len(seen) < 3 else httpx.Response(200, json={"id": "O1", "status": "CREATED", "links": []})
    h, _ = base_handler(extra)
    make(h).create_order(reference_id="p", amount_cents=100, currency="USD", description="d", request_id="rid")
    assert seen == ["rid", "rid", "rid"]


def test_gives_up_after_bounded_retries():
    h, calls = base_handler(lambda r, c: httpx.Response(500))
    with pytest.raises(ProviderError) as e:
        make(h, max_retries=2).get_order("O1")
    assert e.value.retryable and len([c for c in calls if c.url.path != "/v1/oauth2/token"]) == 3


def test_client_error_not_retried():
    h, calls = base_handler(lambda r, c: httpx.Response(422, text="UNPROCESSABLE"))
    with pytest.raises(ProviderError):
        make(h).get_order("O1")
    assert len([c for c in calls if c.url.path != "/v1/oauth2/token"]) == 1


def test_auth_failure_is_reported():
    p = make(lambda r: httpx.Response(401, json={"error": "invalid_client"}))
    with pytest.raises(ProviderError, match="authentication"):
        p.get_order("O1")


HDRS = {"PAYPAL-AUTH-ALGO": "SHA256withRSA", "PAYPAL-CERT-URL": "https://api.paypal.com/cert", "PAYPAL-TRANSMISSION-ID": "t1",
        "PAYPAL-TRANSMISSION-SIG": "sig", "PAYPAL-TRANSMISSION-TIME": "2026-10-14T00:00:00Z"}


def test_webhook_verification_success_and_payload():
    def extra(req, calls):
        b = json.loads(req.content)
        assert b["webhook_id"] == "WH-ID" and b["transmission_id"] == "t1" and b["webhook_event"] == {"id": "E1"}
        return httpx.Response(200, json={"verification_status": "SUCCESS"})
    h, _ = base_handler(extra)
    assert make(h).verify_webhook(HDRS, b'{"id":"E1"}') is True


def test_webhook_verification_failure_missing_headers_and_errors_fail_closed():
    h, _ = base_handler(lambda r, c: httpx.Response(200, json={"verification_status": "FAILURE"}))
    p = make(h)
    assert p.verify_webhook(HDRS, b'{"id":"E1"}') is False
    assert p.verify_webhook({}, b'{"id":"E1"}') is False
    assert p.verify_webhook(HDRS, b"not-json") is False
    h2, _ = base_handler(lambda r, c: httpx.Response(500))
    assert make(h2, max_retries=0).verify_webhook(HDRS, b'{"id":"E1"}') is False
