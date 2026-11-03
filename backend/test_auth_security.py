"""
Legacy integration tests for MoMoGuard authentication security flows.

These tests are skipped automatically when no DATABASE_URL is set (e.g. in CI
without a live PostgreSQL instance). They target the live database to validate
the full token lifecycle including persistent storage of rotated/revoked tokens.

To run:
    DATABASE_URL=postgresql://... pytest backend/test_auth_security.py -v

NOTE: The same flows are also covered in tests/test_integration_api.py using
the in-memory database, so this file primarily serves as a contract test against
a real database for pre-production verification.
"""

import os
import unittest
import uuid

os.environ.setdefault("DATABASE_URL", "")
os.environ.setdefault("MOMOGUARD_AUTH_SECRET", "auth-test-secret")

from backend import app as module


@unittest.skipIf(not os.getenv("DATABASE_URL"), "Requires active PostgreSQL database connection")
class AuthSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        """Bootstrap a test user against the live database before any test runs."""
        module.app.config["TESTING"] = True
        if hasattr(module.limiter, "enabled"):
            module.limiter.enabled = False
        cls.client = module.app.test_client()
        suffix = uuid.uuid4().hex[:8]
        response = cls.client.post(
            "/api/auth/register",
            json={
                "full_name": "Auth Test",
                "phone": f"+23320{str(uuid.uuid4().int)[-7:]}",
                "email": f"auth{suffix}@example.com",
                "password": "SecurePass123!",
            },
        )
        if response.status_code != 201:
            raise AssertionError(response.get_json())
        cls.session = response.get_json()

    def test_access_and_refresh_tokens_are_issued(self):
        """Registration must issue both a short-lived access token and a
        refresh token, with the expected TTL (15 minutes = 900 seconds)."""
        self.assertTrue(self.session["token"])
        self.assertTrue(self.session["refresh_token"])
        self.assertEqual(self.session["expires_in"], 900)

    def test_refresh_rotates_and_logout_revokes(self):
        """Using a refresh token must issue a new (different) refresh token
        and invalidate the old one. After logout, the new token must also
        be rejected."""
        response = self.client.post("/api/auth/refresh", json={"refresh_token": self.session["refresh_token"]})
        self.assertEqual(response.status_code, 200)
        rotated = response.get_json()
        # New refresh token must differ from the original
        self.assertNotEqual(rotated["refresh_token"], self.session["refresh_token"])
        # Old refresh token must now be rejected (401)
        self.assertEqual(self.client.post("/api/auth/refresh", json={"refresh_token": self.session["refresh_token"]}).status_code, 401)
        # Logout must succeed and revoke the new token
        self.assertEqual(self.client.post("/api/auth/logout", json={"refresh_token": rotated["refresh_token"]}).status_code, 200)
        # After logout, the rotated token must also be rejected
        self.assertEqual(self.client.post("/api/auth/refresh", json={"refresh_token": rotated["refresh_token"]}).status_code, 401)


if __name__ == "__main__":
    unittest.main()
