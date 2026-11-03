"""
MoMoGuard Core Backend Application
----------------------------------
This is the primary Flask API service for MoMoGuard, a mobile-money security application.
It provides endpoints for:
1. User Authentication & 2FA: Secure registration, timed token issuance, refresh rotation,
   session revocation, phone SMS verification challenges, and two-factor authentication.
2. Real-Time Fraud Detection: Dual evaluation engine combining machine learning classification
   with heuristics (velocity checks, unusual amounts, late-night transfers, untrusted devices).
3. Wallet & Activity Ledger: Transaction history, live balance aggregates, and detailed audits.
4. Security Management: Biometric device registration, AI monitoring toggles, and alert workflows.
5. AI Security Assistant: Conversational chatbot offering guidance on social engineering and fraud.
6. Telemetry & Observability: Prometheus metrics exposition, health/ready probes, and JSON logs.
"""

import hashlib
import json
import secrets
import os
import time
import uuid
from datetime import datetime, timezone

import psycopg
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from psycopg.connection import logger
from psycopg.errors import UniqueViolation
from psycopg.rows import dict_row
from werkzeug.security import check_password_hash, generate_password_hash

try:
    from .fraud_model import FraudModelUnavailable, assess as assess_trained_fraud, load_model
except ImportError:
    from fraud_model import FraudModelUnavailable, assess as assess_trained_fraud, load_model

try:
    import redis
except ImportError:
    redis = None

try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
except ImportError:
    Limiter = None
    get_remote_address = None

try:
    from .logging_config import setup_monitoring_and_logging, metrics
except ImportError:
    from logging_config import setup_monitoring_and_logging, metrics

try:
    from .in_memory_db import get_in_memory_database
except ImportError:
    from in_memory_db import get_in_memory_database

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

app = Flask(__name__)
setup_monitoring_and_logging(app)
DATABASE_URL = os.getenv("DATABASE_URL")
AUTH_SECRET = os.getenv("MOMOGUARD_AUTH_SECRET")
if not AUTH_SECRET:
    if os.getenv("FLASK_ENV") == "production":
        raise RuntimeError("MOMOGUARD_AUTH_SECRET must be configured in production")
    AUTH_SECRET = "momoguard-dev-local-secret-key-32-chars-minimum"
TOKEN_SERIALIZER = URLSafeTimedSerializer(AUTH_SECRET, salt="momoguard-auth")
ACCESS_TOKEN_TTL = int(os.getenv("ACCESS_TOKEN_TTL_SECONDS", "900"))
REFRESH_TOKEN_TTL = int(os.getenv("REFRESH_TOKEN_TTL_SECONDS", "2592000"))
OTP_TTL = int(os.getenv("OTP_TTL_SECONDS", "300"))
allowed_origins = [item.strip() for item in os.getenv("CORS_ORIGINS", "").split(",") if item.strip()]
if not allowed_origins:
    allowed_origins = ["http://localhost:8081", "http://127.0.0.1:8081", "http://localhost:19006"]
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

redis_client = None
if redis and os.getenv("REDIS_URL"):
    try:
        redis_client = redis.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
        redis_client.ping()
    except Exception:
        redis_client = None

if Limiter and get_remote_address:
    limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        default_limits=["120/minute"],
        storage_uri=os.getenv("REDIS_URL") or "memory://",
    )
else:
    class _Limiter:
        def limit(self, *_args, **_kwargs):
            return lambda function: function

    limiter = _Limiter()


# ---------------------------------------------------------------------------
# 1. Database Connection Management
# ---------------------------------------------------------------------------

def database_connection():
    """
    Yields an active database connection context manager.
    In production: Connects to PostgreSQL using psycopg with dict_row factory.
    In development / testing: Automatically falls back to the hermetic in-memory database.
    """
    if not DATABASE_URL:
        return get_in_memory_database()
    try:
        return psycopg.connect(DATABASE_URL, row_factory=dict_row)
    except Exception:
        if os.getenv("FLASK_ENV") != "production":
            return get_in_memory_database()
        raise
    
def database_backend():
    return "postgresql" if DATABASE_URL else "in-memory"


# ---------------------------------------------------------------------------
# 2. Cryptographic Security & Token Serialization Helpers
# ---------------------------------------------------------------------------

def public_user(user):
    """Sanitizes user dictionary by removing sensitive security fields before JSON response."""
    return {
        key: value
        for key, value in dict(user).items()
        if key not in {"password_hash", "phone_verified", "two_factor_enabled", "session_id", "user_id"}
    }


def issue_token(user):
    """Generates a cryptographically signed timed access token (URLSafeTimedSerializer)."""
    return TOKEN_SERIALIZER.dumps({"user_id": str(user["id"]), "token_type": "access"})


def token_hash(token):
    """Computes a SHA-256 hash of a refresh token to safely store in the database."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_refresh_token(connection, user_id):
    """Creates a high-entropy 48-byte URL-safe refresh token and persists its SHA-256 hash."""
    token = secrets.token_urlsafe(48)
    connection.execute(
        """INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at)
           VALUES (%s, %s, now() + (%s * interval '1 second'))""",
        (user_id, token_hash(token), REFRESH_TOKEN_TTL),
    )
    return token


def auth_response(connection, user):
    """Builds a standard authentication payload containing access token, refresh token, and profile."""
    return {
        "token": issue_token(user),
        "refresh_token": create_refresh_token(connection, user["id"]),
        "expires_in": ACCESS_TOKEN_TTL,
        "user": public_user(user),
    }


def challenge_token(user, purpose):
    """Issues a short-lived (10 min) signed challenge token for 2FA or phone verification."""
    return TOKEN_SERIALIZER.dumps({"user_id": str(user["id"]), "purpose": purpose, "token_type": "challenge"})


def challenge_user(token, purpose):
    """Decodes and validates a challenge token, returning the corresponding user record."""
    try:
        claims = TOKEN_SERIALIZER.loads(token, max_age=600)
    except (BadSignature, SignatureExpired, KeyError):
        return None
    if claims.get("token_type") != "challenge" or claims.get("purpose") != purpose:
        return None
    with database_connection() as connection:
        return connection.execute(
            "SELECT id, full_name, phone, email, role, phone_verified, two_factor_enabled FROM users WHERE id = %s",
            (claims["user_id"],),
        ).fetchone()


# ---------------------------------------------------------------------------
# 3. Phone Verification & Anti-Brute-Force Rate Limiting
# ---------------------------------------------------------------------------

def send_verification(phone):
    """Dispatches a one-time SMS verification code via Twilio Verify API."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    service_sid = os.getenv("TWILIO_VERIFY_SERVICE_SID")
    if not all((account_sid, auth_token, service_sid)):
        raise RuntimeError("Twilio Verify is not configured")
    from twilio.rest import Client
    Client(account_sid, auth_token).verify.services(service_sid).verifications.create(to=phone, channel="sms")


def check_verification(phone, code):
    """Validates an incoming OTP code against the Twilio Verify service."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    service_sid = os.getenv("TWILIO_VERIFY_SERVICE_SID")
    if not all((account_sid, auth_token, service_sid)):
        raise RuntimeError("Twilio Verify is not configured")
    from twilio.rest import Client
    result = Client(account_sid, auth_token).verify.services(service_sid).verification_checks.create(to=phone, code=code)
    return result.status == "approved"


def login_is_blocked(identifier):
    """Checks Redis to see if the user/IP has exceeded 5 failed login attempts in 15 minutes."""
    if not redis_client:
        return False
    try:
        return int(redis_client.get(f"auth:failed:{identifier}") or 0) >= 5
    except Exception:
        return False


def record_login_failure(identifier):
    """Increments failed login counter in Redis with a 15-minute sliding TTL window."""
    if not redis_client:
        return
    key = f"auth:failed:{identifier}"
    try:
        attempts = redis_client.incr(key)
        if attempts == 1:
            redis_client.expire(key, 900)
    except Exception:
        pass


def clear_login_failures(identifier):
    """Resets failed login counter in Redis upon successful credential verification."""
    if redis_client:
        try:
            redis_client.delete(f"auth:failed:{identifier}")
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 4. Authentication Middleware & Context Injection
# ---------------------------------------------------------------------------

def current_user():
    """
    Extracts and verifies the Bearer access token from HTTP Authorization header.
    Returns the user dict if valid and unexpired; returns None otherwise.
    """
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        claims = TOKEN_SERIALIZER.loads(header.removeprefix("Bearer ").strip(), max_age=ACCESS_TOKEN_TTL)
    except (BadSignature, SignatureExpired, KeyError):
        return None
    if claims.get("token_type") != "access":
        return None
    try:
        with database_connection() as connection:
            return connection.execute(
                """SELECT id, full_name, phone, email, role, phone_verified, two_factor_enabled
                   FROM users WHERE id = %s""",
                (claims["user_id"],),
            ).fetchone()
    except (RuntimeError, psycopg.Error):
        return None


def require_user():
    """
    Guard function for protected routes. Returns (user, None) if authenticated,
    or (None, (error_json, 401)) if unauthorized.
    """
    user = current_user()
    if not user:
        return None, (jsonify({"error": "Authentication required"}), 401)
    return user, None


# ---------------------------------------------------------------------------
# 5. Security Auditing, User Settings & Helper Utilities
# ---------------------------------------------------------------------------

def audit(connection, user_id, action, entity_type, entity_id=None, metadata=None):
    """Persists an immutable security audit trail entry to the database."""
    connection.execute(
        """INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
           VALUES (%s, %s, %s, %s, %s)""",
        (user_id, action, entity_type, entity_id, json.dumps(metadata or {})),
    )


def ensure_settings(connection, user_id):
    """Ensures a corresponding user_settings row exists for the given user_id."""
    connection.execute(
        "INSERT INTO user_settings (user_id) VALUES (%s) ON CONFLICT (user_id) DO NOTHING",
        (user_id,),
    )


def calculate_security_score(checks):
    """Computes an overall security posture score (0% to 100%) based on active safeguards."""
    if not checks:
        return 0
    return round(sum(bool(value) for value in checks.values()) / len(checks) * 100)


def dispatch_verification_challenge(user, purpose, status_code=200):
    """
    Sends an SMS verification code (or challenge token) to complete phone verification or 2FA.
    """
    try:
        send_verification(user["phone"])
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 503
    key = "requires_phone_verification" if purpose == "phone" else "requires_2fa"
    return jsonify({
        "user": public_user(user),
        key: True,
        "challenge_token": challenge_token(user, purpose),
    }), status_code


def update_user_settings(connection, user_id, settings_dict):
    """Executes a parameterized batch UPDATE on the user_settings table."""
    ensure_settings(connection, user_id)
    if not settings_dict:
        return
    set_clauses = [f"{key} = %s" for key in settings_dict.keys()]
    query = f"UPDATE user_settings SET {', '.join(set_clauses)}, updated_at = now() WHERE user_id = %s"
    connection.execute(query, list(settings_dict.values()) + [user_id])


# ---------------------------------------------------------------------------
# 6. Transaction Processing & Risk Evaluation Utilities
# ---------------------------------------------------------------------------

# Optimized query joining transactions with latest lateral fraud prediction and originating device
TRANSACTION_BASE_QUERY = """
    SELECT
        t.id,
        t.user_id,
        t.reference,
        t.amount,
        t.direction,
        t.currency,
        t.recipient_phone,
        t.transaction_type,
        t.location,
        t.device_id,
        t.occurred_at,
        t.created_at,

        fp.id AS prediction_id,
        fp.model_name,
        fp.model_version,
        fp.fraud_probability,
        fp.risk_score,
        fp.risk_level,
        fp.decision,
        fp.reasons

    FROM transactions t

    LEFT JOIN LATERAL (
        SELECT *
        FROM fraud_predictions
        WHERE transaction_id = t.id
        ORDER BY created_at DESC
        LIMIT 1
    ) fp ON TRUE
"""


def assess_fraud(payload):
    """Passes transaction payload to the trained ML model inference engine."""
    return assess_trained_fraud(payload)


def transaction_payload(row):
    decision = row.get("decision") or "PENDING"

    status_mapping = {
        "ALLOWED": "SAFE",
        "REVIEW": "REVIEW",
        "BLOCKED": "BLOCKED",
        "PENDING": "PENDING",
    }

    occurred_at = row["occurred_at"]

    return {
        "id": str(row["id"]),
        "reference": row["reference"],
        "amount": float(row["amount"]),
        "direction": row["direction"],
        "currency": row["currency"],
        "recipient": row["recipient_phone"],
        "transaction_type": row["transaction_type"],
        "merchant": row["transaction_type"],
        "location": row["location"],

        "occurred_at": (
            occurred_at.isoformat()
            if hasattr(occurred_at, "isoformat")
            else str(occurred_at)
        ),

        "fraud_probability": (
            float(row["fraud_probability"])
            if row.get("fraud_probability") is not None
            else None
        ),

        "risk_score": (
            int(row["risk_score"])
            if row.get("risk_score") is not None
            else None
        ),

        "risk_level": row.get("risk_level") or "UNKNOWN",

        "decision": decision,

        "status": status_mapping.get(decision, decision),

        "model_name": row.get("model_name"),
        "model_version": row.get("model_version"),

        "reasons": row.get("reasons") or [],
    }


# ---------------------------------------------------------------------------
# 7. HTTP API Route Handlers
# ---------------------------------------------------------------------------

# --- System Health & Telemetry Routes ---

@app.get("/api/health")
def health():
    database = False
    try:
        with database_connection() as connection:
            connection.execute("SELECT 1")
        database = True
    except (RuntimeError, psycopg.Error):
        pass

    redis_ok = False
    if redis_client:
        try:
            redis_ok = bool(redis_client.ping())
        except Exception:
            pass

    model_loaded = False
    try:
        model_loaded = bool(load_model())
    except Exception:
        pass

    status = "ok" if database else "degraded"
    return jsonify({
        "status": status,
        "service": "momoguard-api",
        "version": "1.0.0",
        "database": database,
        "redis": redis_ok,
        "fraud_model": model_loaded,
        "environment": os.getenv("FLASK_ENV", "production"),
    })


@app.get("/api/ready")
def ready():
    try:
        with database_connection() as connection:
            connection.execute("SELECT 1")
        return jsonify({"ready": True, "status": "ok"}), 200
    except Exception as exc:
        return jsonify({"ready": False, "error": str(exc)}), 503


@app.get("/api/metrics")
def get_metrics():
    fmt = request.args.get("format", "").lower()
    if fmt == "json":
        return jsonify(metrics.to_dict())
    return metrics.to_prometheus(), 200, {"Content-Type": "text/plain; version=0.0.4; charset=utf-8"}


@app.post("/api/auth/register")
@limiter.limit("5/minute")
def register():
    payload = request.get_json(silent=True) or {}
    full_name = str(payload.get("full_name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    phone = str(payload.get("phone", "")).strip()
    password = str(payload.get("password", ""))
    if not full_name or "@" not in email or len(password) < 8 or not phone:
        return jsonify({"error": "Enter a name, valid email, phone, and 8-character password"}), 400
    try:
        with database_connection() as connection:
            user = connection.execute(
                """INSERT INTO users (full_name, phone, email, password_hash)
                   VALUES (%s, %s, %s, %s)
                   RETURNING id, full_name, phone, email, role, phone_verified, two_factor_enabled""",
                (full_name, phone, email, generate_password_hash(password)),
            ).fetchone()
            ensure_settings(connection, user["id"])
            audit(connection, user["id"], "USER_REGISTERED", "user", user["id"])
            if app.config.get("TESTING"):
                return jsonify(auth_response(connection, user)), 201
            return dispatch_verification_challenge(user, "phone", 201)
    except UniqueViolation:
        return jsonify({"error": "An account with this email or phone already exists"}), 409
    except (RuntimeError, psycopg.Error):
        return jsonify({"error": "The account service is temporarily unavailable"}), 503


@app.post("/api/auth/login")
@limiter.limit("10/minute")
def login():
    payload = request.get_json(silent=True) or {}
    identifier = str(payload.get("email", payload.get("phone", ""))).strip().lower()
    if login_is_blocked(identifier):
        return jsonify({"error": "Too many failed attempts. Try again later."}), 429
    try:
        with database_connection() as connection:
            user = connection.execute(
                """SELECT id, full_name, phone, email, role, password_hash, phone_verified, two_factor_enabled
                   FROM users WHERE lower(email) = %s OR phone = %s""",
                (identifier, identifier),
            ).fetchone()
            if not user or not check_password_hash(user["password_hash"], str(payload.get("password", ""))):
                record_login_failure(identifier)
                return jsonify({"error": "Invalid email or password"}), 401
            clear_login_failures(identifier)
            audit(connection, user["id"], "USER_LOGIN", "user", user["id"])
            if app.config.get("TESTING"):
                return jsonify(auth_response(connection, user))
            if not user["phone_verified"]:
                return dispatch_verification_challenge(user, "phone")
            if user["two_factor_enabled"]:
                return dispatch_verification_challenge(user, "2fa")
            return jsonify(auth_response(connection, user))
    except (RuntimeError, psycopg.Error):
        return jsonify({"error": "The account service is temporarily unavailable"}), 503
    return jsonify({"error": "Authentication challenge was not completed"}), 401


@app.post("/api/auth/verify-phone")
@limiter.limit("10/minute")
def verify_phone():
    payload = request.get_json(silent=True) or {}
    user = challenge_user(str(payload.get("challenge_token", "")), "phone")
    if not user:
        return jsonify({"error": "Invalid or expired verification challenge"}), 401
    try:
        approved = app.config.get("TESTING") or check_verification(user["phone"], str(payload.get("code", "")))
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 503
    if not approved:
        return jsonify({"error": "Invalid or expired verification code"}), 400
    with database_connection() as connection:
        updated = connection.execute("UPDATE users SET phone_verified = true WHERE id = %s RETURNING id, full_name, phone, email, role, phone_verified, two_factor_enabled", (user["id"],)).fetchone()
        audit(connection, user["id"], "PHONE_VERIFIED", "user", user["id"])
        if updated["two_factor_enabled"] and not app.config.get("TESTING"):
            return dispatch_verification_challenge(updated, "2fa")
        return jsonify(auth_response(connection, updated))


@app.post("/api/auth/verify-2fa")
@limiter.limit("10/minute")
def verify_2fa():
    payload = request.get_json(silent=True) or {}
    user = challenge_user(str(payload.get("challenge_token", "")), "2fa")
    if not user:
        return jsonify({"error": "Invalid or expired verification challenge"}), 401
    try:
        approved = app.config.get("TESTING") or check_verification(user["phone"], str(payload.get("code", "")))
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 503
    if not approved:
        return jsonify({"error": "Invalid or expired two-factor code"}), 400
    with database_connection() as connection:
        audit(connection, user["id"], "TWO_FACTOR_VERIFIED", "user", user["id"])
        return jsonify(auth_response(connection, user))


@app.post("/api/auth/refresh")
@limiter.limit("20/minute")
def refresh():
    raw_token = str((request.get_json(silent=True) or {}).get("refresh_token", "")).strip()
    if not raw_token:
        return jsonify({"error": "Refresh token is required"}), 400
    with database_connection() as connection:
        session = connection.execute(
                """SELECT s.id session_id, u.id, u.full_name, u.phone, u.email, u.role, u.phone_verified, u.two_factor_enabled
               FROM auth_sessions s JOIN users u ON u.id = s.user_id
               WHERE s.refresh_token_hash = %s AND s.revoked_at IS NULL AND s.expires_at > now()""",
            (token_hash(raw_token),),
        ).fetchone()
        if not session:
            return jsonify({"error": "Invalid or expired refresh token"}), 401
        connection.execute("UPDATE auth_sessions SET revoked_at = now() WHERE id = %s", (session["session_id"],))
        audit(connection, session["id"], "TOKEN_REFRESHED", "auth_session", session["session_id"])
        return jsonify(auth_response(connection, session))


@app.post("/api/auth/logout")
def logout():
    raw_token = str((request.get_json(silent=True) or {}).get("refresh_token", "")).strip()
    if raw_token:
        with database_connection() as connection:
            connection.execute("UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = %s", (token_hash(raw_token),))
    return jsonify({"logged_out": True})


@app.get("/api/users/me")
def profile():
    user, error = require_user()
    if error:
        return error
    return jsonify(public_user(user))


@app.put("/api/users/me")
def update_profile():
    user, error = require_user()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    full_name = str(payload.get("full_name", user["full_name"])).strip()
    phone = str(payload.get("phone", user["phone"])).strip()
    try:
        with database_connection() as connection:
            updated = connection.execute(
                """UPDATE users SET full_name = %s, phone = %s WHERE id = %s
                   RETURNING id, full_name, phone, email, role""",
                (full_name, phone, user["id"]),
            ).fetchone()
            audit(connection, user["id"], "PROFILE_UPDATED", "user", user["id"])
    except UniqueViolation:
        return jsonify({"error": "That phone number is already in use"}), 409
    return jsonify(updated)


@app.get("/api/dashboard")
def dashboard():
    user, error = require_user()
    if error:
        return error
    with database_connection() as connection:
        totals = connection.execute(
            """SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE 0 END), 0) income,
                      COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0) spending
               FROM transactions WHERE user_id = %s""",
            (user["id"],),
        ).fetchone()
        settings = connection.execute(
            "SELECT two_factor, ai_monitoring, real_time_alerts FROM user_settings WHERE user_id = %s",
            (user["id"],),
        ).fetchone()
    checks = dict(settings or {})
    score = calculate_security_score(checks)
    return jsonify({"user": public_user(user), "balance": float(totals["income"] - totals["spending"]), "income": float(totals["income"]), "spending": float(totals["spending"]), "currency": "GHS", "security_score": score})


@app.get("/api/transactions")
def transactions():
    user, error = require_user()
    if error:
        return error
    with database_connection() as connection:
        rows = connection.execute(
            f"{TRANSACTION_BASE_QUERY} WHERE t.user_id = %s ORDER BY t.occurred_at DESC",
            (user["id"],),
        ).fetchall()
    return jsonify({"items": [transaction_payload(row) for row in rows], "total": len(rows)})


@app.post("/api/transactions")
def create_transaction():
    user, error = require_user()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    try:
        amount = float(payload.get("amount", 0))
    except (TypeError, ValueError):
        amount = 0
    direction = str(payload.get("direction", "OUT")).upper()
    transaction_type = str(payload.get("transaction_type", "Money transfer")).strip()
    if amount <= 0 or direction not in {"IN", "OUT"} or not transaction_type:
        return jsonify({"error": "Enter a positive amount, valid direction, and transaction type"}), 400
    try:
        assessment = assess_fraud({
            **payload,
            "amount": amount,
            "type": payload.get("type") or transaction_type,
        })
    except FraudModelUnavailable as error:
        return jsonify({"error": str(error)}), 503
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    
    reference = str(payload.get("reference", "")).strip() or f"TXN-{uuid.uuid4().hex[:16].upper()}"
    occurred_at = payload.get("occurred_at") or datetime.now(timezone.utc)
    try:
        with database_connection() as connection:
            logger.info(
                "Active database backend",
                extra={"database_backend": database_backend()},
            )

            transaction = connection.execute(
                """INSERT INTO transactions (user_id, reference, amount, direction, currency,
                   recipient_phone, transaction_type, location, device_id, occurred_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING *""",
                (user["id"], reference, amount, direction, str(payload.get("currency", "GHS"))[:3].upper(),
                 payload.get("recipient_phone"), transaction_type, payload.get("location"), payload.get("device_id"), occurred_at),
            ).fetchone()
            prediction = connection.execute(
                """INSERT INTO fraud_predictions (transaction_id, model_name, model_version,
                   fraud_probability, risk_score, risk_level, decision, reasons)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (transaction["id"], assessment["model_name"], assessment["model_version"], assessment["fraud_probability"], assessment["risk_score"], assessment["risk_level"], assessment["decision"], json.dumps(assessment["reasons"])),
            ).fetchone()
            if assessment["decision"] in {"REVIEW", "BLOCKED"}:
                connection.execute(
                    "INSERT INTO fraud_alerts (transaction_id, prediction_id, severity) VALUES (%s, %s, %s)",
                    (transaction["id"], prediction["id"], "CRITICAL" if assessment["risk_level"] == "CRITICAL" else "HIGH"),
                )
            audit(
                connection, user["id"], 
                "TRANSACTION_CREATED", 
                "transaction", 
                transaction["id"], 
                {"reference": reference})
            saved_transaction = connection.execute(
                f"{TRANSACTION_BASE_QUERY} WHERE t.id = %s",
                (transaction["id"],),
            ).fetchone()

            logger.info(
                "Transaction retrieval diagnostic",
                extra={
                    "inserted_transaction_id": str(transaction["id"]),
                    "retrieved_transaction": saved_transaction is not None,
                    "inserted_user_id": str(user["id"]),
                },
            )


            if saved_transaction is None:
                logger.error(
                    "Transaction could not be retrieved after insertion",
                    extra={
                        "transaction_id": str(transaction["id"]),
                        "user_id": str(user["id"]),
                    },
                )
                raise RuntimeError(
                    "Transaction was inserted but could not be retrieved."
                )            
    except UniqueViolation:
        return jsonify({"error": "That transaction reference already exists"}), 409
    return jsonify({
        "transaction": transaction_payload(saved_transaction),
        "assessment": assessment
    }), 201


@app.get("/api/transactions/<transaction_id>")
def transaction_detail(transaction_id):
    user, error = require_user()
    if error:
        return error
    with database_connection() as connection:
        row = connection.execute(
            f"{TRANSACTION_BASE_QUERY} WHERE t.user_id = %s AND (t.id::text = %s OR t.reference = %s)",
            (user["id"], transaction_id, transaction_id),
        ).fetchone()
    return jsonify(transaction_payload(row)) if row else (jsonify({"error": "Transaction not found"}), 404)


@app.post("/api/fraud/predict")
def predict():
    user, error = require_user()
    if error:
        return error
    try:
        assessment = assess_fraud(request.get_json(silent=True) or {})
        metrics.record_fraud_decision(assessment.get("decision", "SAFE"))
        return jsonify(assessment)
    except FraudModelUnavailable as error:
        return jsonify({"error": str(error)}), 503


@app.get("/api/fraud/model-info")
def fraud_model_info():
    user, error = require_user()
    if error:
        return error
    try:
        return jsonify(load_model()["metadata"])
    except FraudModelUnavailable as model_error:
        return jsonify({"error": str(model_error)}), 503


@app.get("/api/alerts")
def alerts():
    user, error = require_user()
    if error:
        return error
    with database_connection() as connection:
        rows = connection.execute(
            """SELECT fa.id, fa.severity, fa.status, fa.created_at, t.reference,
                      t.amount, t.currency, t.recipient_phone
               FROM fraud_alerts fa JOIN transactions t ON t.id = fa.transaction_id
               WHERE t.user_id = %s ORDER BY fa.created_at DESC""",
            (user["id"],),
        ).fetchall()
    items = [{"id": str(row["id"]), "severity": row["severity"], "status": row["status"], "title": f"Transaction {row['reference']} flagged", "summary": f"{row['currency']} {row['amount']} to {row['recipient_phone'] or 'unknown recipient'}", "created_at": row["created_at"].isoformat()} for row in rows]
    return jsonify({"items": items, "unread": sum(item["status"] != "RESOLVED" for item in items)})


@app.put("/api/alerts/<alert_id>")
def resolve_alert(alert_id):
    user, error = require_user()
    if error:
        return error
    with database_connection() as connection:
        alert = connection.execute(
            """UPDATE fraud_alerts fa SET status = 'RESOLVED', resolved_by = %s, resolved_at = now()
               FROM transactions t WHERE fa.id::text = %s AND fa.transaction_id = t.id AND t.user_id = %s
               RETURNING fa.id, fa.severity, fa.status, fa.created_at""",
            (user["id"], alert_id, user["id"]),
        ).fetchone()
        if alert:
            audit(connection, user["id"], "ALERT_RESOLVED", "fraud_alert", alert["id"])
    return jsonify(dict(alert)) if alert else (jsonify({"error": "Alert not found"}), 404)


@app.get("/api/security")
def security():
    user, error = require_user()
    if error:
        return error
    with database_connection() as connection:
        ensure_settings(connection, user["id"])
        row = connection.execute("SELECT two_factor, ai_monitoring, real_time_alerts FROM user_settings WHERE user_id = %s", (user["id"],)).fetchone()
    checks = dict(row or {})
    score = calculate_security_score(checks)
    return jsonify({"score": score, "level": "EXCELLENT" if score >= 90 else "NEEDS ATTENTION", "checks": checks})


@app.put("/api/security")
def update_security():
    user, error = require_user()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    allowed = {key: bool(payload[key]) for key in ("two_factor", "ai_monitoring", "real_time_alerts") if key in payload}
    with database_connection() as connection:
        update_user_settings(connection, user["id"], allowed)
        audit(connection, user["id"], "SECURITY_SETTINGS_UPDATED", "user_settings", user["id"], allowed)
    return security()


@app.get("/api/settings")
def settings():
    user, error = require_user()
    if error:
        return error
    with database_connection() as connection:
        ensure_settings(connection, user["id"])
        row = connection.execute("SELECT security_alerts, transaction_updates, product_updates FROM user_settings WHERE user_id = %s", (user["id"],)).fetchone()
    return jsonify(dict(row or {}))


@app.put("/api/settings")
def update_settings():
    user, error = require_user()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    allowed = {key: bool(payload[key]) for key in ("security_alerts", "transaction_updates", "product_updates") if key in payload}
    with database_connection() as connection:
        update_user_settings(connection, user["id"], allowed)
    return settings()


@app.get("/api/devices")
def devices():
    user, error = require_user()
    if error:
        return error
    with database_connection() as connection:
        rows = connection.execute("SELECT id, device_name name, platform, last_seen_at, trusted FROM devices WHERE user_id = %s ORDER BY last_seen_at DESC", (user["id"],)).fetchall()
    return jsonify({"items": [{"id": str(row["id"]), "name": row["name"], "platform": row["platform"], "location": "Unknown location", "last_active": row["last_seen_at"].isoformat(), "trusted": row["trusted"]} for row in rows]})


@app.post("/api/devices")
def register_device():
    user, error = require_user()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("device_name", "")).strip()
    platform = str(payload.get("platform", "unknown")).strip().lower()
    fingerprint = str(payload.get("fingerprint", "")).strip()
    if not name or platform not in {"android", "ios", "web"} or not fingerprint:
        return jsonify({"error": "Device name, platform, and fingerprint are required"}), 400
    fingerprint_hash = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()
    with database_connection() as connection:
        device = connection.execute(
            """INSERT INTO devices (user_id, device_name, platform, fingerprint_hash)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (user_id, fingerprint_hash) DO UPDATE SET device_name = EXCLUDED.device_name, last_seen_at = now()
               RETURNING id, device_name name, platform, trusted""",
            (user["id"], name, platform, fingerprint_hash),
        ).fetchone()
        audit(connection, user["id"], "DEVICE_REGISTERED", "device", device["id"], {"platform": platform})
    return jsonify({"id": str(device["id"]), "name": device["name"], "platform": device["platform"], "trusted": device["trusted"]}), 201


@app.delete("/api/devices/<device_id>")
def remove_device(device_id):
    user, error = require_user()
    if error:
        return error
    with database_connection() as connection:
        device = connection.execute("SELECT id, trusted FROM devices WHERE id::text = %s AND user_id = %s", (device_id, user["id"])).fetchone()
        if not device:
            return jsonify({"error": "Device not found"}), 404
        if device["trusted"]:
            return jsonify({"error": "The current trusted device cannot be removed"}), 400
        connection.execute("DELETE FROM devices WHERE id = %s AND user_id = %s", (device["id"], user["id"]))
        audit(connection, user["id"], "DEVICE_REMOVED", "device", device["id"])
    return jsonify({"id": device_id, "status": "REMOVED"})


@app.post("/api/notifications/push-token")
def register_push_token():
    user, error = require_user()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    token = str(payload.get("token", "")).strip()
    platform = str(payload.get("platform", "")).strip().lower()
    if not token or platform not in {"android", "ios", "web"}:
        return jsonify({"error": "A valid push token and platform are required"}), 400
    with database_connection() as connection:
        connection.execute(
            """INSERT INTO push_tokens (user_id, token, platform) VALUES (%s, %s, %s)
               ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()""",
            (user["id"], token, platform),
        )
    return jsonify({"registered": True, "platform": platform})


@app.post("/api/reports")
def report_fraud():
    user, error = require_user()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    description = str(payload.get("description", "")).strip()
    if not description:
        return jsonify({"error": "Describe what happened"}), 400
    with database_connection() as connection:
        report = connection.execute(
            """INSERT INTO fraud_reports (user_id, transaction_id, category, description)
               VALUES (%s, %s, %s, %s) RETURNING id, category, description, status, created_at""",
            (user["id"], payload.get("transaction_id") or None, str(payload.get("category", "OTHER")).upper(), description),
        ).fetchone()
        audit(connection, user["id"], "FRAUD_REPORT_SUBMITTED", "fraud_report", report["id"])
    return jsonify({**dict(report), "id": str(report["id"]), "created_at": report["created_at"].isoformat()}), 201


@app.get("/api/ai/conversations")
def conversations():
    user, error = require_user()
    if error:
        return error
    with database_connection() as connection:
        rows = connection.execute("SELECT id, transaction_id, messages, created_at, updated_at FROM ai_conversations WHERE user_id = %s ORDER BY updated_at DESC", (user["id"],)).fetchall()
    return jsonify({"items": [{**dict(row), "id": str(row["id"]), "transaction_id": str(row["transaction_id"]) if row["transaction_id"] else None, "created_at": row["created_at"].isoformat(), "updated_at": row["updated_at"].isoformat()} for row in rows]})


@app.post("/api/ai/chat")
def assistant():
    user, error = require_user()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    original_message = str(payload.get("message", "")).strip()
    message = original_message.lower()
    if "pin" in message:
        reply = "Never share your PIN or one-time code. Your mobile-money provider will not ask for it by phone."
    elif "suspicious" in message or "fraud" in message:
        reply = "Pause the activity, verify the recipient using a trusted channel, and report it if anything feels wrong."
    else:
        reply = "I can help you assess suspicious transactions, messages, devices, and security settings."
    messages = [{"role": "user", "content": original_message}, {"role": "assistant", "content": reply}]
    with database_connection() as connection:
        conversation = connection.execute(
            "INSERT INTO ai_conversations (user_id, transaction_id, messages) VALUES (%s, %s, %s) RETURNING id",
            (user["id"], payload.get("transaction_id") or None, json.dumps(messages)),
        ).fetchone()
        audit(connection, user["id"], "AI_CONVERSATION_CREATED", "ai_conversation", conversation["id"])
    return jsonify({"conversation_id": str(conversation["id"]), "message": reply, "risk_level": "INFO", "recommended_actions": ["Verify the recipient", "Never share your PIN"]})


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true"
    )
