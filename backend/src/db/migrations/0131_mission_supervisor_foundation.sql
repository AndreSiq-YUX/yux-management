-- Generic Mission goals, bounded autonomy and immutable planning context.

ALTER TABLE public.action_missions
  DROP CONSTRAINT IF EXISTS action_missions_mode_check;
ALTER TABLE public.action_missions
  ADD CONSTRAINT action_missions_mode_check CHECK (mode IN ('shadow','prepare','assisted','autonomous'));

ALTER TABLE public.action_missions
  ADD COLUMN IF NOT EXISTS goal JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(goal) = 'object'),
  ADD COLUMN IF NOT EXISTS autonomy_envelope JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(autonomy_envelope) = 'object'),
  ADD COLUMN IF NOT EXISTS pack_selection JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(pack_selection) = 'object');

CREATE TABLE IF NOT EXISTS public.action_mission_context_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  context_hash TEXT NOT NULL CHECK (context_hash ~ '^[a-f0-9]{64}$'),
  query TEXT NOT NULL,
  company_context JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(company_context) = 'object'),
  knowledge_items JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(knowledge_items) = 'array'),
  strategy_items JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(strategy_items) = 'array'),
  live_state JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(live_state) = 'object'),
  capability_manifest JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(capability_manifest) = 'array'),
  capability_catalog_hash TEXT NOT NULL CHECK (capability_catalog_hash ~ '^[a-f0-9]{64}$'),
  source_ids JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(source_ids) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, context_hash)
);

CREATE INDEX IF NOT EXISTS idx_action_mission_context_snapshots_mission
  ON public.action_mission_context_snapshots(mission_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.guard_action_mission_context_snapshots_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'action_mission_context_snapshots_append_only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_mission_context_snapshots_append_only ON public.action_mission_context_snapshots;
CREATE TRIGGER action_mission_context_snapshots_append_only
  BEFORE UPDATE OR DELETE ON public.action_mission_context_snapshots
  FOR EACH ROW EXECUTE FUNCTION private.guard_action_mission_context_snapshots_append_only();

ALTER TABLE public.action_mission_context_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_mission_context_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_mission_context_snapshots_read ON public.action_mission_context_snapshots;
DROP POLICY IF EXISTS action_mission_context_snapshots_write ON public.action_mission_context_snapshots;
CREATE POLICY action_mission_context_snapshots_read ON public.action_mission_context_snapshots FOR SELECT
  USING (private.rls_can_access_organization(organization_id));
CREATE POLICY action_mission_context_snapshots_write ON public.action_mission_context_snapshots FOR ALL
  USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());
