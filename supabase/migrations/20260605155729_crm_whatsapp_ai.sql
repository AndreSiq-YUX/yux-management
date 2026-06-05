-- CRM WhatsApp AI: lead-conversation links, AI insights, response suggestions and SLA events.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS intent TEXT,
  ADD COLUMN IF NOT EXISTS sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative', 'unknown')),
  ADD COLUMN IF NOT EXISTS urgency_detected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_conversation_at TIMESTAMPTZ;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.lead_conversation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  status TEXT NOT NULL DEFAULT 'linked' CHECK (status IN ('suggested', 'linked', 'rejected', 'archived')),
  match_method TEXT NOT NULL DEFAULT 'manual' CHECK (match_method IN ('phone', 'email', 'manual', 'ai', 'webchat')),
  match_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (match_score >= 0 AND match_score <= 100),
  contact_phone TEXT,
  contact_email TEXT,
  linked_by UUID REFERENCES auth.users(id),
  linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, conversation_id)
);

CREATE TABLE IF NOT EXISTS public.lead_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  ai_run_id UUID REFERENCES public.ai_message_runs(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  intent TEXT,
  sentiment TEXT NOT NULL DEFAULT 'unknown' CHECK (sentiment IN ('positive', 'neutral', 'negative', 'unknown')),
  urgency TEXT NOT NULL DEFAULT 'none' CHECK (urgency IN ('high', 'medium', 'low', 'none')),
  objections TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  risks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  next_best_action TEXT,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_ai_field_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  field_key TEXT NOT NULL,
  current_value JSONB,
  suggested_value JSONB NOT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired')),
  confirmed_by UUID REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_ai_field_suggestions_confirmed CHECK (
    status <> 'confirmed' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.lead_response_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'rejected')),
  template_id UUID,
  quick_reply_id UUID,
  ai_insight_id UUID REFERENCES public.lead_ai_insights(id) ON DELETE SET NULL,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  approved_by UUID REFERENCES auth.users(id),
  sent_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_sla_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('first_response', 'follow_up', 'human_handoff', 'stale_conversation')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'breached', 'resolved', 'cancelled')),
  due_at TIMESTAMPTZ NOT NULL,
  breached_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  owner_member_id UUID REFERENCES public.crm_instance_members(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_handoff_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  locked_by UUID REFERENCES auth.users(id),
  reason TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.crm_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  channel TEXT CHECK (channel IS NULL OR channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, label)
);

CREATE TABLE IF NOT EXISTS public.crm_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  requires_opt_in BOOLEAN NOT NULL DEFAULT true,
  category TEXT,
  variables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, channel, name)
);

DO $$
BEGIN
  ALTER TABLE public.lead_response_suggestions
    ADD CONSTRAINT lead_response_suggestions_template_fk
    FOREIGN KEY (template_id) REFERENCES public.crm_message_templates(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.lead_response_suggestions
    ADD CONSTRAINT lead_response_suggestions_quick_reply_fk
    FOREIGN KEY (quick_reply_id) REFERENCES public.crm_quick_replies(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON public.conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_last_conversation_at ON public.leads(crm_instance_id, last_conversation_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_conversation_links_instance ON public.lead_conversation_links(crm_instance_id, lead_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_conversation_links_conversation ON public.lead_conversation_links(conversation_id);
CREATE INDEX IF NOT EXISTS idx_lead_ai_insights_lead ON public.lead_ai_insights(crm_instance_id, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ai_field_suggestions_lead ON public.lead_ai_field_suggestions(crm_instance_id, lead_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_response_suggestions_conversation ON public.lead_response_suggestions(conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_sla_events_due ON public.lead_sla_events(crm_instance_id, status, due_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_handoff_locks_active
  ON public.lead_handoff_locks(conversation_id)
  WHERE active;
CREATE INDEX IF NOT EXISTS idx_crm_quick_replies_instance ON public.crm_quick_replies(crm_instance_id, is_active);
CREATE INDEX IF NOT EXISTS idx_crm_message_templates_instance ON public.crm_message_templates(crm_instance_id, channel, status);

ALTER TABLE public.lead_conversation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_ai_field_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_response_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sla_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_handoff_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_message_templates ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_conversation_links', 'lead_response_suggestions', 'lead_sla_events',
    'crm_quick_replies', 'crm_message_templates'
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
    'lead_conversation_links', 'lead_ai_insights', 'lead_ai_field_suggestions',
    'lead_response_suggestions', 'lead_sla_events', 'lead_handoff_locks'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_accessible" ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE POLICY "%s_select_accessible" ON public.%I FOR SELECT TO authenticated USING (private.can_access_crm_lead_v2(lead_id) AND (conversation_id IS NULL OR private.can_access_omnichannel_conversation(conversation_id, ''read'')))',
      target_table,
      target_table
    );

    EXECUTE format('DROP POLICY IF EXISTS "%s_insert_accessible" ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE POLICY "%s_insert_accessible" ON public.%I FOR INSERT TO authenticated WITH CHECK (private.can_update_crm_lead_v2(lead_id) AND (conversation_id IS NULL OR private.can_access_omnichannel_conversation(conversation_id, ''write'')))',
      target_table,
      target_table
    );

    EXECUTE format('DROP POLICY IF EXISTS "%s_update_accessible" ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE POLICY "%s_update_accessible" ON public.%I FOR UPDATE TO authenticated USING (private.can_update_crm_lead_v2(lead_id) AND (conversation_id IS NULL OR private.can_access_omnichannel_conversation(conversation_id, ''write''))) WITH CHECK (private.can_update_crm_lead_v2(lead_id) AND (conversation_id IS NULL OR private.can_access_omnichannel_conversation(conversation_id, ''write'')))',
      target_table,
      target_table
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "crm_quick_replies_select_accessible" ON public.crm_quick_replies;
CREATE POLICY "crm_quick_replies_select_accessible"
  ON public.crm_quick_replies FOR SELECT TO authenticated
  USING (private.can_access_crm_instance(crm_instance_id));

DROP POLICY IF EXISTS "crm_quick_replies_manageable" ON public.crm_quick_replies;
CREATE POLICY "crm_quick_replies_manageable"
  ON public.crm_quick_replies FOR ALL TO authenticated
  USING (private.can_manage_crm_instance(crm_instance_id))
  WITH CHECK (private.can_manage_crm_instance(crm_instance_id));

DROP POLICY IF EXISTS "crm_message_templates_select_accessible" ON public.crm_message_templates;
CREATE POLICY "crm_message_templates_select_accessible"
  ON public.crm_message_templates FOR SELECT TO authenticated
  USING (private.can_access_crm_instance(crm_instance_id));

DROP POLICY IF EXISTS "crm_message_templates_manageable" ON public.crm_message_templates;
CREATE POLICY "crm_message_templates_manageable"
  ON public.crm_message_templates FOR ALL TO authenticated
  USING (private.can_manage_crm_instance(crm_instance_id))
  WITH CHECK (private.can_manage_crm_instance(crm_instance_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_conversation_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_ai_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_ai_field_suggestions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_response_suggestions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_sla_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_handoff_locks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_quick_replies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_message_templates TO authenticated;

NOTIFY pgrst, 'reload schema';
