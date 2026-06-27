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
  'openai/gpt-4.1-mini',
  'openai/gpt-4o',
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

NOTIFY pgrst, 'reload schema';
