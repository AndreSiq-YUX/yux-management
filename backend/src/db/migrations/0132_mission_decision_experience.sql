-- Durable, tenant-scoped delivery ledger and preferences for Mission decisions.

CREATE TABLE IF NOT EXISTS public.action_decision_notification_preferences (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_phone TEXT,
  whatsapp_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id),
  CHECK (NOT whatsapp_enabled OR whatsapp_phone IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.action_decision_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE CASCADE,
  approval_id UUID NOT NULL REFERENCES public.action_approvals(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('in_product','email','whatsapp')),
  escalation_stage TEXT NOT NULL CHECK (escalation_stage IN ('created','4h','24h')),
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','queued','delivered','failed','skipped')),
  safe_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(safe_payload) = 'object'),
  email_request_id UUID REFERENCES public.email_send_requests(id) ON DELETE SET NULL,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (approval_id, channel, escalation_stage)
);

CREATE TABLE IF NOT EXISTS public.action_decision_notification_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  approval_id UUID NOT NULL REFERENCES public.action_approvals(id) ON DELETE CASCADE,
  escalation_stage TEXT NOT NULL CHECK (escalation_stage IN ('created','4h','24h')),
  due_at TIMESTAMPTZ NOT NULL,
  enqueued_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (approval_id, escalation_stage)
);

CREATE INDEX IF NOT EXISTS idx_action_decision_notifications_recipient
  ON public.action_decision_notifications(organization_id, recipient_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_decision_notifications_approval
  ON public.action_decision_notifications(approval_id, escalation_stage);

CREATE INDEX IF NOT EXISTS idx_action_decision_notification_schedule_pending
  ON public.action_decision_notification_schedule(due_at) WHERE enqueued_at IS NULL;

ALTER TABLE public.action_decision_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_decision_notification_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.action_decision_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_decision_notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.action_decision_notification_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_decision_notification_schedule FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS action_decision_notification_preferences_access ON public.action_decision_notification_preferences;
CREATE POLICY action_decision_notification_preferences_access ON public.action_decision_notification_preferences
  FOR ALL USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));

DROP POLICY IF EXISTS action_decision_notifications_read ON public.action_decision_notifications;
CREATE POLICY action_decision_notifications_read ON public.action_decision_notifications
  FOR SELECT USING (private.rls_can_access_organization(organization_id));

DROP POLICY IF EXISTS action_decision_notifications_write ON public.action_decision_notifications;
CREATE POLICY action_decision_notifications_write ON public.action_decision_notifications
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

DROP POLICY IF EXISTS action_decision_notification_schedule_internal ON public.action_decision_notification_schedule;
CREATE POLICY action_decision_notification_schedule_internal ON public.action_decision_notification_schedule
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());
