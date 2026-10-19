import uuid
import pytest


class TestApiIntegration:
    def test_health_ready_and_metrics_endpoints(self, client):
        # Health check
        res = client.get("/api/health")
        assert res.status_code == 200
        data = res.get_json()
        assert data["service"] == "momoguard-api"
        assert "database" in data
        assert "redis" in data
        assert "fraud_model" in data

        # Ready probe
        ready_res = client.get("/api/ready")
        assert ready_res.status_code in (200, 503)

        # Prometheus metrics
        metrics_res = client.get("/api/metrics")
        assert metrics_res.status_code == 200
        assert "momoguard_uptime_seconds" in metrics_res.get_data(as_text=True)

        # JSON metrics
        metrics_json = client.get("/api/metrics?format=json")
        assert metrics_json.status_code == 200
        assert "uptime_seconds" in metrics_json.get_json()

    def test_auth_registration_validation_and_duplicate(self, client):
        # Empty / short password
        bad_pw = client.post(
            "/api/auth/register",
            json={
                "full_name": "Test User",
                "phone": "+233244123456",
                "email": "test@example.com",
                "password": "short",
            },
        )
        assert bad_pw.status_code == 400

        # Valid registration
        suffix = uuid.uuid4().hex[:6]
        valid_payload = {
            "full_name": "Kofi Mensah",
            "phone": "+233244987654",
            "email": f"kofi_{suffix}@example.com",
            "password": "StrongPassword123!",
        }
        res = client.post("/api/auth/register", json=valid_payload)
        assert res.status_code == 201
        data = res.get_json()
        assert data["token"]
        assert data["refresh_token"]
        assert data["user"]["email"] == valid_payload["email"]

        # Duplicate email
        dup_res = client.post("/api/auth/register", json=valid_payload)
        assert dup_res.status_code == 409

    def test_auth_login_success_and_failures(self, client):
        suffix = uuid.uuid4().hex[:6]
        email = f"login_{suffix}@example.com"
        password = "ValidSecretPass123!"

        reg_res = client.post(
            "/api/auth/register",
            json={
                "full_name": "Login Tester",
                "phone": "+233201122334",
                "email": email,
                "password": password,
            },
        )
        assert reg_res.status_code == 201

        # Correct credentials
        login_res = client.post("/api/auth/login", json={"email": email, "password": password})
        assert login_res.status_code == 200
        assert login_res.get_json()["token"]

        # Wrong password
        wrong_pw = client.post("/api/auth/login", json={"email": email, "password": "WrongPassword!"})
        assert wrong_pw.status_code == 401

        # Nonexistent email
        ghost = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": password})
        assert ghost.status_code == 401

    def test_auth_refresh_token_rotation_and_revocation(self, client, registered_user):
        refresh_token = registered_user["refresh_token"]

        # First refresh succeeds
        res1 = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        assert res1.status_code == 200
        new_tokens = res1.get_json()
        assert new_tokens["refresh_token"] != refresh_token

        # Re-using old rotated token fails
        res2 = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        assert res2.status_code == 401

        # Logout revokes new token
        logout_res = client.post("/api/auth/logout", json={"refresh_token": new_tokens["refresh_token"]})
        assert logout_res.status_code == 200

        # Attempting refresh after logout fails
        res3 = client.post("/api/auth/refresh", json={"refresh_token": new_tokens["refresh_token"]})
        assert res3.status_code == 401

    def test_dashboard_endpoint(self, client, auth_headers):
        res = client.get("/api/dashboard", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert "balance" in data
        assert "income" in data
        assert "spending" in data
        assert "security_score" in data

    def test_transaction_creation_and_listing(self, client, auth_headers):
        ref = f"TX-{uuid.uuid4().hex[:8]}"
        tx_payload = {
            "reference": ref,
            "amount": 350.00,
            "direction": "OUT",
            "transaction_type": "MTN MoMo Cashout",
            "recipient_phone": "+233244888999",
            "location": "Accra Central",
            "new_recipient": False,
            "unusual_time": False,
            "new_device": False,
        }

        create_res = client.post("/api/transactions", headers=auth_headers, json=tx_payload)
        assert create_res.status_code == 201
        created = create_res.get_json()
        assert created["transaction"]["merchant"] == "MTN MoMo Cashout"
        assert "assessment" in created

        # List transactions
        list_res = client.get("/api/transactions", headers=auth_headers)
        assert list_res.status_code == 200
        items = list_res.get_json()["items"]
        assert len(items) >= 1
        assert any(t["id"] == str(created["transaction"]["id"]) for t in items)

        # Get transaction detail by ID
        detail_res = client.get(f"/api/transactions/{created['transaction']['id']}", headers=auth_headers)
        assert detail_res.status_code == 200
        assert detail_res.get_json()["id"] == created["transaction"]["id"]

    def test_fraud_prediction_endpoints(self, client, auth_headers):
        # Predict endpoint
        pred_res = client.post(
            "/api/fraud/predict",
            headers=auth_headers,
            json={
                "amount": 4200.00,
                "new_recipient": True,
                "unusual_time": True,
                "new_device": True,
            },
        )
        assert pred_res.status_code == 200
        data = pred_res.get_json()
        assert "decision" in data
        assert "risk_score" in data
        assert "reasons" in data

        # Model info endpoint
        info_res = client.get("/api/fraud/model-info", headers=auth_headers)
        assert info_res.status_code == 200
        assert "accuracy" in info_res.get_json()

    def test_real_fraud_report_submission(self, client, auth_headers):
        # Missing description
        bad_rep = client.post(
            "/api/reports",
            headers=auth_headers,
            json={"category": "UNAUTHORIZED_TRANSACTION", "description": ""},
        )
        assert bad_rep.status_code == 400

        # Valid submission
        valid_rep = client.post(
            "/api/reports",
            headers=auth_headers,
            json={
                "category": "PHISHING",
                "description": "Received fake lottery SMS claiming prize won, money debited.",
            },
        )
        assert valid_rep.status_code == 201
        data = valid_rep.get_json()
        assert data["id"]
        assert data["category"] == "PHISHING"
        assert "created_at" in data

    def test_security_settings_get_and_update(self, client, auth_headers):
        # Get settings
        get_res = client.get("/api/security", headers=auth_headers)
        assert get_res.status_code == 200
        assert "score" in get_res.get_json()
        assert "checks" in get_res.get_json()

        # Update toggle
        put_res = client.put(
            "/api/security",
            headers=auth_headers,
            json={"two_factor": True, "ai_monitoring": True},
        )
        assert put_res.status_code == 200
        checks = put_res.get_json()["checks"]
        assert checks["two_factor"] is True

    def test_ai_chat_assistant(self, client, auth_headers):
        chat_res = client.post(
            "/api/ai/chat",
            headers=auth_headers,
            json={"message": "Someone called asking for my MoMo PIN."},
        )
        assert chat_res.status_code == 200
        data = chat_res.get_json()
        assert "message" in data
        assert "pin" in data["message"].lower() or "never" in data["message"].lower()

        # List conversation history
        conv_res = client.get("/api/ai/conversations", headers=auth_headers)
        assert conv_res.status_code == 200
        assert len(conv_res.get_json()["items"]) >= 1

    def test_device_registration(self, client, auth_headers):
        reg_res = client.post(
            "/api/devices",
            headers=auth_headers,
            json={
                "device_name": "Samsung Galaxy S24",
                "platform": "android",
                "fingerprint": uuid.uuid4().hex,
            },
        )
        assert reg_res.status_code == 201
        dev = reg_res.get_json()
        assert dev["name"] == "Samsung Galaxy S24"

        # List devices
        list_res = client.get("/api/devices", headers=auth_headers)
        assert list_res.status_code == 200
        assert len(list_res.get_json()["items"]) >= 1

    def test_push_token_registration(self, client, auth_headers):
        token_res = client.post(
            "/api/notifications/push-token",
            headers=auth_headers,
            json={"token": "ExponentPushToken[Abc123TestToken]", "platform": "android"},
        )
        assert token_res.status_code == 200
        assert token_res.get_json()["registered"] is True
