from fraud_model import assess

test_cases = [
    {"amount": 1, "type": "PAYMENT"},
    {"amount": 100, "type": "PAYMENT"},
    {"amount": 500, "type": "PAYMENT"},
    {"amount": 1000, "type": "PAYMENT"},
    {"amount": 1, "type": "TRANSFER"},
    {"amount": 100, "type": "TRANSFER"},
    {"amount": 500, "type": "TRANSFER"},
    {"amount": 1000, "type": "TRANSFER"},
    {"amount": 100, "type": "CASH_OUT"},
    {"amount": 500, "type": "CASH_OUT"},
]

for case in test_cases:
    result = assess(case)

    print(
        f"Amount: {case['amount']:>6} | "
        f"Type: {case['type']:<10} | "
        f"Probability: {result['fraud_probability']:.6f} | "
        f"Risk: {result['risk_score']} | "
        f"Decision: {result['decision']}"
    )