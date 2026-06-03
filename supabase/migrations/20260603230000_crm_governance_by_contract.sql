-- Govern contracted CRM instances, seats, teams, configuration versions, and lead assignment.

DO $$
BEGIN
  CREATE TYPE public.crm_instance_status AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_instance_role AS ENUM ('seller', 'manager', 'client_admin', 'yux_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_member_status AS ENUM ('invited', 'active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_assignment_mode AS ENUM ('manual', 'queue', 'round_robin', 'pull_next');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_assignment_state AS ENUM ('unassigned', 'assigned', 'in_queue', 'reassigned');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_publication_status AS ENUM ('draft', 'reviewing', 'published', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_migration_strategy AS ENUM ('keep_existing', 'migrate_all', 'migrate_open', 'mapped_stages');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.crm_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  status public.crm_instance_status NOT NULL DEFAULT 'draft',
  sector_key TEXT,
  blueprint_id UUID REFERENCES public.blueprints(id) ON DELETE SET NULL,
  blueprint_application_run_id UUID REFERENCES public.blueprint_application_runs(id) ON DELETE SET NULL,
  seller_seat_limit INTEGER NOT NULL DEFAULT 1 CHECK (seller_seat_limit >= 0),
  manager_seat_limit INTEGER NOT NULL DEFAULT 0 CHECK (manager_seat_limit >= 0),
  admin_seat_limit INTEGER NOT NULL DEFAULT 1 CHECK (admin_seat_limit >= 0),
  max_pipeline_count INTEGER NOT NULL DEFAULT 1 CHECK (max_pipeline_count >= 1),
  max_custom_field_count INTEGER NOT NULL DEFAULT 0 CHECK (max_custom_field_count >= 0),
  max_automation_count INTEGER NOT NULL DEFAULT 0 CHECK (max_automation_count >= 0),
  allow_client_pipeline_customization BOOLEAN NOT NULL DEFAULT false,
  allow_client_field_customization BOOLEAN NOT NULL DEFAULT false,
  allow_client_category_customization BOOLEAN NOT NULL DEFAULT false,
  default_assignment_mode public.crm_assignment_mode NOT NULL DEFAULT 'queue',
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id)
);

CREATE TABLE IF NOT EXISTS public.crm_instance_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.crm_instance_role NOT NULL,
  status public.crm_member_status NOT NULL DEFAULT 'invited',
  display_name TEXT,
  email TEXT,
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.crm_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  assignment_mode public.crm_assignment_mode NOT NULL DEFAULT 'queue',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, name)
);

CREATE TABLE IF NOT EXISTS public.crm_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.crm_teams(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.crm_instance_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('seller', 'manager')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.crm_pipeline_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  source_pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  status public.crm_publication_status NOT NULL DEFAULT 'draft',
  snapshot_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, source_pipeline_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.crm_stage_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_version_id UUID NOT NULL REFERENCES public.crm_pipeline_versions(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pipeline_version_id, stable_key),
  CONSTRAINT crm_stage_version_outcome CHECK (NOT (is_won AND is_lost))
);

CREATE TABLE IF NOT EXISTS public.crm_custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  required BOOLEAN NOT NULL DEFAULT false,
  version_number INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, stable_key, version_number)
);

CREATE TABLE IF NOT EXISTS public.crm_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, stable_key)
);

CREATE TABLE IF NOT EXISTS public.crm_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, stable_key)
);

CREATE TABLE IF NOT EXISTS public.crm_loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, stable_key)
);

CREATE TABLE IF NOT EXISTS public.crm_configuration_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  draft_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_configuration_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES public.crm_configuration_drafts(id) ON DELETE SET NULL,
  status public.crm_publication_status NOT NULL DEFAULT 'reviewing',
  migration_strategy public.crm_migration_strategy NOT NULL DEFAULT 'keep_existing',
  impact_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_by UUID REFERENCES auth.users(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_configuration_migration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  publication_id UUID NOT NULL REFERENCES public.crm_configuration_publications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processed_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crm_pipelines
  ADD COLUMN IF NOT EXISTS crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.crm_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_member_id UUID REFERENCES public.crm_instance_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_version_id UUID REFERENCES public.crm_pipeline_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_version_id UUID REFERENCES public.crm_stage_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_state public.crm_assignment_state NOT NULL DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS assignment_mode public.crm_assignment_mode,
  ADD COLUMN IF NOT EXISTS last_assignment_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_instances_organization_id ON public.crm_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_instances_contract_id ON public.crm_instances(contract_id);
CREATE INDEX IF NOT EXISTS idx_crm_instance_members_instance_id ON public.crm_instance_members(crm_instance_id);
CREATE INDEX IF NOT EXISTS idx_crm_instance_members_user_id ON public.crm_instance_members(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_teams_instance_id ON public.crm_teams(crm_instance_id);
CREATE INDEX IF NOT EXISTS idx_crm_team_members_team_id ON public.crm_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_crm_team_members_member_id ON public.crm_team_members(member_id);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_versions_instance_id ON public.crm_pipeline_versions(crm_instance_id);
CREATE INDEX IF NOT EXISTS idx_crm_stage_versions_pipeline_version_id ON public.crm_stage_versions(pipeline_version_id);
CREATE INDEX IF NOT EXISTS idx_crm_custom_fields_instance_id ON public.crm_custom_field_definitions(crm_instance_id);
CREATE INDEX IF NOT EXISTS idx_crm_configuration_drafts_instance_id ON public.crm_configuration_drafts(crm_instance_id);
CREATE INDEX IF NOT EXISTS idx_crm_configuration_publications_instance_id ON public.crm_configuration_publications(crm_instance_id);
CREATE INDEX IF NOT EXISTS idx_crm_migration_runs_instance_id ON public.crm_configuration_migration_runs(crm_instance_id);
CREATE INDEX IF NOT EXISTS idx_crm_audit_events_instance_id ON public.crm_audit_events(crm_instance_id);
CREATE INDEX IF NOT EXISTS idx_leads_crm_instance_id ON public.leads(crm_instance_id);
CREATE INDEX IF NOT EXISTS idx_leads_crm_owner_member_id ON public.leads(owner_member_id);
CREATE INDEX IF NOT EXISTS idx_leads_crm_team_id ON public.leads(team_id);
CREATE INDEX IF NOT EXISTS idx_crm_pipelines_instance_id ON public.crm_pipelines(crm_instance_id);

CREATE OR REPLACE FUNCTION private.can_access_crm_instance(target_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.crm_instance_members cim
      WHERE cim.crm_instance_id = target_instance_id
        AND cim.user_id = (SELECT auth.uid())
        AND cim.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.crm_instances ci
      JOIN public.organizations o ON o.id = ci.organization_id
      JOIN public.memberships m ON m.organization_id = o.id
      WHERE ci.id = target_instance_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role_key = 'client_admin'
    );
$$;

CREATE OR REPLACE FUNCTION private.crm_member_role(target_instance_id UUID)
RETURNS public.crm_instance_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT cim.role
  FROM public.crm_instance_members cim
  WHERE cim.crm_instance_id = target_instance_id
    AND cim.user_id = (SELECT auth.uid())
    AND cim.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.current_crm_member_id(target_instance_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT cim.id
  FROM public.crm_instance_members cim
  WHERE cim.crm_instance_id = target_instance_id
    AND cim.user_id = (SELECT auth.uid())
    AND cim.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.can_manage_crm_instance(target_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_internal_user()
    OR COALESCE(private.crm_member_role(target_instance_id) IN ('client_admin', 'yux_admin'), false)
    OR EXISTS (
      SELECT 1
      FROM public.crm_instances ci
      JOIN public.organizations o ON o.id = ci.organization_id
      JOIN public.memberships m ON m.organization_id = o.id
      WHERE ci.id = target_instance_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role_key = 'client_admin'
    );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_crm_members(target_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.can_manage_crm_instance(target_instance_id);
$$;

CREATE OR REPLACE FUNCTION private.can_access_crm_team(target_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.crm_teams t
    WHERE t.id = target_team_id
      AND private.can_access_crm_instance(t.crm_instance_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_crm_lead_v2(target_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = target_lead_id
      AND (
        l.crm_instance_id IS NULL
        OR private.is_internal_user()
        OR COALESCE(private.crm_member_role(l.crm_instance_id) IN ('client_admin', 'yux_admin'), false)
        OR l.owner_member_id = private.current_crm_member_id(l.crm_instance_id)
        OR EXISTS (
          SELECT 1
          FROM public.crm_team_members tm
          WHERE tm.team_id = l.team_id
            AND tm.member_id = private.current_crm_member_id(l.crm_instance_id)
            AND tm.role = 'manager'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_update_crm_lead_v2(target_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = target_lead_id
      AND (
        l.crm_instance_id IS NULL
        OR private.is_internal_user()
        OR COALESCE(private.crm_member_role(l.crm_instance_id) IN ('client_admin', 'yux_admin'), false)
        OR l.owner_member_id = private.current_crm_member_id(l.crm_instance_id)
        OR EXISTS (
          SELECT 1
          FROM public.crm_team_members tm
          WHERE tm.team_id = l.team_id
            AND tm.member_id = private.current_crm_member_id(l.crm_instance_id)
            AND tm.role = 'manager'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_publish_crm_configuration(target_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.can_manage_crm_instance(target_instance_id);
$$;

CREATE OR REPLACE FUNCTION private.crm_instance_for_contract(target_contract_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ci.id
  FROM public.crm_instances ci
  WHERE ci.contract_id = target_contract_id
  LIMIT 1;
$$;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'crm_instances', 'crm_instance_members', 'crm_teams', 'crm_pipeline_versions',
    'crm_stage_versions', 'crm_custom_field_definitions', 'crm_categories',
    'crm_tags', 'crm_loss_reasons', 'crm_configuration_drafts',
    'crm_configuration_publications', 'crm_configuration_migration_runs'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      target_table,
      target_table
    );
  END LOOP;
END
$$;

INSERT INTO public.crm_instances (
  organization_id,
  contract_id,
  status,
  seller_seat_limit,
  manager_seat_limit,
  admin_seat_limit,
  max_pipeline_count,
  max_custom_field_count,
  max_automation_count,
  allow_client_pipeline_customization,
  allow_client_field_customization,
  allow_client_category_customization,
  default_assignment_mode
)
SELECT
  o.id,
  c.id,
  'active',
  3,
  1,
  1,
  3,
  20,
  5,
  true,
  true,
  true,
  'queue'
FROM public.contracts c
JOIN public.contract_modules cm ON cm.contract_id = c.id AND cm.module_key = 'crm' AND cm.enabled
JOIN public.organizations o ON o.client_id = c.client_id AND o.kind = 'client'
WHERE c.status = 'active'
ON CONFLICT (contract_id) DO NOTHING;

UPDATE public.crm_pipelines p
SET crm_instance_id = ci.id
FROM public.crm_instances ci
WHERE p.crm_instance_id IS NULL
  AND p.organization_id = ci.organization_id;

UPDATE public.leads l
SET crm_instance_id = ci.id,
    assignment_state = CASE
      WHEN l.owner_id IS NOT NULL OR l.assigned_to IS NOT NULL THEN 'assigned'::public.crm_assignment_state
      ELSE 'in_queue'::public.crm_assignment_state
    END,
    assignment_mode = COALESCE(l.assignment_mode, ci.default_assignment_mode)
FROM public.crm_instances ci
WHERE l.crm_instance_id IS NULL
  AND l.organization_id = ci.organization_id;

ALTER TABLE public.crm_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_instance_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipeline_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stage_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_loss_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_configuration_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_configuration_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_configuration_migration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_instances_select_accessible" ON public.crm_instances;
CREATE POLICY "crm_instances_select_accessible"
  ON public.crm_instances FOR SELECT TO authenticated
  USING (private.can_access_crm_instance(id));

DROP POLICY IF EXISTS "crm_instances_insert_internal" ON public.crm_instances;
CREATE POLICY "crm_instances_insert_internal"
  ON public.crm_instances FOR INSERT TO authenticated
  WITH CHECK (private.is_internal_user());

DROP POLICY IF EXISTS "crm_instances_update_manageable" ON public.crm_instances;
CREATE POLICY "crm_instances_update_manageable"
  ON public.crm_instances FOR UPDATE TO authenticated
  USING (private.can_manage_crm_instance(id))
  WITH CHECK (private.can_manage_crm_instance(id));

DROP POLICY IF EXISTS "crm_instance_members_select_accessible" ON public.crm_instance_members;
CREATE POLICY "crm_instance_members_select_accessible"
  ON public.crm_instance_members FOR SELECT TO authenticated
  USING (private.can_access_crm_instance(crm_instance_id));

DROP POLICY IF EXISTS "crm_instance_members_manageable" ON public.crm_instance_members;
CREATE POLICY "crm_instance_members_manageable"
  ON public.crm_instance_members FOR ALL TO authenticated
  USING (private.can_manage_crm_members(crm_instance_id))
  WITH CHECK (private.can_manage_crm_members(crm_instance_id));

DROP POLICY IF EXISTS "crm_teams_select_accessible" ON public.crm_teams;
CREATE POLICY "crm_teams_select_accessible"
  ON public.crm_teams FOR SELECT TO authenticated
  USING (private.can_access_crm_instance(crm_instance_id));

DROP POLICY IF EXISTS "crm_teams_manageable" ON public.crm_teams;
CREATE POLICY "crm_teams_manageable"
  ON public.crm_teams FOR ALL TO authenticated
  USING (private.can_manage_crm_instance(crm_instance_id))
  WITH CHECK (private.can_manage_crm_instance(crm_instance_id));

DROP POLICY IF EXISTS "crm_team_members_accessible" ON public.crm_team_members;
CREATE POLICY "crm_team_members_accessible"
  ON public.crm_team_members FOR ALL TO authenticated
  USING (private.can_access_crm_team(team_id))
  WITH CHECK (private.can_access_crm_team(team_id));

DROP POLICY IF EXISTS "crm_pipeline_versions_accessible" ON public.crm_pipeline_versions;
CREATE POLICY "crm_pipeline_versions_accessible"
  ON public.crm_pipeline_versions FOR ALL TO authenticated
  USING (private.can_access_crm_instance(crm_instance_id))
  WITH CHECK (private.can_manage_crm_instance(crm_instance_id));

DROP POLICY IF EXISTS "crm_stage_versions_accessible" ON public.crm_stage_versions;
CREATE POLICY "crm_stage_versions_accessible"
  ON public.crm_stage_versions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_pipeline_versions pv
      WHERE pv.id = pipeline_version_id
        AND private.can_access_crm_instance(pv.crm_instance_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_pipeline_versions pv
      WHERE pv.id = pipeline_version_id
        AND private.can_manage_crm_instance(pv.crm_instance_id)
    )
  );

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'crm_custom_field_definitions', 'crm_categories', 'crm_tags', 'crm_loss_reasons',
    'crm_configuration_drafts', 'crm_configuration_publications', 'crm_configuration_migration_runs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_accessible" ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY "%s_accessible" ON public.%I FOR ALL TO authenticated USING (private.can_access_crm_instance(crm_instance_id)) WITH CHECK (private.can_manage_crm_instance(crm_instance_id))',
      table_name,
      table_name
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "crm_audit_events_accessible" ON public.crm_audit_events;
CREATE POLICY "crm_audit_events_accessible"
  ON public.crm_audit_events FOR SELECT TO authenticated
  USING (
    crm_instance_id IS NOT NULL
    AND private.can_manage_crm_instance(crm_instance_id)
  );

DROP POLICY IF EXISTS "crm_audit_events_insert_internal" ON public.crm_audit_events;
CREATE POLICY "crm_audit_events_insert_internal"
  ON public.crm_audit_events FOR INSERT TO authenticated
  WITH CHECK (private.is_internal_user() OR private.can_manage_crm_instance(crm_instance_id));

DROP POLICY IF EXISTS "CRM governance can read leads" ON public.leads;
CREATE POLICY "CRM governance can read leads"
  ON public.leads FOR SELECT TO authenticated
  USING (crm_instance_id IS NULL OR private.can_access_crm_lead_v2(id));

DROP POLICY IF EXISTS "CRM governance can update leads" ON public.leads;
CREATE POLICY "CRM governance can update leads"
  ON public.leads FOR UPDATE TO authenticated
  USING (crm_instance_id IS NULL OR private.can_update_crm_lead_v2(id))
  WITH CHECK (crm_instance_id IS NULL OR private.can_update_crm_lead_v2(id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_instances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_instance_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_team_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipeline_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_stage_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_custom_field_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_loss_reasons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_configuration_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_configuration_publications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_configuration_migration_runs TO authenticated;
GRANT SELECT, INSERT ON public.crm_audit_events TO authenticated;

REVOKE ALL ON FUNCTION private.can_access_crm_instance(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.crm_member_role(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_crm_member_id(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_crm_instance(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_crm_members(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_crm_team(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_crm_lead_v2(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_update_crm_lead_v2(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_publish_crm_configuration(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.crm_instance_for_contract(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.can_access_crm_instance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.crm_member_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_crm_member_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_crm_instance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_crm_members(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_crm_team(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_crm_lead_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_update_crm_lead_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_publish_crm_configuration(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.crm_instance_for_contract(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
