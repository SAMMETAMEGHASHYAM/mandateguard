import hashlib
import json
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from .models import AuditEvent

GENESIS = "0" * 64


def _hash(prev: str, ts: str, actor: str, action: str, pid: str, details: dict) -> str:
    payload = json.dumps([prev, ts, actor, action, pid, details], sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def append(db: Session, actor: str, action: str, purchase_id: str = "", details: dict | None = None) -> AuditEvent:
    details = json.loads(json.dumps(details or {}, default=str))
    last = db.query(AuditEvent).order_by(AuditEvent.id.desc()).first()
    prev = last.hash if last else GENESIS
    ts = datetime.now(timezone.utc).isoformat()
    ev = AuditEvent(ts=ts, actor=actor, action=action, purchase_id=purchase_id, details=details,
                    prev_hash=prev, hash=_hash(prev, ts, actor, action, purchase_id, details))
    db.add(ev)
    db.flush()
    return ev


def verify(db: Session) -> dict:
    prev = GENESIS
    n = 0
    for ev in db.query(AuditEvent).order_by(AuditEvent.id).all():
        n += 1
        if ev.prev_hash != prev or ev.hash != _hash(prev, ev.ts, ev.actor, ev.action, ev.purchase_id, ev.details):
            return {"valid": False, "checked": n, "first_bad_event_id": ev.id}
        prev = ev.hash
    return {"valid": True, "checked": n, "first_bad_event_id": None}
