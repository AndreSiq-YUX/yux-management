CREATE POLICY strategy_workflow_credit_holds_admin_presales_read
  ON private.strategy_workflow_credit_holds FOR SELECT TO yux_api
  USING (
    current_setting('app.current_role', true) = 'yux_admin'
    AND action = 'agent_runtime_workflow'
    AND audience = 'internal_operator'
    AND organization_id = ANY(coalesce(nullif(current_setting('app.current_orgs', true), ''), '{}')::uuid[])
  );

CREATE INDEX IF NOT EXISTS agent_execution_runs_presales_operation_idx
  ON public.agent_execution_runs (organization_id, (input_payload->>'strategy_operation_id'), contract_id)
  WHERE run_source = 'strategy_admin' AND profile_key = 'growth_strategist'
    AND input_payload ? 'strategy_operation_id';
