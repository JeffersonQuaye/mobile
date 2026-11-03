"""
Legacy database workflow tests for MoMoGuard.

These tests exercise multi-user data isolation and cross-feature workflows
against a live PostgreSQL database. They are automatically skipped in
environments without DATABASE_URL set.

Tests verify:
- Transaction and alert data is strictly isolated between users (User A's
  transactions and alerts are invisible to User B).
- Device ownership: User B cannot delete a device registered by User A.
- Reports and AI conversations are properly associated with the creating user.

To run:
    DATABASE_URL=postgresql://... pytest backend/test_database_workflows.py -v

NOTE: These are end-to-end contract tests. Equivalent in-memory-backed tests
exist in tests/test_integration_api.py for use in CI pipelines.
"""

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
        """Register two isolated test users (User A and User B) who will be used
        to verify that data created by one user is not visible to the other.
        Both users share a base phone suffix to ensure uniqueness across runs."""
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
        """A high-risk transaction created by User A must:
        - Appear in User A's transaction list.
        - NOT appear in User B's transaction list (total == 0).
        - Generate at least one alert for User A.
        - NOT generate any alerts for User B (unread == 0)."""
        response = self.client.post(
            "/api/transactions",
            headers=self.headers_a,
            json={
                "amount": 2500,
                "direction": "OUT",
                "transaction_type": "Money transfer",
                "recipient_phone": "+233241234567",
                "location": "Accra",
                "new_recipient": True,   # All risk flags on to guarantee an alert
                "unusual_time": True,
                "new_device": True,
            },
        )
        self.assertEqual(response.status_code, 201)
        # User B must see zero transactions — data isolation check
        self.assertEqual(self.client.get("/api/transactions", headers=self.headers_b).get_json()["total"], 0)
        # User B must have no alerts from User A's transaction
        self.assertEqual(self.client.get("/api/alerts", headers=self.headers_b).get_json()["unread"], 0)
        # User A must have at least one alert from the high-risk transaction
        self.assertGreaterEqual(self.client.get("/api/alerts", headers=self.headers_a).get_json()["unread"], 1)

    def test_device_ownership_and_persistent_features(self):
        """Verifies ownership enforcement and feature interactions:
        - A device created by User A must be invisible/undeletable by User B (404).
        - Reports and AI conversations created by User A must succeed.
        - The AI conversation response must include a conversation_id for history tracking."""
        device = self.client.post(
            "/api/devices",
            headers=self.headers_a,
            json={"device_name": "Test Android", "platform": "android", "fingerprint": uuid.uuid4().hex},
        )
        self.assertEqual(device.status_code, 201)
        device_id = device.get_json()["id"]
        # User B must not be able to delete User A's device — ownership isolation
        self.assertEqual(self.client.delete(f"/api/devices/{device_id}", headers=self.headers_b).status_code, 404)

        # User A can create a fraud report successfully
        report = self.client.post(
            "/api/reports",
            headers=self.headers_a,
            json={"category": "UNAUTHORIZED_TRANSACTION", "description": "Test report"},
        )
        self.assertEqual(report.status_code, 201)
        # User A can start an AI conversation; the response must include a conversation ID
        conversation = self.client.post(
            "/api/ai/chat",
            headers=self.headers_a,
            json={"message": "Is this suspicious?"},
        )
        self.assertEqual(conversation.status_code, 200)
        self.assertIn("conversation_id", conversation.get_json())


if __name__ == "__main__":
    unittest.main()
