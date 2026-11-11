CREATE TABLE public.commercial_email_senders (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  revision UUID NOT NULL DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('professional', 'managed')),
  from_email TEXT,
  from_name TEXT NOT NULL,
  reply_to TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  CHECK (approved_at IS NULL OR (from_email IS NOT NULL AND reply_to IS NOT NULL))
);

CREATE UNIQUE INDEX commercial_email_senders_approved_address
  ON public.commercial_email_senders (lower(from_email)) WHERE approved_at IS NOT NULL;

ALTER TABLE public.commercial_email_senders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_email_senders FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.commercial_email_senders TO yux_api;
GRANT SELECT ON public.commercial_email_senders TO yux_worker;
CREATE POLICY commercial_email_senders_read ON public.commercial_email_senders
  FOR SELECT USING (private.rls_can_access_organization(organization_id));
CREATE POLICY commercial_email_senders_internal ON public.commercial_email_senders
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

CREATE INDEX email_send_requests_provider_message_id
  ON public.email_send_requests (provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Contact basis per organization. Absence of a row means the platform defaults:
-- e-mail may use business contacts published by the company for suppliers;
-- WhatsApp keeps explicit opt-in (Meta Business Messaging Policy).
CREATE TABLE public.organization_contact_policies (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  email_basis TEXT NOT NULL DEFAULT 'published_business_contact'
    CHECK (email_basis IN ('published_business_contact', 'explicit_opt_in')),
  whatsapp_basis TEXT NOT NULL DEFAULT 'explicit_opt_in'
    CHECK (whatsapp_basis IN ('published_business_contact', 'explicit_opt_in')),
  revision UUID NOT NULL DEFAULT gen_random_uuid(),
  updated_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.organization_contact_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_contact_policies FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.organization_contact_policies TO yux_api;
GRANT SELECT ON public.organization_contact_policies TO yux_worker;
CREATE POLICY organization_contact_policies_read ON public.organization_contact_policies
  FOR SELECT USING (private.rls_can_access_organization(organization_id));
CREATE POLICY organization_contact_policies_internal ON public.organization_contact_policies
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

-- One-click opt-out for commercial e-mail (RFC 8058) without a shared secret.
ALTER TABLE public.email_send_requests ADD COLUMN unsubscribe_token TEXT;
CREATE UNIQUE INDEX email_send_requests_unsubscribe_token
  ON public.email_send_requests (unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;

-- Sequences stop when the lead replies, unless the sequence explicitly opts out.
ALTER TABLE public.crm_sequences ADD COLUMN exit_on_reply BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.crm_sequence_enrollments ADD COLUMN exit_reason TEXT
  CHECK (exit_reason IS NULL OR exit_reason IN ('lead_replied', 'unsubscribed'));
