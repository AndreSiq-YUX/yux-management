-- YUX Agent Harness runtime: central event queue, execution trace,
-- autonomy policies, strategic workflow specs, subagent runs and
-- controlled active-learning governance.

CREATE TABLE IF NOT EXISTS public.agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id UUID,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  source_channel TEXT NOT NULL DEFAULT 'unknown' CHECK (BTRIM(source_channel) <> ''),
  event_type TEXT NOT NULL CHECK (BTRIM(event_type) <> ''),
  external_event_id TEXT,
  inbound_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object'),
  normalized_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(normalized_payload) = 'object'),
  content_text TEXT NOT NULL DEFAULT '',
  media_summary TEXT NOT NULL DEFAULT '',
  signature_status TEXT NOT NULL DEFAULT 'not_checked' CHECK (signature_status IN ('not_checked','valid','invalid','missing')),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','debounced','queued','processing','processed','ignored','failed')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.agent_queue_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.agent_events(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  queue_name TEXT NOT NULL DEFAULT 'agent.default' CHECK (BTRIM(queue_name) <> ''),
  job_type TEXT NOT NULL CHECK (BTRIM(job_type) <> ''),
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting_approval','succeeded','failed','cancelled','dead_letter')),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object'),
  result_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(result_payload) = 'object'),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_autonomy_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  profile_key TEXT,
  channel TEXT,
  intent_key TEXT,
  stage_key TEXT,
  action_key TEXT,
  autonomy_mode TEXT NOT NULL DEFAULT 'suggestion' CHECK (autonomy_mode IN ('draft','suggestion','auto_send','approval_required','handoff','blocked')),
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
  requires_business_hours BOOLEAN NOT NULL DEFAULT FALSE,
  max_auto_send_per_conversation INTEGER NOT NULL DEFAULT 0 CHECK (max_auto_send_per_conversation >= 0),
  confidence_threshold NUMERIC(5,4) NOT NULL DEFAULT 0.75 CHECK (confidence_threshold BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.strategy_workflow_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key TEXT NOT NULL CHECK (BTRIM(workflow_key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  profile_key TEXT NOT NULL DEFAULT 'growth_strategist',
  workflow_type TEXT NOT NULL DEFAULT 'strategic' CHECK (workflow_type IN ('whatsapp','strategic','retrieval','evaluation','learning')),
  trigger_modes TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  planner_profile_key TEXT NOT NULL DEFAULT 'growth_strategist',
  node_spec JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(node_spec) = 'object'),
  subagent_specs JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(subagent_specs) = 'array'),
  verifier_spec JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(verifier_spec) = 'object'),
  synthesis_spec JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(synthesis_spec) = 'object'),
  max_subagents INTEGER NOT NULL DEFAULT 4 CHECK (max_subagents >= 0),
  max_retries_per_node INTEGER NOT NULL DEFAULT 1 CHECK (max_retries_per_node >= 0),
  max_cost_per_run NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (max_cost_per_run >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_key, version)
);

CREATE TABLE IF NOT EXISTS public.agent_execution_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.agent_events(id) ON DELETE SET NULL,
  queue_job_id UUID REFERENCES public.agent_queue_jobs(id) ON DELETE SET NULL,
  workflow_spec_id UUID REFERENCES public.strategy_workflow_specs(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  ai_message_run_id UUID REFERENCES public.ai_message_runs(id) ON DELETE SET NULL,
  strategy_chat_session_id UUID REFERENCES public.yux_strategy_chat_sessions(id) ON DELETE SET NULL,
  run_source TEXT NOT NULL DEFAULT 'runtime' CHECK (run_source IN ('whatsapp','strategy_admin','marketing_studio','scheduled','runtime','test')),
  profile_key TEXT NOT NULL,
  assistant_id UUID REFERENCES public.ai_assistants(id) ON DELETE SET NULL,
  agent_role TEXT,
  workflow_key TEXT,
  autonomy_mode TEXT NOT NULL DEFAULT 'suggestion' CHECK (autonomy_mode IN ('draft','suggestion','auto_send','approval_required','handoff','blocked')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting_approval','succeeded','failed','cancelled','blocked','retried')),
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  model_provider TEXT,
  model_name TEXT,
  fallback_model_name TEXT,
  routing_rule_id UUID REFERENCES public.model_routing_rules(id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_payload) = 'object'),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_payload) = 'object'),
  decision_summary TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_execution_runs(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES public.agent_execution_steps(id) ON DELETE SET NULL,
  step_key TEXT NOT NULL CHECK (BTRIM(step_key) <> ''),
  step_type TEXT NOT NULL CHECK (step_type IN ('ingest','debounce','classify','retrieval','planner','agent','subagent','tool','verifier','global_evaluator','synthesizer','policy','dispatch','learning')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','blocked','retried','skipped')),
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  model_provider TEXT,
  model_name TEXT,
  prompt_hash TEXT,
  context_hash TEXT,
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_payload) = 'object'),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_payload) = 'object'),
  decision JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(decision) = 'object'),
  warnings TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_context_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_execution_runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.agent_execution_steps(id) ON DELETE SET NULL,
  profile_key TEXT NOT NULL,
  context_kind TEXT NOT NULL DEFAULT 'runtime' CHECK (context_kind IN ('runtime','rag','crm','conversation','metrics','workflow','subagent')),
  safe_context JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(safe_context) = 'object'),
  card_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  chunk_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  asset_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  context_hash TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0 CHECK (token_estimate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_execution_runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.agent_execution_steps(id) ON DELETE SET NULL,
  verifier_key TEXT NOT NULL CHECK (BTRIM(verifier_key) <> ''),
  subject_step_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','passed','failed','warning','skipped')),
  score NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 1),
  rubric JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(rubric) = 'object'),
  findings JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(findings) = 'array'),
  follow_up_prompt TEXT NOT NULL DEFAULT '',
  retry_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.strategy_subagent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_execution_runs(id) ON DELETE CASCADE,
  planner_step_id UUID REFERENCES public.agent_execution_steps(id) ON DELETE SET NULL,
  subagent_key TEXT NOT NULL CHECK (BTRIM(subagent_key) <> ''),
  profile_key TEXT NOT NULL,
  objective TEXT NOT NULL,
  context_summary TEXT NOT NULL DEFAULT '',
  allowed_tools TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  rubric JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(rubric) = 'object'),
  max_attempts INTEGER NOT NULL DEFAULT 2 CHECK (max_attempts > 0),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','blocked','cancelled')),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_payload) = 'object'),
  verification_result_id UUID REFERENCES public.agent_verification_results(id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  outcome_type TEXT NOT NULL CHECK (BTRIM(outcome_type) <> ''),
  outcome_direction TEXT NOT NULL DEFAULT 'neutral' CHECK (outcome_direction IN ('positive','neutral','negative','unknown')),
  outcome_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  observed_value NUMERIC(14,2),
  attribution_window TEXT NOT NULL DEFAULT 'unknown',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_learning_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  outcome_id UUID REFERENCES public.agent_outcomes(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_key TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (BTRIM(signal_type) <> ''),
  target_type TEXT NOT NULL CHECK (target_type IN ('concept_card','chunk','playbook','prompt','model_route','autonomy_policy','workflow','subagent','offer','script')),
  target_id TEXT,
  signal_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(evidence) = 'object'),
  aggregation_window TEXT NOT NULL DEFAULT 'event',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_improvement_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_key TEXT NOT NULL,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('concept_card','playbook','prompt','model_route','autonomy_policy','workflow','subagent','rag_rerank')),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  rationale TEXT NOT NULL DEFAULT '',
  target_type TEXT,
  target_id TEXT,
  proposed_change JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(proposed_change) = 'object'),
  baseline_metrics JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(baseline_metrics) = 'object'),
  candidate_metrics JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(candidate_metrics) = 'object'),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','shadow_testing','approved','rejected','promoted','rolled_back','archived')),
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
  created_by_run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_shadow_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES public.agent_improvement_recommendations(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  experiment_key TEXT NOT NULL CHECK (BTRIM(experiment_key) <> ''),
  baseline_version TEXT NOT NULL DEFAULT 'current',
  candidate_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('draft','running','completed','failed','cancelled')),
  sample_size INTEGER NOT NULL DEFAULT 0 CHECK (sample_size >= 0),
  success_metric TEXT NOT NULL DEFAULT 'quality_score',
  baseline_score NUMERIC(8,4),
  candidate_score NUMERIC(8,4),
  result_summary TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_org_status_created ON public.agent_events(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_conversation_created ON public.agent_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_queue_jobs_status_available ON public.agent_queue_jobs(status, available_at, priority);
CREATE INDEX IF NOT EXISTS idx_agent_queue_jobs_conversation ON public.agent_queue_jobs(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_autonomy_scope ON public.agent_autonomy_policies(organization_id, client_id, assistant_id, profile_key, status);
CREATE INDEX IF NOT EXISTS idx_strategy_workflow_specs_key_status ON public.strategy_workflow_specs(workflow_key, status, version DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_org_status_created ON public.agent_execution_runs(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation_created ON public.agent_execution_runs(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_profile_status ON public.agent_execution_runs(profile_key, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_steps_run_created ON public.agent_execution_steps(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_steps_type_status ON public.agent_execution_steps(step_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_context_run_kind ON public.agent_context_snapshots(run_id, context_kind);
CREATE INDEX IF NOT EXISTS idx_agent_verification_run_status ON public.agent_verification_results(run_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategy_subagent_runs_run_status ON public.strategy_subagent_runs(run_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_outcomes_org_type ON public.agent_outcomes(organization_id, outcome_type, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_learning_profile_target ON public.agent_learning_signals(profile_key, target_type, signal_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_improvements_status_risk ON public.agent_improvement_recommendations(status, risk_level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_shadow_recommendation_status ON public.agent_shadow_experiments(recommendation_id, status);

CREATE TRIGGER update_agent_queue_jobs_updated_at BEFORE UPDATE ON public.agent_queue_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_autonomy_policies_updated_at BEFORE UPDATE ON public.agent_autonomy_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_strategy_workflow_specs_updated_at BEFORE UPDATE ON public.strategy_workflow_specs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_execution_runs_updated_at BEFORE UPDATE ON public.agent_execution_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_improvement_recommendations_updated_at BEFORE UPDATE ON public.agent_improvement_recommendations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_shadow_experiments_updated_at BEFORE UPDATE ON public.agent_shadow_experiments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_queue_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_autonomy_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_workflow_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_execution_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_execution_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_context_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_verification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_subagent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_learning_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_improvement_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_shadow_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users read agent events" ON public.agent_events
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Service role manages agent events" ON public.agent_events
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users read agent queue jobs" ON public.agent_queue_jobs
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Service role manages agent queue jobs" ON public.agent_queue_jobs
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users manage agent autonomy policies" ON public.agent_autonomy_policies
  FOR ALL TO authenticated USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Service role manages agent autonomy policies" ON public.agent_autonomy_policies
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users manage strategy workflow specs" ON public.strategy_workflow_specs
  FOR ALL TO authenticated USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Service role manages strategy workflow specs" ON public.strategy_workflow_specs
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users read agent execution runs" ON public.agent_execution_runs
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Service role manages agent execution runs" ON public.agent_execution_runs
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users read agent execution steps" ON public.agent_execution_steps
  FOR SELECT TO authenticated USING (
    private.is_internal_user()
    OR EXISTS (
      SELECT 1 FROM public.agent_execution_runs r
      WHERE r.id = run_id AND r.organization_id IS NOT NULL
        AND private.can_access_marketing_studio_organization(r.organization_id, 'configure')
    )
  );
CREATE POLICY "Service role manages agent execution steps" ON public.agent_execution_steps
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users read agent context snapshots" ON public.agent_context_snapshots
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Service role manages agent context snapshots" ON public.agent_context_snapshots
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users read agent verification results" ON public.agent_verification_results
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Service role manages agent verification results" ON public.agent_verification_results
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users read strategy subagent runs" ON public.strategy_subagent_runs
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Service role manages strategy subagent runs" ON public.strategy_subagent_runs
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users read agent outcomes" ON public.agent_outcomes
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Service role manages agent outcomes" ON public.agent_outcomes
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users read agent learning signals" ON public.agent_learning_signals
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Service role manages agent learning signals" ON public.agent_learning_signals
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users manage agent improvement recommendations" ON public.agent_improvement_recommendations
  FOR ALL TO authenticated USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Service role manages agent improvement recommendations" ON public.agent_improvement_recommendations
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users manage agent shadow experiments" ON public.agent_shadow_experiments
  FOR ALL TO authenticated USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Service role manages agent shadow experiments" ON public.agent_shadow_experiments
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

REVOKE ALL ON public.agent_events FROM anon;
REVOKE ALL ON public.agent_queue_jobs FROM anon;
REVOKE ALL ON public.agent_autonomy_policies FROM anon;
REVOKE ALL ON public.strategy_workflow_specs FROM anon;
REVOKE ALL ON public.agent_execution_runs FROM anon;
REVOKE ALL ON public.agent_execution_steps FROM anon;
REVOKE ALL ON public.agent_context_snapshots FROM anon;
REVOKE ALL ON public.agent_verification_results FROM anon;
REVOKE ALL ON public.strategy_subagent_runs FROM anon;
REVOKE ALL ON public.agent_outcomes FROM anon;
REVOKE ALL ON public.agent_learning_signals FROM anon;
REVOKE ALL ON public.agent_improvement_recommendations FROM anon;
REVOKE ALL ON public.agent_shadow_experiments FROM anon;

GRANT SELECT ON public.agent_events TO authenticated;
GRANT SELECT ON public.agent_queue_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_autonomy_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_workflow_specs TO authenticated;
GRANT SELECT ON public.agent_execution_runs TO authenticated;
GRANT SELECT ON public.agent_execution_steps TO authenticated;
GRANT SELECT ON public.agent_context_snapshots TO authenticated;
GRANT SELECT ON public.agent_verification_results TO authenticated;
GRANT SELECT ON public.strategy_subagent_runs TO authenticated;
GRANT SELECT ON public.agent_outcomes TO authenticated;
GRANT SELECT ON public.agent_learning_signals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_improvement_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_shadow_experiments TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_queue_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_autonomy_policies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_workflow_specs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_execution_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_execution_steps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_context_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_verification_results TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_subagent_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_outcomes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_learning_signals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_improvement_recommendations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_shadow_experiments TO service_role;

INSERT INTO public.strategy_workflow_specs (
  workflow_key,
  name,
  description,
  profile_key,
  workflow_type,
  trigger_modes,
  node_spec,
  subagent_specs,
  verifier_spec,
  synthesis_spec,
  max_subagents,
  max_retries_per_node,
  version
)
VALUES
  (
    'diagnostic_48h',
    'Diagnostico 48h',
    'Workflow estrategico para diagnostico rapido de gargalos, caixa, CRM, oferta e proximos passos.',
    'growth_strategist',
    'strategic',
    ARRAY['strategy_admin','manual'],
    jsonb_build_object('planner','growth_strategist','retrieval','strategy_rag','evaluator','risk_auditor'),
    jsonb_build_array(
      jsonb_build_object('key','crm_pipeline_analyst','profile_key','crm_controller','objective','Avaliar funil, follow-up e oportunidades paradas.'),
      jsonb_build_object('key','cash_metrics_analyst','profile_key','metrics_cash_mroi','objective','Avaliar caixa, CAC, ticket, LTV e riscos financeiros.'),
      jsonb_build_object('key','offer_conversion_analyst','profile_key','offer_conversion','objective','Avaliar oferta, objecoes e ambiente de conversao.'),
      jsonb_build_object('key','risk_auditor','profile_key','growth_strategist','objective','Validar riscos, premissas e o que nao fazer.')
    ),
    jsonb_build_object('minimum_score',0.75,'retry_on_fail',true,'required_fields',jsonb_build_array('objective','action','owner','metric','next_step')),
    jsonb_build_object('format','consultative_plan','include_risks',true,'include_30_60_90',false),
    4,
    1,
    1
  ),
  (
    'proposal_consultative',
    'Proposta Consultiva',
    'Workflow para transformar diagnostico em escopo, fases, entregaveis, riscos e proposta YUX.',
    'proposal_delivery',
    'strategic',
    ARRAY['strategy_admin','manual'],
    jsonb_build_object('planner','proposal_delivery','retrieval','strategy_rag','evaluator','risk_auditor'),
    jsonb_build_array(
      jsonb_build_object('key','proposal_scope_analyst','profile_key','proposal_delivery','objective','Montar escopo e fases com premissas claras.'),
      jsonb_build_object('key','cash_metrics_analyst','profile_key','metrics_cash_mroi','objective','Validar impacto financeiro e prioridade por caixa.'),
      jsonb_build_object('key','risk_auditor','profile_key','growth_strategist','objective','Auditar riscos comerciais e de entrega.')
    ),
    jsonb_build_object('minimum_score',0.8,'retry_on_fail',true,'required_fields',jsonb_build_array('scope','risk','delivery_step','approval_needed')),
    jsonb_build_object('format','proposal_outline','include_assumptions',true),
    3,
    1,
    1
  ),
  (
    'whatsapp_conversation_turn',
    'Turno Conversacional WhatsApp',
    'Workflow de conversa para classificar, recuperar contexto, gerar resposta e aplicar policy de autonomia.',
    'ai_sdr_comercial_1',
    'whatsapp',
    ARRAY['whatsapp','omnichannel'],
    jsonb_build_object('classify','conversation_classifier','retrieval','strategy_rag','policy','autonomy_policy'),
    jsonb_build_array(),
    jsonb_build_object('minimum_score',0.7,'retry_on_fail',false,'required_fields',jsonb_build_array('message','next_step','handoff_required')),
    jsonb_build_object('format','conversation_reply','include_policy_decision',true),
    0,
    0,
    1
  )
ON CONFLICT (workflow_key, version) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    node_spec = EXCLUDED.node_spec,
    subagent_specs = EXCLUDED.subagent_specs,
    verifier_spec = EXCLUDED.verifier_spec,
    synthesis_spec = EXCLUDED.synthesis_spec,
    updated_at = NOW();

INSERT INTO public.agent_autonomy_policies (
  profile_key,
  channel,
  action_key,
  autonomy_mode,
  risk_level,
  confidence_threshold,
  config
)
VALUES
  ('ai_sdr_comercial_1', 'whatsapp', 'send_external_message', 'suggestion', 'medium', 0.75, jsonb_build_object('defaultPolicy', true)),
  ('ai_closer', 'whatsapp', 'send_external_message', 'approval_required', 'high', 0.85, jsonb_build_object('defaultPolicy', true)),
  ('support_assistant', 'whatsapp', 'send_external_message', 'suggestion', 'medium', 0.75, jsonb_build_object('defaultPolicy', true)),
  ('customer_growth_comercial_2', 'whatsapp', 'upsell_message', 'approval_required', 'high', 0.85, jsonb_build_object('defaultPolicy', true)),
  ('growth_strategist', 'strategy_admin', 'client_visible_recommendation', 'approval_required', 'high', 0.9, jsonb_build_object('defaultPolicy', true))
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
