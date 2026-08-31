BEGIN;

CREATE TABLE IF NOT EXISTS public.action_plan_artifact_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.action_plans(id) ON DELETE CASCADE,
  from_pack_key TEXT NOT NULL,
  artifact_key TEXT NOT NULL,
  from_step_key TEXT NOT NULL,
  output_path TEXT NOT NULL,
  to_pack_key TEXT NOT NULL,
  to_step_key TEXT NOT NULL,
  input_key TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id,from_pack_key,artifact_key,to_pack_key,input_key)
);

CREATE INDEX IF NOT EXISTS idx_action_plan_artifact_bindings_plan
  ON public.action_plan_artifact_bindings(organization_id,plan_id,created_at);

ALTER TABLE public.action_plan_artifact_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_plan_artifact_bindings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_plan_artifact_bindings_tenant ON public.action_plan_artifact_bindings;
CREATE POLICY action_plan_artifact_bindings_tenant ON public.action_plan_artifact_bindings
  USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));

COMMIT;
