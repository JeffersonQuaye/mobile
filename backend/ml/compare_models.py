
import gc
import json
import joblib
import numpy as np
import pandas as pd

from pathlib import Path
from sklearn import __version__ as sklearn_version

from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline

from sklearn.ensemble import (
    RandomForestClassifier,
    HistGradientBoostingClassifier
)

from sklearn.linear_model import SGDClassifier

from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    average_precision_score,
    roc_auc_score,
    confusion_matrix
)


# ==========================================
# 1. PATHS AND CONFIGURATION
# ==========================================

BASE_DIR = Path(__file__).resolve().parents[1]

DATA_PATH = (
    BASE_DIR / "data" /
    "PS_20174392719_1491204439457_log.csv"
)

OUTPUT_DIR = BASE_DIR / "ml" / "models" / "comparison"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

RANDOM_STATE = 42

print("MoMoGuard Model Comparison")
print("Scikit-learn version:", sklearn_version)
print("Output directory:", OUTPUT_DIR)


# ==========================================
# 2. LOAD DATASET
# ==========================================

print("\nLoading PaySim dataset...")

df = pd.read_csv(
    DATA_PATH,
    usecols=["step", "type", "amount", "isFraud"],
    dtype={
        "step": "int32",
        "type": "category",
        "amount": "float32",
        "isFraud": "int8"
    }
)

print("Dataset shape:", df.shape)


# ==========================================
# 3. CHRONOLOGICAL SORTING
# ==========================================

print("\nSorting transactions chronologically...")

df = df.sort_values(
    "step",
    kind="stable"
).reset_index(drop=True)


# ==========================================
# 4. CHRONOLOGICAL DATA SPLITTING
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


X_train = df.loc[
    train_mask, ["amount", "type", "step"]
].copy()

y_train = df.loc[
    train_mask, "isFraud"
].copy()

X_val = df.loc[
    validation_mask, ["amount", "type", "step"]
].copy()

y_val = df.loc[
    validation_mask, "isFraud"
].copy()

X_test = df.loc[
    test_mask, ["amount", "type", "step"]
].copy()

y_test = df.loc[
    test_mask, "isFraud"
].copy()


print("Training records:", len(X_train))
print("Validation records:", len(X_val))
print("Testing records:", len(X_test))

print("\nFraud counts:")
print("Training:", int(y_train.sum()))
print("Validation:", int(y_val.sum()))
print("Testing:", int(y_test.sum()))


del df, train_mask, validation_mask, test_mask
gc.collect()


# ==========================================
# 5. PREPROCESSING
# ==========================================

def make_one_hot_preprocessor(scale_numeric=False):

    transformers = [
        (
            "categorical",
            OneHotEncoder(
                handle_unknown="ignore",
                sparse_output=True,
                dtype=np.float32
            ),
            ["type"]
        )
    ]

    if scale_numeric:

        numeric_pipeline = StandardScaler(
            with_mean=False
        )

    else:

        numeric_pipeline = "passthrough"

    transformers.append(
        (
            "numeric",
            numeric_pipeline,
            ["amount", "step"]
        )
    )

    return ColumnTransformer(
        transformers=transformers
    )


# ==========================================
# 6. HISTGRADIENTBOOSTING ENCODING
# ==========================================

print("\nCreating HistGradientBoosting category mapping...")

# Use categories available in the training data.
# Convert category names to strings for consistent API use.

type_categories = [
    str(category)
    for category in X_train["type"].cat.categories
]

type_mapping = {
    category: index
    for index, category in enumerate(type_categories)
}

print("Transaction type mapping:")
print(type_mapping)


# Save the mapping separately.
# Flask will need this file when making predictions.

TYPE_MAPPING_PATH = (
    OUTPUT_DIR /
    "histgradientboosting_type_mapping.pkl"
)

joblib.dump(
    type_mapping,
    TYPE_MAPPING_PATH
)

print("\nTransaction type mapping saved:")
print(TYPE_MAPPING_PATH)


def prepare_hgb_data(data):

    encoded_types = (
        data["type"]
        .astype(str)
        .map(type_mapping)
    )

    # Prevent unknown transaction types from silently
    # becoming missing categorical values.

    if encoded_types.isna().any():

        unknown_types = (
            data.loc[
                encoded_types.isna(), "type"
            ]
            .astype(str)
            .unique()
            .tolist()
        )

        raise ValueError(
            f"Unknown transaction types: {unknown_types}"
        )

    # Explicitly create a float32 array.
    # HistGradientBoosting expects the second column
    # to contain integer-coded categorical values.

    prepared_data = np.empty(
        (len(data), 3),
        dtype=np.float32
    )

    prepared_data[:, 0] = data["amount"].to_numpy(
        dtype=np.float32
    )

    prepared_data[:, 1] = encoded_types.to_numpy(
        dtype=np.float32
    )

    prepared_data[:, 2] = data["step"].to_numpy(
        dtype=np.float32
    )

    return prepared_data


# ==========================================
# 7. PREPARE HISTGRADIENTBOOSTING DATA
# ==========================================

print("\nPreparing gradient boosting data...")

X_train_hgb = prepare_hgb_data(X_train)
X_val_hgb = prepare_hgb_data(X_val)
X_test_hgb = prepare_hgb_data(X_test)

print("HistGradientBoosting data prepared.")

print("Training shape:", X_train_hgb.shape)
print("Validation shape:", X_val_hgb.shape)
print("Testing shape:", X_test_hgb.shape)


# ==========================================
# 8. DEFINE MODELS
# ==========================================

models = {

    "Random Forest": Pipeline(
        steps=[

            (
                "preprocessor",
                make_one_hot_preprocessor()
            ),

            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=100,
                    class_weight="balanced_subsample",
                    random_state=RANDOM_STATE,
                    n_jobs=-1
                )
            )

        ]
    ),

    "HistGradientBoosting": HistGradientBoostingClassifier(

        max_iter=100,
        learning_rate=0.1,
        max_leaf_nodes=31,
        l2_regularization=1.0,
        class_weight="balanced",

        categorical_features=[1],

        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=10,

        random_state=RANDOM_STATE

    ),

    "SGD Logistic Classifier": Pipeline(
        steps=[

            (
                "preprocessor",
                make_one_hot_preprocessor(
                    scale_numeric=True
                )
            ),

            (
                "classifier",
                SGDClassifier(
                    loss="log_loss",
                    class_weight="balanced",
                    max_iter=20,
                    tol=1e-3,
                    random_state=RANDOM_STATE,
                    n_jobs=-1
                )
            )

        ]
    )

}


# ==========================================
# 9. TRAIN MODELS AND SELECT THRESHOLDS
# ==========================================

validation_results = {}
model_paths = {}

thresholds = np.arange(
    0.01,
    1.00,
    0.01
)


# Pop each model from the dictionary as it is trained.
# This allows unused model objects to be released.

for model_name in list(models.keys()):

    model = models.pop(model_name)

    print("\n" + "=" * 55)
    print("TRAINING:", model_name)
    print("=" * 55)

    if model_name == "HistGradientBoosting":

        train_data = X_train_hgb
        validation_data = X_val_hgb

    else:

        train_data = X_train
        validation_data = X_val

    print("Training started...")

    model.fit(
        train_data,
        y_train
    )

    print("Training completed.")

    # --------------------------------------
    # VALIDATION
    # --------------------------------------

    print("\nCalculating validation probabilities...")

    val_probabilities = model.predict_proba(
        validation_data
    )[:, 1]

    best_f1 = -1
    best_threshold = None
    best_precision = 0
    best_recall = 0

    for threshold in thresholds:

        predictions = (
            val_probabilities >= threshold
        ).astype(int)

        precision = precision_score(
            y_val,
            predictions,
            zero_division=0
        )

        recall = recall_score(
            y_val,
            predictions,
            zero_division=0
        )

        f1 = f1_score(
            y_val,
            predictions,
            zero_division=0
        )

        if f1 > best_f1:

            best_f1 = f1
            best_threshold = float(threshold)
            best_precision = precision
            best_recall = recall

    print("\nVALIDATION RESULTS")

    print("Threshold:", best_threshold)
    print("Precision:", best_precision)
    print("Recall:", best_recall)
    print("F1-score:", best_f1)

    # --------------------------------------
    # SAVE MODEL AND THRESHOLD
    # --------------------------------------

    safe_name = (
        model_name.lower()
        .replace(" ", "_")
    )

    model_path = (
        OUTPUT_DIR /
        f"{safe_name}.pkl"
    )

    threshold_path = (
        OUTPUT_DIR /
        f"{safe_name}_threshold.pkl"
    )

    joblib.dump(
        model,
        model_path
    )

    joblib.dump(
        best_threshold,
        threshold_path
    )

    model_paths[model_name] = {

        "model": str(model_path),

        "threshold": str(threshold_path)

    }

    # Include the preprocessing mapping in the
    # HistGradientBoosting model's saved metadata.

    if model_name == "HistGradientBoosting":

        model_paths[model_name]["type_mapping"] = str(
            TYPE_MAPPING_PATH
        )

    validation_results[model_name] = {

        "threshold": best_threshold,

        "precision": best_precision,

        "recall": best_recall,

        "f1": best_f1

    }

    print("\nSaved model:", model_path)
    print("Saved threshold:", threshold_path)

    # --------------------------------------
    # MEMORY CLEANUP
    # --------------------------------------

    del model
    del val_probabilities

    gc.collect()


# ==========================================
# 10. SELECT BEST MODEL USING VALIDATION F1
# ==========================================

best_model_name = max(
    validation_results,
    key=lambda name: validation_results[name]["f1"]
)

print("\n" + "=" * 55)
print("BEST MODEL BASED ON VALIDATION F1")
print("=" * 55)

print("Model:", best_model_name)

print(
    "Validation F1:",
    validation_results[best_model_name]["f1"]
)


# ==========================================
# 11. FINAL TEST EVALUATION
# ==========================================

test_results = {}

for model_name, paths in model_paths.items():

    print("\n" + "=" * 55)
    print("TESTING:", model_name)
    print("=" * 55)

    model = joblib.load(
        paths["model"]
    )

    threshold = joblib.load(
        paths["threshold"]
    )

    if model_name == "HistGradientBoosting":

        test_data = X_test_hgb

    else:

        test_data = X_test

    probabilities = model.predict_proba(
        test_data
    )[:, 1]

    predictions = (
        probabilities >= threshold
    ).astype(int)

    precision = precision_score(
        y_test,
        predictions,
        zero_division=0
    )

    recall = recall_score(
        y_test,
        predictions,
        zero_division=0
    )

    f1 = f1_score(
        y_test,
        predictions,
        zero_division=0
    )

    pr_auc = average_precision_score(
        y_test,
        probabilities
    )

    roc_auc = roc_auc_score(
        y_test,
        probabilities
    )

    matrix = confusion_matrix(
        y_test,
        predictions,
        labels=[0, 1]
    )

    tn, fp, fn, tp = matrix.ravel()

    test_results[model_name] = {

        "threshold": threshold,

        "precision": precision,

        "recall": recall,

        "f1": f1,

        "pr_auc": pr_auc,

        "roc_auc": roc_auc,

        "true_negatives": int(tn),

        "false_positives": int(fp),

        "false_negatives": int(fn),

        "true_positives": int(tp)

    }

    print("\nTEST RESULTS")

    print("Threshold:", threshold)
    print("Precision:", round(precision, 4))
    print("Recall:", round(recall, 4))
    print("F1-score:", round(f1, 4))
    print("PR-AUC:", round(pr_auc, 4))
    print("ROC-AUC:", round(roc_auc, 4))

    print("\nConfusion matrix:")
    print(matrix)

    print("\nTrue Negatives:", tn)
    print("False Positives:", fp)
    print("False Negatives:", fn)
    print("True Positives:", tp)

    del model
    del probabilities
    del predictions

    gc.collect()


# ==========================================
# 12. SAVE MODEL COMPARISON
# ==========================================

comparison = []

for model_name in validation_results:

    validation = validation_results[model_name]

    testing = test_results[model_name]

    comparison.append({

        "Model": model_name,

        "Threshold": testing["threshold"],

        "Validation F1": validation["f1"],

        "Test Precision": testing["precision"],

        "Test Recall": testing["recall"],

        "Test F1": testing["f1"],

        "PR-AUC": testing["pr_auc"],

        "ROC-AUC": testing["roc_auc"],

        "False Positives": testing["false_positives"],

        "False Negatives": testing["false_negatives"]

    })


comparison_df = pd.DataFrame(comparison)

print("\n" + "=" * 70)
print("FINAL MODEL COMPARISON")
print("=" * 70)

print(
    comparison_df.to_string(
        index=False,
        float_format=lambda value: f"{value:.4f}"
    )
)


# ==========================================
# 13. SAVE COMPARISON RESULTS
# ==========================================

comparison_df.to_csv(
    OUTPUT_DIR / "model_comparison.csv",
    index=False
)


with open(
    OUTPUT_DIR / "model_comparison.json",
    "w"
) as file:

    json.dump(

        {

            "validation_results": validation_results,

            "test_results": test_results,

            "best_model_by_validation_f1": best_model_name,

            "feature_columns": [
                "amount",
                "type",
                "step"
            ],

            "histgradientboosting_type_mapping": type_mapping,

            "histgradientboosting_type_mapping_file": str(
                TYPE_MAPPING_PATH
            ),

            "sklearn_version": sklearn_version

        },

        file,

        indent=4

    )


# ==========================================
# 14. SAVE HGB DEPLOYMENT METADATA
# ==========================================

hgb_metadata = {

    "model_name": "HistGradientBoosting",

    "model_file": "histgradientboosting.pkl",

    "threshold_file": "histgradientboosting_threshold.pkl",

    "type_mapping_file": "histgradientboosting_type_mapping.pkl",

    "features": [
        "amount",
        "type",
        "step"
    ],

    "feature_order": [
        "amount",
        "encoded_type",
        "step"
    ],

    "categorical_feature_indices": [1],

    "type_mapping": type_mapping,

    "risk_threshold": joblib.load(
        OUTPUT_DIR / "histgradientboosting_threshold.pkl"
    ),

    "sklearn_version": sklearn_version

}


with open(
    OUTPUT_DIR / "histgradientboosting_metadata.json",
    "w"
) as file:

    json.dump(
        hgb_metadata,
        file,
        indent=4
    )


# ==========================================
# 15. COMPLETION
# ==========================================

print("\n" + "=" * 60)

print("MODEL COMPARISON COMPLETED SUCCESSFULLY")

print("=" * 60)

print("\nBest model:", best_model_name)

print("\nAll files saved in:")
print(OUTPUT_DIR)

print("\nHistGradientBoosting deployment files:")

print("- histgradientboosting.pkl")

print("- histgradientboosting_threshold.pkl")

print("- histgradientboosting_type_mapping.pkl")

print("- histgradientboosting_metadata.json")

print("\nComparison files:")

print("- model_comparison.csv")

print("- model_comparison.json")
