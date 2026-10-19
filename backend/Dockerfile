# Multi-stage production Dockerfile for MoMoGuard Backend
FROM python:3.12-slim AS base

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5000 \
    FLASK_ENV=production

WORKDIR /app

# Install curl for container health check
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

# Copy backend source code
COPY backend /app

# Create unprivileged user for security
RUN useradd -m -u 1001 momoguard && \
    chown -R momoguard:momoguard /app
USER momoguard

EXPOSE 5000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Production WSGI execution with Gunicorn
CMD ["gunicorn", \
     "--workers=4", \
     "--bind=0.0.0.0:5000", \
     "--timeout=30", \
     "--access-logfile=-", \
     "--error-logfile=-", \
     "app:app"]
