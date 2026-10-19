-- Explicit manual FX; no guessed/default rate, no activation or credit change.
ALTER TABLE public.radar_operational_limits ADD COLUMN cost_policy JSONB NOT NULL DEFAULT '{"usdToBrl":null,"rateAsOf":null,"rateSource":"manual","marginPercent":"0"}'::jsonb CHECK(jsonb_typeof(cost_policy)='object');
ALTER TABLE public.radar_operational_limit_audit ADD COLUMN old_cost_policy JSONB;
ALTER TABLE public.radar_operational_limit_audit ADD COLUMN new_cost_policy JSONB;
