-- Add ordered, explicit provider/model fallbacks without removing legacy routes.
ALTER TABLE public.model_routing_rules
  ADD COLUMN IF NOT EXISTS fallback_routes JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.model_routing_rules
  ADD CONSTRAINT model_routing_rules_fallback_routes_array
  CHECK (jsonb_typeof(fallback_routes) = 'array');

CREATE INDEX IF NOT EXISTS idx_model_routing_rules_case_scope
  ON public.model_routing_rules(agent_type, routing_tier, organization_id, client_id, contract_id, agent_id);

-- Runtime can observe provider state without gaining direct access to secrets.
CREATE OR REPLACE FUNCTION private.runtime_provider_configuration(p_provider_key TEXT)
RETURNS TABLE (provider_key TEXT, status TEXT, public_config JSONB, has_credential BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF COALESCE(current_setting('app.service_role', true), '') <> 'runtime' THEN
    RAISE EXCEPTION 'runtime_provider_configuration_forbidden';
  END IF;
  RETURN QUERY
  SELECT connection.provider_key, connection.status::text, connection.public_config,
         EXISTS (SELECT 1 FROM public.platform_provider_secrets secret
                 WHERE secret.provider_connection_id = connection.id AND secret.secret_kind = 'api_key')
  FROM public.platform_provider_connections connection
  WHERE connection.provider_type = 'llm' AND connection.provider_key = p_provider_key
    AND connection.environment = 'production'
  ORDER BY connection.is_default DESC, connection.updated_at DESC
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION private.runtime_provider_configuration(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.runtime_provider_configuration(TEXT) TO yux_runtime;

-- Match the configuration row exactly: degraded/stale providers may retry, but
-- a newer connection without a key must never inherit an older connection's key.
-- The runtime checks the selected connection's status before requesting a secret.
CREATE OR REPLACE FUNCTION private.runtime_provider_secret_envelope(p_provider_key TEXT)
RETURNS TABLE (provider_key TEXT, public_config JSONB, ciphertext TEXT, nonce TEXT, auth_tag TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF COALESCE(current_setting('app.service_role', true), '') <> 'runtime' THEN
    RAISE EXCEPTION 'runtime_provider_secret_forbidden';
  END IF;
  RETURN QUERY
  WITH selected_connection AS (
    SELECT connection.id, connection.provider_key, connection.public_config
    FROM public.platform_provider_connections connection
    WHERE connection.provider_type = 'llm' AND connection.provider_key = p_provider_key
      AND connection.environment = 'production'
    ORDER BY connection.is_default DESC, connection.updated_at DESC
    LIMIT 1
  )
  SELECT connection.provider_key, connection.public_config,
         secret.ciphertext, secret.nonce, secret.auth_tag
  FROM selected_connection connection
  JOIN public.platform_provider_secrets secret
    ON secret.provider_connection_id = connection.id AND secret.secret_kind = 'api_key';
END;
$$;
REVOKE ALL ON FUNCTION private.runtime_provider_secret_envelope(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.runtime_provider_secret_envelope(TEXT) TO yux_runtime;
