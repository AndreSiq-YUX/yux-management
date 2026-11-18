ALTER TABLE private.mission_prompt_versions
  ADD COLUMN source_rules JSONB CHECK (jsonb_typeof(source_rules) = 'object');

ALTER TABLE public.strategy_agent_prompt_versions
  ADD COLUMN source_rules JSONB CHECK (jsonb_typeof(source_rules) = 'object');

ALTER TABLE private.mission_conversation_turn_context
  ADD COLUMN excluded_sources TEXT[] NOT NULL DEFAULT '{}';
