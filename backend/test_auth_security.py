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
        self.assertTrue(self.session["token"])
        self.assertTrue(self.session["refresh_token"])
        self.assertEqual(self.session["expires_in"], 900)

    def test_refresh_rotates_and_logout_revokes(self):
        response = self.client.post("/api/auth/refresh", json={"refresh_token": self.session["refresh_token"]})
        self.assertEqual(response.status_code, 200)
        rotated = response.get_json()
        self.assertNotEqual(rotated["refresh_token"], self.session["refresh_token"])
        self.assertEqual(self.client.post("/api/auth/refresh", json={"refresh_token": self.session["refresh_token"]}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/logout", json={"refresh_token": rotated["refresh_token"]}).status_code, 200)
        self.assertEqual(self.client.post("/api/auth/refresh", json={"refresh_token": rotated["refresh_token"]}).status_code, 401)


if __name__ == "__main__":
    unittest.main()
