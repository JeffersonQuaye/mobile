"""
MoMoGuard In-Memory Database Simulator
-------------------------------------
This module provides a hermetic in-memory database simulating PostgreSQL queries.
It allows the entire application (Flask API + React Native client) to run immediately in
local development or test environments with zero external database setup required.

Key Capabilities:
1. Emulates psycopg dict_row cursor behavior (fetchone, fetchall, column indexing).
2. Simulates schema tables: users, auth_sessions, transactions, user_settings,
   fraud_alerts, fraud_reports, devices, push_tokens, and audit_logs.
3. Automatically seeds a demo account ('jefferson@example.com' / 'DemoPass123!') with sample
   transactions and security preferences.
"""

import os
import uuid
from datetime import datetime, timezone
from flask import json
from werkzeug.security import generate_password_hash


class MockRecord(dict):
    """Wraps dictionary rows to allow dictionary key access similar to psycopg Row objects."""
    def __getitem__(self, item):
        return super().get(item)


class MockResult:
    """Simulates a database cursor query result supporting fetchone() and fetchall()."""
    def __init__(self, rows):
        self.rows = [MockRecord(r) for r in rows]

    def fetchone(self):
        """Fetches the first matching record or None."""
        return self.rows[0] if self.rows else None

    def fetchall(self):
        """Fetches all matching records."""
        return self.rows


class InMemoryDatabase:
    """
    Hermetic in-memory store simulating Postgres behavior for testing and local development
    without external PostgreSQL database dependency.
    """

    def __init__(self, seed_demo=True):
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

        if seed_demo:
            self._seed_demo_account()

    def _seed_demo_account(self):
        demo_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
        demo_user = {
            "id": demo_id,
            "full_name": "Jefferson Kwabena",
            "phone": "+233201234567",
            "email": "jefferson@example.com",
            "password_hash": generate_password_hash("DemoPass123!"),
            "role": "user",
            "phone_verified": True,
            "two_factor_enabled": False,
        }
        self.users[str(demo_id)] = demo_user
        self.user_settings[str(demo_id)] = {
            "two_factor": False,
            "ai_monitoring": True,
            "real_time_alerts": True,
            "security_alerts": True,
            "transaction_updates": True,
            "product_updates": False,
        }

        # Seed initial demo transactions
        tx1_id = uuid.UUID("22222222-2222-2222-2222-222222222221")
        tx2_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
        self.transactions[str(tx1_id)] = {
            "id": tx1_id,
            "user_id": str(demo_id),
            "reference": "TXN-8849201",
            "amount": 250.0,
            "direction": "OUT",
            "currency": "GHS",
            "recipient_phone": "+233549001122",
            "recipient": "MTN Merchant - Accra Mall",
            "transaction_type": "MERCHANT_PAYMENT",
            "merchant": "MTN Merchant - Accra Mall",
            "location": "Accra, Greater Accra",
            "device_id": None,
            "device": "Primary Phone",
            "risk_score": 12,
            "status": "SAFE",
            "occurred_at": datetime.now(timezone.utc),
        }
        self.transactions[str(tx2_id)] = {
            "id": tx2_id,
            "user_id": str(demo_id),
            "reference": "TXN-8849202",
            "amount": 1200.0,
            "direction": "IN",
            "currency": "GHS",
            "recipient_phone": "+233201234567",
            "recipient": "Salary Deposit",
            "transaction_type": "TRANSFER",
            "merchant": "Direct Deposit",
            "location": "Accra, Greater Accra",
            "device_id": None,
            "device": "Authorized Mobile Device",
            "risk_score": 5,
            "status": "SAFE",
            "occurred_at": datetime.now(timezone.utc),
        }

    def execute(self, query, params=None):
        q = " ".join(query.strip().split())
        params = list(params) if params else []

        # SELECT 1 (health check)
        if q.upper().startswith("SELECT 1"):
            return MockResult([{"?column?": 1}])

        # USERS
        if "INSERT INTO users" in q:
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
                "security_alerts": True,
                "transaction_updates": True,
                "product_updates": False,
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
                    "security_alerts": True,
                    "transaction_updates": True,
                    "product_updates": False,
                }
            return MockResult([self.user_settings[uid]])

        if "SELECT two_factor, ai_monitoring, real_time_alerts FROM user_settings" in q or "SELECT two_factor" in q:
            uid = str(params[0])
            settings = self.user_settings.get(uid, {
                "two_factor": False,
                "ai_monitoring": True,
                "real_time_alerts": True,
                "security_alerts": True,
                "transaction_updates": True,
                "product_updates": False,
            })
            return MockResult([settings])

        if "UPDATE user_settings SET" in q:
            uid = str(params[-1])
            if uid not in self.user_settings:
                self.user_settings[uid] = {
                    "two_factor": False,
                    "ai_monitoring": True,
                    "real_time_alerts": True,
                    "security_alerts": True,
                    "transaction_updates": True,
                    "product_updates": False,
                }
            param_idx = 0
            for k in ("two_factor", "ai_monitoring", "real_time_alerts", "security_alerts", "transaction_updates", "product_updates"):
                if f"{k} = %s" in q:
                    if param_idx < len(params) - 1:
                        self.user_settings[uid][k] = bool(params[param_idx])
                        param_idx += 1
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



        # GET TRANSACTIONS WITH THEIR LATEST FRAUD PREDICTIONS
        if (
            "FROM transactions t" in q
            and "WHERE t.user_id = %s" in q
        ):
            user_id = str(params[0])

            matching_transactions = [
                tx for tx in self.transactions.values()
                if str(tx.get("user_id")) == user_id
            ]

            rows = []

            for tx in matching_transactions:
                tx_id = str(tx["id"])

                predictions = [
                    p for p in self.fraud_predictions.values()
                    if str(p.get("transaction_id")) == tx_id
                ]

                latest_prediction = max(
                    predictions,
                    key=lambda p: p.get("created_at") or datetime.min.replace(
                        tzinfo=timezone.utc
                    ),
                    default={}
                )
                
                print("TRANSACTION:", tx.get("reference"))
                print("PREDICTIONS FOUND:", len(predictions))
                print("LATEST PREDICTION:", latest_prediction)

                row = {
                    **tx,
                    "prediction_id": latest_prediction.get("id"),
                    "model_name": latest_prediction.get("model_name"),
                    "model_version": latest_prediction.get("model_version"),
                    "fraud_probability": latest_prediction.get("fraud_probability"),
                    "risk_score": latest_prediction.get(
                        "risk_score", tx.get("risk_score")
                    ),
                    "risk_level": latest_prediction.get("risk_level"),
                    "decision": latest_prediction.get(
                        "decision", tx.get("decision", "PENDING")
                    ),
                    "reasons": latest_prediction.get("reasons", []),
                }

                rows.append(row)

            rows.sort(
                key=lambda row: row.get("occurred_at") or datetime.min.replace(
                    tzinfo=timezone.utc
                ),
                reverse=True
            )

            return MockResult(rows)



        if "SELECT COALESCE(SUM(CASE WHEN direction = 'IN'" in q:
            uid = str(params[0])
            items = [t for t in self.transactions.values() if t["user_id"] == uid]
            income = sum(t["amount"] for t in items if t["direction"] == "IN")
            spending = sum(t["amount"] for t in items if t["direction"] == "OUT")
            return MockResult([{"income": income, "spending": spending}])

        
        # SINGLE TRANSACTION WITH ITS LATEST FRAUD PREDICTION
        if (
            "FROM transactions t" in q
            and "WHERE t.id = %s" in q
            and "LEFT JOIN LATERAL" in q
        ):
            tx_id = str(params[0])
            tx = self.transactions.get(tx_id)

            if not tx:
                return MockResult([])

            predictions = [
                p for p in self.fraud_predictions.values()
                if str(p["transaction_id"]) == tx_id
            ]

            latest_prediction = predictions[-1] if predictions else {}

            row = {
                "id": tx["id"],
                "user_id": tx["user_id"],
                "reference": tx["reference"],
                "amount": tx["amount"],
                "direction": tx["direction"],
                "currency": tx["currency"],
                "recipient_phone": tx.get("recipient_phone"),
                "transaction_type": tx["transaction_type"],
                "location": tx.get("location"),
                "device_id": tx.get("device_id"),
                "occurred_at": tx["occurred_at"],
                "created_at": tx.get("created_at", tx["occurred_at"]),
                "prediction_id": latest_prediction.get("id"),
                "model_name": latest_prediction.get("model_name"),
                "model_version": latest_prediction.get("model_version"),
                "fraud_probability": latest_prediction.get("fraud_probability"),
                "risk_score": latest_prediction.get("risk_score", tx.get("risk_score")),
                "risk_level": latest_prediction.get("risk_level"),
                "decision": latest_prediction.get("decision"),
                "reasons": latest_prediction.get("reasons", []),
            }

            return MockResult([row])

        # FRAUD PREDICTIONS
        if "INSERT INTO fraud_predictions" in q:
            pred_id = uuid.uuid4()
            pred = {
                "id": pred_id,
                "transaction_id": params[0],
                "model_name": params[1],
                "model_version": params[2],
                "fraud_probability": params[3],
                "risk_score": params[4],
                "risk_level": params[5],
                "decision": params[6],
                "reasons": json.loads(params[7]) if isinstance(params[7], str) else params[7],
                "created_at": datetime.now(timezone.utc),
            }
            
            
            self.fraud_predictions[str(pred_id)] = pred
            tx_id_str = str(params[0])
            if tx_id_str in self.transactions:
                self.transactions[tx_id_str]["risk_score"] = params[4]
                self.transactions[tx_id_str]["status"] = params[6]
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


_global_in_memory_db = None


def get_in_memory_database():
    global _global_in_memory_db
    if _global_in_memory_db is None:
        _global_in_memory_db = InMemoryDatabase(seed_demo=True)
    return _global_in_memory_db
