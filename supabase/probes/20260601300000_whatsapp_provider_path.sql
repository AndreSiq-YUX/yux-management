-- Real WhatsApp provider path probes.

SELECT
  CASE
    WHEN COUNT(*) = 7 THEN 'ok'
    ELSE 'missing WhatsApp provider connection columns'
  END AS whatsapp_provider_connection_columns_exist
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'channel_connections'
  AND column_name IN (
    'provider_account_id',
    'phone_number_id',
    'provider_verify_state',
    'token_state',
    'last_provider_sync_at',
    'protected_metadata_references',
    'provider_webhook_secret_reference'
  );

SELECT
  CASE
    WHEN COUNT(*) = 5 THEN 'ok'
    ELSE 'token state constraint missing values'
  END AS whatsapp_token_states_present
FROM (
  VALUES ('not_configured'), ('connected'), ('stale'), ('needs_reauth'), ('failed')
) AS expected(status)
WHERE EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'channel_connections'
    AND pg_get_constraintdef(c.oid) LIKE '%' || expected.status || '%'
);

SELECT
  CASE
    WHEN COUNT(*) = 4 THEN 'ok'
    ELSE 'provider verify state constraint missing values'
  END AS whatsapp_verify_states_present
FROM (
  VALUES ('not_configured'), ('pending'), ('verified'), ('failed')
) AS expected(status)
WHERE EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'channel_connections'
    AND pg_get_constraintdef(c.oid) LIKE '%' || expected.status || '%'
);

SELECT
  CASE
    WHEN COUNT(*) >= 3 THEN 'ok'
    ELSE 'missing WhatsApp provider indexes'
  END AS whatsapp_provider_indexes_exist
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'channel_connections'
  AND indexname IN (
    'idx_channel_connections_whatsapp_phone_number_id',
    'idx_channel_connections_whatsapp_health',
    'idx_channel_connections_last_provider_sync'
  );
