ALTER TABLE public.radar_regional_discovery_cursors
 ADD COLUMN token_received_at TIMESTAMPTZ,
 ADD COLUMN generation INTEGER NOT NULL DEFAULT 0 CHECK(generation>=0),
 ADD COLUMN rejected_token_hash TEXT,
 ADD COLUMN rejected_receipt_id UUID REFERENCES public.radar_enrichment_runs(id);
-- Do not infer token issuance from updated_at: leases and rejected requests
-- also update that timestamp. Legacy tokens intentionally retain unknown age.
CREATE TABLE public.radar_continuation_authorizations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,campaign_id UUID NOT NULL,
 configuration_revision INTEGER NOT NULL,scope_key TEXT NOT NULL,generation INTEGER NOT NULL,
 request_id UUID NOT NULL,approved_by UUID NOT NULL REFERENCES public.users(id),
 expected_state_id TEXT NOT NULL,token_hash TEXT NOT NULL,reason TEXT NOT NULL,policy_version INTEGER NOT NULL,
 approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(campaign_id,organization_id) REFERENCES public.radar_campaigns(id,organization_id) ON DELETE CASCADE,
 UNIQUE(campaign_id,scope_key,generation),UNIQUE(campaign_id,scope_key,request_id)
);
ALTER TABLE public.radar_continuation_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_continuation_authorizations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_continuation_authorizations FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT ON public.radar_continuation_authorizations TO yux_api;
GRANT SELECT ON public.radar_continuation_authorizations TO yux_worker;
CREATE POLICY continuation_admin ON public.radar_continuation_authorizations FOR ALL TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin' AND private.rls_can_access_organization(organization_id))
 WITH CHECK(current_setting('app.current_role',true)='yux_admin' AND private.rls_can_access_organization(organization_id));
CREATE POLICY continuation_worker ON public.radar_continuation_authorizations FOR SELECT TO yux_worker
 USING(private.rls_can_access_organization(organization_id));
CREATE POLICY continuation_tenant ON public.radar_continuation_authorizations AS RESTRICTIVE FOR ALL
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
