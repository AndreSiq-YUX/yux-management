-- Replies to commercial e-mail are routed to r+<reply_token>@<EMAIL_REPLY_DOMAIN>
-- and delivered to the API by the inbound e-mail worker.
ALTER TABLE public.email_send_requests ADD COLUMN reply_token TEXT;
CREATE UNIQUE INDEX email_send_requests_reply_token
  ON public.email_send_requests (reply_token) WHERE reply_token IS NOT NULL;

CREATE TABLE public.email_inbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  request_id UUID REFERENCES public.email_send_requests(id) ON DELETE SET NULL,
  provider_message_id TEXT NOT NULL CHECK (btrim(provider_message_id) <> ''),
  from_email TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  text_body TEXT,
  in_reply_to TEXT,
  is_auto_reply BOOLEAN NOT NULL DEFAULT FALSE,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachments) = 'array'),
  forward_request_id UUID REFERENCES public.email_send_requests(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider_message_id)
);
CREATE INDEX email_inbound_messages_lead ON public.email_inbound_messages (lead_id, received_at DESC);

ALTER TABLE public.email_inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_inbound_messages FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.email_inbound_messages TO yux_api;
GRANT SELECT ON public.email_inbound_messages TO yux_worker;
CREATE POLICY email_inbound_messages_read ON public.email_inbound_messages
  FOR SELECT USING (private.rls_can_access_organization(organization_id));
CREATE POLICY email_inbound_messages_internal ON public.email_inbound_messages
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());
