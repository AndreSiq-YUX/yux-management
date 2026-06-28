CREATE TABLE IF NOT EXISTS app_password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL DEFAULT 'set_password' CHECK (purpose IN ('set_password', 'password_reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS app_password_reset_tokens_user_id_idx ON app_password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS app_password_reset_tokens_expires_at_idx ON app_password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS app_password_reset_tokens_active_idx
  ON app_password_reset_tokens(token_hash)
  WHERE used_at IS NULL;
