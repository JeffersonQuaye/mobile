import os
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

FEATURES = ("amount", "new_recipient", "unusual_time", "new_device")
FEATURE_LABELS = {
    "amount": "Unusual transaction amount",
    "new_recipient": "New recipient",
    "unusual_time": "Unusual transaction time",
    "new_device": "New device",
}


class FraudModelUnavailable(RuntimeError):
    pass


def model_path():
    configured = os.getenv("FRAUD_MODEL_PATH")
    return Path(configured) if configured else Path(__file__).resolve().parent / "models" / "fraud_model.joblib"


@lru_cache(maxsize=1)
def load_model():
    path = model_path()
    if not path.exists():
        raise FraudModelUnavailable(f"Fraud model artifact is missing: {path}")
    artifact = joblib.load(path)
    if not isinstance(artifact, dict) or "model" not in artifact or "metadata" not in artifact:
        raise FraudModelUnavailable("Fraud model artifact has an invalid format")
    return artifact


def assess(payload):
    artifact = load_model()
    model = artifact["model"]
    values = np.array([[float(payload.get("amount", 0) or 0), int(bool(payload.get("new_recipient"))), int(bool(payload.get("unusual_time"))), int(bool(payload.get("new_device")))]])
    probability = float(model.predict_proba(values)[0, 1])
    score = max(0, min(99, round(probability * 100)))
    level = "CRITICAL" if score >= 80 else "HIGH" if score >= 60 else "MEDIUM" if score >= 35 else "LOW"
    decision = "BLOCKED" if score >= 80 else "REVIEW" if score >= 45 else "ALLOWED"
    reasons = []
    classifier = model.named_steps["classifier"]
    scaler = model.named_steps["scaler"]
    contributions = classifier.coef_[0] * ((values[0] - scaler.mean_) / scaler.scale_)
    for index in np.argsort(contributions)[::-1]:
        if contributions[index] <= 0:
            continue
        feature = FEATURES[index]
        if feature == "amount" and values[0, index] < 500:
            continue
        if feature != "amount" and not values[0, index]:
            continue
        reasons.append({"title": FEATURE_LABELS[feature], "detail": f"The trained model identified {FEATURE_LABELS[feature].lower()} as a positive fraud signal."})
    if not reasons:
        reasons.append({"title": "Routine activity pattern", "detail": "The trained model found no dominant positive fraud signal."})
    return {
        "fraud_probability": round(probability, 4),
        "risk_score": score,
        "risk_level": level,
        "decision": decision,
        "reasons": reasons[:4],
        "recommendation": "Pause and verify independently before sending." if decision != "ALLOWED" else "No strong warning signals were detected.",
        "model_name": artifact["metadata"]["model_name"],
        "model_version": artifact["metadata"]["model_version"],
    }
