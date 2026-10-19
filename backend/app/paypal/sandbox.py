"""Client for the official PayPal REST API (Orders v2, OAuth2, webhook signature verification).
Targets https://api-m.sandbox.paypal.com. Covered by mocked-transport unit tests; NOT yet exercised
against the live sandbox (requires the developer's own credentials) - see docs/KNOWN_LIMITATIONS.md."""
import json
import time
import httpx
from typing import Mapping
from .base import CaptureResult, OrderResult, ProviderError, cents_to_str, str_to_cents


class SandboxProvider:
    name = "sandbox"
    simulated = False

    def __init__(self, client_id: str, client_secret: str, webhook_id: str, base_url: str,
                 return_url: str, cancel_url: str, timeout: float = 10.0,
                 max_retries: int = 2, transport: httpx.BaseTransport | None = None,
                 sleep=time.sleep):
        self._id, self._secret, self._webhook_id = client_id, client_secret, webhook_id
        self._return, self._cancel = return_url, cancel_url
        self._retries = max_retries
        self._sleep = sleep
        self._http = httpx.Client(base_url=base_url, timeout=timeout, transport=transport)
        self._token: str = ""
        self._token_exp: float = 0.0

    # --- auth -------------------------------------------------------------
    def _auth(self) -> str:
        if self._token and time.time() < self._token_exp - 30:
            return self._token
        r = self._http.post("/v1/oauth2/token", data={"grant_type": "client_credentials"},
                            auth=(self._id, self._secret))
        if r.status_code != 200:
            raise ProviderError("PayPal authentication failed (check client id/secret)", r.status_code)
        data = r.json()
        self._token = data["access_token"]
        self._token_exp = time.time() + int(data.get("expires_in", 300))
        return self._token

    def _request(self, method: str, path: str, *, json_body=None, request_id: str | None = None,
                 idempotent: bool = True) -> dict:
        """Bounded retries with exponential backoff, only on 429/5xx/network errors and only when safe."""
        last: Exception | None = None
        for attempt in range(self._retries + 1):
            headers = {"Authorization": f"Bearer {self._auth()}", "Content-Type": "application/json"}
            if request_id:
                headers["PayPal-Request-Id"] = request_id
            try:
                r = self._http.request(method, path, headers=headers, json=json_body)
            except httpx.TransportError as e:
                last = ProviderError(f"Network error: {e}", retryable=True)
            else:
                if r.status_code == 401:
                    self._token = ""  # force refresh once
                    last = ProviderError("Unauthorized", 401, retryable=True)
                elif r.status_code == 429 or r.status_code >= 500:
                    last = ProviderError(f"PayPal temporary error {r.status_code}", r.status_code, retryable=True)
                elif r.status_code >= 400:
                    raise ProviderError(f"PayPal rejected request ({r.status_code}): {r.text[:300]}", r.status_code)
                else:
                    return r.json() if r.content else {}
            if not idempotent or attempt == self._retries:
                break
            self._sleep(min(0.25 * (2 ** attempt), 2.0))
        assert last is not None
        raise last

    # --- orders -------------------------------------------------------------
    def create_order(self, *, reference_id, amount_cents, currency, description, request_id) -> OrderResult:
        body = {
            "intent": "CAPTURE",
            "purchase_units": [{
                "reference_id": reference_id,
                "description": description[:127],
                "amount": {"currency_code": currency, "value": cents_to_str(amount_cents)},
            }],
            "payment_source": {"paypal": {"experience_context": {
                "return_url": self._return, "cancel_url": self._cancel,
                "user_action": "PAY_NOW", "shipping_preference": "NO_SHIPPING"}}},
        }
        data = self._request("POST", "/v2/checkout/orders", json_body=body, request_id=request_id)
        return self._parse_order(data, amount_cents, currency)

    def get_order(self, order_id: str) -> OrderResult:
        return self._parse_order(self._request("GET", f"/v2/checkout/orders/{order_id}"))

    def capture_order(self, order_id: str, request_id: str) -> CaptureResult:
        data = self._request("POST", f"/v2/checkout/orders/{order_id}/capture", json_body={}, request_id=request_id)
        try:
            cap = data["purchase_units"][0]["payments"]["captures"][0]
            amt = cap["amount"]
            return CaptureResult(cap["id"], cap["status"], str_to_cents(amt["value"]), amt["currency_code"])
        except (KeyError, IndexError) as e:
            raise ProviderError(f"Unexpected capture response shape: {e}")

    @staticmethod
    def _parse_order(data: dict, amount_cents: int = 0, currency: str = "USD") -> OrderResult:
        try:
            if "purchase_units" in data and data["purchase_units"]:
                amt = data["purchase_units"][0]["amount"]
                amount_cents, currency = str_to_cents(amt["value"]), amt["currency_code"]
            links = {l.get("rel"): l.get("href", "") for l in data.get("links", [])}
            url = links.get("payer-action") or links.get("approve", "")
            return OrderResult(data["id"], data["status"], url, amount_cents, currency)
        except KeyError as e:
            raise ProviderError(f"Unexpected order response shape: missing {e}")

    # --- webhooks -------------------------------------------------------------
    def verify_webhook(self, headers: Mapping[str, str], body: bytes) -> bool:
        """Uses PayPal's official verify-webhook-signature endpoint. Fails CLOSED on any error."""
        h = {k.lower(): v for k, v in headers.items()}
        needed = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id",
                  "paypal-transmission-sig", "paypal-transmission-time"]
        if any(k not in h for k in needed):
            return False
        try:
            payload = {
                "auth_algo": h["paypal-auth-algo"], "cert_url": h["paypal-cert-url"],
                "transmission_id": h["paypal-transmission-id"], "transmission_sig": h["paypal-transmission-sig"],
                "transmission_time": h["paypal-transmission-time"], "webhook_id": self._webhook_id,
                "webhook_event": json.loads(body),
            }
            data = self._request("POST", "/v1/notifications/verify-webhook-signature", json_body=payload)
            return data.get("verification_status") == "SUCCESS"
        except (ProviderError, ValueError):
            return False
