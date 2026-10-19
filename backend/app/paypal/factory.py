from sqlalchemy.orm import sessionmaker
from ..config import Settings
from .sandbox import SandboxProvider
from .simulator import SimulatedProvider


def build_provider(settings: Settings, session_factory: sessionmaker):
    settings.validate_safety()
    if settings.paypal_mode == "sandbox":
        return SandboxProvider(
            settings.paypal_client_id, settings.paypal_client_secret, settings.paypal_webhook_id,
            settings.paypal_base_url,
            return_url=f"{settings.frontend_url}/?paypal=return", cancel_url=f"{settings.frontend_url}/?paypal=cancel")
    return SimulatedProvider(session_factory, settings.sim_webhook_secret, settings.public_base_url)
