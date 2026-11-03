
from backend.fraud_model import assess, load_model


def main():
    artifact = load_model()

    print("MODEL:", artifact["metadata"]["model_name"])
    print("VERSION:", artifact["metadata"]["model_version"])
    print("FEATURES:", artifact["features"])
    print("TYPE MAPPING:", artifact["type_mapping"])
    print("THRESHOLD:", artifact["threshold"])

    test_transactions = [
        {"amount": 100, "type": "CASH_OUT"},
        {"amount": 5000, "type": "TRANSFER"},
        {"amount": 250, "type": "PAYMENT"},
        {"amount": 1000, "type": "CASH_IN"},
    ]

    for transaction in test_transactions:
        print("\nTransaction:", transaction)

        result = assess(transaction)

        print("Fraud score:", result["fraud_probability"])
        print("Risk score:", result["risk_score"])
        print("Risk level:", result["risk_level"])
        print("Decision:", result["decision"])
        print("Model version:", result["model_version"])


if __name__ == "__main__":
    main()
