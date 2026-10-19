import os
import unittest
import uuid

os.environ.setdefault("DATABASE_URL", "")
os.environ.setdefault("MOMOGUARD_AUTH_SECRET", "database-workflow-test-secret")

from backend import app as module


@unittest.skipIf(not os.getenv("DATABASE_URL"), "Requires active PostgreSQL database connection")
class DatabaseWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = module.app.test_client()
        module.app.config["TESTING"] = True
        if hasattr(module.limiter, "enabled"):
            module.limiter.enabled = False
        suffix = uuid.uuid4().hex[:8]
        phone_suffix = str(uuid.uuid4().int)[-7:]
        response_a = cls.client.post(
            "/api/auth/register",
            json={
                "full_name": "Isolation A",
                "phone": f"+23320{phone_suffix}",
                "email": f"isolationa{suffix}@example.com",
                "password": "SecurePass123!",
            },
        )
        cls.user_a = response_a.get_json()
        response_b = cls.client.post(
            "/api/auth/register",
            json={
                "full_name": "Isolation B",
                "phone": f"+23321{phone_suffix}",
                "email": f"isolationb{suffix}@example.com",
                "password": "SecurePass123!",
            },
        )
        cls.user_b = response_b.get_json()
        if response_a.status_code != 201 or response_b.status_code != 201:
            raise AssertionError((response_a.status_code, response_a.get_json(), response_b.status_code, response_b.get_json()))
        cls.headers_a = {"Authorization": f"Bearer {cls.user_a['token']}"}
        cls.headers_b = {"Authorization": f"Bearer {cls.user_b['token']}"}

    def test_transaction_isolation_and_alert_creation(self):
        response = self.client.post(
            "/api/transactions",
            headers=self.headers_a,
            json={
                "amount": 2500,
                "direction": "OUT",
                "transaction_type": "Money transfer",
                "recipient_phone": "+233241234567",
                "location": "Accra",
                "new_recipient": True,
                "unusual_time": True,
                "new_device": True,
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.get("/api/transactions", headers=self.headers_b).get_json()["total"], 0)
        self.assertEqual(self.client.get("/api/alerts", headers=self.headers_b).get_json()["unread"], 0)
        self.assertGreaterEqual(self.client.get("/api/alerts", headers=self.headers_a).get_json()["unread"], 1)

    def test_device_ownership_and_persistent_features(self):
        device = self.client.post(
            "/api/devices",
            headers=self.headers_a,
            json={"device_name": "Test Android", "platform": "android", "fingerprint": uuid.uuid4().hex},
        )
        self.assertEqual(device.status_code, 201)
        device_id = device.get_json()["id"]
        self.assertEqual(self.client.delete(f"/api/devices/{device_id}", headers=self.headers_b).status_code, 404)

        report = self.client.post(
            "/api/reports",
            headers=self.headers_a,
            json={"category": "UNAUTHORIZED_TRANSACTION", "description": "Test report"},
        )
        self.assertEqual(report.status_code, 201)
        conversation = self.client.post(
            "/api/ai/chat",
            headers=self.headers_a,
            json={"message": "Is this suspicious?"},
        )
        self.assertEqual(conversation.status_code, 200)
        self.assertIn("conversation_id", conversation.get_json())


if __name__ == "__main__":
    unittest.main()
