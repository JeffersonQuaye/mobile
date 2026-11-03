import pandas as pd
from pathlib import Path

data_path = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "fraud_transactions.csv"
)

df = pd.read_csv(data_path)

print("TOTAL TRANSACTIONS:", len(df))

print("\nFRAUD DISTRIBUTION:")
print(df["label"].value_counts().sort_index())

print("\nFRAUD PERCENTAGES:")
print(
    (df["label"].value_counts(normalize=True) * 100)
    .sort_index()
    .round(2)
)

print("\nFEATURE VARIATION:")
for column in df.columns:
    print(f"{column}: {df[column].nunique()} unique values")

print("\nAVERAGE AMOUNT BY CLASS:")
print(df.groupby("label")["amount"].mean())
