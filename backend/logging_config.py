import json
import logging
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from flask import g, request


class JsonFormatter(logging.Formatter):
    """
    Structured JSON log formatter for production monitoring and log aggregation (Datadog, CloudWatch, ELK).
    """

    def __init__(self, service_name="momoguard-backend", env="production"):
        super().__init__()
        self.service_name = service_name
        self.env = env

    def format(self, record):
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": self.service_name,
            "environment": self.env,
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Attach request context if available
        try:
            if hasattr(g, "request_id"):
                log_entry["request_id"] = g.request_id
            if hasattr(g, "user_id"):
                log_entry["user_id"] = g.user_id
            if request:
                log_entry["http"] = {
                    "method": request.method,
                    "path": request.path,
                    "remote_ip": request.headers.get("X-Forwarded-For", request.remote_addr),
                }
        except (RuntimeError, AttributeError):
            pass

        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry)


class MetricsRegistry:
    """
    Lightweight metrics collector for Prometheus and APM scraping.
    """

    def __init__(self):
        self.start_time = time.time()
        self.request_counts = {}
        self.request_durations = {}
        self.fraud_evaluations = {"SAFE": 0, "REVIEW": 0, "BLOCKED": 0}

    def record_request(self, endpoint, method, status_code, duration_seconds):
        key = f'{method}_{endpoint}_{status_code}'
        self.request_counts[key] = self.request_counts.get(key, 0) + 1

        dur_key = f'{method}_{endpoint}'
        if dur_key not in self.request_durations:
            self.request_durations[dur_key] = {"count": 0, "total_seconds": 0.0}
        self.request_durations[dur_key]["count"] += 1
        self.request_durations[dur_key]["total_seconds"] += duration_seconds

    def record_fraud_decision(self, decision):
        dec = str(decision).upper()
        if dec in self.fraud_evaluations:
            self.fraud_evaluations[dec] += 1

    def to_prometheus(self):
        uptime = time.time() - self.start_time
        lines = [
            "# HELP momoguard_uptime_seconds Process uptime in seconds",
            "# TYPE momoguard_uptime_seconds gauge",
            f"momoguard_uptime_seconds {uptime:.2f}",
            "",
            "# HELP momoguard_http_requests_total Total number of HTTP requests processed",
            "# TYPE momoguard_http_requests_total counter",
        ]

        for key, count in self.request_counts.items():
            parts = key.split("_")
            method = parts[0]
            status = parts[-1]
            endpoint = "_".join(parts[1:-1])
            lines.append(
                f'momoguard_http_requests_total{{method="{method}",endpoint="{endpoint}",status="{status}"}} {count}'
            )

        lines.extend([
            "",
            "# HELP momoguard_fraud_evaluations_total Total number of transactions scored by AI",
            "# TYPE momoguard_fraud_evaluations_total counter",
        ])
        for decision, count in self.fraud_evaluations.items():
            lines.append(f'momoguard_fraud_evaluations_total{{decision="{decision}"}} {count}')

        return "\n".join(lines) + "\n"

    def to_dict(self):
        return {
            "uptime_seconds": round(time.time() - self.start_time, 2),
            "requests_total": sum(self.request_counts.values()),
            "requests_by_status": self.request_counts,
            "fraud_decisions": self.fraud_evaluations,
        }


metrics = MetricsRegistry()


def setup_monitoring_and_logging(app):
    """
    Configures structured logging and performance middleware on the Flask app.
    """
    env = os.getenv("FLASK_ENV", os.getenv("APP_ENV", "production")).lower()
    log_level = logging.DEBUG if env == "development" else logging.INFO

    # Root handler setup
    handler = logging.StreamHandler(sys.stdout)
    if env == "production" or os.getenv("LOG_FORMAT") == "json":
        handler.setFormatter(JsonFormatter(env=env))
    else:
        handler.setFormatter(
            logging.Formatter("[%(asctime)s] [%(levelname)s] %(name)s: %(message)s")
        )

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(log_level)
    app.logger.handlers = [handler]
    app.logger.setLevel(log_level)

    # Middleware: Request ID and Performance Tracking
    @app.before_request
    def before_request_hook():
        g.request_start_time = time.perf_counter()
        req_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        g.request_id = req_id

    @app.after_request
    def after_request_hook(response):
        req_id = getattr(g, "request_id", uuid.uuid4().hex)
        response.headers["X-Request-ID"] = req_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"

        if hasattr(g, "request_start_time"):
            duration = time.perf_counter() - g.request_start_time
            duration_ms = round(duration * 1000, 2)
            response.headers["X-Response-Time"] = f"{duration_ms}ms"

            # Record in metrics
            endpoint = request.endpoint or request.path
            metrics.record_request(endpoint, request.method, response.status_code, duration)

            if request.path != "/api/health" and request.path != "/api/metrics":
                app.logger.info(
                    f"{request.method} {request.path} {response.status_code} ({duration_ms}ms)"
                )

        return response

    return metrics
