-- Every accepted start request retains its original payload and operation,
-- including requests that reused another active operation.
CREATE TABLE public.radar_capture_requests (
 organization_id UUID NOT NULL, request_id UUID NOT NULL, operation_id UUID NOT NULL, campaign_id UUID NOT NULL,
 configuration_revision INTEGER NOT NULL CHECK(configuration_revision>0), requested_count INTEGER NOT NULL CHECK(requested_count BETWEEN 1 AND 1000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(organization_id,request_id),
 FOREIGN KEY(operation_id,organization_id,campaign_id) REFERENCES public.radar_capture_operations(id,organization_id,campaign_id) ON DELETE CASCADE
);
CREATE INDEX radar_capture_requests_operation_idx ON public.radar_capture_requests(operation_id);
CREATE INDEX radar_capture_requests_campaign_idx ON public.radar_capture_requests(campaign_id);
INSERT INTO public.radar_capture_requests(organization_id,request_id,operation_id,campaign_id,configuration_revision,requested_count)
 SELECT organization_id,request_id,id,campaign_id,configuration_revision,requested_count FROM public.radar_capture_operations;
ALTER TABLE public.radar_capture_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_capture_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_capture_requests FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT ON public.radar_capture_requests TO yux_api;
CREATE POLICY capture_request_access ON public.radar_capture_requests FOR ALL TO yux_api
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
CREATE POLICY capture_request_scope ON public.radar_capture_requests AS RESTRICTIVE FOR ALL
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
