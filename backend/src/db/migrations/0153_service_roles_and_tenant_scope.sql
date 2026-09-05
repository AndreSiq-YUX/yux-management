-- Least-privilege service identities and defense-in-depth tenant scope.
-- Passwords are deliberately absent and must be provisioned by the deployment secret store.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yux_api') THEN
    CREATE ROLE yux_api LOGIN PASSWORD NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yux_worker') THEN
    CREATE ROLE yux_worker LOGIN PASSWORD NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yux_runtime') THEN
    CREATE ROLE yux_runtime LOGIN PASSWORD NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yux_migrator') THEN
    CREATE ROLE yux_migrator LOGIN PASSWORD NULL;
  END IF;
END;
$$;

ALTER ROLE yux_api NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
ALTER ROLE yux_worker NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
ALTER ROLE yux_runtime NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
ALTER ROLE yux_migrator NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO yux_api,yux_worker,yux_runtime,yux_migrator', current_database());
END;
$$;

GRANT USAGE ON SCHEMA public TO yux_api,yux_worker,yux_runtime,yux_migrator;
GRANT USAGE ON SCHEMA private TO yux_api,yux_worker,yux_runtime;
GRANT CREATE ON SCHEMA public TO yux_migrator;

GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO yux_api,yux_worker;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO yux_api,yux_worker;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO yux_api,yux_worker;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO yux_api,yux_worker;

GRANT SELECT ON TABLE
  public.organizations,
  public.contracts,
  public.yux_strategy_agent_profiles,
  public.marketing_agent_global_prompts,
  public.model_routing_rules,
  public.marketing_agent_tool_policies,
  public.agent_budget_policies,
  public.strategy_workflow_specs,
  public.agent_autonomy_policies,
  public.yux_strategy_concept_cards,
  public.yux_strategy_source_chunks,
  public.yux_strategy_source_assets,
  public.yux_strategy_profile_tool_policies,
  public.yux_strategy_card_embeddings,
  public.yux_strategy_chunk_embeddings,
  public.yux_strategy_asset_embeddings,
  public.organization_company_profiles,
  public.marketing_brand_profiles,
  public.marketing_products_services,
  public.knowledge_sources,
  public.knowledge_entries,
  public.marketing_knowledge_documents,
  public.marketing_knowledge_chunks,
  public.ai_assistant_knowledge_links,
  public.ai_assistant_safety_rules,
  public.ai_credit_wallets
TO yux_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE
  public.agent_events,
  public.agent_queue_jobs,
  public.agent_execution_runs,
  public.agent_execution_steps,
  public.agent_context_snapshots,
  public.agent_verification_results,
  public.strategy_subagent_runs,
  public.agent_outcomes,
  public.agent_learning_signals,
  public.yux_strategy_retrieval_queries,
  public.ai_usage_ledger
TO yux_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO yux_runtime;
GRANT EXECUTE ON FUNCTION private.rls_can_access_organization(UUID) TO yux_runtime;
GRANT EXECUTE ON FUNCTION private.rls_is_internal() TO yux_runtime;

REVOKE ALL ON TABLE public.platform_provider_secrets FROM yux_runtime;
REVOKE ALL ON TABLE public.provider_integration_secrets FROM yux_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO yux_api,yux_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE,SELECT ON SEQUENCES TO yux_api,yux_worker;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'organization_company_profiles',
    'knowledge_sources',
    'knowledge_entries',
    'knowledge_publications',
    'marketing_brand_profiles',
    'marketing_products_services',
    'marketing_knowledge_documents',
    'marketing_knowledge_chunks',
    'agent_events',
    'agent_queue_jobs',
    'agent_execution_runs',
    'agent_outcomes',
    'agent_learning_signals',
    'yux_strategy_retrieval_queries',
    'ai_credit_wallets',
    'ai_usage_ledger'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target_table);
    EXECUTE format('DROP POLICY IF EXISTS yux_service_tenant_access ON public.%I', target_table);
    EXECUTE format(
      'CREATE POLICY yux_service_tenant_access ON public.%I AS PERMISSIVE FOR ALL TO yux_api,yux_worker,yux_runtime USING (organization_id IS NOT NULL AND private.rls_can_access_organization(organization_id)) WITH CHECK (organization_id IS NOT NULL AND private.rls_can_access_organization(organization_id))',
      target_table
    );
    EXECUTE format('DROP POLICY IF EXISTS yux_tenant_scope ON public.%I', target_table);
    EXECUTE format(
      'CREATE POLICY yux_tenant_scope ON public.%I AS RESTRICTIVE FOR ALL USING (organization_id IS NOT NULL AND private.rls_can_access_organization(organization_id)) WITH CHECK (organization_id IS NOT NULL AND private.rls_can_access_organization(organization_id))',
      target_table
    );
  END LOOP;
END;
$$;

ALTER TABLE public.agent_execution_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_execution_steps FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS yux_service_tenant_access ON public.agent_execution_steps;
CREATE POLICY yux_service_tenant_access ON public.agent_execution_steps AS PERMISSIVE FOR ALL TO yux_api,yux_worker,yux_runtime
  USING (EXISTS (
    SELECT 1 FROM public.agent_execution_runs run
    WHERE run.id = agent_execution_steps.run_id
      AND private.rls_can_access_organization(run.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agent_execution_runs run
    WHERE run.id = agent_execution_steps.run_id
      AND private.rls_can_access_organization(run.organization_id)
  ));
DROP POLICY IF EXISTS yux_tenant_scope ON public.agent_execution_steps;
CREATE POLICY yux_tenant_scope ON public.agent_execution_steps AS RESTRICTIVE FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.agent_execution_runs run
    WHERE run.id = agent_execution_steps.run_id
      AND private.rls_can_access_organization(run.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agent_execution_runs run
    WHERE run.id = agent_execution_steps.run_id
      AND private.rls_can_access_organization(run.organization_id)
  ));

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'agent_context_snapshots',
    'agent_verification_results',
    'strategy_subagent_runs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target_table);
    EXECUTE format('DROP POLICY IF EXISTS yux_service_tenant_access ON public.%I', target_table);
    EXECUTE format(
      'CREATE POLICY yux_service_tenant_access ON public.%I AS PERMISSIVE FOR ALL TO yux_api,yux_worker,yux_runtime USING (EXISTS (SELECT 1 FROM public.agent_execution_runs run WHERE run.id = %I.run_id AND private.rls_can_access_organization(run.organization_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.agent_execution_runs run WHERE run.id = %I.run_id AND private.rls_can_access_organization(run.organization_id)))',
      target_table,
      target_table,
      target_table
    );
    EXECUTE format('DROP POLICY IF EXISTS yux_tenant_scope ON public.%I', target_table);
    EXECUTE format(
      'CREATE POLICY yux_tenant_scope ON public.%I AS RESTRICTIVE FOR ALL USING (EXISTS (SELECT 1 FROM public.agent_execution_runs run WHERE run.id = %I.run_id AND private.rls_can_access_organization(run.organization_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.agent_execution_runs run WHERE run.id = %I.run_id AND private.rls_can_access_organization(run.organization_id)))',
      target_table,
      target_table,
      target_table
    );
  END LOOP;
END;
$$;
