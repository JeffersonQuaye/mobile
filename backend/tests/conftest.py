"""
Pytest configuration and shared fixtures for the MoMoGuard backend test suite.

This module is auto-discovered by pytest and runs before any test collection.
It sets critical environment variables (AUTH_SECRET, FLASK_ENV) that the
application module reads at import time, then provides reusable fixtures:

Fixtures:
    mock_db_if_no_postgres  - (autouse) Swaps in an in-memory database when no
                              live PostgreSQL connection is available. This allows
                              the full test suite to run in CI without a database.
    app                     - Configures the Flask app for TESTING mode and
                              disables Flask-Limiter so rate limits don't break tests.
    client                  - Flask test client derived from `app`.
    registered_user         - Registers a unique user via the API and returns the
                              full JSON response (including token + refresh_token).
    auth_headers            - Authorization header dict ready for authenticated requests.
"""

import os
import re
import uuid
from datetime import datetime, timezone
import pytest

# Set required environment variables BEFORE importing the application module,
# because app.py reads these at module load time.
os.environ.setdefault("MOMOGUARD_AUTH_SECRET", "test-auth-secret-key-32-chars-minimum")
os.environ.setdefault("FLASK_ENV", "testing")

from backend import app as backend_app
from backend.logging_config import metrics
from backend.in_memory_db import InMemoryDatabase, MockRecord, MockResult



@pytest.fixture(autouse=True)
def mock_db_if_no_postgres(monkeypatch):
    """
    Auto-use fixture: detects whether a live PostgreSQL database is reachable.

    If DATABASE_URL is not set, or the connection attempt fails (e.g. in CI),
    the fixture monkey-patches `backend_app.database_connection` to return an
    InMemoryDatabase instance instead. This keeps tests hermetic and fast.

    Returns the InMemoryDatabase instance so individual tests can inspect its
    state, or None if a real database is being used.
    """
    db_url = os.getenv("DATABASE_URL")
    use_mock = False

    if not db_url:
        # No DATABASE_URL configured \u2014 always use the in-memory mock
        use_mock = True
    else:
        try:
            import psycopg
            # Probe the connection with a 1-second timeout; switch to mock on failure
            with psycopg.connect(db_url, connect_timeout=1) as conn:
                pass
        except Exception:
            use_mock = True

    if use_mock:
        in_memory = InMemoryDatabase()
        # Replace the connection factory so every request gets the mock DB
        monkeypatch.setattr(backend_app, "database_connection", lambda: in_memory)
        return in_memory

    return None


@pytest.fixture
def app():
    """Create and configure a Flask test application instance."""
    backend_app.app.config["TESTING"] = True
    # Disable rate limiting so repeated identical requests don't fail in tests
    if hasattr(backend_app.limiter, "enabled"):
        backend_app.limiter.enabled = False
    return backend_app.app


@pytest.fixture
def client(app):
    """Return a Flask test client configured for the test app."""
    return app.test_client()


@pytest.fixture
def registered_user(client):
    """
    Register a brand-new unique user via the API and return the full JSON response.

    Uses a UUID hex suffix to guarantee unique email / phone on every test run,
    preventing 409 Conflict errors from leftover data.
    """
    suffix = uuid.uuid4().hex[:6]
    res = client.post(
        "/api/auth/register",
        json={
            "full_name": f"Test User {suffix}",
            "phone": f"+23320{str(uuid.uuid4().int)[-7:]}",
            "email": f"testuser_{suffix}@example.com",
            "password": "Password123!",
        },
    )
    assert res.status_code == 201, res.get_json()
    return res.get_json()


@pytest.fixture
def auth_headers(registered_user):
    """Return a Bearer Authorization header dict for the registered test user."""
    return {"Authorization": f"Bearer {registered_user['token']}"}
