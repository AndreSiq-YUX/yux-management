-- Add commercial outcomes without rewriting durable queue states or receipts.
ALTER TABLE public.radar_candidate_research_runs ADD COLUMN funnel_outcome TEXT
 CHECK(funnel_outcome IN('out_of_profile','completed','completed_with_gaps','technical_failure'));
ALTER TABLE public.radar_capture_items ADD COLUMN funnel_outcome TEXT
 CHECK(funnel_outcome IN('out_of_profile','completed','completed_with_gaps','technical_failure'));

CREATE TABLE public.radar_funnel_events(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL,
 campaign_id UUID NOT NULL, candidate_id UUID NOT NULL, run_id UUID,
 configuration_revision INTEGER NOT NULL CHECK(configuration_revision>0),
 gate TEXT NOT NULL CHECK(gate IN('g0','g1','g3','g5','e2','e6')),
 mode TEXT NOT NULL CHECK(mode IN('off','shadow','enforce','effective')),
 outcome TEXT NOT NULL, would_block BOOLEAN NOT NULL DEFAULT FALSE,
 reason_code TEXT, evidence_ids JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(evidence_ids)='array'),
 decision_request_id TEXT, event_key TEXT NOT NULL,
 cost_estimate_brl NUMERIC CHECK(cost_estimate_brl>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(organization_id,candidate_id,configuration_revision,gate,event_key),
 FOREIGN KEY(candidate_id,organization_id,campaign_id) REFERENCES public.radar_candidate_records(id,organization_id,campaign_id) ON DELETE CASCADE,
 FOREIGN KEY(run_id,organization_id,campaign_id,candidate_id) REFERENCES public.radar_candidate_research_runs(id,organization_id,campaign_id,candidate_id)
);
CREATE INDEX radar_funnel_events_campaign_idx ON public.radar_funnel_events(organization_id,campaign_id,created_at);
CREATE INDEX radar_funnel_events_run_idx ON public.radar_funnel_events(run_id) WHERE run_id IS NOT NULL;
ALTER TABLE public.radar_funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_funnel_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_funnel_events FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT ON public.radar_funnel_events TO yux_api;
GRANT SELECT,INSERT ON public.radar_funnel_events TO yux_worker;
CREATE POLICY radar_funnel_events_admin ON public.radar_funnel_events FOR SELECT TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_funnel_events_worker ON public.radar_funnel_events FOR ALL TO yux_worker
 USING(current_setting('app.service_role',true)='worker') WITH CHECK(current_setting('app.service_role',true)='worker');
CREATE POLICY radar_funnel_events_tenant ON public.radar_funnel_events AS RESTRICTIVE FOR ALL
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
