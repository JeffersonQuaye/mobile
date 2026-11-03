
import pandas as pd
import numpy as np
import joblib

from pathlib import Path

from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier

from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    average_precision_score,
    roc_auc_score,
    precision_score,
    recall_score,
    f1_score
)

# ==========================================
# 1. PATHS
# ==========================================

BASE_DIR = Path(__file__).resolve().parents[1]

DATA_PATH = (
    BASE_DIR / "data" /
    "PS_20174392719_1491204439457_log.csv"
)

MODEL_DIR = BASE_DIR / "ml" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# ==========================================
# 2. LOAD DATA
# ==========================================

print("Loading PaySim dataset...")

df = pd.read_csv(DATA_PATH)

print("Dataset shape:", df.shape)

# ==========================================
# 3. SORT CHRONOLOGICALLY
# ==========================================

print("Sorting transactions...")

df = df.sort_values(
    "step",
    kind="stable"
).reset_index(drop=True)

# ==========================================
# 4. SELECT FEATURES
# ==========================================

# new_recipient is excluded in this experiment.
# PaySim does not contain a device identifier.

features = [
    "amount",
    "type",
    "step"
]

X = df[features].copy()
y = df["isFraud"].copy()

# ==========================================
# 5. CHRONOLOGICAL SPLIT
# ==========================================

print("\nCreating chronological splits...")

unique_steps = np.sort(df["step"].unique())

train_end = unique_steps[
    int(len(unique_steps) * 0.70)
]

validation_end = unique_steps[
    int(len(unique_steps) * 0.85)
]

train_mask = df["step"] <= train_end

validation_mask = (
    (df["step"] > train_end) &
    (df["step"] <= validation_end)
)

test_mask = df["step"] > validation_end

X_train = X.loc[train_mask]
y_train = y.loc[train_mask]

X_val = X.loc[validation_mask]
y_val = y.loc[validation_mask]

X_test = X.loc[test_mask]
y_test = y.loc[test_mask]

print("Training records:", len(X_train))
print("Validation records:", len(X_val))
print("Testing records:", len(X_test))

print("\nFraud counts:")
print("Train:", int(y_train.sum()))
print("Validation:", int(y_val.sum()))
print("Test:", int(y_test.sum()))

if (
    y_train.nunique() < 2
    or y_val.nunique() < 2
    or y_test.nunique() < 2
):
    raise ValueError(
        "A data split does not contain both classes."
    )

# ==========================================
# 6. PREPROCESSING
# ==========================================

preprocessor = ColumnTransformer(
    transformers=[
        (
            "categorical",
            OneHotEncoder(handle_unknown="ignore"),
            ["type"]
        ),
        (
            "numeric",
            "passthrough",
            ["amount", "step"]
        )
    ]
)

# ==========================================
# 7. RANDOM FOREST
# ==========================================

print("\nBuilding Random Forest...")

model = Pipeline(
    steps=[
        ("preprocessor", preprocessor),
        (
            "classifier",
            RandomForestClassifier(
                n_estimators=100,
                class_weight="balanced_subsample",
                random_state=42,
                n_jobs=-1
            )
        )
    ]
)

# ==========================================
# 8. TRAIN MODEL
# ==========================================

print("\nTraining model...")

model.fit(X_train, y_train)

print("Training completed.")

# ==========================================
# 9. SELECT BALANCED THRESHOLD
# ==========================================

print("\nSelecting threshold using validation data...")

val_probabilities = model.predict_proba(X_val)[:, 1]

thresholds = np.arange(0.05, 0.96, 0.01)

best_f1 = -1
best_threshold = None
best_precision = 0
best_recall = 0

for threshold in thresholds:

    val_predictions = (
        val_probabilities >= threshold
    ).astype(int)

    current_precision = precision_score(
        y_val,
        val_predictions,
        zero_division=0
    )

    current_recall = recall_score(
        y_val,
        val_predictions,
        zero_division=0
    )

    current_f1 = f1_score(
        y_val,
        val_predictions,
        zero_division=0
    )

    if current_f1 > best_f1:

        best_f1 = current_f1
        best_threshold = float(threshold)
        best_precision = current_precision
        best_recall = current_recall

print("\nBEST VALIDATION THRESHOLD")

print("Threshold:", best_threshold)
print("Precision:", best_precision)
print("Recall:", best_recall)
print("F1-score:", best_f1)

# ==========================================
# 10. SAVE MODEL AND THRESHOLD
# ==========================================

model_path = MODEL_DIR / "fraud_detection_model.pkl"

threshold_path = MODEL_DIR / "fraud_threshold.pkl"

joblib.dump(model, model_path)

joblib.dump(best_threshold, threshold_path)

print("\nModel saved:", model_path)
print("Threshold saved:", threshold_path)

# ==========================================
# 11. FINAL UNTOUCHED TEST EVALUATION
# ==========================================

print("\nEvaluating on untouched test data...")

test_probabilities = model.predict_proba(X_test)[:, 1]

test_predictions = (
    test_probabilities >= best_threshold
).astype(int)

# Calculate metrics

test_precision = precision_score(
    y_test,
    test_predictions,
    zero_division=0
)

test_recall = recall_score(
    y_test,
    test_predictions,
    zero_division=0
)

test_f1 = f1_score(
    y_test,
    test_predictions,
    zero_division=0
)

test_pr_auc = average_precision_score(
    y_test,
    test_probabilities
)

test_roc_auc = roc_auc_score(
    y_test,
    test_probabilities
)

matrix = confusion_matrix(
    y_test,
    test_predictions,
    labels=[0, 1]
)

tn, fp, fn, tp = matrix.ravel()

print("\n========== FINAL TEST RESULTS ==========")

print("Threshold:", best_threshold)
print("Precision:", round(test_precision, 4))
print("Recall:", round(test_recall, 4))
print("F1-score:", round(test_f1, 4))
print("PR-AUC:", round(test_pr_auc, 4))
print("ROC-AUC:", round(test_roc_auc, 4))

print("\nCONFUSION MATRIX")

print(matrix)

print("\nDETAILED CLASSIFICATION REPORT")

print(
    classification_report(
        y_test,
        test_predictions,
        target_names=["Legitimate", "Fraud"],
        zero_division=0
    )
)

print("\nPREDICTION COUNTS")

print("True Negatives:", tn)
print("False Positives:", fp)
print("False Negatives:", fn)
print("True Positives:", tp)

print(
    "Total transactions flagged:",
    int(test_predictions.sum())
)

print(
    "Total test transactions:",
    len(y_test)
)

print("\nEXPERIMENT COMPLETED SUCCESSFULLY")
