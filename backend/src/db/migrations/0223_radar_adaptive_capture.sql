-- Existing lots retain v1 membership and counting. Nothing activates v2 here.
ALTER TABLE public.radar_capture_operations ADD COLUMN pipeline_version INTEGER NOT NULL DEFAULT 1 CHECK(pipeline_version IN(1,2)),
 ADD COLUMN counting_mode TEXT NOT NULL DEFAULT 'admitted' CHECK(counting_mode IN('admitted','qualified')),
 ADD COLUMN discovery_plan JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(discovery_plan)='object');
ALTER TABLE public.radar_capture_operations ADD CONSTRAINT radar_capture_pipeline_counting_check CHECK((pipeline_version=1 AND counting_mode='admitted') OR(pipeline_version=2 AND counting_mode='qualified'));
ALTER TABLE public.radar_capture_items ADD COLUMN is_new BOOLEAN NOT NULL DEFAULT TRUE;
CREATE TABLE public.radar_discovery_policy(singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),version BIGINT NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),configuration JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(configuration)='object'),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO public.radar_discovery_policy(singleton) VALUES(TRUE);
ALTER TABLE public.radar_discovery_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_discovery_policy FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_discovery_policy FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,UPDATE ON public.radar_discovery_policy TO yux_api;
GRANT SELECT ON public.radar_discovery_policy TO yux_worker;
CREATE POLICY radar_discovery_policy_admin ON public.radar_discovery_policy FOR ALL TO yux_api USING(current_setting('app.current_role',true)='yux_admin') WITH CHECK(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_discovery_policy_worker ON public.radar_discovery_policy FOR SELECT TO yux_worker USING(current_setting('app.service_role',true)='worker');
CREATE TABLE public.radar_discovery_pages(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,campaign_id UUID NOT NULL,operation_id UUID NOT NULL REFERENCES public.radar_capture_operations(id) ON DELETE CASCADE,
 scope_key TEXT NOT NULL,source TEXT NOT NULL,page_number INTEGER NOT NULL CHECK(page_number>0),
 status TEXT NOT NULL CHECK(status IN('reserved','received','admitted','uncertain','rejected')),
 input JSONB NOT NULL CHECK(jsonb_typeof(input)='object'),response_body JSONB,normalized_page JSONB,
 continuation JSONB,exhaustion TEXT NOT NULL DEFAULT 'unknown' CHECK(exhaustion IN('more','exhausted','unknown')),
 extraction JSONB NOT NULL DEFAULT '{}',error_code TEXT,cost_estimate_brl NUMERIC NOT NULL DEFAULT 0 CHECK(cost_estimate_brl>=0),
 lease_id UUID,lease_until TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(operation_id,scope_key,page_number),
 FOREIGN KEY(campaign_id,organization_id) REFERENCES public.radar_campaigns(id,organization_id) ON DELETE CASCADE
);
CREATE INDEX radar_discovery_pages_operation_idx ON public.radar_discovery_pages(organization_id,operation_id,status);
CREATE INDEX radar_discovery_pages_campaign_idx ON public.radar_discovery_pages(campaign_id);
ALTER TABLE public.radar_discovery_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_discovery_pages FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_discovery_pages FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT,UPDATE ON public.radar_discovery_pages TO yux_api,yux_worker;
CREATE POLICY radar_discovery_pages_admin ON public.radar_discovery_pages FOR ALL TO yux_api USING(current_setting('app.current_role',true)='yux_admin') WITH CHECK(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_discovery_pages_worker ON public.radar_discovery_pages FOR ALL TO yux_worker USING(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[])) WITH CHECK(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]));
CREATE POLICY radar_discovery_pages_tenant ON public.radar_discovery_pages AS RESTRICTIVE FOR ALL USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
