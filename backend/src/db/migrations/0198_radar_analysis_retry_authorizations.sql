-- Explicit approval is distinct from a completed/uncertain effect. It does not
-- clear, refund or replay the old receipt; request orchestration consumes it.
CREATE TABLE public.radar_analysis_retry_authorizations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL,campaign_id UUID NOT NULL,candidate_id UUID NOT NULL,
 request_id UUID NOT NULL,batch_hash TEXT NOT NULL CHECK(batch_hash ~ '^[a-f0-9]{64}$'),
 configuration_revision INTEGER NOT NULL CHECK(configuration_revision>0),
 previous_analysis_receipt_id UUID NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('radar_presence_resolution','radar_business_qualification')),
 approved_by UUID NOT NULL REFERENCES public.users(id),approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL,
 acknowledged_previous_charge BOOLEAN NOT NULL CHECK(acknowledged_previous_charge),
 policy_snapshot JSONB NOT NULL,policy_hash TEXT NOT NULL CHECK(policy_hash ~ '^[a-f0-9]{64}$'),
 consumed_by_analysis_receipt_id UUID REFERENCES public.radar_analysis_receipts(id),consumed_at TIMESTAMPTZ,
 UNIQUE(organization_id,request_id,candidate_id,previous_analysis_receipt_id),
 FOREIGN KEY(candidate_id,organization_id,campaign_id) REFERENCES public.radar_candidate_records(id,organization_id,campaign_id) ON DELETE CASCADE,
 FOREIGN KEY(previous_analysis_receipt_id,organization_id) REFERENCES public.radar_analysis_receipts(id,organization_id) ON DELETE CASCADE,
 CHECK(expires_at>approved_at),CHECK((consumed_at IS NULL)=(consumed_by_analysis_receipt_id IS NULL))
);
CREATE INDEX radar_analysis_retry_pending_idx ON public.radar_analysis_retry_authorizations(previous_analysis_receipt_id,expires_at) WHERE consumed_at IS NULL;
CREATE INDEX radar_analysis_retry_campaign_idx ON public.radar_analysis_retry_authorizations(organization_id,campaign_id);
CREATE UNIQUE INDEX radar_analysis_retry_consumed_idx ON public.radar_analysis_retry_authorizations(consumed_by_analysis_receipt_id) WHERE consumed_by_analysis_receipt_id IS NOT NULL;
ALTER TABLE public.radar_analysis_retry_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_analysis_retry_authorizations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_analysis_retry_authorizations FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT ON public.radar_analysis_retry_authorizations TO yux_api;
GRANT SELECT ON public.radar_analysis_retry_authorizations TO yux_worker,yux_runtime;
GRANT UPDATE(consumed_by_analysis_receipt_id,consumed_at) ON public.radar_analysis_retry_authorizations TO yux_runtime;
CREATE POLICY radar_retry_admin_read ON public.radar_analysis_retry_authorizations FOR SELECT TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin' AND private.rls_can_access_organization(organization_id));
CREATE POLICY radar_retry_admin_insert ON public.radar_analysis_retry_authorizations FOR INSERT TO yux_api
 WITH CHECK(current_setting('app.current_role',true)='yux_admin' AND private.rls_can_access_organization(organization_id));
CREATE POLICY radar_retry_service_read ON public.radar_analysis_retry_authorizations FOR SELECT TO yux_worker,yux_runtime
 USING(private.rls_can_access_organization(organization_id));
CREATE POLICY radar_retry_runtime_consume ON public.radar_analysis_retry_authorizations FOR UPDATE TO yux_runtime
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
CREATE POLICY radar_retry_tenant_scope ON public.radar_analysis_retry_authorizations AS RESTRICTIVE FOR ALL
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
