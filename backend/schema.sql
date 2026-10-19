CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(160) NOT NULL,
  phone VARCHAR(30) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  role VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  two_factor BOOLEAN NOT NULL DEFAULT TRUE,
  ai_monitoring BOOLEAN NOT NULL DEFAULT TRUE,
  real_time_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  security_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  transaction_updates BOOLEAN NOT NULL DEFAULT TRUE,
  product_updates BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name VARCHAR(120) NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('android', 'ios', 'web', 'unknown')),
  fingerprint_hash TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trusted BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (user_id, fingerprint_hash)
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference VARCHAR(80) UNIQUE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  direction VARCHAR(10) NOT NULL DEFAULT 'OUT' CHECK (direction IN ('IN', 'OUT')),
  currency CHAR(3) NOT NULL DEFAULT 'GHS',
  recipient_phone VARCHAR(30),
  transaction_type VARCHAR(60) NOT NULL,
  location VARCHAR(120),
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fraud_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  model_name VARCHAR(80) NOT NULL,
  model_version VARCHAR(30) NOT NULL,
  fraud_probability NUMERIC(5, 4) NOT NULL CHECK (fraud_probability BETWEEN 0 AND 1),
  risk_score SMALLINT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level VARCHAR(20) NOT NULL,
  decision VARCHAR(20) NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  prediction_id UUID NOT NULL REFERENCES fraud_predictions(id) ON DELETE CASCADE,
  severity VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fraud_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  category VARCHAR(40) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS transactions_user_time_idx ON transactions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS fraud_alerts_status_idx ON fraud_alerts(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_time_idx ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS conversations_user_time_idx ON ai_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens(user_id, last_seen_at DESC);
