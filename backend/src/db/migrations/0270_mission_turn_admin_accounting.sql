GRANT SELECT (organization_id, contract_id, operation_id, action, audience,
  agent_run_id, reserved_credits, charged_credits, unlimited, state, attempts)
  ON private.strategy_workflow_credit_holds TO yux_api;

CREATE POLICY strategy_workflow_credit_holds_admin_mission_read
  ON private.strategy_workflow_credit_holds FOR SELECT TO yux_api
  USING (
    current_setting('app.current_role', true) = 'yux_admin'
    AND action = 'agent_runtime_mission_conversation_turn'
    AND organization_id = ANY(coalesce(nullif(current_setting('app.current_orgs', true), ''), '{}')::uuid[])
  );
