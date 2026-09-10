-- Remove the previously seeded GPT-4.1 route. Paid OpenRouter models are also
-- rejected by the application unless listed in OPENROUTER_ALLOWED_PAID_MODELS.
UPDATE public.model_routing_rules
SET status = 'paused', updated_at = NOW()
WHERE provider = 'openrouter'
  AND status = 'active'
  AND (
    model_name = 'openai/gpt-4.1-mini'
    OR fallback_model_name = 'openai/gpt-4.1-mini'
  );

INSERT INTO public.model_routing_rules (
  agent_type,
  routing_tier,
  provider,
  model_name,
  fallback_model_name,
  max_input_tokens,
  max_output_tokens,
  temperature,
  max_cost_per_run,
  status
)
SELECT
  'growth_strategist',
  'default',
  'openrouter',
  'nex-agi/nex-n2.5-mini:free',
  NULL,
  16000,
  2200,
  0.35,
  0,
  'active'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.model_routing_rules
  WHERE agent_type = 'growth_strategist'
    AND routing_tier = 'default'
    AND status = 'active'
);

UPDATE public.platform_provider_connections
SET public_config = (public_config - 'primaryModel' - 'fallbackModels') || jsonb_build_object(
      'primaryModel', 'nex-agi/nex-n2.5-mini:free',
      'fallbackModels', '[]'::jsonb
    ),
    updated_at = NOW()
WHERE provider_type = 'llm'
  AND provider_key = 'openrouter';

UPDATE public.platform_provider_connections
SET public_config = public_config - 'defaultModel',
    updated_at = NOW()
WHERE provider_type = 'llm'
  AND provider_key = 'openai_direct';
