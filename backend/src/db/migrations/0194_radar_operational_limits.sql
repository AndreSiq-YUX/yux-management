CREATE TABLE public.radar_operational_limits (
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 limits JSONB NOT NULL CHECK(jsonb_typeof(limits)='object'),updated_by UUID REFERENCES public.users(id),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.radar_operational_limits(limits) VALUES('{"maxNewCompaniesPerLot":1000,"maxPagesPerScope":10,"maxDiscoveryQueriesPerLot":100,"maxDiscoveryPageSize":10,"maxVerificationBatch":25,"maxSearchQueriesPerCompany":5,"maxPublicPagesPerCompany":10,"maxCampaignDailyQueries":1000,"maxSourceDailyQueries":1000,"maxResearchFreshnessDays":30,"maxContinuationIdleMinutes":60}');
CREATE TABLE public.radar_operational_limit_audit (
 policy_version INTEGER PRIMARY KEY,old_limits JSONB NOT NULL,new_limits JSONB NOT NULL,
 updated_by UUID NOT NULL REFERENCES public.users(id),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.radar_operational_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_operational_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.radar_operational_limit_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_operational_limit_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_operational_limits,public.radar_operational_limit_audit FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,UPDATE ON public.radar_operational_limits TO yux_api;
GRANT SELECT,INSERT ON public.radar_operational_limit_audit TO yux_api;
GRANT SELECT ON public.radar_operational_limits TO yux_worker;
CREATE POLICY radar_limits_admin ON public.radar_operational_limits FOR ALL TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin') WITH CHECK(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_limits_worker ON public.radar_operational_limits FOR SELECT TO yux_worker USING(current_setting('app.service_role',true)='worker');
CREATE POLICY radar_limits_audit_admin ON public.radar_operational_limit_audit FOR ALL TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin') WITH CHECK(current_setting('app.current_role',true)='yux_admin');
-- Business quotas are now validated against the audited policy. Preserve int4's
-- physical boundary and positivity, not the previous hard-coded 1000 quota.
ALTER TABLE public.radar_capture_operations DROP CONSTRAINT radar_capture_operations_requested_count_check;
ALTER TABLE public.radar_capture_operations ADD CONSTRAINT radar_capture_operations_requested_count_check CHECK(requested_count>0);
ALTER TABLE public.radar_capture_requests DROP CONSTRAINT radar_capture_requests_requested_count_check;
ALTER TABLE public.radar_capture_requests ADD CONSTRAINT radar_capture_requests_requested_count_check CHECK(requested_count>0);
-- Existing releases only requested pages of at most ten records. Continuations
-- inherit that size, even when the next lot requests fewer new companies.
ALTER TABLE public.radar_regional_discovery_cursors ADD COLUMN page_size INTEGER NOT NULL DEFAULT 10 CHECK(page_size>0);
