"""
Unit tests for MoMoGuard authentication utilities (backend/app.py).

These tests exercise the pure helper functions in isolation, without making any
HTTP requests or hitting the database.  They verify the correctness of:

- issue_token / TOKEN_SERIALIZER: that tokens are signed, structurally correct,
  and that tampered tokens are rejected.
- challenge_token: short-lived tokens used for 2FA and similar challenge flows.
- token_hash: SHA-256 hashing used to store token identifiers safely.
- public_user: the sanitisation function that strips internal fields before
  returning user objects in API responses.
- werkzeug password hashing: that generate_password_hash / check_password_hash
  round-trips work and wrong passwords are rejected.
"""

import hashlib
import pytest
from itsdangerous import BadSignature
from werkzeug.security import check_password_hash, generate_password_hash

from backend.app import (
    issue_token,
    token_hash,
    public_user,
    TOKEN_SERIALIZER,
    ACCESS_TOKEN_TTL,
    challenge_token,
)


class TestAuthUnits:
    def test_issue_token_generates_valid_signed_token(self):
        """Verify that issue_token returns a non-trivial string whose claims
        can be decoded and contain the expected user_id and token_type."""
        user = {"id": "12345678-1234-5678-1234-567812345678", "full_name": "Kojo Test"}
        token = issue_token(user)

        assert isinstance(token, str)
        assert len(token) > 20

        # Unpack token claims and assert structure
        claims = TOKEN_SERIALIZER.loads(token, max_age=ACCESS_TOKEN_TTL)
        assert claims["user_id"] == "12345678-1234-5678-1234-567812345678"
        assert claims["token_type"] == "access"

    def test_tampered_token_fails_validation(self):
        """Altering even a single character of a signed token must raise BadSignature."""
        user = {"id": "12345678-1234-5678-1234-567812345678"}
        token = issue_token(user)
        # Corrupt the last 4 characters to simulate token tampering
        tampered = token[:-4] + "fake"

        with pytest.raises(BadSignature):
            TOKEN_SERIALIZER.loads(tampered, max_age=ACCESS_TOKEN_TTL)

    def test_challenge_token_format(self):
        """challenge_token must embed the correct user_id, token_type='challenge',
        and the specified purpose claim."""
        user = {"id": "12345678-1234-5678-1234-567812345678"}
        c_token = challenge_token(user, "2fa")
        claims = TOKEN_SERIALIZER.loads(c_token, max_age=600)

        assert claims["user_id"] == user["id"]
        assert claims["token_type"] == "challenge"
        assert claims["purpose"] == "2fa"

    def test_token_hash_matches_sha256(self):
        """token_hash must produce the same output as a direct SHA-256 digest."""
        token_str = "secure-random-token-xyz"
        expected = hashlib.sha256(token_str.encode("utf-8")).hexdigest()
        assert token_hash(token_str) == expected

    def test_public_user_sanitizes_confidential_fields(self):
        """public_user must strip all internal/confidential fields from the raw
        database row before returning data in API responses."""
        raw_user = {
            "id": "abc-123",
            "full_name": "Ama Serwaa",
            "email": "ama@example.com",
            "phone": "+233244111222",
            "password_hash": "argon2$secret_hash_value",  # must be removed
            "phone_verified": True,                        # must be removed
            "two_factor_enabled": False,                   # must be removed
            "session_id": "sess-999",                      # must be removed
            "user_id": "abc-123",                          # must be removed
        }
        sanitized = public_user(raw_user)

        # Confidential fields must not appear in the API output
        assert "password_hash" not in sanitized
        assert "phone_verified" not in sanitized
        assert "two_factor_enabled" not in sanitized
        assert "session_id" not in sanitized
        assert "user_id" not in sanitized

        # Safe public fields must be preserved unchanged
        assert sanitized["full_name"] == "Ama Serwaa"
        assert sanitized["email"] == "ama@example.com"
        assert sanitized["phone"] == "+233244111222"

    def test_password_hash_verification(self):
        """Passwords must hash and verify correctly; wrong passwords must fail."""
        raw_pw = "MasterP@ssw0rd2026"
        hashed = generate_password_hash(raw_pw)

        assert check_password_hash(hashed, raw_pw) is True
        assert check_password_hash(hashed, "WrongPassword") is False
