BEGIN;

CREATE TABLE IF NOT EXISTS public.action_learning_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL REFERENCES public.action_learning_recommendations(id) ON DELETE CASCADE,
  context_snapshot_id UUID REFERENCES public.action_mission_context_snapshots(id) ON DELETE SET NULL,
  baseline_hash TEXT NOT NULL CHECK (baseline_hash ~ '^[a-f0-9]{64}$'),
  candidate_config JSONB NOT NULL CHECK (jsonb_typeof(candidate_config) = 'object'),
  candidate_config_hash TEXT NOT NULL CHECK (candidate_config_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','rejected')),
  baseline_metrics JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(baseline_metrics) = 'object'),
  candidate_metrics JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(candidate_metrics) = 'object'),
  comparison JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(comparison) = 'object'),
  golden_corpus_hash TEXT CHECK (golden_corpus_hash IS NULL OR golden_corpus_hash ~ '^[a-f0-9]{64}$'),
  golden_gate_passed BOOLEAN,
  production_effects_observed BOOLEAN NOT NULL DEFAULT FALSE CHECK (production_effects_observed = FALSE),
  failure_reason TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id,recommendation_id,candidate_config_hash)
);

CREATE TABLE IF NOT EXISTS public.action_learning_promotion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL REFERENCES public.action_learning_recommendations(id) ON DELETE RESTRICT,
  experiment_id UUID NOT NULL REFERENCES public.action_learning_experiments(id) ON DELETE RESTRICT,
  change_type TEXT NOT NULL CHECK (change_type IN ('pack_change','prompt_change','policy_change','knowledge_candidate')),
  target_key TEXT NOT NULL,
  requested_change JSONB NOT NULL CHECK (jsonb_typeof(requested_change) = 'object'),
  requested_change_hash TEXT NOT NULL CHECK (requested_change_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','implemented')),
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id,experiment_id)
);

CREATE INDEX IF NOT EXISTS idx_action_learning_experiments_review
  ON public.action_learning_experiments(organization_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_learning_promotion_requests_review
  ON public.action_learning_promotion_requests(organization_id,status,created_at DESC);

ALTER TABLE public.action_learning_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_learning_experiments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.action_learning_promotion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_learning_promotion_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS action_learning_experiments_read ON public.action_learning_experiments;
DROP POLICY IF EXISTS action_learning_experiments_write ON public.action_learning_experiments;
CREATE POLICY action_learning_experiments_read ON public.action_learning_experiments
  FOR SELECT USING (private.rls_can_access_organization(organization_id));
CREATE POLICY action_learning_experiments_write ON public.action_learning_experiments
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

DROP POLICY IF EXISTS action_learning_promotion_requests_read ON public.action_learning_promotion_requests;
DROP POLICY IF EXISTS action_learning_promotion_requests_write ON public.action_learning_promotion_requests;
CREATE POLICY action_learning_promotion_requests_read ON public.action_learning_promotion_requests
  FOR SELECT USING (private.rls_can_access_organization(organization_id));
CREATE POLICY action_learning_promotion_requests_write ON public.action_learning_promotion_requests
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

COMMIT;
