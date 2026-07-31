ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

ALTER TABLE app_password_reset_tokens
  DROP CONSTRAINT IF EXISTS app_password_reset_tokens_purpose_check;

ALTER TABLE app_password_reset_tokens
  ADD CONSTRAINT app_password_reset_tokens_purpose_check
  CHECK (purpose IN ('set_password', 'client_invitation', 'password_reset'));
