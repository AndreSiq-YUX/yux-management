-- CRM proposals closing: CRM-facing proposal orchestration, events, checklists and onboarding.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recommended_package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS source_proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS source_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.invoices
      ADD COLUMN IF NOT EXISTS source_proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.lead_proposal_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  module_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  score NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (score >= 0),
  reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'accepted', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, package_id)
);

CREATE TABLE IF NOT EXISTS public.proposal_view_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'viewed', 'adjustment_requested', 'accepted', 'rejected', 'converted')),
  actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('internal', 'client', 'system')),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.proposal_follow_up_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  due_at TIMESTAMPTZ NOT NULL,
  assigned_to_member_id UUID REFERENCES public.crm_instance_members(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.proposal_objections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'handled', 'dismissed')),
  handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.proposal_closing_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'blocked')),
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id)
);

ALTER TABLE public.proposal_conversion_runs
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS invoice_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.proposal_conversion_runs r
SET organization_id = p.organization_id,
    crm_instance_id = p.crm_instance_id,
    lead_id = p.lead_id,
    idempotency_key = COALESCE(r.idempotency_key, 'proposal:' || r.proposal_id::TEXT || ':conversion')
FROM public.proposals p
WHERE p.id = r.proposal_id
  AND (r.organization_id IS NULL OR r.lead_id IS NULL OR r.idempotency_key IS NULL);

DO $$
BEGIN
  ALTER TABLE public.proposal_conversion_runs
    DROP CONSTRAINT IF EXISTS proposal_conversion_runs_status_check;
  ALTER TABLE public.proposal_conversion_runs
    ADD CONSTRAINT proposal_conversion_runs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.proposal_conversion_runs
      ADD CONSTRAINT proposal_conversion_runs_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_conversion_runs_idempotency
  ON public.proposal_conversion_runs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.client_onboarding_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.client_onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES public.client_onboarding_checklists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_crm_instance ON public.proposals(crm_instance_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_contracts_source_proposal ON public.contracts(source_proposal_id);
CREATE INDEX IF NOT EXISTS idx_projects_source_lead ON public.projects(source_lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_proposal_recommendations_lead ON public.lead_proposal_recommendations(crm_instance_id, lead_id, status);
CREATE INDEX IF NOT EXISTS idx_proposal_view_events_proposal ON public.proposal_view_events(proposal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_follow_up_tasks_due ON public.proposal_follow_up_tasks(crm_instance_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_proposal_objections_proposal ON public.proposal_objections(proposal_id, status);
CREATE INDEX IF NOT EXISTS idx_proposal_closing_checklists_proposal ON public.proposal_closing_checklists(proposal_id);
CREATE INDEX IF NOT EXISTS idx_client_onboarding_checklists_client ON public.client_onboarding_checklists(client_id, status);
CREATE INDEX IF NOT EXISTS idx_client_onboarding_tasks_checklist ON public.client_onboarding_tasks(checklist_id, status);

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_source_proposal ON public.invoices(source_proposal_id);
  END IF;
END
$$;

ALTER TABLE public.lead_proposal_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_view_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_follow_up_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_objections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_closing_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_onboarding_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_onboarding_tasks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_proposal_recommendations', 'proposal_follow_up_tasks',
    'proposal_objections', 'proposal_closing_checklists',
    'client_onboarding_checklists'
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

DROP TRIGGER IF EXISTS update_proposal_conversion_runs_updated_at ON public.proposal_conversion_runs;
CREATE TRIGGER update_proposal_conversion_runs_updated_at
  BEFORE UPDATE ON public.proposal_conversion_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_onboarding_tasks_updated_at ON public.client_onboarding_tasks;
CREATE TRIGGER update_client_onboarding_tasks_updated_at
  BEFORE UPDATE ON public.client_onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_proposal_recommendations', 'proposal_view_events', 'proposal_follow_up_tasks',
    'proposal_objections', 'proposal_closing_checklists'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_accessible" ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE POLICY "%s_select_accessible" ON public.%I FOR SELECT TO authenticated USING (private.can_manage_proposal_organization(organization_id) OR private.can_access_crm_lead_v2(lead_id))',
      target_table,
      target_table
    );

    EXECUTE format('DROP POLICY IF EXISTS "%s_manageable" ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE POLICY "%s_manageable" ON public.%I FOR ALL TO authenticated USING (private.can_manage_proposal_organization(organization_id)) WITH CHECK (private.can_manage_proposal_organization(organization_id))',
      target_table,
      target_table
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "proposal_conversion_runs_select_accessible" ON public.proposal_conversion_runs;
CREATE POLICY "proposal_conversion_runs_select_accessible"
  ON public.proposal_conversion_runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = proposal_id
        AND (private.can_manage_proposal_organization(p.organization_id) OR private.can_access_crm_lead_v2(p.lead_id))
    )
  );

DROP POLICY IF EXISTS "proposal_conversion_runs_manageable" ON public.proposal_conversion_runs;
CREATE POLICY "proposal_conversion_runs_manageable"
  ON public.proposal_conversion_runs FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND private.can_manage_proposal_organization(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND private.can_manage_proposal_organization(organization_id));

DROP POLICY IF EXISTS "client_onboarding_checklists_select_accessible" ON public.client_onboarding_checklists;
CREATE POLICY "client_onboarding_checklists_select_accessible"
  ON public.client_onboarding_checklists FOR SELECT TO authenticated
  USING (private.can_manage_proposal_organization(organization_id) OR (lead_id IS NOT NULL AND private.can_access_crm_lead_v2(lead_id)));

DROP POLICY IF EXISTS "client_onboarding_checklists_manageable" ON public.client_onboarding_checklists;
CREATE POLICY "client_onboarding_checklists_manageable"
  ON public.client_onboarding_checklists FOR ALL TO authenticated
  USING (private.can_manage_proposal_organization(organization_id))
  WITH CHECK (private.can_manage_proposal_organization(organization_id));

DROP POLICY IF EXISTS "client_onboarding_tasks_select_accessible" ON public.client_onboarding_tasks;
CREATE POLICY "client_onboarding_tasks_select_accessible"
  ON public.client_onboarding_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_onboarding_checklists c
      WHERE c.id = checklist_id
        AND (private.can_manage_proposal_organization(c.organization_id) OR (c.lead_id IS NOT NULL AND private.can_access_crm_lead_v2(c.lead_id)))
    )
  );

DROP POLICY IF EXISTS "client_onboarding_tasks_manageable" ON public.client_onboarding_tasks;
CREATE POLICY "client_onboarding_tasks_manageable"
  ON public.client_onboarding_tasks FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_onboarding_checklists c
      WHERE c.id = checklist_id
        AND private.can_manage_proposal_organization(c.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_onboarding_checklists c
      WHERE c.id = checklist_id
        AND private.can_manage_proposal_organization(c.organization_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_proposal_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_view_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_follow_up_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_objections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_closing_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_conversion_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_onboarding_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_onboarding_tasks TO authenticated;

NOTIFY pgrst, 'reload schema';
