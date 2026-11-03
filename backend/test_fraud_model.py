"""
Tests for the MoMoGuard HistGradientBoosting inference engine.

Run from the project root:
    python -m unittest backend.test_fraud_model -v

Train the model first with:
    python -m backend.train_fraud_model
"""

import unittest

from backend.fraud_model import (
    FraudModelUnavailable,
    assess,
    load_model,
)


class FraudModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.artifact = load_model()
        cls.metadata = cls.artifact["metadata"]

    def test_artifact_has_expected_features_and_metadata(self):
        self.assertEqual(self.artifact["features"], ["amount", "type"])
        self.assertEqual(self.metadata["model_name"], "momoguard-histgradientboosting-paysim")
        self.assertIn("test_f1", self.metadata)
        self.assertIn("validation_threshold", self.metadata)

    def test_known_transfer_can_be_scored(self):
        result = assess({
            "amount": 150,
            "transaction_type": "Money transfer",
        })
        self.assertIn("fraud_probability", result)
        self.assertGreaterEqual(result["fraud_probability"], 0.0)
        self.assertLessEqual(result["fraud_probability"], 1.0)
        self.assertIn(result["risk_level"], {"LOW", "MEDIUM", "HIGH", "CRITICAL"})
        self.assertIn(result["decision"], {"ALLOWED", "REVIEW", "BLOCKED"})
        self.assertTrue(result["reasons"])
        self.assertEqual(result["model_name"], self.metadata["model_name"])

    def test_supported_paysim_types_are_accepted(self):
        for transaction_type in ("CASH_IN", "CASH_OUT", "DEBIT", "PAYMENT", "TRANSFER"):
            with self.subTest(transaction_type=transaction_type):
                result = assess({"amount": 100, "type": transaction_type})
                self.assertIn(result["decision"], {"ALLOWED", "REVIEW", "BLOCKED"})

    def test_unknown_type_is_rejected_instead_of_silently_mapped(self):
        with self.assertRaises(FraudModelUnavailable):
            assess({"amount": 100, "transaction_type": "Unclassified transaction"})

    def test_invalid_amount_is_rejected(self):
        with self.assertRaises(FraudModelUnavailable):
            assess({"amount": -5, "transaction_type": "TRANSFER"})


if __name__ == "__main__":
    unittest.main()
