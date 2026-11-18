ALTER TABLE private.strategy_workflow_credit_holds
  ADD COLUMN action TEXT NOT NULL DEFAULT 'agent_runtime_workflow',
  ADD COLUMN audience TEXT NOT NULL DEFAULT 'internal_operator',
  ADD COLUMN agent_run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  ADD CONSTRAINT workflow_credit_hold_audience CHECK (
    (action = 'agent_runtime_workflow' AND audience = 'internal_operator')
    OR (action = 'agent_runtime_mission_conversation_turn'
        AND audience IN ('internal_operator', 'client_user'))
  );

CREATE INDEX workflow_credit_holds_agent_run
  ON private.strategy_workflow_credit_holds (agent_run_id) WHERE agent_run_id IS NOT NULL;

GRANT UPDATE (agent_run_id) ON private.strategy_workflow_credit_holds TO yux_runtime;

ALTER POLICY strategy_workflow_credit_holds_runtime ON private.strategy_workflow_credit_holds
  USING (
    organization_id = ANY(coalesce(nullif(current_setting('app.current_orgs', true), ''), '{}')::uuid[])
    AND contract_id = nullif(current_setting('app.current_contract_id', true), '')::uuid
    AND current_setting('app.current_profile_key', true) = 'growth_strategist'
    AND audience = current_setting('app.current_audience', true)
  );
