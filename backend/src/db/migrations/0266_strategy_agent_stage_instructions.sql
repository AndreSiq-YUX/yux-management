ALTER TABLE public.strategy_agent_prompt_versions
  ADD COLUMN stage_instructions JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (CASE WHEN jsonb_typeof(stage_instructions) = 'array'
                THEN jsonb_array_length(stage_instructions) <= 48 ELSE false END);
