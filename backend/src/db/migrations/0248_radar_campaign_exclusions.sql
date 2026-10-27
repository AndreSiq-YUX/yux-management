CREATE TABLE public.radar_campaign_exclusions(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
 candidate_id UUID REFERENCES public.radar_candidate_records(id) ON DELETE SET NULL,
 request_id UUID NOT NULL,identity_keys JSONB NOT NULL CHECK(jsonb_typeof(identity_keys)='array'),
 review_snapshot JSONB NOT NULL DEFAULT '{}',title TEXT NOT NULL,reason TEXT,origin TEXT NOT NULL DEFAULT 'manual' CHECK(origin IN('manual','semantic')),
 criteria_revision INTEGER,created_by UUID REFERENCES public.app_users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 revoked_by UUID REFERENCES public.app_users(id),revoked_at TIMESTAMPTZ,
 CHECK(origin='manual' OR criteria_revision IS NOT NULL)
);
CREATE UNIQUE INDEX radar_campaign_exclusion_active_candidate ON public.radar_campaign_exclusions(organization_id,campaign_id,candidate_id) WHERE revoked_at IS NULL;
CREATE INDEX radar_campaign_exclusion_scope ON public.radar_campaign_exclusions(organization_id,campaign_id) WHERE revoked_at IS NULL;
CREATE INDEX radar_campaign_exclusion_keys ON public.radar_campaign_exclusions USING gin(identity_keys);
CREATE TABLE public.radar_campaign_exclusion_requests(
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
 request_id UUID NOT NULL,input_hash TEXT NOT NULL,candidate_ids JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(organization_id,campaign_id,request_id)
);
ALTER TABLE public.radar_campaign_exclusion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_campaign_exclusion_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_campaign_exclusion_requests FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT ON public.radar_campaign_exclusion_requests TO yux_api;
CREATE POLICY radar_campaign_exclusion_request_api ON public.radar_campaign_exclusion_requests FOR ALL TO yux_api USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
ALTER TABLE public.radar_campaign_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_campaign_exclusions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_campaign_exclusions FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT,UPDATE ON public.radar_campaign_exclusions TO yux_api;
GRANT SELECT ON public.radar_campaign_exclusions TO yux_worker;
CREATE POLICY radar_campaign_exclusion_api ON public.radar_campaign_exclusions FOR ALL TO yux_api USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
CREATE POLICY radar_campaign_exclusion_worker ON public.radar_campaign_exclusions FOR SELECT TO yux_worker USING(current_setting('app.service_role',true)='worker' AND private.rls_can_access_organization(organization_id));
INSERT INTO public.radar_campaign_exclusions(organization_id,campaign_id,candidate_id,request_id,identity_keys,title,created_by,created_at)
 SELECT organization_id,campaign_id,id,gen_random_uuid(),to_jsonb(ARRAY['candidate:'||id::text]||CASE WHEN source_type IN('cnpja_advanced_search','cnpja_office_lookup') AND length(regexp_replace(normalized_payload->>'cnpj','\D','','g'))=14 THEN ARRAY['cnpj:'||regexp_replace(normalized_payload->>'cnpj','\D','','g')] ELSE ARRAY[]::text[] END),title,reviewed_by,COALESCE(reviewed_at,updated_at)
 FROM public.radar_candidate_records WHERE status='discarded';
