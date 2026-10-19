"""Quota awareness: per-day LLM call budget (persisted), in-memory per-key rate limiter, planner cache."""
import time
from collections import defaultdict, deque
from datetime import date
from sqlalchemy.orm import Session
from .models import UsageRecord


def today() -> str:
    return date.today().isoformat()


def llm_calls_today(db: Session) -> int:
    r = db.query(UsageRecord).filter_by(day=today(), kind="llm").one_or_none()
    return r.calls if r else 0


def can_call_llm(db: Session, budget: int) -> bool:
    return llm_calls_today(db) < budget


def record_llm_call(db: Session) -> None:
    r = db.query(UsageRecord).filter_by(day=today(), kind="llm").one_or_none()
    if not r:
        r = UsageRecord(day=today(), kind="llm", calls=0)
        db.add(r)
    r.calls += 1
    db.flush()


class RateLimiter:
    def __init__(self, per_minute: int, clock=time.monotonic):
        self.per_minute, self.clock = per_minute, clock
        self.hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = self.clock()
        q = self.hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= self.per_minute:
            return False
        q.append(now)
        return True


class TTLCache:
    def __init__(self, ttl: float = 600, clock=time.monotonic):
        self.ttl, self.clock, self.data = ttl, clock, {}

    def get(self, k):
        v = self.data.get(k)
        if v and self.clock() - v[0] < self.ttl:
            return v[1]
        return None

    def set(self, k, val):
        self.data[k] = (self.clock(), val)
