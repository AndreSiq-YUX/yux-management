ALTER TABLE public.radar_capture_operations ADD COLUMN historical_closed_at TIMESTAMPTZ;
ALTER TABLE public.radar_candidate_research_runs ADD COLUMN historical_closed_at TIMESTAMPTZ;
CREATE TABLE public.radar_funnel_reopen_audit(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,campaign_id UUID NOT NULL,candidate_id UUID NOT NULL,
 request_id UUID NOT NULL,gate TEXT NOT NULL CHECK(gate IN('g0','g1','g5')),configuration_revision INTEGER NOT NULL CHECK(configuration_revision>0),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),confirmed_false_block BOOLEAN NOT NULL DEFAULT FALSE,
 reopened_by UUID NOT NULL REFERENCES public.app_users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(organization_id,request_id),
 FOREIGN KEY(candidate_id,organization_id,campaign_id) REFERENCES public.radar_candidate_records(id,organization_id,campaign_id) ON DELETE CASCADE
);
CREATE INDEX radar_funnel_reopen_scope ON public.radar_funnel_reopen_audit(organization_id,campaign_id,gate,created_at);
ALTER TABLE public.radar_funnel_reopen_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_funnel_reopen_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_funnel_reopen_audit FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT ON public.radar_funnel_reopen_audit TO yux_api;
GRANT SELECT ON public.radar_funnel_reopen_audit TO yux_worker;
CREATE POLICY radar_funnel_reopen_admin ON public.radar_funnel_reopen_audit FOR ALL TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin') WITH CHECK(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_funnel_reopen_worker ON public.radar_funnel_reopen_audit FOR SELECT TO yux_worker
 USING(current_setting('app.service_role',true)='worker');
CREATE POLICY radar_funnel_reopen_tenant ON public.radar_funnel_reopen_audit AS RESTRICTIVE FOR ALL
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
