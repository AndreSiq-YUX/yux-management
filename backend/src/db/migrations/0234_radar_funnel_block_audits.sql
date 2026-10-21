ALTER TABLE public.radar_funnel_events ADD CONSTRAINT radar_funnel_event_scope UNIQUE(id,organization_id,campaign_id);
CREATE TABLE public.radar_funnel_block_audits(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,campaign_id UUID NOT NULL,event_id UUID NOT NULL UNIQUE,
 outcome TEXT NOT NULL CHECK(outcome IN('confirmed_outside','false_block','uncertain')),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),reviewed_by UUID NOT NULL REFERENCES public.app_users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(event_id,organization_id,campaign_id) REFERENCES public.radar_funnel_events(id,organization_id,campaign_id) ON DELETE CASCADE
);
CREATE INDEX radar_funnel_block_audit_scope ON public.radar_funnel_block_audits(organization_id,campaign_id,created_at);
ALTER TABLE public.radar_funnel_block_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_funnel_block_audits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_funnel_block_audits FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT ON public.radar_funnel_block_audits TO yux_api;
CREATE POLICY radar_funnel_block_audit_admin ON public.radar_funnel_block_audits FOR ALL TO yux_api USING(current_setting('app.current_role',true)='yux_admin') WITH CHECK(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_funnel_block_audit_tenant ON public.radar_funnel_block_audits AS RESTRICTIVE FOR ALL USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
