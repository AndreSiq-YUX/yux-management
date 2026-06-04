-- Shared SMTP2GO email hub for transactional, operational and marketing email.

CREATE TABLE IF NOT EXISTS public.email_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'smtp2go' CHECK (provider IN ('smtp2go')),
  status TEXT NOT NULL DEFAULT 'needs_setup' CHECK (status IN ('connected', 'stale', 'needs_setup', 'failed')),
  token_reference TEXT,
  default_from_email TEXT,
  default_from_name TEXT,
  daily_send_limit INTEGER NOT NULL DEFAULT 500 CHECK (daily_send_limit >= 0),
  last_verified_at TIMESTAMPTZ,
  protected_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider)
);

CREATE TABLE IF NOT EXISTS public.smtp2go_subaccounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.email_provider_connections(id) ON DELETE CASCADE,
  smtp2go_account_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  monthly_quota INTEGER NOT NULL DEFAULT 0 CHECK (monthly_quota >= 0),
  daily_send_limit INTEGER NOT NULL DEFAULT 500 CHECK (daily_send_limit >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, smtp2go_account_id)
);

CREATE TABLE IF NOT EXISTS public.email_send_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.email_provider_connections(id) ON DELETE SET NULL,
  subaccount_id UUID REFERENCES public.smtp2go_subaccounts(id) ON DELETE SET NULL,
  email_kind TEXT NOT NULL CHECK (email_kind IN ('transactional', 'marketing', 'operational')),
  module_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_opt_in BOOLEAN NOT NULL DEFAULT false,
  subject TEXT NOT NULL CHECK (BTRIM(subject) <> ''),
  body_html TEXT,
  body_text TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'rejected', 'suppressed')),
  provider_message_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  protected_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (body_html IS NOT NULL OR body_text IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.email_send_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.email_send_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_payload) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_suppression_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('bounce', 'spam', 'unsubscribe', 'manual', 'provider_reject')),
  source TEXT NOT NULL DEFAULT 'smtp2go',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS public.email_usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subaccount_id UUID REFERENCES public.smtp2go_subaccounts(id) ON DELETE SET NULL,
  period_date DATE NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, subaccount_id, period_date)
);

CREATE INDEX IF NOT EXISTS idx_email_provider_connections_org ON public.email_provider_connections(organization_id, provider);
CREATE INDEX IF NOT EXISTS idx_smtp2go_subaccounts_org ON public.smtp2go_subaccounts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_email_send_requests_org_status ON public.email_send_requests(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_requests_recipient ON public.email_send_requests(organization_id, recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_send_events_request ON public.email_send_events(request_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_suppressions_org_email ON public.email_suppression_entries(organization_id, email);
CREATE INDEX IF NOT EXISTS idx_email_usage_counters_org_date ON public.email_usage_counters(organization_id, period_date DESC);

ALTER TABLE public.email_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smtp2go_subaccounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppression_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_usage_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Omnichannel configurators manage email provider connections" ON public.email_provider_connections
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel configurators manage smtp2go subaccounts" ON public.smtp2go_subaccounts
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read email send requests" ON public.email_send_requests
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));

CREATE POLICY "Omnichannel writers create email send requests" ON public.email_send_requests
  FOR INSERT TO authenticated WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'write'));

CREATE POLICY "Omnichannel configurators update email send requests" ON public.email_send_requests
  FOR UPDATE TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read email send events" ON public.email_send_events
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.email_send_requests r
      WHERE r.id = request_id
        AND private.can_access_omnichannel_organization(r.organization_id, 'read')
    )
  );

CREATE POLICY "Omnichannel users read email suppressions" ON public.email_suppression_entries
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));

CREATE POLICY "Omnichannel configurators manage email suppressions" ON public.email_suppression_entries
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read email usage counters" ON public.email_usage_counters
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));

CREATE POLICY "Omnichannel configurators manage email usage counters" ON public.email_usage_counters
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

REVOKE ALL ON public.email_provider_connections FROM anon;
REVOKE ALL ON public.smtp2go_subaccounts FROM anon;
REVOKE ALL ON public.email_send_requests FROM anon;
REVOKE ALL ON public.email_send_events FROM anon;
REVOKE ALL ON public.email_suppression_entries FROM anon;
REVOKE ALL ON public.email_usage_counters FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_provider_connections TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smtp2go_subaccounts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_send_requests TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_send_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_suppression_entries TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_usage_counters TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
