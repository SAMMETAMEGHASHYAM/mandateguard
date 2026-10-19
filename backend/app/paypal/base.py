"""Provider interface. The app depends ONLY on this; simulation/sandbox are swapped via PAYPAL_MODE."""
from dataclasses import dataclass
from typing import Mapping, Protocol


class ProviderError(Exception):
    def __init__(self, message: str, status: int | None = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


@dataclass
class OrderResult:
    order_id: str
    status: str            # CREATED | APPROVED | COMPLETED | VOIDED ...
    approve_url: str = ""
    amount_cents: int = 0
    currency: str = "USD"


@dataclass
class CaptureResult:
    capture_id: str
    status: str            # COMPLETED | PENDING | DECLINED
    amount_cents: int
    currency: str


class PaymentProvider(Protocol):
    name: str              # "simulation" | "sandbox"
    simulated: bool

    def create_order(self, *, reference_id: str, amount_cents: int, currency: str,
                     description: str, request_id: str) -> OrderResult: ...
    def get_order(self, order_id: str) -> OrderResult: ...
    def capture_order(self, order_id: str, request_id: str) -> CaptureResult: ...
    def verify_webhook(self, headers: Mapping[str, str], body: bytes) -> bool: ...


def cents_to_str(cents: int) -> str:
    return f"{cents // 100}.{cents % 100:02d}"


def str_to_cents(value: str) -> int:
    whole, _, frac = value.partition(".")
    return int(whole) * 100 + int((frac + "00")[:2])
