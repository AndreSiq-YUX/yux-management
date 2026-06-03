-- Campaigns and Ads API-first core with provider-neutral local mutation model.

CREATE OR REPLACE FUNCTION private.can_read_campaign_contract(target_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      JOIN public.contract_modules cm
        ON cm.contract_id = c.id
       AND cm.module_key = 'campaigns'
       AND cm.enabled = TRUE
      WHERE c.id = target_contract_id
        AND c.status = 'active'
        AND private.can_access_client(c.client_id)
    );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_campaign_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = target_organization_id
    );
$$;

REVOKE ALL ON FUNCTION private.can_read_campaign_contract(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_campaign_organization(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_campaign_contract(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_campaign_organization(UUID) TO authenticated;

CREATE TABLE public.ad_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'google')),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  status TEXT NOT NULL DEFAULT 'needs_reauth' CHECK (status IN ('connected', 'stale', 'needs_reauth', 'failed')),
  token_reference TEXT,
  last_sync_at TIMESTAMPTZ,
  protected_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider, name)
);

CREATE TABLE public.ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_connection_id UUID NOT NULL REFERENCES public.ad_provider_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'google')),
  external_account_id TEXT NOT NULL CHECK (BTRIM(external_account_id) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, external_account_id)
);

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider_connection_id UUID REFERENCES public.ad_provider_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ad_account_id UUID REFERENCES public.ad_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS initial_stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS objective TEXT DEFAULT 'lead_generation',
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS daily_budget DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS total_budget DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attributed_revenue DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpl DECIMAL(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mroi DECIMAL(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS protected_error TEXT;

UPDATE public.campaigns
SET provider = COALESCE(provider, CASE WHEN platform = 'META' THEN 'meta' ELSE 'google' END),
    lifecycle_status = CASE
      WHEN lifecycle_status IN ('draft', 'pending_approval', 'approved', 'syncing', 'active', 'paused', 'archived', 'failed') THEN lifecycle_status
      WHEN status = 'ACTIVE' THEN 'active'
      WHEN status = 'PAUSED' THEN 'paused'
      WHEN status = 'ENDED' THEN 'archived'
      ELSE 'draft'
    END,
    daily_budget = COALESCE(daily_budget, budget),
    total_budget = COALESCE(total_budget, budget),
    starts_at = COALESCE(starts_at, start_date::timestamptz),
    ends_at = COALESCE(ends_at, end_date::timestamptz),
    leads = COALESCE(NULLIF(leads, 0), conversions),
    cpl = CASE WHEN COALESCE(NULLIF(leads, 0), conversions) > 0 THEN spent / COALESCE(NULLIF(leads, 0), conversions) ELSE cpl END,
    mroi = CASE WHEN spent > 0 THEN (attributed_revenue - spent) / spent ELSE mroi END
WHERE provider IS NULL
   OR lifecycle_status IS NULL
   OR daily_budget IS NULL
   OR total_budget IS NULL
   OR starts_at IS NULL;

ALTER TABLE public.campaigns
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN objective SET NOT NULL,
  ALTER COLUMN lifecycle_status SET NOT NULL,
  ALTER COLUMN daily_budget SET NOT NULL;

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_provider_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_provider_check CHECK (provider IN ('meta', 'google'));
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_objective_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_objective_check CHECK (objective IN ('lead_generation', 'traffic', 'conversions', 'awareness'));
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_lifecycle_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_lifecycle_status_check CHECK (lifecycle_status IN ('draft', 'pending_approval', 'approved', 'syncing', 'active', 'paused', 'archived', 'failed'));
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_budget_positive_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_budget_positive_check CHECK (daily_budget >= 0 AND (total_budget IS NULL OR total_budget >= 0));

CREATE TABLE public.campaign_ad_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived', 'failed')),
  daily_budget DECIMAL(15,2),
  targeting JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(targeting) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campaign_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_set_id UUID REFERENCES public.campaign_ad_sets(id) ON DELETE SET NULL,
  external_id TEXT,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campaign_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_id UUID REFERENCES public.campaign_ads(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  format TEXT NOT NULL DEFAULT 'image' CHECK (format IN ('image', 'video', 'carousel', 'text')),
  headline TEXT,
  body TEXT,
  media_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campaign_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  spend DECIMAL(15,2) NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  attributed_revenue DECIMAL(15,2) NOT NULL DEFAULT 0,
  raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_metrics) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campaign_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campaign_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.ad_provider_mutation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_connection_id UUID REFERENCES public.ad_provider_connections(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'google')),
  action TEXT NOT NULL CHECK (action IN ('create_campaign', 'update_budget', 'pause_campaign', 'sync_metrics')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(request_payload) = 'object'),
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(response_payload) = 'object'),
  protected_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_provider_connections_org_status ON public.ad_provider_connections(organization_id, status);
CREATE INDEX idx_ad_accounts_connection ON public.ad_accounts(provider_connection_id);
CREATE INDEX idx_campaigns_org_status ON public.campaigns(organization_id, lifecycle_status);
CREATE INDEX idx_campaigns_client_status ON public.campaigns(client_id, lifecycle_status);
CREATE INDEX idx_campaigns_contract_status ON public.campaigns(contract_id, lifecycle_status);
CREATE INDEX idx_campaigns_provider_connection ON public.campaigns(provider_connection_id);
CREATE INDEX idx_campaign_creatives_campaign ON public.campaign_creatives(campaign_id);
CREATE INDEX idx_campaign_metric_snapshots_campaign ON public.campaign_metric_snapshots(campaign_id, snapshot_at DESC);
CREATE INDEX idx_campaign_recommendations_campaign ON public.campaign_recommendations(campaign_id, status);
CREATE INDEX idx_campaign_alerts_campaign ON public.campaign_alerts(campaign_id, status);
CREATE INDEX idx_ad_provider_mutation_runs_campaign ON public.ad_provider_mutation_runs(campaign_id, created_at DESC);

CREATE TRIGGER update_ad_provider_connections_updated_at BEFORE UPDATE ON public.ad_provider_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ad_accounts_updated_at BEFORE UPDATE ON public.ad_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_campaign_ad_sets_updated_at BEFORE UPDATE ON public.campaign_ad_sets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_campaign_ads_updated_at BEFORE UPDATE ON public.campaign_ads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_campaign_creatives_updated_at BEFORE UPDATE ON public.campaign_creatives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_campaign_recommendations_updated_at BEFORE UPDATE ON public.campaign_recommendations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_campaign_alerts_updated_at BEFORE UPDATE ON public.campaign_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ad_provider_mutation_runs_updated_at BEFORE UPDATE ON public.ad_provider_mutation_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ad_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_provider_mutation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal users can manage campaigns" ON public.campaigns;
CREATE POLICY "Internal users manage campaigns" ON public.campaigns
  FOR ALL USING (private.can_manage_campaign_organization(organization_id))
  WITH CHECK (private.can_manage_campaign_organization(organization_id));
CREATE POLICY "Portal users read campaigns" ON public.campaigns
  FOR SELECT USING (private.can_read_campaign_contract(contract_id));

CREATE POLICY "Internal users manage ad provider connections" ON public.ad_provider_connections
  FOR ALL USING (private.can_manage_campaign_organization(organization_id))
  WITH CHECK (private.can_manage_campaign_organization(organization_id));
CREATE POLICY "Internal users manage ad accounts" ON public.ad_accounts
  FOR ALL USING (EXISTS (SELECT 1 FROM public.ad_provider_connections c WHERE c.id = provider_connection_id AND private.can_manage_campaign_organization(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ad_provider_connections c WHERE c.id = provider_connection_id AND private.can_manage_campaign_organization(c.organization_id)));

CREATE POLICY "Internal users manage campaign ad sets" ON public.campaign_ad_sets
  FOR ALL USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_manage_campaign_organization(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_manage_campaign_organization(c.organization_id)));
CREATE POLICY "Internal users manage campaign ads" ON public.campaign_ads
  FOR ALL USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_manage_campaign_organization(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_manage_campaign_organization(c.organization_id)));
CREATE POLICY "Internal users manage campaign creatives" ON public.campaign_creatives
  FOR ALL USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_manage_campaign_organization(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_manage_campaign_organization(c.organization_id)));
CREATE POLICY "Portal users read campaign creatives" ON public.campaign_creatives
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_read_campaign_contract(c.contract_id)));

CREATE POLICY "Internal users manage campaign snapshots" ON public.campaign_metric_snapshots
  FOR ALL USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_manage_campaign_organization(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_manage_campaign_organization(c.organization_id)));
CREATE POLICY "Portal users read campaign snapshots" ON public.campaign_metric_snapshots
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_read_campaign_contract(c.contract_id)));

CREATE POLICY "Internal users manage campaign recommendations" ON public.campaign_recommendations
  FOR ALL USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_manage_campaign_organization(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_manage_campaign_organization(c.organization_id)));
CREATE POLICY "Portal users read campaign recommendations" ON public.campaign_recommendations
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_read_campaign_contract(c.contract_id)));

CREATE POLICY "Internal users manage campaign alerts" ON public.campaign_alerts
  FOR ALL USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_manage_campaign_organization(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_manage_campaign_organization(c.organization_id)));
CREATE POLICY "Portal users read campaign alerts" ON public.campaign_alerts
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND private.can_read_campaign_contract(c.contract_id)));

CREATE POLICY "Internal users manage ad provider mutation runs" ON public.ad_provider_mutation_runs
  FOR ALL USING (private.can_manage_campaign_organization(organization_id))
  WITH CHECK (private.can_manage_campaign_organization(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_provider_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_ad_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_ads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_creatives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_metric_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_provider_mutation_runs TO authenticated;

NOTIFY pgrst, 'reload schema';
