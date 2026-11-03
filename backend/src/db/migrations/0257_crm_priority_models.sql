-- Drafts and previews are isolated from the active scoring models.
ALTER TABLE public.crm_instances
  ADD CONSTRAINT crm_instances_id_organization_unique UNIQUE (id, organization_id);

CREATE TABLE public.crm_priority_configs (
  crm_instance_id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  draft JSONB NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
  active_version_id UUID,
  effects_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID NOT NULL REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (crm_instance_id, organization_id),
  FOREIGN KEY (crm_instance_id, organization_id)
    REFERENCES public.crm_instances(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE public.crm_priority_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  definition JSONB NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (crm_instance_id, revision),
  UNIQUE (crm_instance_id, organization_id, id),
  FOREIGN KEY (crm_instance_id, organization_id)
    REFERENCES public.crm_priority_configs(crm_instance_id, organization_id) ON DELETE CASCADE
);

ALTER TABLE public.crm_priority_configs ADD CONSTRAINT crm_priority_active_version_scope
  FOREIGN KEY (crm_instance_id, organization_id, active_version_id)
  REFERENCES public.crm_priority_versions(crm_instance_id, organization_id, id);

CREATE TABLE public.crm_priority_preview_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  actor_id UUID NOT NULL REFERENCES public.users(id),
  as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_cursor UUID,
  totals JSONB NOT NULL CHECK (jsonb_typeof(totals) = 'object'),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (crm_instance_id, organization_id)
    REFERENCES public.crm_priority_configs(crm_instance_id, organization_id) ON DELETE CASCADE
);

CREATE INDEX crm_priority_preview_instance_revision ON public.crm_priority_preview_runs(crm_instance_id, revision);
CREATE INDEX crm_priority_preview_expiry ON public.crm_priority_preview_runs(as_of);
CREATE INDEX crm_priority_lead_page ON public.leads(crm_instance_id, id) WHERE deleted_at IS NULL;

DO $$
DECLARE target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['crm_priority_configs', 'crm_priority_versions', 'crm_priority_preview_runs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target);
    EXECUTE format('CREATE POLICY priority_org_scope ON public.%I TO yux_api USING (private.rls_can_access_organization(organization_id)) WITH CHECK (private.rls_can_access_organization(organization_id))', target);
  END LOOP;
END $$;

-- The public schema grants broad DML by default to both runtime roles.
REVOKE ALL ON public.crm_priority_configs, public.crm_priority_versions,
  public.crm_priority_preview_runs FROM yux_api, yux_worker;

GRANT SELECT ON public.crm_priority_configs TO yux_api;
GRANT INSERT (crm_instance_id, organization_id, revision, draft, updated_by)
  ON public.crm_priority_configs TO yux_api;
GRANT UPDATE (revision, draft, updated_by, updated_at) ON public.crm_priority_configs TO yux_api;
GRANT SELECT ON public.crm_priority_versions TO yux_api;
GRANT SELECT ON public.crm_priority_preview_runs TO yux_api;
GRANT INSERT (crm_instance_id, organization_id, actor_id, revision, totals)
  ON public.crm_priority_preview_runs TO yux_api;
GRANT UPDATE (next_cursor, totals, completed_at) ON public.crm_priority_preview_runs TO yux_api;
