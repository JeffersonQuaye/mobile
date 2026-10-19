import unittest

from backend.fraud_model import assess, load_model


class FraudModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.artifact = load_model()
        cls.metrics = cls.artifact["metadata"]

    def test_accuracy_and_false_positive_thresholds(self):
        self.assertGreaterEqual(self.metrics["accuracy"], 0.80)
        self.assertLessEqual(self.metrics["false_positive_rate"], 0.10)
        self.assertGreaterEqual(self.metrics["precision"], 0.80)

    def test_safe_transaction_is_not_blocked(self):
        result = assess({"amount": 150, "new_recipient": False, "unusual_time": False, "new_device": False})
        self.assertNotEqual(result["decision"], "BLOCKED")
        self.assertEqual(result["model_version"], "1.0.0")
        self.assertTrue(result["reasons"])

    def test_high_risk_transaction_is_reviewed_or_blocked(self):
        result = assess({"amount": 2500, "new_recipient": True, "unusual_time": True, "new_device": True})
        self.assertIn(result["decision"], {"REVIEW", "BLOCKED"})
        self.assertEqual(result["model_name"], "momoguard-fraud-logistic-regression")
        self.assertTrue(result["reasons"])


if __name__ == "__main__":
    unittest.main()
