-- Provisional observations retain their original provenance. No provider/model is activated.
CREATE TABLE public.radar_business_observations(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,campaign_id UUID NOT NULL,
 observation_key TEXT NOT NULL CHECK(length(observation_key) BETWEEN 1 AND 240),input_hash TEXT NOT NULL CHECK(input_hash~'^[a-f0-9]{64}$'),
 criteria_revision INTEGER NOT NULL CHECK(criteria_revision>0),mention JSONB NOT NULL CHECK(jsonb_typeof(mention)='object'),
 resolution JSONB NOT NULL CHECK(jsonb_typeof(resolution)='object'),candidate_id UUID,
 state TEXT NOT NULL CHECK(state IN('linked','provisional','ambiguous','outside_profile','unlinked')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(organization_id,campaign_id,observation_key),UNIQUE(id,organization_id,campaign_id),
 FOREIGN KEY(campaign_id,organization_id) REFERENCES public.radar_campaigns(id,organization_id) ON DELETE CASCADE,
 FOREIGN KEY(candidate_id,organization_id,campaign_id) REFERENCES public.radar_candidate_records(id,organization_id,campaign_id) ON DELETE CASCADE
);
CREATE INDEX radar_business_observations_candidate_idx ON public.radar_business_observations(candidate_id);
CREATE TABLE public.radar_business_identity_keys(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,campaign_id UUID NOT NULL,candidate_id UUID NOT NULL,observation_id UUID NOT NULL,
 key_kind TEXT NOT NULL CHECK(key_kind IN('tax_id','external_id','domain_location')),identity_key TEXT NOT NULL CHECK(length(identity_key) BETWEEN 1 AND 1200),
 active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),invalidated_at TIMESTAMPTZ,
 FOREIGN KEY(candidate_id,organization_id,campaign_id) REFERENCES public.radar_candidate_records(id,organization_id,campaign_id) ON DELETE CASCADE,
 FOREIGN KEY(observation_id,organization_id,campaign_id) REFERENCES public.radar_business_observations(id,organization_id,campaign_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX radar_business_identity_active_idx ON public.radar_business_identity_keys(organization_id,campaign_id,key_kind,identity_key) WHERE active;
CREATE INDEX radar_business_identity_candidate_idx ON public.radar_business_identity_keys(candidate_id);
CREATE INDEX radar_business_identity_observation_idx ON public.radar_business_identity_keys(observation_id);
CREATE TABLE public.radar_business_identity_events(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,campaign_id UUID NOT NULL,observation_id UUID NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('create','link','review','exclude','unlink')),previous_candidate_id UUID,candidate_id UUID,actor_id UUID REFERENCES public.users(id),reason TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(observation_id,organization_id,campaign_id) REFERENCES public.radar_business_observations(id,organization_id,campaign_id) ON DELETE CASCADE
);
CREATE INDEX radar_business_identity_events_observation_idx ON public.radar_business_identity_events(observation_id,created_at DESC);
CREATE INDEX radar_business_identity_events_campaign_idx ON public.radar_business_identity_events(organization_id,campaign_id);
CREATE INDEX radar_business_identity_events_actor_idx ON public.radar_business_identity_events(actor_id);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['radar_business_observations','radar_business_identity_keys','radar_business_identity_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,yux_api,yux_worker,yux_runtime',t);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO yux_api,yux_worker',t);
  EXECUTE format('CREATE POLICY business_identity_admin ON public.%I FOR ALL TO yux_api USING(current_setting(''app.current_role'',true)=''yux_admin'') WITH CHECK(current_setting(''app.current_role'',true)=''yux_admin'')',t);
  EXECUTE format('CREATE POLICY business_identity_worker ON public.%I FOR ALL TO yux_worker USING(organization_id=ANY(COALESCE(NULLIF(current_setting(''app.current_orgs'',true),''''),''{}'')::uuid[])) WITH CHECK(organization_id=ANY(COALESCE(NULLIF(current_setting(''app.current_orgs'',true),''''),''{}'')::uuid[]))',t);
  EXECUTE format('CREATE POLICY business_identity_tenant ON public.%I AS RESTRICTIVE FOR ALL USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id))',t);
 END LOOP;
END $$;
GRANT UPDATE ON public.radar_business_observations,public.radar_business_identity_keys TO yux_api,yux_worker;
