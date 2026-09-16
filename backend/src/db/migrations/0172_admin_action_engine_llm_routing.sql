-- Action Engine LLM routes are admin-owned and independent from the
-- growth_strategist knowledge/permission profile.
INSERT INTO public.model_routing_rules (
  agent_type, routing_tier, provider, model_name, fallback_model_name,
  max_input_tokens, max_output_tokens, temperature, max_cost_per_run, status
)
SELECT
  'action_engine_strategist', 'default', source.provider, source.model_name,
  source.fallback_model_name, source.max_input_tokens, source.max_output_tokens,
  source.temperature, source.max_cost_per_run, 'active'
FROM (
  SELECT provider, model_name, fallback_model_name, max_input_tokens,
         max_output_tokens, temperature, max_cost_per_run
  FROM public.model_routing_rules
  WHERE agent_type = 'growth_strategist'
    AND routing_tier = 'default'
    AND status = 'active'
  ORDER BY updated_at DESC
  LIMIT 1
) source
WHERE NOT EXISTS (
  SELECT 1 FROM public.model_routing_rules
  WHERE agent_type = 'action_engine_strategist' AND routing_tier = 'default'
);

INSERT INTO public.model_routing_rules (
  agent_type, routing_tier, provider, model_name, fallback_model_name,
  max_input_tokens, max_output_tokens, temperature, max_cost_per_run, status
)
SELECT
  'mission_supervisor', 'default', source.provider, source.model_name,
  source.fallback_model_name, source.max_input_tokens, source.max_output_tokens,
  source.temperature, source.max_cost_per_run, 'active'
FROM (
  SELECT provider, model_name, fallback_model_name, max_input_tokens,
         max_output_tokens, temperature, max_cost_per_run
  FROM public.model_routing_rules
  WHERE agent_type = 'action_engine_strategist'
    AND routing_tier = 'default'
  ORDER BY (status = 'active') DESC, updated_at DESC
  LIMIT 1
) source
WHERE NOT EXISTS (
  SELECT 1 FROM public.model_routing_rules
  WHERE agent_type = 'mission_supervisor' AND routing_tier = 'default'
);

-- The runtime keeps direct table access to provider secrets revoked. This
-- security-definer function exposes only the encrypted envelope for the
-- requested active production LLM provider; decryption happens in memory.
CREATE OR REPLACE FUNCTION private.runtime_provider_secret_envelope(p_provider_key TEXT)
RETURNS TABLE (
  provider_key TEXT,
  public_config JSONB,
  ciphertext TEXT,
  nonce TEXT,
  auth_tag TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF COALESCE(current_setting('app.service_role', true), '') <> 'runtime' THEN
    RAISE EXCEPTION 'runtime_provider_secret_forbidden';
  END IF;

  RETURN QUERY
  SELECT connection.provider_key,
         connection.public_config,
         secret.ciphertext,
         secret.nonce,
         secret.auth_tag
  FROM public.platform_provider_connections connection
  JOIN public.platform_provider_secrets secret
    ON secret.provider_connection_id = connection.id
   AND secret.secret_kind = 'api_key'
  WHERE connection.provider_type = 'llm'
    AND connection.provider_key = p_provider_key
    AND connection.environment = 'production'
    AND connection.status = 'active'
  ORDER BY connection.is_default DESC, connection.updated_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION private.runtime_provider_secret_envelope(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.runtime_provider_secret_envelope(TEXT) TO yux_runtime;

UPDATE public.platform_provider_connections
SET public_config = public_config - 'primaryModel' - 'fallbackModels',
    updated_at = NOW()
WHERE provider_type = 'llm'
  AND provider_key = 'openrouter';
