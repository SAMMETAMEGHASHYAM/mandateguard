"""Risk scoring for agent purchase proposals.
- Features are computed deterministically from the proposal and history.
- A GradientBoosting classifier (trained on SYNTHETIC data, see scripts/train_risk.py) outputs an advisory score.
- If no trained model file exists, a transparent heuristic is used instead.
The score is advisory and can only escalate to human review (see policy.py)."""
import os
import re
from datetime import datetime
import numpy as np

FEATURES = ["amount_ratio", "budget_util_after", "new_merchant", "off_hours", "velocity_1h",
            "injection_flag", "price_vs_typical", "justification_len", "quantity"]

INJECTION_PATTERNS = [
    r"ignore (all |any |the |your )?(previous |prior |above )?(instructions|limits|rules|policy|policies)",
    r"disregard", r"system prompt", r"override", r"bypass", r"without (asking|approval|confirmation)",
    r"do not (ask|tell|notify|alert)", r"auto[- ]?approve", r"you (must|have to) (buy|purchase|pay)",
    r"<\s*/?system\s*>", r"as the (admin|owner)", r"urgent(ly)?[:!]",
]
_INJ = re.compile("|".join(INJECTION_PATTERNS), re.IGNORECASE)


def detect_injection(text: str) -> bool:
    return bool(_INJ.search(text or ""))


def extract_features(*, amount_cents, mandate, quantity, typical_unit_cents, unit_cents, new_merchant,
                     spent_month_cents, velocity_1h, justification, now: datetime) -> dict:
    return {
        "amount_ratio": amount_cents / max(mandate.per_purchase_limit_cents, 1),
        "budget_util_after": (spent_month_cents + amount_cents) / max(mandate.monthly_limit_cents, 1),
        "new_merchant": float(new_merchant),
        "off_hours": float(now.hour < 6 or now.hour >= 23),
        "velocity_1h": float(velocity_1h),
        "injection_flag": float(detect_injection(justification)),
        "price_vs_typical": unit_cents / max(typical_unit_cents, 1),
        "justification_len": float(min(len(justification), 600)),
        "quantity": float(quantity),
    }


def vectorize(f: dict) -> np.ndarray:
    return np.array([[f[k] for k in FEATURES]], dtype=float)


def heuristic_score(f: dict) -> float:
    s = (0.35 * min(f["amount_ratio"], 1.5) / 1.5 + 0.2 * min(f["budget_util_after"], 1.5) / 1.5
         + 0.15 * f["new_merchant"] + 0.1 * f["off_hours"] + 0.1 * min(f["velocity_1h"], 4) / 4
         + 0.5 * f["injection_flag"] + 0.2 * max(0.0, min(f["price_vs_typical"] - 1, 2)) / 2)
    return float(min(1.0, s))


def explain(f: dict) -> list[dict]:
    """Threshold-based, human-readable factors (not model attributions)."""
    out = []
    if f["injection_flag"]: out.append({"factor": "injection_flag", "detail": "instruction-like text in justification"})
    if f["price_vs_typical"] > 1.5: out.append({"factor": "price_vs_typical", "detail": f"unit price {f['price_vs_typical']:.1f}x typical"})
    if f["amount_ratio"] > 0.6: out.append({"factor": "amount_ratio", "detail": f"{f['amount_ratio']*100:.0f}% of per-purchase limit"})
    if f["budget_util_after"] > 0.8: out.append({"factor": "budget_util_after", "detail": f"{f['budget_util_after']*100:.0f}% of monthly budget"})
    if f["new_merchant"]: out.append({"factor": "new_merchant", "detail": "first purchase from this merchant"})
    if f["velocity_1h"] >= 3: out.append({"factor": "velocity_1h", "detail": f"{int(f['velocity_1h'])} purchases in the last hour"})
    if f["off_hours"]: out.append({"factor": "off_hours", "detail": "outside normal hours"})
    return out


class RiskScorer:
    def __init__(self, model_path: str | None = None):
        self.model = None
        if model_path and os.path.exists(model_path):
            import joblib
            self.model = joblib.load(model_path)

    @property
    def kind(self) -> str:
        return "gradient_boosting(synthetic-trained)" if self.model else "heuristic"

    def score(self, f: dict) -> float:
        if self.model is None:
            return heuristic_score(f)
        return float(self.model.predict_proba(vectorize(f))[0, 1])


def generate_synthetic(n: int, seed: int, shift: float = 0.0, anomaly_rate: float = 0.12):
    """SYNTHETIC labelled data. label=1 means 'purchase an agent should not make unreviewed'
    (compromised/injected agent, runaway loop, price gouging). Distributions deliberately overlap
    (some benign purchases look unusual; some bad ones look subtle). `shift` perturbs the benign
    distribution to test robustness. Results on this data are NOT real-world performance."""
    rng = np.random.default_rng(seed)
    y = (rng.random(n) < anomaly_rate).astype(int)
    X = np.zeros((n, len(FEATURES)))
    for i in range(n):
        bad = y[i] == 1
        subtle = bad and rng.random() < 0.25          # bad but looks ordinary
        odd_benign = (not bad) and rng.random() < 0.07  # benign but looks unusual
        unusual = (bad and not subtle) or odd_benign
        ratio = rng.beta(5, 2) * 1.1 if unusual else rng.beta(2, 6) * (1 + shift)
        util = min(1.6, ratio * rng.uniform(0.2, 0.6) + (rng.beta(4, 2) if unusual else rng.beta(2, 5)))
        inj = float(bad and not subtle and rng.random() < 0.5)
        X[i] = [ratio, util,
                float(rng.random() < (0.7 if unusual else 0.12 + shift * 0.2)),
                float(rng.random() < (0.35 if bad else 0.06)),
                float(rng.poisson(2.5 if bad and not subtle else 0.4)),
                inj,
                rng.lognormal(0.5 if unusual else 0.0, 0.35),
                float(rng.integers(150, 600) if inj else rng.integers(20, 200)),
                float(rng.integers(1, 40) if unusual else rng.integers(1, 8))]
    return X, y
