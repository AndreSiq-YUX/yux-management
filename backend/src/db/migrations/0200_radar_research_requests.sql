-- Durable intent, not a new spending authorization or discovery cursor.
ALTER TABLE public.radar_campaigns ADD COLUMN commercial_criteria_revision INTEGER NOT NULL DEFAULT 1 CHECK(commercial_criteria_revision>0);
ALTER TABLE public.radar_campaigns ADD COLUMN operational_policy_version BIGINT NOT NULL DEFAULT 1 CHECK(operational_policy_version>0);
UPDATE public.radar_campaigns SET commercial_criteria_revision=configuration_revision;
CREATE TABLE public.radar_research_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,campaign_id UUID NOT NULL,
 request_id UUID NOT NULL,requested_by UUID NOT NULL REFERENCES public.users(id),
 criteria_revision INTEGER NOT NULL CHECK(criteria_revision>0),configuration_revision INTEGER NOT NULL CHECK(configuration_revision>0),
 operational_policy_version BIGINT NOT NULL CHECK(operational_policy_version>0),
 intent TEXT NOT NULL CHECK(intent IN('resume','refresh','reanalyze')),intent_hash TEXT NOT NULL,
 analysis_authorization_id UUID,analysis_refresh_authorization JSONB,
 status TEXT NOT NULL DEFAULT 'accepted' CHECK(status IN('accepted','running','waiting','unchanged','completed')),
 lease_id UUID,lease_until TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(organization_id,request_id),UNIQUE(id,organization_id,campaign_id),
 FOREIGN KEY(campaign_id,organization_id) REFERENCES public.radar_campaigns(id,organization_id) ON DELETE CASCADE
);
CREATE INDEX radar_research_requests_campaign_idx ON public.radar_research_requests(campaign_id,created_at DESC);
CREATE INDEX radar_research_requests_actor_idx ON public.radar_research_requests(requested_by);
CREATE TABLE public.radar_research_request_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,campaign_id UUID NOT NULL,
 research_request_id UUID NOT NULL,candidate_id UUID NOT NULL,run_id UUID,
 state TEXT NOT NULL DEFAULT 'accepted' CHECK(state IN('accepted','running','waiting','unchanged','completed')),
 reason_code TEXT,started_at TIMESTAMPTZ,dispatch_generation INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(research_request_id,candidate_id),
 FOREIGN KEY(research_request_id,organization_id,campaign_id) REFERENCES public.radar_research_requests(id,organization_id,campaign_id) ON DELETE CASCADE,
 FOREIGN KEY(candidate_id,organization_id,campaign_id) REFERENCES public.radar_candidate_records(id,organization_id,campaign_id) ON DELETE CASCADE,
 FOREIGN KEY(run_id,organization_id,campaign_id,candidate_id) REFERENCES public.radar_candidate_research_runs(id,organization_id,campaign_id,candidate_id)
);
CREATE INDEX radar_research_request_items_candidate_idx ON public.radar_research_request_items(candidate_id);
CREATE INDEX radar_research_request_items_run_idx ON public.radar_research_request_items(run_id);
CREATE INDEX radar_research_request_items_scope_idx ON public.radar_research_request_items(organization_id,research_request_id,state);
-- Reuse the existing global metadata-only maintenance/outbox, not a second loop.
ALTER TABLE public.radar_capture_outbox DROP CONSTRAINT radar_capture_outbox_pkey;
ALTER TABLE public.radar_capture_outbox ALTER COLUMN operation_id DROP NOT NULL;
ALTER TABLE public.radar_capture_outbox ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY;
ALTER TABLE public.radar_capture_outbox ADD COLUMN research_request_id UUID;
ALTER TABLE public.radar_capture_outbox ADD CONSTRAINT radar_capture_outbox_operation_unique UNIQUE(operation_id);
ALTER TABLE public.radar_capture_outbox ADD CONSTRAINT radar_capture_outbox_request_unique UNIQUE(research_request_id);
ALTER TABLE public.radar_capture_outbox ADD CHECK((operation_id IS NULL)<>(research_request_id IS NULL));
ALTER TABLE public.radar_capture_outbox ADD FOREIGN KEY(research_request_id,organization_id,campaign_id) REFERENCES public.radar_research_requests(id,organization_id,campaign_id) ON DELETE CASCADE;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['radar_research_requests','radar_research_request_items'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,yux_api,yux_worker,yux_runtime',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO yux_api,yux_worker',t);
  EXECUTE format('CREATE POLICY research_request_service ON public.%I FOR ALL TO yux_api,yux_worker USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id))',t);
  EXECUTE format('CREATE POLICY research_request_scope ON public.%I AS RESTRICTIVE FOR ALL USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id))',t);
  EXECUTE format('CREATE POLICY research_request_worker_scope ON public.%I AS RESTRICTIVE FOR ALL TO yux_worker USING(organization_id=ANY(COALESCE(NULLIF(current_setting(''app.current_orgs'',true),''''),''{}'')::uuid[])) WITH CHECK(organization_id=ANY(COALESCE(NULLIF(current_setting(''app.current_orgs'',true),''''),''{}'')::uuid[]))',t);
 END LOOP;
END $$;
