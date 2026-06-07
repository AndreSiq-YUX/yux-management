DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'marketing_agent_global_prompts',
        'marketing_workflows',
        'marketing_workflow_nodes',
        'marketing_workflow_edges',
        'marketing_workflow_runs',
        'marketing_agent_runs',
        'marketing_tool_runs',
        'agent_budget_policies',
        'model_routing_rules',
        'marketing_agent_tool_policies'
      )
      AND rowsecurity = FALSE
  ) THEN
    RAISE EXCEPTION 'marketing agent harness runtime tables without RLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_agents'
      AND column_name IN ('prompt_config', 'context_policy', 'quality_gates', 'model_parameters', 'prompt_version')
    GROUP BY table_name
    HAVING COUNT(*) = 5
  ) THEN
    RAISE EXCEPTION 'marketing_agents prompt/config columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.marketing_agent_global_prompts
    WHERE agent_type = 'multichannel_writer'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'global system prompts were not seeded';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'marketing_agent_global_prompts'
      AND policyname = 'Internal users manage marketing global prompts'
  ) THEN
    RAISE EXCEPTION 'global prompt internal RLS policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'ai_usage_ledger'
      AND constraint_name = 'ai_usage_ledger_workflow_run_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    RAISE EXCEPTION 'ai_usage_ledger workflow_run foreign key missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.model_routing_rules
    WHERE agent_type = 'campaign_strategist'
      AND routing_tier = 'premium'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'default model routing rules missing';
  END IF;
END $$;
