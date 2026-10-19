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
        user = {"id": "12345678-1234-5678-1234-567812345678", "full_name": "Kojo Test"}
        token = issue_token(user)

        assert isinstance(token, str)
        assert len(token) > 20

        # Unpack token claims
        claims = TOKEN_SERIALIZER.loads(token, max_age=ACCESS_TOKEN_TTL)
        assert claims["user_id"] == "12345678-1234-5678-1234-567812345678"
        assert claims["token_type"] == "access"

    def test_tampered_token_fails_validation(self):
        user = {"id": "12345678-1234-5678-1234-567812345678"}
        token = issue_token(user)
        tampered = token[:-4] + "fake"

        with pytest.raises(BadSignature):
            TOKEN_SERIALIZER.loads(tampered, max_age=ACCESS_TOKEN_TTL)

    def test_challenge_token_format(self):
        user = {"id": "12345678-1234-5678-1234-567812345678"}
        c_token = challenge_token(user, "2fa")
        claims = TOKEN_SERIALIZER.loads(c_token, max_age=600)

        assert claims["user_id"] == user["id"]
        assert claims["token_type"] == "challenge"
        assert claims["purpose"] == "2fa"

    def test_token_hash_matches_sha256(self):
        token_str = "secure-random-token-xyz"
        expected = hashlib.sha256(token_str.encode("utf-8")).hexdigest()
        assert token_hash(token_str) == expected

    def test_public_user_sanitizes_confidential_fields(self):
        raw_user = {
            "id": "abc-123",
            "full_name": "Ama Serwaa",
            "email": "ama@example.com",
            "phone": "+233244111222",
            "password_hash": "argon2$secret_hash_value",
            "phone_verified": True,
            "two_factor_enabled": False,
            "session_id": "sess-999",
            "user_id": "abc-123",
        }
        sanitized = public_user(raw_user)

        assert "password_hash" not in sanitized
        assert "phone_verified" not in sanitized
        assert "two_factor_enabled" not in sanitized
        assert "session_id" not in sanitized
        assert "user_id" not in sanitized

        assert sanitized["full_name"] == "Ama Serwaa"
        assert sanitized["email"] == "ama@example.com"
        assert sanitized["phone"] == "+233244111222"

    def test_password_hash_verification(self):
        raw_pw = "MasterP@ssw0rd2026"
        hashed = generate_password_hash(raw_pw)

        assert check_password_hash(hashed, raw_pw) is True
        assert check_password_hash(hashed, "WrongPassword") is False
