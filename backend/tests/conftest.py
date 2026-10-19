import os
os.environ.setdefault("DATABASE_URL", "sqlite://")
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from app.config import Settings
from app.db import make_engine
from app.main import create_app

OWNER = {"X-API-Key": "owner-test"}
AGENT = {"X-API-Key": "agent-test"}


@pytest.fixture
def settings():
    return Settings(database_url="sqlite://", owner_api_key="owner-test", agent_api_key="agent-test",
                    risk_model_path="models/risk_model.joblib", rate_limit_per_minute=10_000, anthropic_api_key="")


@pytest.fixture
def client(settings, tmp_path):
    # file-based SQLite on purpose: separate connections (provider vs request) surfaced a real 'database is locked' bug
    eng = make_engine(f"sqlite:///{tmp_path}/test.db")
    sf = sessionmaker(bind=eng, autoflush=False, expire_on_commit=False)
    app = create_app(settings, sf)
    with TestClient(app) as c:
        c.sf = sf
        c.app_ref = app
        yield c
