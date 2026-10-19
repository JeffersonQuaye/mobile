import os
import re
import uuid
from datetime import datetime, timezone
import pytest

os.environ.setdefault("MOMOGUARD_AUTH_SECRET", "test-auth-secret-key-32-chars-minimum")
os.environ.setdefault("FLASK_ENV", "testing")

from backend import app as backend_app
from backend.logging_config import metrics


class MockRecord(dict):
    def __getitem__(self, item):
        return super().get(item)


class MockResult:
    def __init__(self, rows):
        self.rows = [MockRecord(r) for r in rows]

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows


class InMemoryDatabase:
    """
    Hermetic in-memory store simulating Postgres behavior for testing without external database dependency.
    """

    def __init__(self):
        self.users = {}
        self.auth_sessions = {}
        self.transactions = {}
        self.fraud_predictions = {}
        self.fraud_alerts = {}
        self.fraud_reports = {}
        self.user_settings = {}
        self.devices = {}
        self.push_tokens = {}
        self.ai_conversations = {}
        self.audit_logs = []

    def execute(self, query, params=None):
        q = " ".join(query.strip().split())
        params = list(params) if params else []

        # SELECT 1 (health check)
        if q.upper().startswith("SELECT 1"):
            return MockResult([{"?column?": 1}])

        # USERS
        if "INSERT INTO users" in q:
            # (full_name, phone, email, password_hash)
            user_id = uuid.uuid4()
            user = {
                "id": user_id,
                "full_name": params[0],
                "phone": params[1],
                "email": params[2].lower(),
                "password_hash": params[3],
                "role": "user",
                "phone_verified": True,
                "two_factor_enabled": False,
            }
            # check unique email
            for existing in self.users.values():
                if existing["email"].lower() == user["email"].lower():
                    from psycopg.errors import UniqueViolation
                    raise UniqueViolation("email unique violation")
            self.users[str(user_id)] = user
            self.user_settings[str(user_id)] = {
                "two_factor": False,
                "ai_monitoring": True,
                "real_time_alerts": True,
            }
            return MockResult([user])

        if "FROM users WHERE lower(email) = %s OR phone = %s" in q or "FROM users WHERE email = %s" in q:
            identifier = str(params[0]).lower()
            matched = [
                u for u in self.users.values()
                if u["email"].lower() == identifier or u["phone"] == identifier
            ]
            return MockResult(matched)

        if "SELECT id, full_name, phone, email, role, phone_verified, two_factor_enabled FROM users WHERE id = %s" in q:
            uid = str(params[0])
            matched = [self.users[uid]] if uid in self.users else []
            return MockResult(matched)

        # AUTH SESSIONS
        if "INSERT INTO auth_sessions" in q:
            sess_id = uuid.uuid4()
            sess = {
                "id": sess_id,
                "session_id": sess_id,
                "user_id": str(params[0]),
                "refresh_token_hash": params[1],
                "revoked_at": None,
            }
            self.auth_sessions[params[1]] = sess
            return MockResult([sess])

        if "FROM auth_sessions s JOIN users u" in q:
            token_hash_val = params[0]
            sess = self.auth_sessions.get(token_hash_val)
            if sess and sess.get("revoked_at") is None:
                user = self.users.get(str(sess["user_id"]))
                if user:
                    row = {**user, "session_id": sess["id"], "id": user["id"], "revoked_at": None}
                    return MockResult([row])
            return MockResult([])

        if "UPDATE auth_sessions SET revoked_at = now()" in q:
            if "WHERE id = %s" in q:
                target_id = str(params[0])
                for sess in self.auth_sessions.values():
                    if str(sess["id"]) == target_id:
                        sess["revoked_at"] = datetime.now(timezone.utc)
            elif "WHERE refresh_token_hash = %s" in q:
                token_hash_val = str(params[0])
                if token_hash_val in self.auth_sessions:
                    self.auth_sessions[token_hash_val]["revoked_at"] = datetime.now(timezone.utc)
            return MockResult([])

        # USER SETTINGS
        if "INSERT INTO user_settings" in q:
            uid = str(params[0])
            if uid not in self.user_settings:
                self.user_settings[uid] = {
                    "two_factor": False,
                    "ai_monitoring": True,
                    "real_time_alerts": True,
                }
            return MockResult([self.user_settings[uid]])

        if "SELECT two_factor, ai_monitoring, real_time_alerts FROM user_settings" in q:
            uid = str(params[0])
            settings = self.user_settings.get(uid, {"two_factor": False, "ai_monitoring": True, "real_time_alerts": True})
            return MockResult([settings])

        if "UPDATE user_settings SET" in q:
            uid = str(params[1])
            if uid not in self.user_settings:
                self.user_settings[uid] = {"two_factor": False, "ai_monitoring": True, "real_time_alerts": True}
            for k in ("two_factor", "ai_monitoring", "real_time_alerts"):
                if f"{k} = %s" in q:
                    self.user_settings[uid][k] = bool(params[0])
            return MockResult([self.user_settings[uid]])

        # TRANSACTIONS
        if "INSERT INTO transactions" in q:
            tx_id = uuid.uuid4()
            tx = {
                "id": tx_id,
                "user_id": str(params[0]),
                "reference": params[1],
                "amount": float(params[2]),
                "direction": params[3],
                "currency": params[4],
                "recipient_phone": params[5],
                "recipient": params[5],
                "transaction_type": params[6],
                "merchant": params[6],
                "location": params[7],
                "device_id": params[8],
                "device": "Authorized Mobile Device",
                "risk_score": 10,
                "status": "SAFE",
                "occurred_at": params[9] if len(params) > 9 else datetime.now(timezone.utc),
            }
            self.transactions[str(tx_id)] = tx
            return MockResult([tx])

        if "SELECT t.*, COALESCE(fp.risk_score, 0) risk_score" in q and "WHERE t.user_id = %s" in q:
            uid = str(params[0])
            if len(params) > 1:
                # single transaction by ID or reference
                tx_ref = str(params[1])
                items = [t for t in self.transactions.values() if t["user_id"] == uid and (str(t["id"]) == tx_ref or t["reference"] == tx_ref)]
                return MockResult(items)
            items = [t for t in self.transactions.values() if t["user_id"] == uid]
            return MockResult(items)

        if "SELECT COALESCE(SUM(CASE WHEN direction = 'IN'" in q:
            uid = str(params[0])
            items = [t for t in self.transactions.values() if t["user_id"] == uid]
            income = sum(t["amount"] for t in items if t["direction"] == "IN")
            spending = sum(t["amount"] for t in items if t["direction"] == "OUT")
            return MockResult([{"income": income, "spending": spending}])

        # FRAUD PREDICTIONS
        if "INSERT INTO fraud_predictions" in q:
            pred_id = uuid.uuid4()
            pred = {
                "id": pred_id,
                "transaction_id": params[0],
                "decision": params[6],
                "risk_score": params[4],
            }
            self.fraud_predictions[str(pred_id)] = pred
            tx_id_str = str(params[0])
            if tx_id_str in self.transactions:
                self.transactions[tx_id_str]["risk_score"] = params[4]
                if params[6] in ("REVIEW", "BLOCKED"):
                    self.transactions[tx_id_str]["status"] = "REVIEW"
            return MockResult([pred])

        # FRAUD ALERTS
        if "INSERT INTO fraud_alerts" in q:
            alert_id = uuid.uuid4()
            alert = {
                "id": alert_id,
                "transaction_id": params[0],
                "severity": params[2],
                "status": "NEW",
                "created_at": datetime.now(timezone.utc),
            }
            self.fraud_alerts[str(alert_id)] = alert
            return MockResult([alert])

        if "SELECT fa.id, fa.severity, fa.status, fa.created_at, t.reference" in q:
            uid = str(params[0])
            user_tx_ids = {str(t["id"]): t for t in self.transactions.values() if t["user_id"] == uid}
            items = []
            for a in self.fraud_alerts.values():
                tx = user_tx_ids.get(str(a["transaction_id"]))
                if tx:
                    items.append({
                        "id": a["id"],
                        "severity": a["severity"],
                        "status": a["status"],
                        "created_at": a["created_at"],
                        "reference": tx["reference"],
                        "amount": tx["amount"],
                        "currency": tx["currency"],
                        "recipient_phone": tx["recipient_phone"],
                    })
            return MockResult(items)

        if "UPDATE fraud_alerts fa SET status = 'RESOLVED'" in q:
            alert_id_str = str(params[1])
            if alert_id_str in self.fraud_alerts:
                self.fraud_alerts[alert_id_str]["status"] = "RESOLVED"
                return MockResult([self.fraud_alerts[alert_id_str]])
            return MockResult([])

        # FRAUD REPORTS
        if "INSERT INTO fraud_reports" in q:
            rep_id = uuid.uuid4()
            rep = {
                "id": rep_id,
                "user_id": params[0],
                "transaction_id": params[1],
                "category": params[2],
                "description": params[3],
                "status": "PENDING_REVIEW",
                "created_at": datetime.now(timezone.utc),
            }
            self.fraud_reports[str(rep_id)] = rep
            return MockResult([rep])

        # DEVICES
        if "INSERT INTO devices" in q:
            dev_id = uuid.uuid4()
            dev = {
                "id": dev_id,
                "user_id": str(params[0]),
                "name": params[1],
                "device_name": params[1],
                "platform": params[2],
                "fingerprint_hash": params[3],
                "trusted": True,
                "last_seen_at": datetime.now(timezone.utc),
            }
            self.devices[str(dev_id)] = dev
            return MockResult([dev])

        if "SELECT id, device_name name, platform, last_seen_at, trusted FROM devices" in q:
            uid = str(params[0])
            items = [d for d in self.devices.values() if d["user_id"] == uid]
            return MockResult(items)

        if "DELETE FROM devices" in q:
            dev_id = str(params[0])
            if dev_id in self.devices:
                del self.devices[dev_id]
            return MockResult([])

        if "SELECT id, trusted FROM devices" in q:
            dev_id = str(params[0])
            uid = str(params[1])
            items = [d for d in self.devices.values() if str(d["id"]) == dev_id and d["user_id"] == uid]
            return MockResult(items)

        # AI CONVERSATIONS
        if "INSERT INTO ai_conversations" in q:
            conv_id = uuid.uuid4()
            conv = {
                "id": conv_id,
                "user_id": str(params[0]),
                "transaction_id": params[1],
                "messages": params[2],
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
            self.ai_conversations[str(conv_id)] = conv
            return MockResult([conv])

        if "SELECT id, transaction_id, messages, created_at, updated_at FROM ai_conversations" in q:
            uid = str(params[0])
            items = [c for c in self.ai_conversations.values() if c["user_id"] == uid]
            return MockResult(items)

        # PUSH TOKENS
        if "INSERT INTO push_tokens" in q:
            token = {
                "user_id": str(params[0]),
                "token": params[1],
                "platform": params[2],
            }
            self.push_tokens[params[1]] = token
            return MockResult([token])

        # AUDIT LOGS
        if "INSERT INTO audit_logs" in q:
            self.audit_logs.append({
                "actor_id": params[0],
                "action": params[1],
                "entity_type": params[2],
                "entity_id": params[3],
            })
            return MockResult([])

        return MockResult([])

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


@pytest.fixture(autouse=True)
def mock_db_if_no_postgres(monkeypatch):
    """
    If no live Postgres database is reachable, automatically provides the in-memory database mock.
    """
    db_url = os.getenv("DATABASE_URL")
    use_mock = False

    if not db_url:
        use_mock = True
    else:
        try:
            import psycopg
            with psycopg.connect(db_url, connect_timeout=1) as conn:
                pass
        except Exception:
            use_mock = True

    if use_mock:
        in_memory = InMemoryDatabase()
        monkeypatch.setattr(backend_app, "database_connection", lambda: in_memory)
        return in_memory

    return None


@pytest.fixture
def app():
    backend_app.app.config["TESTING"] = True
    if hasattr(backend_app.limiter, "enabled"):
        backend_app.limiter.enabled = False
    return backend_app.app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def registered_user(client):
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
    return {"Authorization": f"Bearer {registered_user['token']}"}
