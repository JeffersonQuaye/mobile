
import pandas as pd
import numpy as np
import joblib

from pathlib import Path
from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    fbeta_score
)

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = BASE_DIR / "data" / "PS_20174392719_1491204439457_log.csv"
MODEL_PATH = BASE_DIR / "ml" / "models" / "fraud_detection_model.pkl"

print("Loading dataset...")

df = pd.read_csv(DATA_PATH)
df = df.sort_values("step", kind="stable").reset_index(drop=True)

df["new_recipient"] = (
    df.groupby(["nameOrig", "nameDest"], sort=False)
    .cumcount()
    .eq(0)
    .astype("int8")
)

features = ["amount", "type", "step", "new_recipient"]

unique_steps = np.sort(df["step"].unique())

train_end = unique_steps[int(len(unique_steps) * 0.70)]
validation_end = unique_steps[int(len(unique_steps) * 0.85)]

validation_mask = (
    (df["step"] > train_end) &
    (df["step"] <= validation_end)
)

X_val = df.loc[validation_mask, features]
y_val = df.loc[validation_mask, "isFraud"]

print("Loading trained model...")

model = joblib.load(MODEL_PATH)

probabilities = model.predict_proba(X_val)[:, 1]

print("\nVALIDATION THRESHOLD COMPARISON")
print("-" * 85)

print(
    f"{'Threshold':<12}"
    f"{'Precision':<14}"
    f"{'Recall':<14}"
    f"{'F1':<12}"
    f"{'F2':<12}"
    f"{'Flagged':<12}"
)

for threshold in [
    0.05, 0.10, 0.15, 0.20, 0.25,
    0.30, 0.35, 0.40, 0.45, 0.50,
    0.60, 0.70, 0.76, 0.80
]:
    predictions = (probabilities >= threshold).astype(int)

    precision = precision_score(
        y_val, predictions, zero_division=0
    )

    recall = recall_score(
        y_val, predictions, zero_division=0
    )

    f1 = f1_score(
        y_val, predictions, zero_division=0
    )

    f2 = fbeta_score(
        y_val, predictions, beta=2, zero_division=0
    )

    flagged = predictions.sum()

    print(
        f"{threshold:<12.2f}"
        f"{precision:<14.4f}"
        f"{recall:<14.4f}"
        f"{f1:<12.4f}"
        f"{f2:<12.4f}"
        f"{flagged:<12}"
    )
