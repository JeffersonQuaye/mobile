import json
import csv
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "fraud_transactions.csv"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "fraud_model.joblib"
METRICS_PATH = MODEL_DIR / "fraud_model_metrics.json"
MODEL_VERSION = "1.0.0"
FEATURES = ["amount", "new_recipient", "unusual_time", "new_device"]


def main():
    with DATA_PATH.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    features = np.array([[float(row[name]) for name in FEATURES] for row in rows])
    labels = np.array([int(row["label"]) for row in rows])
    x_train, x_test, y_train, y_test = train_test_split(
        features, labels, test_size=0.25, random_state=42, stratify=labels
    )
    model = Pipeline([
        ("scaler", StandardScaler()),
        ("classifier", LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42)),
    ])
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    true_negative, false_positive, false_negative, true_positive = confusion_matrix(y_test, predictions, labels=[0, 1]).ravel()
    metrics = {
        "model_name": "momoguard-fraud-logistic-regression",
        "model_version": MODEL_VERSION,
        "dataset": str(DATA_PATH.name),
        "samples": int(len(labels)),
        "test_samples": int(len(y_test)),
        "accuracy": round(float(accuracy_score(y_test, predictions)), 4),
        "precision": round(float(precision_score(y_test, predictions, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, predictions, zero_division=0)), 4),
        "false_positive_rate": round(float(false_positive / (false_positive + true_negative)), 4),
        "false_negative_rate": round(float(false_negative / (false_negative + true_positive)), 4),
        "confusion_matrix": {"true_negative": int(true_negative), "false_positive": int(false_positive), "false_negative": int(false_negative), "true_positive": int(true_positive)},
    }
    MODEL_DIR.mkdir(exist_ok=True)
    joblib.dump({"model": model, "metadata": metrics}, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
