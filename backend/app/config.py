"""Environment-based configuration. Secrets come ONLY from env vars / .env (never committed)."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_OWNER_KEY = "dev-owner-key"
DEFAULT_AGENT_KEY = "dev-agent-key"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./mandateguard.db"
    # simulation (default, offline, clearly labelled) | sandbox (real PayPal sandbox API)
    paypal_mode: str = "simulation"
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_webhook_id: str = ""
    paypal_base_url: str = "https://api-m.sandbox.paypal.com"
    allow_live_payments: bool = False  # production is never enabled implicitly
    sim_webhook_secret: str = "dev-only-simulator-secret"
    owner_api_key: str = DEFAULT_OWNER_KEY
    agent_api_key: str = DEFAULT_AGENT_KEY
    public_base_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-5-5"
    llm_daily_call_budget: int = 50
    llm_timeout_s: float = 15.0
    rate_limit_per_minute: int = 120
    risk_model_path: str = "models/risk_model.joblib"

    def validate_safety(self) -> None:
        if self.paypal_mode not in ("simulation", "sandbox"):
            raise RuntimeError("PAYPAL_MODE must be 'simulation' or 'sandbox'")
        if "api-m.paypal.com" in self.paypal_base_url and "sandbox" not in self.paypal_base_url:
            if not self.allow_live_payments:
                raise RuntimeError("Live PayPal base URL refused: set ALLOW_LIVE_PAYMENTS=true deliberately.")
        if self.paypal_mode == "sandbox":
            missing = [n for n, v in (("PAYPAL_CLIENT_ID", self.paypal_client_id),
                                      ("PAYPAL_CLIENT_SECRET", self.paypal_client_secret),
                                      ("PAYPAL_WEBHOOK_ID", self.paypal_webhook_id)) if not v]
            if missing:
                raise RuntimeError(f"Sandbox mode requires: {', '.join(missing)}")
            if self.owner_api_key == DEFAULT_OWNER_KEY or self.agent_api_key == DEFAULT_AGENT_KEY:
                raise RuntimeError("Sandbox mode requires non-default OWNER_API_KEY / AGENT_API_KEY")


@lru_cache
def get_settings() -> Settings:
    return Settings()
