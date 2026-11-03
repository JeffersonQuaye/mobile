
import pandas as pd
from pathlib import Path

# Locate the dataset
data_folder = Path(__file__).resolve().parents[1] / "data"
csv_files = list(data_folder.glob("*.csv"))

if not csv_files:
    raise FileNotFoundError(
        f"No CSV file found inside {data_folder}"
    )

dataset_path = csv_files[0]

print("Dataset:", dataset_path.name)

# Load the dataset
df = pd.read_csv(dataset_path)

# Basic inspection
print("\n--- DATASET SHAPE ---")
print(df.shape)

print("\n--- COLUMN NAMES ---")
print(df.columns.tolist())

print("\n--- FIRST FIVE RECORDS ---")
print(df.head())

print("\n--- DATA TYPES ---")
print(df.dtypes)

print("\n--- MISSING VALUES ---")
print(df.isnull().sum())

print("\n--- DUPLICATE RECORDS ---")
print(df.duplicated().sum())

# Fraud distribution
if "isFraud" in df.columns:
    print("\n--- FRAUD DISTRIBUTION ---")
    print(df["isFraud"].value_counts())

    print("\n--- FRAUD PERCENTAGES ---")
    print(
        df["isFraud"].value_counts(normalize=True) * 100
    )
else:
    print("WARNING: isFraud column not found.")
