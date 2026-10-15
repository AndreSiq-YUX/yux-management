-- Opt-in orchestration only: no provider, model, license or budget is enabled.
ALTER TABLE public.radar_campaigns ADD CONSTRAINT radar_capture_campaign_scope UNIQUE(id,organization_id);
ALTER TABLE public.radar_candidate_research_runs ADD CONSTRAINT radar_capture_run_scope UNIQUE(id,organization_id,campaign_id,candidate_id);
CREATE TABLE public.radar_capture_operations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL, campaign_id UUID NOT NULL,
 requested_by UUID NOT NULL REFERENCES public.users(id), request_id UUID NOT NULL,
 configuration_revision INTEGER NOT NULL CHECK(configuration_revision>0),
 requested_count INTEGER NOT NULL CHECK(requested_count BETWEEN 1 AND 1000), configuration_snapshot JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','discovering','researching','completed','partial','blocked')),
 discovery_stopped BOOLEAN NOT NULL DEFAULT FALSE, discovery_reason TEXT,
 queries INTEGER NOT NULL DEFAULT 0 CHECK(queries>=0), scope_pages JSONB NOT NULL DEFAULT '{}', discovery_pending BOOLEAN NOT NULL DEFAULT FALSE,
 blockers JSONB NOT NULL DEFAULT '[]', lease_id UUID, lease_until TIMESTAMPTZ,
 resume_request_id UUID, resume_generation INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(organization_id,request_id), UNIQUE(id,organization_id,campaign_id),
 FOREIGN KEY(campaign_id,organization_id) REFERENCES public.radar_campaigns(id,organization_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX radar_capture_active_idx ON public.radar_capture_operations(organization_id,campaign_id,configuration_revision)
 WHERE status IN ('queued','discovering','researching','blocked');
CREATE INDEX radar_capture_campaign_idx ON public.radar_capture_operations(campaign_id,created_at DESC);
CREATE INDEX radar_capture_author_idx ON public.radar_capture_operations(requested_by);
CREATE TABLE public.radar_capture_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL, campaign_id UUID NOT NULL,
 operation_id UUID NOT NULL, candidate_id UUID NOT NULL, run_id UUID,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','researching','completed','insufficient','blocked')),
 blocker TEXT, dispatch_generation INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(operation_id,candidate_id),
 FOREIGN KEY(operation_id,organization_id,campaign_id) REFERENCES public.radar_capture_operations(id,organization_id,campaign_id) ON DELETE CASCADE,
 FOREIGN KEY(candidate_id,organization_id,campaign_id) REFERENCES public.radar_candidate_records(id,organization_id,campaign_id) ON DELETE CASCADE,
 FOREIGN KEY(run_id,organization_id,campaign_id,candidate_id) REFERENCES public.radar_candidate_research_runs(id,organization_id,campaign_id,candidate_id)
);
CREATE INDEX radar_capture_items_candidate_idx ON public.radar_capture_items(candidate_id);
CREATE INDEX radar_capture_items_run_idx ON public.radar_capture_items(run_id);
CREATE INDEX radar_capture_items_scope_idx ON public.radar_capture_items(organization_id,operation_id,status);
CREATE TABLE public.radar_capture_overflow (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id UUID NOT NULL, campaign_id UUID NOT NULL,
 configuration_revision INTEGER NOT NULL, scope_key TEXT NOT NULL, enrichment_run_id UUID NOT NULL REFERENCES public.radar_enrichment_runs(id), candidate JSONB NOT NULL,
 FOREIGN KEY(campaign_id,organization_id) REFERENCES public.radar_campaigns(id,organization_id) ON DELETE CASCADE
);
CREATE INDEX radar_capture_overflow_campaign_idx ON public.radar_capture_overflow(campaign_id,configuration_revision,id);
CREATE INDEX radar_capture_overflow_run_idx ON public.radar_capture_overflow(enrichment_run_id);
-- No company/contact fields here. Global worker reads only dispatch metadata.
CREATE TABLE public.radar_capture_outbox (
 operation_id UUID PRIMARY KEY, organization_id UUID NOT NULL, campaign_id UUID NOT NULL, next_dispatch_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(operation_id,organization_id,campaign_id) REFERENCES public.radar_capture_operations(id,organization_id,campaign_id) ON DELETE CASCADE
);
CREATE INDEX radar_capture_outbox_pending_idx ON public.radar_capture_outbox(next_dispatch_at);
CREATE INDEX radar_capture_outbox_campaign_idx ON public.radar_capture_outbox(campaign_id);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['radar_capture_operations','radar_capture_items','radar_capture_overflow'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,yux_api,yux_worker,yux_runtime',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO yux_api,yux_worker',t);
  EXECUTE format('CREATE POLICY capture_service ON public.%I FOR ALL TO yux_api,yux_worker USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id))',t);
  EXECUTE format('CREATE POLICY capture_scope ON public.%I AS RESTRICTIVE FOR ALL USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id))',t);
 END LOOP;
END $$;
GRANT USAGE,SELECT ON SEQUENCE public.radar_capture_overflow_id_seq TO yux_api,yux_worker;
ALTER TABLE public.radar_capture_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_capture_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_capture_outbox FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.radar_capture_outbox TO yux_api,yux_worker;
CREATE POLICY capture_outbox_tenant ON public.radar_capture_outbox FOR ALL TO yux_api,yux_worker
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
CREATE POLICY capture_outbox_reconcile ON public.radar_capture_outbox FOR SELECT TO yux_worker
 USING(current_setting('app.service_role',true)='worker');
