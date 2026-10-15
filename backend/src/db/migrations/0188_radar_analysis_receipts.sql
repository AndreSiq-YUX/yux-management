-- Durable receipts prevent replay after a lost response. No provider is enabled.
CREATE TABLE public.radar_analysis_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('radar_presence_resolution','radar_business_qualification')),
  request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 1 AND 200),
  input_hash TEXT NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  owner_token UUID NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','completed','rejected_before_provider','uncertain')),
  result JSONB,usage JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,action,request_id),
  CHECK((status='completed')=(result IS NOT NULL))
);
CREATE INDEX radar_analysis_receipts_scope_idx ON public.radar_analysis_receipts(organization_id,created_at);
ALTER TABLE public.radar_analysis_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_analysis_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_analysis_receipts FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT ON public.radar_analysis_receipts TO yux_api,yux_worker,yux_runtime;
GRANT INSERT,UPDATE ON public.radar_analysis_receipts TO yux_runtime;
CREATE POLICY yux_service_tenant_access ON public.radar_analysis_receipts FOR ALL TO yux_api,yux_worker,yux_runtime
  USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
CREATE POLICY yux_tenant_scope ON public.radar_analysis_receipts AS RESTRICTIVE FOR ALL
  USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
