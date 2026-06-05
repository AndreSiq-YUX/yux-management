-- Commercial CRM cockpit: lead profile, tags, saved views, imports, next actions and calendar.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS segment TEXT,
  ADD COLUMN IF NOT EXISTS interest TEXT,
  ADD COLUMN IF NOT EXISTS temperature TEXT CHECK (temperature IS NULL OR temperature IN ('hot', 'warm', 'cold', 'unqualified')),
  ADD COLUMN IF NOT EXISTS urgency TEXT CHECK (urgency IS NULL OR urgency IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS consent_lgpd BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS competitor TEXT,
  ADD COLUMN IF NOT EXISTS objections TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS current_stage_entered_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.lead_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.lead_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, name)
);

CREATE TABLE IF NOT EXISTS public.lead_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.lead_loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  required_for_lost BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, label)
);

CREATE TABLE IF NOT EXISTS public.lead_duplicates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  duplicate_lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  match_kind TEXT NOT NULL CHECK (match_kind IN ('email', 'phone', 'whatsapp', 'manual')),
  confidence NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (confidence >= 0 AND confidence <= 100),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'merged', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_duplicates_distinct CHECK (lead_id <> duplicate_lead_id),
  UNIQUE (lead_id, duplicate_lead_id, match_kind)
);

CREATE TABLE IF NOT EXISTS public.lead_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.crm_teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_saved_views_owner CHECK (user_id IS NOT NULL OR team_id IS NOT NULL OR is_shared)
);

CREATE TABLE IF NOT EXISTS public.lead_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'processing', 'completed', 'failed', 'cancelled')),
  file_name TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows INTEGER NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  created_by UUID REFERENCES auth.users(id),
  executed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  import_id UUID NOT NULL REFERENCES public.lead_imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (import_id, row_number)
);

CREATE TABLE IF NOT EXISTS public.lead_next_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('respond_now', 'send_proposal', 'schedule_meeting', 'send_sector_case', 'request_budget', 'reactivate', 'reassign', 'mark_lost')),
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  assigned_to_member_id UUID REFERENCES public.crm_instance_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_activity_calendar_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.crm_tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('task', 'meeting', 'follow_up', 'sla')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  owner_member_id UUID REFERENCES public.crm_instance_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_temperature ON public.leads(crm_instance_id, temperature);
CREATE INDEX IF NOT EXISTS idx_leads_current_stage_entered_at ON public.leads(crm_instance_id, current_stage_entered_at);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_instance ON public.lead_stage_history(crm_instance_id, lead_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_tags_instance ON public.lead_tags(crm_instance_id, is_active);
CREATE INDEX IF NOT EXISTS idx_lead_tag_assignments_instance ON public.lead_tag_assignments(crm_instance_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_loss_reasons_instance ON public.lead_loss_reasons(crm_instance_id, is_active);
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_instance ON public.lead_duplicates(crm_instance_id, lead_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_saved_views_instance ON public.lead_saved_views(crm_instance_id, user_id, team_id);
CREATE INDEX IF NOT EXISTS idx_lead_imports_instance ON public.lead_imports(crm_instance_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_import_rows_import ON public.lead_import_rows(import_id, row_number);
CREATE INDEX IF NOT EXISTS idx_lead_next_actions_instance ON public.lead_next_actions(crm_instance_id, lead_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_crm_activity_calendar_entries_instance ON public.crm_activity_calendar_entries(crm_instance_id, starts_at);

ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_loss_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_duplicates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_next_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activity_calendar_entries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_tags', 'lead_loss_reasons', 'lead_duplicates', 'lead_saved_views',
    'lead_imports', 'lead_next_actions', 'crm_activity_calendar_entries'
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

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_stage_history', 'lead_tags', 'lead_tag_assignments', 'lead_loss_reasons',
    'lead_duplicates', 'lead_saved_views', 'lead_imports', 'lead_import_rows',
    'lead_next_actions', 'crm_activity_calendar_entries'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_accessible" ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE POLICY "%s_select_accessible" ON public.%I FOR SELECT TO authenticated USING (private.can_access_crm_instance(crm_instance_id))',
      target_table,
      target_table
    );

    EXECUTE format('DROP POLICY IF EXISTS "%s_manageable" ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE POLICY "%s_manageable" ON public.%I FOR ALL TO authenticated USING (private.can_manage_crm_instance(crm_instance_id)) WITH CHECK (private.can_manage_crm_instance(crm_instance_id))',
      target_table,
      target_table
    );
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_stage_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tag_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_loss_reasons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_duplicates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_saved_views TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_imports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_import_rows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_next_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activity_calendar_entries TO authenticated;

NOTIFY pgrst, 'reload schema';
