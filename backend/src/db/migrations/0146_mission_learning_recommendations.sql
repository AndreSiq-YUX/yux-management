BEGIN;

ALTER TABLE public.action_mission_context_snapshots
  ADD COLUMN IF NOT EXISTS approved_learning_memory JSONB NOT NULL DEFAULT '[]'::JSONB
  CHECK (jsonb_typeof(approved_learning_memory) = 'array');

CREATE TABLE IF NOT EXISTS public.action_mission_memory_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE CASCADE,
  pack_key TEXT NOT NULL,
  pack_version TEXT NOT NULL,
  outcome_hash TEXT NOT NULL CHECK (outcome_hash ~ '^[a-f0-9]{64}$'),
  summary JSONB NOT NULL CHECK (jsonb_typeof(summary) = 'object'),
  evidence_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, mission_id, outcome_hash)
);

CREATE TABLE IF NOT EXISTS public.action_learning_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE CASCADE,
  memory_summary_id UUID NOT NULL REFERENCES public.action_mission_memory_summaries(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('pack_change','prompt_change','policy_change','knowledge_candidate')),
  target_key TEXT NOT NULL CHECK (BTRIM(target_key) <> ''),
  rationale TEXT NOT NULL CHECK (BTRIM(rationale) <> ''),
  evidence_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expected_impact JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(expected_impact) = 'object'),
  recommendation_hash TEXT NOT NULL CHECK (recommendation_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','shadow_testing','approved','rejected','promoted')),
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, recommendation_hash)
);

CREATE INDEX IF NOT EXISTS idx_action_mission_memory_approved_pack
  ON public.action_mission_memory_summaries(organization_id, pack_key, reviewed_at DESC)
  WHERE review_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_action_learning_recommendations_review
  ON public.action_learning_recommendations(organization_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION private.guard_action_learning_content_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.mission_id IS DISTINCT FROM OLD.mission_id
    OR NEW.memory_summary_id IS DISTINCT FROM OLD.memory_summary_id
    OR NEW.recommendation_type IS DISTINCT FROM OLD.recommendation_type
    OR NEW.target_key IS DISTINCT FROM OLD.target_key
    OR NEW.rationale IS DISTINCT FROM OLD.rationale
    OR NEW.evidence_ids IS DISTINCT FROM OLD.evidence_ids
    OR NEW.expected_impact IS DISTINCT FROM OLD.expected_impact
    OR NEW.recommendation_hash IS DISTINCT FROM OLD.recommendation_hash THEN
    RAISE EXCEPTION 'action_learning_recommendation_content_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_learning_recommendation_content_immutable ON public.action_learning_recommendations;
CREATE TRIGGER action_learning_recommendation_content_immutable
  BEFORE UPDATE ON public.action_learning_recommendations
  FOR EACH ROW EXECUTE FUNCTION private.guard_action_learning_content_immutable();

ALTER TABLE public.action_mission_memory_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_mission_memory_summaries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.action_learning_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_learning_recommendations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS action_mission_memory_summaries_read ON public.action_mission_memory_summaries;
DROP POLICY IF EXISTS action_mission_memory_summaries_write ON public.action_mission_memory_summaries;
CREATE POLICY action_mission_memory_summaries_read ON public.action_mission_memory_summaries
  FOR SELECT USING (private.rls_can_access_organization(organization_id));
CREATE POLICY action_mission_memory_summaries_write ON public.action_mission_memory_summaries
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

DROP POLICY IF EXISTS action_learning_recommendations_read ON public.action_learning_recommendations;
DROP POLICY IF EXISTS action_learning_recommendations_write ON public.action_learning_recommendations;
CREATE POLICY action_learning_recommendations_read ON public.action_learning_recommendations
  FOR SELECT USING (private.rls_can_access_organization(organization_id));
CREATE POLICY action_learning_recommendations_write ON public.action_learning_recommendations
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

INSERT INTO public.platform_modules (key,name,base,internal_route,portal_route,required_permissions)
VALUES ('mission_learning','Aprendizado de Missões',FALSE,'/admin/mission-learning',NULL,ARRAY['action_engine.read']::TEXT[])
ON CONFLICT (key) DO UPDATE SET
  name=EXCLUDED.name,internal_route=EXCLUDED.internal_route,
  required_permissions=EXCLUDED.required_permissions,updated_at=NOW();

COMMIT;
