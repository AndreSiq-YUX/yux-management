-- CRM attribution, source rollups and MROI reporting.

CREATE OR REPLACE FUNCTION private.can_access_crm_attribution(target_organization_id UUID, target_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_internal_user()
    OR (
      target_instance_id IS NOT NULL
      AND private.can_access_crm_instance(target_instance_id)
    )
    OR private.can_access_crm_organization(target_organization_id);
$$;

CREATE OR REPLACE FUNCTION private.can_manage_crm_attribution(target_organization_id UUID, target_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_internal_user()
    OR (
      target_instance_id IS NOT NULL
      AND private.can_manage_crm_instance(target_instance_id)
    );
$$;

REVOKE ALL ON FUNCTION private.can_access_crm_attribution(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_crm_attribution(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_crm_attribution(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_crm_attribution(UUID, UUID) TO authenticated;

CREATE TABLE IF NOT EXISTS public.lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (BTRIM(key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('paid_campaign', 'landing_page', 'whatsapp', 'organic', 'referral', 'direct', 'manual')),
  provider TEXT,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  media_cost DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (media_cost >= 0),
  operational_cost DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (operational_cost >= 0),
  client_visible_cost DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (client_visible_cost >= 0),
  is_client_cost_visible BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, crm_instance_id, key)
);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS primary_source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_confidence TEXT NOT NULL DEFAULT 'low';

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_confidence_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_source_confidence_check
  CHECK (source_confidence IN ('high', 'medium', 'low'));

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS crm_performance_status TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_crm_performance_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_crm_performance_status_check
  CHECK (crm_performance_status IN ('excellent', 'healthy', 'watch', 'critical', 'unknown'));

ALTER TABLE public.landing_pages
  ADD COLUMN IF NOT EXISTS crm_source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS source_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.invoices
      ADD COLUMN IF NOT EXISTS source_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.lead_attribution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('first_touch', 'lead_created', 'campaign_click', 'landing_page_submit', 'whatsapp_click', 'proposal_approved', 'invoice_paid')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  invoice_id UUID,
  revenue_amount DECIMAL(15,2) CHECK (revenue_amount IS NULL OR revenue_amount >= 0),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.lead_attribution_events
      ADD CONSTRAINT lead_attribution_events_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.lead_source_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.lead_sources(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  leads INTEGER NOT NULL DEFAULT 0 CHECK (leads >= 0),
  opportunities INTEGER NOT NULL DEFAULT 0 CHECK (opportunities >= 0),
  sales INTEGER NOT NULL DEFAULT 0 CHECK (sales >= 0),
  media_cost DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (media_cost >= 0),
  operational_cost DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (operational_cost >= 0),
  client_visible_cost DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (client_visible_cost >= 0),
  attributed_revenue DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (attributed_revenue >= 0),
  cpl DECIMAL(15,4) NOT NULL DEFAULT 0,
  opportunity_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
  conversion_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
  mroi DECIMAL(12,4) NOT NULL DEFAULT 0,
  seller_id UUID REFERENCES public.crm_instance_members(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.crm_teams(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  UNIQUE (source_id, period_start, period_end, seller_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.campaign_crm_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  leads INTEGER NOT NULL DEFAULT 0 CHECK (leads >= 0),
  opportunities INTEGER NOT NULL DEFAULT 0 CHECK (opportunities >= 0),
  sales INTEGER NOT NULL DEFAULT 0 CHECK (sales >= 0),
  spend DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (spend >= 0),
  attributed_revenue DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (attributed_revenue >= 0),
  cpl DECIMAL(15,4) NOT NULL DEFAULT 0,
  conversion_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
  mroi DECIMAL(12,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('excellent', 'healthy', 'watch', 'critical', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  UNIQUE (campaign_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS public.crm_revenue_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  invoice_id UUID,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  attribution_model TEXT NOT NULL DEFAULT 'primary_source' CHECK (attribution_model IN ('primary_source', 'manual', 'proposal_source', 'invoice_source')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.crm_revenue_attribution
      ADD CONSTRAINT crm_revenue_attribution_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.crm_mroi_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical', 'success')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  description TEXT NOT NULL DEFAULT '',
  metric_key TEXT NOT NULL CHECK (metric_key IN ('cpl', 'conversion_rate', 'mroi', 'revenue')),
  metric_value DECIMAL(15,4) NOT NULL DEFAULT 0,
  threshold_value DECIMAL(15,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.crm_report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'internal' CHECK (scope IN ('internal', 'portal')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  csv TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start)
);

INSERT INTO public.lead_sources (
  organization_id,
  crm_instance_id,
  key,
  name,
  kind,
  campaign_id,
  utm_source,
  utm_medium,
  utm_campaign,
  client_visible_cost
)
SELECT DISTINCT
  l.organization_id,
  l.crm_instance_id,
  COALESCE(NULLIF(LOWER(REGEXP_REPLACE(l.source, '[^a-zA-Z0-9]+', '_', 'g')), ''), 'manual') AS key,
  COALESCE(NULLIF(l.source, ''), 'Manual') AS name,
  CASE
    WHEN l.source_kind = 'whatsapp_cta' THEN 'whatsapp'
    WHEN l.source_kind IN ('paid_campaign', 'landing_page', 'organic', 'referral', 'manual') THEN l.source_kind
    ELSE 'manual'
  END,
  l.campaign_id,
  NULLIF(l.attribution_context->>'utmSource', ''),
  NULLIF(l.attribution_context->>'utmMedium', ''),
  NULLIF(l.attribution_context->>'utmCampaign', ''),
  0
FROM public.leads l
WHERE l.organization_id IS NOT NULL
ON CONFLICT (organization_id, crm_instance_id, key) DO NOTHING;

UPDATE public.leads l
SET primary_source_id = s.id,
    source_confidence = CASE
      WHEN l.campaign_id IS NOT NULL OR COALESCE(l.attribution_context, '{}'::jsonb) <> '{}'::jsonb THEN 'high'
      WHEN l.source IS NOT NULL AND BTRIM(l.source) <> '' THEN 'medium'
      ELSE 'low'
    END
FROM public.lead_sources s
WHERE l.primary_source_id IS NULL
  AND l.organization_id = s.organization_id
  AND COALESCE(l.crm_instance_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(s.crm_instance_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND COALESCE(NULLIF(LOWER(REGEXP_REPLACE(l.source, '[^a-zA-Z0-9]+', '_', 'g')), ''), 'manual') = s.key;

INSERT INTO public.lead_attribution_events (
  organization_id,
  crm_instance_id,
  lead_id,
  source_id,
  event_kind,
  occurred_at,
  campaign_id,
  utm_source,
  utm_medium,
  utm_campaign,
  metadata
)
SELECT
  l.organization_id,
  l.crm_instance_id,
  l.id,
  l.primary_source_id,
  'lead_created',
  COALESCE(l.created_at, NOW()),
  l.campaign_id,
  NULLIF(l.attribution_context->>'utmSource', ''),
  NULLIF(l.attribution_context->>'utmMedium', ''),
  NULLIF(l.attribution_context->>'utmCampaign', ''),
  jsonb_build_object('seeded_from_existing_lead', true)
FROM public.leads l
WHERE l.organization_id IS NOT NULL
  AND l.primary_source_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.proposals
SET source_lead_id = COALESCE(source_lead_id, lead_id)
WHERE source_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_sources_org_kind ON public.lead_sources(organization_id, crm_instance_id, kind);
CREATE INDEX IF NOT EXISTS idx_lead_sources_campaign ON public.lead_sources(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_primary_source ON public.leads(primary_source_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_crm_performance_status ON public.campaigns(crm_performance_status);
CREATE INDEX IF NOT EXISTS idx_landing_pages_crm_source ON public.landing_pages(crm_source_id);
CREATE INDEX IF NOT EXISTS idx_proposals_source_lead ON public.proposals(source_lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_events_lead ON public.lead_attribution_events(lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_events_source ON public.lead_attribution_events(source_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_source_rollups_period ON public.lead_source_rollups(crm_instance_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_campaign_crm_performance_period ON public.campaign_crm_performance_snapshots(campaign_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_crm_revenue_attribution_lead ON public.crm_revenue_attribution(lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_mroi_alerts_status ON public.crm_mroi_alerts(crm_instance_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_crm_report_exports_scope ON public.crm_report_exports(crm_instance_id, scope, created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_source_lead ON public.invoices(source_lead_id);
  END IF;
END
$$;

ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_attribution_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_source_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_crm_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_revenue_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_mroi_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_report_exports ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_sources', 'lead_source_rollups', 'campaign_crm_performance_snapshots',
    'crm_mroi_alerts'
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
    'lead_sources', 'lead_source_rollups', 'campaign_crm_performance_snapshots',
    'crm_revenue_attribution', 'crm_mroi_alerts', 'crm_report_exports'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_accessible" ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE POLICY "%s_select_accessible" ON public.%I FOR SELECT TO authenticated USING (private.can_access_crm_attribution(organization_id, crm_instance_id))',
      target_table,
      target_table
    );

    EXECUTE format('DROP POLICY IF EXISTS "%s_manageable" ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE POLICY "%s_manageable" ON public.%I FOR ALL TO authenticated USING (private.can_manage_crm_attribution(organization_id, crm_instance_id)) WITH CHECK (private.can_manage_crm_attribution(organization_id, crm_instance_id))',
      target_table,
      target_table
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "lead_attribution_events_select_accessible" ON public.lead_attribution_events;
CREATE POLICY "lead_attribution_events_select_accessible"
  ON public.lead_attribution_events FOR SELECT TO authenticated
  USING (private.can_access_crm_lead_v2(lead_id) OR private.can_access_crm_attribution(organization_id, crm_instance_id));

DROP POLICY IF EXISTS "lead_attribution_events_insert_accessible" ON public.lead_attribution_events;
CREATE POLICY "lead_attribution_events_insert_accessible"
  ON public.lead_attribution_events FOR INSERT TO authenticated
  WITH CHECK (private.can_update_crm_lead_v2(lead_id) OR private.can_manage_crm_attribution(organization_id, crm_instance_id));

DROP POLICY IF EXISTS "lead_attribution_events_manageable" ON public.lead_attribution_events;
CREATE POLICY "lead_attribution_events_manageable"
  ON public.lead_attribution_events FOR UPDATE TO authenticated
  USING (private.can_manage_crm_attribution(organization_id, crm_instance_id))
  WITH CHECK (private.can_manage_crm_attribution(organization_id, crm_instance_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_attribution_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_source_rollups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_crm_performance_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_revenue_attribution TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_mroi_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_report_exports TO authenticated;

NOTIFY pgrst, 'reload schema';
