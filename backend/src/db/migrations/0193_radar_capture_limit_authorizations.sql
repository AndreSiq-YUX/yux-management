CREATE TABLE public.radar_capture_limit_authorizations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,campaign_id UUID NOT NULL,operation_id UUID NOT NULL,
 request_id UUID NOT NULL,approved_by UUID NOT NULL REFERENCES public.users(id),expected_state_id TEXT NOT NULL,
 old_limits JSONB NOT NULL,new_limits JSONB NOT NULL,counters JSONB NOT NULL,approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(operation_id,request_id),FOREIGN KEY(operation_id,organization_id,campaign_id)
 REFERENCES public.radar_capture_operations(id,organization_id,campaign_id) ON DELETE CASCADE
);
CREATE INDEX radar_capture_limit_authorizations_scope_idx ON public.radar_capture_limit_authorizations(organization_id,campaign_id,operation_id);
CREATE INDEX radar_capture_receipt_operation_idx ON public.radar_enrichment_runs(organization_id,campaign_id,(input_payload->>'captureOperationId')) WHERE provider='cnpja_advanced_search';
ALTER TABLE public.radar_capture_limit_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_capture_limit_authorizations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_capture_limit_authorizations FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT ON public.radar_capture_limit_authorizations TO yux_api;
GRANT SELECT ON public.radar_capture_limit_authorizations TO yux_worker;
CREATE POLICY capture_limit_tenant ON public.radar_capture_limit_authorizations FOR ALL TO yux_api,yux_worker
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
CREATE POLICY capture_limit_scope ON public.radar_capture_limit_authorizations AS RESTRICTIVE FOR ALL
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
