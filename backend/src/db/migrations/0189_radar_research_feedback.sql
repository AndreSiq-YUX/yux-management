ALTER TABLE public.radar_candidate_records ADD CONSTRAINT radar_candidate_feedback_scope_unique UNIQUE(id,organization_id,campaign_id);
CREATE TABLE public.radar_research_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,
  campaign_id UUID NOT NULL,candidate_id UUID NOT NULL,request_id UUID NOT NULL,
  configuration_revision INTEGER NOT NULL CHECK(configuration_revision>0),
  payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
  kind TEXT NOT NULL CHECK(kind IN ('identity_confirmed','identity_wrong','contact_valid','contact_invalid','segment_confirmed','segment_wrong')),
  contact JSONB,note TEXT CHECK(length(note)<=2000),created_by UUID NOT NULL REFERENCES public.users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,request_id),
  FOREIGN KEY(candidate_id,organization_id,campaign_id) REFERENCES public.radar_candidate_records(id,organization_id,campaign_id) ON DELETE CASCADE,
  CHECK((kind IN ('contact_valid','contact_invalid'))=(contact IS NOT NULL))
);
CREATE INDEX radar_feedback_candidate_idx ON public.radar_research_feedback(organization_id,candidate_id,created_at DESC);
CREATE INDEX radar_feedback_campaign_idx ON public.radar_research_feedback(campaign_id);
CREATE INDEX radar_feedback_author_idx ON public.radar_research_feedback(created_by);
ALTER TABLE public.radar_research_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_research_feedback FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_research_feedback FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT ON public.radar_research_feedback TO yux_api;
GRANT SELECT ON public.radar_research_feedback TO yux_worker;
CREATE POLICY yux_service_tenant_access ON public.radar_research_feedback FOR ALL TO yux_api,yux_worker
  USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
CREATE POLICY yux_tenant_scope ON public.radar_research_feedback AS RESTRICTIVE FOR ALL
  USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
