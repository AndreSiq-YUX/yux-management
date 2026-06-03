-- Shared commercial attribution model for CRM, campaigns, landing pages, WhatsApp, and reports.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_read_commercial_attribution(
  target_client_id UUID,
  target_contract_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    OR (
      target_client_id IS NOT NULL
      AND private.can_access_client(target_client_id)
      AND (
        target_contract_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.contracts c
          WHERE c.id = target_contract_id
            AND c.client_id = target_client_id
            AND c.status = 'active'
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_commercial_attribution(
  target_organization_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_organization_id IS NOT NULL
    AND private.is_internal_user()
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = target_organization_id
    );
$$;

REVOKE ALL ON FUNCTION private.can_read_commercial_attribution(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_commercial_attribution(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_commercial_attribution(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_commercial_attribution(UUID) TO authenticated;

CREATE TABLE public.utm_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  session_key TEXT NOT NULL CHECK (BTRIM(session_key) <> ''),
  visitor_key TEXT CHECK (visitor_key IS NULL OR BTRIM(visitor_key) <> ''),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT utm_sessions_seen_order CHECK (last_seen_at >= first_seen_at),
  UNIQUE (organization_id, session_key)
);

CREATE TABLE public.lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  utm_session_id UUID REFERENCES public.utm_sessions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('paid_campaign', 'landing_page', 'whatsapp_cta', 'organic', 'referral', 'manual')),
  source_label TEXT NOT NULL DEFAULT 'Manual' CHECK (BTRIM(source_label) <> ''),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  first_touch_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_touch_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_sources_touch_order CHECK (last_touch_at >= first_touch_at)
);

CREATE TABLE public.tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  utm_session_id UUID REFERENCES public.utm_sessions(id) ON DELETE SET NULL,
  lead_source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'page_view',
      'form_submit',
      'whatsapp_click',
      'campaign_click',
      'manual_import',
      'lead_created',
      'conversion'
    )
  ),
  event_name TEXT NOT NULL CHECK (BTRIM(event_name) <> ''),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  path TEXT,
  referrer TEXT,
  value_amount DECIMAL(15,2) CHECK (value_amount IS NULL OR value_amount >= 0),
  currency TEXT CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_utm_sessions_organization_seen ON public.utm_sessions(organization_id, last_seen_at DESC);
CREATE INDEX idx_utm_sessions_client_seen ON public.utm_sessions(client_id, last_seen_at DESC);
CREATE INDEX idx_utm_sessions_contract_id ON public.utm_sessions(contract_id);
CREATE INDEX idx_utm_sessions_campaign_id ON public.utm_sessions(campaign_id);
CREATE INDEX idx_utm_sessions_landing_page_id ON public.utm_sessions(landing_page_id);
CREATE INDEX idx_utm_sessions_conversation_id ON public.utm_sessions(conversation_id);

CREATE INDEX idx_lead_sources_organization_kind ON public.lead_sources(organization_id, kind);
CREATE INDEX idx_lead_sources_client_touch ON public.lead_sources(client_id, last_touch_at DESC);
CREATE INDEX idx_lead_sources_contract_id ON public.lead_sources(contract_id);
CREATE INDEX idx_lead_sources_lead_id ON public.lead_sources(lead_id);
CREATE INDEX idx_lead_sources_campaign_id ON public.lead_sources(campaign_id);
CREATE INDEX idx_lead_sources_landing_page_id ON public.lead_sources(landing_page_id);
CREATE INDEX idx_lead_sources_conversation_id ON public.lead_sources(conversation_id);

CREATE INDEX idx_tracking_events_organization_occurred ON public.tracking_events(organization_id, occurred_at DESC);
CREATE INDEX idx_tracking_events_client_occurred ON public.tracking_events(client_id, occurred_at DESC);
CREATE INDEX idx_tracking_events_contract_id ON public.tracking_events(contract_id);
CREATE INDEX idx_tracking_events_lead_id ON public.tracking_events(lead_id);
CREATE INDEX idx_tracking_events_campaign_id ON public.tracking_events(campaign_id);
CREATE INDEX idx_tracking_events_landing_page_id ON public.tracking_events(landing_page_id);
CREATE INDEX idx_tracking_events_conversation_id ON public.tracking_events(conversation_id);
CREATE INDEX idx_tracking_events_type_occurred ON public.tracking_events(event_type, occurred_at DESC);

CREATE TRIGGER update_utm_sessions_updated_at
  BEFORE UPDATE ON public.utm_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lead_sources_updated_at
  BEFORE UPDATE ON public.lead_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tracking_events_updated_at
  BEFORE UPDATE ON public.tracking_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.utm_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users manage UTM sessions" ON public.utm_sessions
  FOR ALL USING (private.can_manage_commercial_attribution(organization_id))
  WITH CHECK (private.can_manage_commercial_attribution(organization_id));

CREATE POLICY "Portal users read UTM sessions" ON public.utm_sessions
  FOR SELECT USING (private.can_read_commercial_attribution(client_id, contract_id));

CREATE POLICY "Internal users manage lead sources" ON public.lead_sources
  FOR ALL USING (private.can_manage_commercial_attribution(organization_id))
  WITH CHECK (private.can_manage_commercial_attribution(organization_id));

CREATE POLICY "Portal users read lead sources" ON public.lead_sources
  FOR SELECT USING (private.can_read_commercial_attribution(client_id, contract_id));

CREATE POLICY "Internal users manage tracking events" ON public.tracking_events
  FOR ALL USING (private.can_manage_commercial_attribution(organization_id))
  WITH CHECK (private.can_manage_commercial_attribution(organization_id));

CREATE POLICY "Portal users read tracking events" ON public.tracking_events
  FOR SELECT USING (private.can_read_commercial_attribution(client_id, contract_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.utm_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_events TO authenticated;

NOTIFY pgrst, 'reload schema';
