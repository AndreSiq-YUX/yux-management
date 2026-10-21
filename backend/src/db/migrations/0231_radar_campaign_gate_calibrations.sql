-- Register capability only; never activates a model or a paid provider.
INSERT INTO public.llm_use_case_definitions(key,kind,title)
 VALUES('radar_fit_gate','decision','Radar — aderência após identificação') ON CONFLICT(key) DO NOTHING;
ALTER TABLE public.radar_analysis_receipts DROP CONSTRAINT radar_analysis_receipts_action_check;
ALTER TABLE public.radar_analysis_receipts ADD CONSTRAINT radar_analysis_receipts_action_check
 CHECK(action IN('radar_presence_resolution','radar_business_qualification','radar_discovery_extraction','radar_initial_triage','radar_next_action','radar_quality_gate','radar_fit_gate','radar_deep_research'));
ALTER TABLE public.radar_analysis_retry_authorizations DROP CONSTRAINT radar_analysis_retry_authorizations_action_check;
ALTER TABLE public.radar_analysis_retry_authorizations ADD CONSTRAINT radar_analysis_retry_authorizations_action_check
 CHECK(action IN('radar_presence_resolution','radar_business_qualification','radar_initial_triage','radar_next_action','radar_quality_gate','radar_fit_gate','radar_deep_research'));

CREATE TABLE public.radar_funnel_policy_floors(
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
 version BIGINT NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 configuration JSONB NOT NULL CHECK(jsonb_typeof(configuration)='object'),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.radar_funnel_policy_floors(singleton,configuration) VALUES(TRUE,
 '{"minPositiveSamples":20,"minNegativeSamples":10,"minHoldoutPositives":8,"minHoldoutNegatives":5,"minThreshold":0.75,"minBlockPrecision":0.95,"maxFalseBlocksOnPositives":0}'::jsonb);
ALTER TABLE public.radar_funnel_policy_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_funnel_policy_floors FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_funnel_policy_floors FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,UPDATE ON public.radar_funnel_policy_floors TO yux_api;
GRANT SELECT ON public.radar_funnel_policy_floors TO yux_worker;
CREATE POLICY radar_funnel_floors_admin ON public.radar_funnel_policy_floors FOR ALL TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin') WITH CHECK(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_funnel_floors_worker ON public.radar_funnel_policy_floors FOR SELECT TO yux_worker
 USING(current_setting('app.service_role',true)='worker');

CREATE TABLE public.radar_campaign_gate_calibrations(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL,
 campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
 configuration_revision INTEGER NOT NULL CHECK(configuration_revision>0),
 gate TEXT NOT NULL CHECK(gate IN('g1','g5')),
 binding JSONB NOT NULL CHECK(jsonb_typeof(binding)='object'),
 dataset JSONB NOT NULL CHECK(jsonb_typeof(dataset)='array'),
 criteria JSONB NOT NULL CHECK(jsonb_typeof(criteria)='object'),
 seed UUID NOT NULL, dataset_hash TEXT NOT NULL,
 metrics JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metrics)='object'),
 threshold NUMERIC CHECK(threshold BETWEEN 0 AND 1),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','superseded','auto_shadowed')),
 created_by UUID NOT NULL REFERENCES public.app_users(id), approved_by UUID REFERENCES public.app_users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), approved_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(id,organization_id,campaign_id),
 CHECK(status<>'approved' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL AND threshold IS NOT NULL))
);
CREATE INDEX radar_campaign_gate_calibrations_scope ON public.radar_campaign_gate_calibrations(organization_id,campaign_id,gate,created_at DESC);
ALTER TABLE public.radar_campaign_gate_calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_campaign_gate_calibrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_campaign_gate_calibrations FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT,UPDATE ON public.radar_campaign_gate_calibrations TO yux_api;
GRANT SELECT ON public.radar_campaign_gate_calibrations TO yux_worker;
GRANT UPDATE(status,updated_at) ON public.radar_campaign_gate_calibrations TO yux_worker;
CREATE POLICY radar_campaign_calibration_admin ON public.radar_campaign_gate_calibrations FOR ALL TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin') WITH CHECK(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_campaign_calibration_worker ON public.radar_campaign_gate_calibrations FOR ALL TO yux_worker
 USING(current_setting('app.service_role',true)='worker') WITH CHECK(current_setting('app.service_role',true)='worker');
CREATE POLICY radar_campaign_calibration_tenant ON public.radar_campaign_gate_calibrations AS RESTRICTIVE FOR ALL
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));

CREATE TABLE public.radar_gate_evaluation_cases(
 calibration_id UUID NOT NULL, organization_id UUID NOT NULL, campaign_id UUID NOT NULL,
 candidate_id UUID NOT NULL, request_id TEXT NOT NULL,
 context JSONB NOT NULL CHECK(jsonb_typeof(context)='object'),
 route JSONB NOT NULL CHECK(jsonb_typeof(route)='object'),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','submitting','completed','uncertain','rejected_before_provider')),
 result JSONB, error_code TEXT, lease_id UUID, lease_until TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(calibration_id,candidate_id), UNIQUE(organization_id,request_id),
 FOREIGN KEY(calibration_id,organization_id,campaign_id) REFERENCES public.radar_campaign_gate_calibrations(id,organization_id,campaign_id) ON DELETE CASCADE,
 FOREIGN KEY(candidate_id,organization_id,campaign_id) REFERENCES public.radar_candidate_records(id,organization_id,campaign_id)
);
ALTER TABLE public.radar_gate_evaluation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_gate_evaluation_cases FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_gate_evaluation_cases FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT,UPDATE ON public.radar_gate_evaluation_cases TO yux_api;
CREATE POLICY radar_gate_evaluation_admin ON public.radar_gate_evaluation_cases FOR ALL TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin') WITH CHECK(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_gate_evaluation_tenant ON public.radar_gate_evaluation_cases AS RESTRICTIVE FOR ALL
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
