"""
Unit tests for the MoMoGuard logging and metrics infrastructure (backend/logging_config.py).

These tests validate the observability layer independently of the HTTP server:

- JsonFormatter: verifies that structured JSON log records contain all required
  standard fields (service, environment, level, logger, message, timestamp).
- MetricsRegistry: verifies that request and fraud-decision counters increment
  correctly and that both the dict and Prometheus text-format exports work.
"""

import json
import logging
from backend.logging_config import JsonFormatter, MetricsRegistry


class TestMonitoringUnits:
    def test_json_formatter_outputs_valid_json_with_standard_fields(self):
        """JsonFormatter must produce parseable JSON containing all standard
        structured-logging fields required by downstream log aggregation."""
        formatter = JsonFormatter(service_name="test-service", env="testing")
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg="User login successful",
            args=(),
            exc_info=None,
        )

        formatted_str = formatter.format(record)
        data = json.loads(formatted_str)

        assert data["service"] == "test-service"
        assert data["environment"] == "testing"
        assert data["level"] == "INFO"
        assert data["logger"] == "test.logger"
        assert data["message"] == "User login successful"
        assert "timestamp" in data  # ISO-8601 timestamp required for log sorting

    def test_metrics_registry_records_requests_and_fraud(self):
        """MetricsRegistry must correctly count HTTP requests (by method/path/status)
        and fraud decision outcomes (SAFE / REVIEW / BLOCKED)."""
        registry = MetricsRegistry()

        # Simulate two successful transaction creations and one auth failure
        registry.record_request("/api/transactions", "POST", 201, 0.045)
        registry.record_request("/api/transactions", "POST", 201, 0.055)
        registry.record_request("/api/auth/login", "POST", 401, 0.020)

        # Record one of each fraud decision type
        registry.record_fraud_decision("SAFE")
        registry.record_fraud_decision("REVIEW")
        registry.record_fraud_decision("BLOCKED")

        metrics_dict = registry.to_dict()

        assert metrics_dict["requests_total"] == 3
        assert metrics_dict["requests_by_status"]["POST_/api/transactions_201"] == 2
        assert metrics_dict["requests_by_status"]["POST_/api/auth/login_401"] == 1
        assert metrics_dict["fraud_decisions"]["SAFE"] == 1
        assert metrics_dict["fraud_decisions"]["REVIEW"] == 1
        assert metrics_dict["fraud_decisions"]["BLOCKED"] == 1

    def test_metrics_registry_prometheus_text_format(self):
        """to_prometheus() must return a valid Prometheus text-format string
        containing the expected HELP comments and metric lines."""
        registry = MetricsRegistry()
        registry.record_request("api_dashboard", "GET", 200, 0.012)
        registry.record_fraud_decision("SAFE")

        prom_text = registry.to_prometheus()

        # Prometheus scrape format requires # HELP metadata lines
        assert "# HELP momoguard_uptime_seconds" in prom_text
        assert "# HELP momoguard_http_requests_total" in prom_text
        # Verify a specific labelled counter value
        assert 'momoguard_fraud_evaluations_total{decision="SAFE"} 1' in prom_text
