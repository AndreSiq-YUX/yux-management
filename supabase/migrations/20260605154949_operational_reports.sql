-- Operational reports and MROI snapshots.

CREATE TABLE IF NOT EXISTS public.report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'internal' CHECK (scope IN ('internal', 'portal')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.report_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  widget_key TEXT NOT NULL,
  title TEXT NOT NULL,
  source_table TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 100,
  is_portal_visible BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, widget_key)
);

CREATE TABLE IF NOT EXISTS public.report_metric_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_value NUMERIC NOT NULL DEFAULT 0,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimensions) = 'object'),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, metric_key, dimensions)
);

CREATE INDEX IF NOT EXISTS idx_report_snapshots_org_period ON public.report_snapshots(organization_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_report_widgets_org_order ON public.report_widgets(organization_id, display_order);
CREATE INDEX IF NOT EXISTS idx_report_metric_cache_org_metric ON public.report_metric_cache(organization_id, metric_key, calculated_at DESC);

ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_metric_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Omnichannel users read report snapshots" ON public.report_snapshots
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators manage report snapshots" ON public.report_snapshots
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read report widgets" ON public.report_widgets
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators manage report widgets" ON public.report_widgets
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read report metric cache" ON public.report_metric_cache
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators manage report metric cache" ON public.report_metric_cache
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

REVOKE ALL ON public.report_snapshots FROM anon;
REVOKE ALL ON public.report_widgets FROM anon;
REVOKE ALL ON public.report_metric_cache FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_snapshots TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_widgets TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_metric_cache TO authenticated, service_role;
