CREATE TABLE public.radar_decision_calibrations(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),route_id UUID NOT NULL REFERENCES public.model_routing_rules(id),
 route_fingerprint TEXT NOT NULL CHECK(route_fingerprint~'^[a-f0-9]{64}$'),
 calibration JSONB NOT NULL CHECK(jsonb_typeof(calibration)='object'),
 approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),approved_by UUID NOT NULL REFERENCES public.app_users(id)
);
CREATE INDEX radar_decision_calibration_route ON public.radar_decision_calibrations(route_id,route_fingerprint);
ALTER TABLE public.radar_decision_calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_decision_calibrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_decision_calibrations FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT ON public.radar_decision_calibrations TO yux_api;
GRANT SELECT ON public.radar_decision_calibrations TO yux_worker,yux_runtime;
CREATE POLICY radar_decision_calibration_admin ON public.radar_decision_calibrations FOR ALL TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin') WITH CHECK(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_decision_calibration_worker ON public.radar_decision_calibrations FOR SELECT TO yux_worker USING(current_setting('app.service_role',true)='worker');
CREATE POLICY radar_decision_calibration_runtime ON public.radar_decision_calibrations FOR SELECT TO yux_runtime USING(current_setting('app.service_role',true)='runtime');
