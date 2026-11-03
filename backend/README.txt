# MoMoGuard HistGradientBoosting deployment update

## Files in this package

Copy these files into the matching locations in your project:

- `backend/train_fraud_model.py`
- `backend/fraud_model.py`
- `backend/test_fraud_model.py`

`backend/app.py` does not need to be rewritten: the replacement `fraud_model.py`
preserves the `assess()`, `load_model()` and `FraudModelUnavailable` interface
used by your existing Flask application.

## Important feature change

The deployment model is retrained with `amount` and `type` only. PaySim's
`step` is excluded because it is simulation time and your live API does not
currently provide a defensible equivalent.

This is a new experiment. Do not reuse the previous three-feature model's
F1, PR-AUC or ROC-AUC figures as the new model's results.

## Installation and training

Run these commands from the project root (the directory containing `backend`):

```bash
pip install pandas numpy joblib scikit-learn
python -m backend.train_fraud_model
python -m unittest backend.test_fraud_model -v
```

The PaySim CSV must exist at:

`backend/data/PS_20174392719_1491204439457_log.csv`

The training script creates:

- `backend/models/fraud_model.joblib`
- `backend/models/fraud_model_metrics.json`

It does not overwrite the older comparison artifacts in
`backend/ml/models/comparison/`.

## Transaction type values

The inference engine accepts PaySim types:

- `CASH_IN`
- `CASH_OUT`
- `DEBIT`
- `PAYMENT`
- `TRANSFER`

It also normalizes common application labels such as `Money transfer`,
`Withdrawal`, `Deposit`, `Bill payment`, and `Airtime purchase`.

Unrecognized types are rejected rather than silently assigned to a category.
Your React Native app should send a consistent transaction type.

## Notes

- The returned score is not a calibrated probability of real-world Ghanaian fraud.
- PaySim is a synthetic mobile-money simulation, not actual MTN MoMo transaction data.
- The application's ALLOWED / REVIEW / BLOCKED result is a local risk policy.
  It does not directly block or reverse transactions at a mobile-money provider.
- Review the newly generated metrics before describing model performance in the thesis.
