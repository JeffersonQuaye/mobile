CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON audit_logs(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fraud_reports_user_status_idx
  ON fraud_reports(user_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS devices_user_fingerprint_idx
  ON devices(user_id, fingerprint_hash);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_idx
  ON auth_sessions(user_id, expires_at DESC);
