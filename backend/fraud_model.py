
"""
MoMoGuard Fraud Inference Module
--------------------------------
Loads the HistGradientBoosting PaySim model and exposes a stable
interface for the Flask application.

Expected artifact:
{
    "model": trained HistGradientBoostingClassifier,
    "metadata": {...},
    "type_mapping": {...},
    "threshold": 0.97,
    "features": ["amount", "type"]
}
"""

import os
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np


class FraudModelUnavailable(RuntimeError):
    """Raised when the trained fraud model cannot be loaded."""


def model_path():
    """Resolve the model artifact path."""
    default_path = (
        Path(__file__).resolve().parent
        / "models"
        / "fraud_model.joblib"
    )

    configured_path = os.getenv("FRAUD_MODEL_PATH")

    return Path(configured_path) if configured_path else default_path


@lru_cache(maxsize=1)
def load_model():
    """
    Load and validate the trained model artifact.

    Returns the complete artifact dictionary.
    """
    path = model_path()

    if not path.exists():
        raise FraudModelUnavailable(
            f"Fraud model artifact not found: {path}"
        )

    try:
        artifact = joblib.load(path)

        required_keys = {
            "model",
            "metadata",
            "type_mapping",
            "threshold",
            "features",
        }

        missing = required_keys.difference(artifact.keys())

        if missing:
            raise ValueError(
                f"Model artifact is missing fields: {sorted(missing)}"
            )

        if artifact["features"] != ["amount", "type"]:
            raise ValueError(
                "Unexpected model feature schema. "
                "Expected ['amount', 'type']."
            )

        if not isinstance(artifact["type_mapping"], dict):
            raise ValueError("Invalid transaction type mapping.")

        if not 0 <= float(artifact["threshold"]) <= 1:
            raise ValueError("Invalid model threshold.")

        if not hasattr(artifact["model"], "predict_proba"):
            raise ValueError(
                "Loaded model does not support predict_proba."
            )

        return artifact

    except FraudModelUnavailable:
        raise

    except Exception as exc:
        raise FraudModelUnavailable(
            f"Could not load fraud model: {exc}"
        ) from exc


def _prepare_input(payload, artifact):
    """
    Convert an API transaction payload into the exact
    [amount, encoded transaction type] feature order.
    """
    if not isinstance(payload, dict):
        raise ValueError("Transaction payload must be an object.")

    try:
        amount = float(payload["amount"])
    except (KeyError, TypeError, ValueError):
        raise ValueError("A valid transaction amount is required.")

    if not np.isfinite(amount) or amount < 0:
        raise ValueError(
            "Transaction amount must be a finite, non-negative number."
        )

    transaction_type = payload.get("type")

    if not isinstance(transaction_type, str) or not transaction_type.strip():
        raise ValueError("A transaction type is required.")

    transaction_type = transaction_type.strip().upper()

    type_mapping = artifact["type_mapping"]

    if transaction_type not in type_mapping:
        supported = ", ".join(sorted(type_mapping.keys()))
        raise ValueError(
            f"Unsupported transaction type '{transaction_type}'. "
            f"Supported types: {supported}"
        )

    encoded_type = type_mapping[transaction_type]

    # Feature order must match the training script.
    features = np.array(
        [[amount, float(encoded_type)]],
        dtype=np.float32,
    )

    return features, amount, transaction_type


def assess(payload):
    """
    Assess a transaction using the trained HistGradientBoosting model.

    Returns the fields expected by the Flask application.
    """
    artifact = load_model()

    model = artifact["model"]
    metadata = artifact["metadata"]
    threshold = float(artifact["threshold"])

    features, amount, transaction_type = _prepare_input(
        payload,
        artifact,
    )

    try:
        probability = float(model.predict_proba(features)[0][1])
    except Exception as exc:
        raise FraudModelUnavailable(
            f"Fraud prediction failed: {exc}"
        ) from exc

    # Keep the existing application's 0–99 risk-score convention.
    probability = min(max(probability, 0.0), 1.0)
    risk_score = int(round(probability * 99))

    # Existing MoMoGuard risk categories.
    if risk_score >= 80:
        risk_level = "CRITICAL"
    elif risk_score >= 60:
        risk_level = "HIGH"
    elif risk_score >= 35:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    # The training threshold is selected using validation data.
    threshold_exceeded = probability >= threshold

    # Preserve the application's existing decision policy.
    if risk_score >= 80:
        decision = "BLOCKED"
    elif risk_score >= 45 or threshold_exceeded:
        decision = "REVIEW"
    else:
        decision = "ALLOWED"

    reasons = [
        f"Transaction type: {transaction_type}",
        f"Transaction amount: {amount:.2f}",
        (
            "Model fraud score: "
            f"{probability:.4f} "
            f"(validation threshold: {threshold:.2f})"
        ),
    ]

    if threshold_exceeded:
        reasons.append(
            "The model score meets or exceeds its validation-selected "
            "fraud classification threshold."
        )
    else:
        reasons.append(
            "The model score is below its validation-selected "
            "fraud classification threshold."
        )

    if decision == "BLOCKED":
        recommendation = (
            "Treat this transaction as critical risk and require "
            "additional security review."
        )
    elif decision == "REVIEW":
        recommendation = (
            "Review this transaction before proceeding."
        )
    else:
        recommendation = (
            "No additional review is indicated by the current "
            "risk decision policy."
        )

    return {
        "fraud_probability": probability,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "decision": decision,
        "reasons": reasons,
        "recommendation": recommendation,
        "model_name": metadata.get(
            "model_name",
            "momoguard-histgradientboosting-paysim",
        ),
        "model_version": metadata.get(
            "model_version",
            "2.0.0",
        ),
        "fraud_threshold": threshold,
        "threshold_exceeded": threshold_exceeded,
    }
