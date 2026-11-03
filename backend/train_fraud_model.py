"""
MoMoGuard HistGradientBoosting Training Pipeline
------------------------------------------------
Trains the deployment model using PaySim with the same feature schema
available to the Flask API: amount and transaction type.

PaySim's `step` is deliberately excluded because it is a simulation-time
feature and the live API does not provide an equivalent value.

Run from the project root:
    python -m backend.train_fraud_model
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "PS_20174392719_1491204439457_log.csv"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "fraud_model.joblib"
METRICS_PATH = MODEL_DIR / "fraud_model_metrics.json"

MODEL_NAME = "momoguard-histgradientboosting-paysim"
MODEL_VERSION = "2.0.0"
RANDOM_STATE = 42


def prepare_features(frame, type_mapping):
    """Return [amount, encoded transaction type] in the exact training order."""
    amount = frame["amount"].to_numpy(dtype=np.float32)
    type_codes = (
        frame["type"].astype(str).map(type_mapping)
    )
    if type_codes.isna().any():
        unknown = sorted(frame.loc[type_codes.isna(), "type"].astype(str).unique())
        raise ValueError(f"Unknown transaction types in dataset: {unknown}")
    type_codes = type_codes.to_numpy(dtype=np.float32)
    return np.column_stack((amount, type_codes))


def chronological_split(frame):
    """Split by time-ordered unique PaySim steps: 70% / 15% / 15%."""
    unique_steps = np.sort(frame["step"].unique())
    train_end = unique_steps[int(len(unique_steps) * 0.70)]
    validation_end = unique_steps[int(len(unique_steps) * 0.85)]

    train = frame[frame["step"] <= train_end]
    validation = frame[
        (frame["step"] > train_end) & (frame["step"] <= validation_end)
    ]
    test = frame[frame["step"] > validation_end]
    return train, validation, test


def select_threshold(y_true, probabilities):
    """Choose the F1-maximizing threshold on validation data only."""
    thresholds = np.arange(0.01, 1.00, 0.01)
    best = None
    for threshold in thresholds:
        predictions = (probabilities >= threshold).astype(int)
        precision = precision_score(y_true, predictions, zero_division=0)
        recall = recall_score(y_true, predictions, zero_division=0)
        f1 = f1_score(y_true, predictions, zero_division=0)
        candidate = {
            "threshold": float(threshold),
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
        }
        if best is None or candidate["f1"] > best["f1"]:
            best = candidate
    return best


def main():
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"PaySim dataset not found at {DATA_PATH}. "
            "Check the CSV filename in backend/data."
        )

    print("Loading PaySim dataset...")
    df = pd.read_csv(
        DATA_PATH,
        usecols=["step", "type", "amount", "isFraud"],
        dtype={
            "step": "int32",
            "type": "category",
            "amount": "float32",
            "isFraud": "int8",
        },
    )
    print("Dataset shape:", df.shape)

    df = df.sort_values("step", kind="stable").reset_index(drop=True)
    train_df, val_df, test_df = chronological_split(df)

    print("Training records:", len(train_df))
    print("Validation records:", len(val_df))
    print("Testing records:", len(test_df))
    print(
        "Fraud counts:",
        int(train_df["isFraud"].sum()),
        int(val_df["isFraud"].sum()),
        int(test_df["isFraud"].sum()),
    )

    # Fit category mapping from training data only.
    categories = sorted(train_df["type"].astype(str).unique().tolist())
    type_mapping = {name: index for index, name in enumerate(categories)}
    print("Transaction type mapping:", type_mapping)

    X_train = prepare_features(train_df, type_mapping)
    y_train = train_df["isFraud"].to_numpy(dtype=np.int8)
    X_val = prepare_features(val_df, type_mapping)
    y_val = val_df["isFraud"].to_numpy(dtype=np.int8)
    X_test = prepare_features(test_df, type_mapping)
    y_test = test_df["isFraud"].to_numpy(dtype=np.int8)

    model = HistGradientBoostingClassifier(
        max_iter=100,
        learning_rate=0.1,
        max_leaf_nodes=31,
        l2_regularization=1.0,
        class_weight="balanced",
        categorical_features=[1],
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=10,
        random_state=RANDOM_STATE,
    )

    print("Training HistGradientBoosting...")
    model.fit(X_train, y_train)

    val_probabilities = model.predict_proba(X_val)[:, 1]
    threshold_result = select_threshold(y_val, val_probabilities)
    threshold = threshold_result["threshold"]
    print("Validation threshold:", threshold)
    print("Validation F1:", threshold_result["f1"])

    # Evaluate the frozen model and threshold once on the chronological test set.
    test_probabilities = model.predict_proba(X_test)[:, 1]
    test_predictions = (test_probabilities >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(
        y_test, test_predictions, labels=[0, 1]
    ).ravel()

    metrics = {
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "dataset": DATA_PATH.name,
        "dataset_type": "synthetic PaySim mobile-money simulation",
        "sklearn_version": sklearn.__version__,
        "features": ["amount", "type"],
        "excluded_features": {
            "step": "PaySim simulation-time feature; no equivalent is supplied by the live API"
        },
        "samples": int(len(df)),
        "train_samples": int(len(train_df)),
        "validation_samples": int(len(val_df)),
        "test_samples": int(len(test_df)),
        "training_fraud_count": int(y_train.sum()),
        "validation_fraud_count": int(y_val.sum()),
        "test_fraud_count": int(y_test.sum()),
        "validation_threshold": threshold,
        "validation_precision": threshold_result["precision"],
        "validation_recall": threshold_result["recall"],
        "validation_f1": threshold_result["f1"],
        "test_accuracy": float(accuracy_score(y_test, test_predictions)),
        "test_precision": float(precision_score(y_test, test_predictions, zero_division=0)),
        "test_recall": float(recall_score(y_test, test_predictions, zero_division=0)),
        "test_f1": float(f1_score(y_test, test_predictions, zero_division=0)),
        "test_pr_auc": float(average_precision_score(y_test, test_probabilities)),
        "test_roc_auc": float(roc_auc_score(y_test, test_probabilities)),
        "confusion_matrix": {
            "true_negative": int(tn),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "true_positive": int(tp),
        },
    }

    artifact = {
        "model": model,
        "metadata": metrics,
        "type_mapping": type_mapping,
        "threshold": threshold,
        "features": ["amount", "type"],
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print("\nTraining completed.")
    print(json.dumps(metrics, indent=2))
    print("Saved model artifact:", MODEL_PATH)
    print("Saved metrics:", METRICS_PATH)


if __name__ == "__main__":
    main()
