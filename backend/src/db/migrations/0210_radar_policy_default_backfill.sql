-- Persist newly introduced defaults so the API and the runtime compare the
-- same policy. A migration is not a human approval and never resets usage.
ALTER TABLE public.radar_operational_limit_audit
 ADD COLUMN change_origin TEXT NOT NULL DEFAULT 'admin'
 CHECK(change_origin IN ('admin','migration'));
ALTER TABLE public.radar_operational_limit_audit ALTER COLUMN updated_by DROP NOT NULL;
ALTER TABLE public.radar_operational_limit_audit ADD CONSTRAINT radar_limit_audit_actor
 CHECK((change_origin='admin' AND updated_by IS NOT NULL) OR (change_origin='migration' AND updated_by IS NULL));
DROP POLICY radar_limits_audit_admin ON public.radar_operational_limit_audit;
CREATE POLICY radar_limits_audit_admin_read ON public.radar_operational_limit_audit FOR SELECT TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_limits_audit_admin_insert ON public.radar_operational_limit_audit FOR INSERT TO yux_api
 WITH CHECK(current_setting('app.current_role',true)='yux_admin' AND change_origin='admin' AND updated_by IS NOT NULL);

-- Migration-owner utility, not a service endpoint or an elevated API function.
CREATE FUNCTION private.backfill_radar_operational_defaults(defaults JSONB) RETURNS VOID
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE current_policy public.radar_operational_limits%ROWTYPE; merged JSONB;
BEGIN
 IF jsonb_typeof(defaults) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'radar_defaults_invalid'; END IF;
 SELECT * INTO STRICT current_policy FROM public.radar_operational_limits WHERE singleton=TRUE FOR UPDATE;
 merged := defaults || current_policy.limits;
 IF merged=current_policy.limits THEN RETURN; END IF;
 INSERT INTO public.radar_operational_limit_audit(policy_version,old_limits,new_limits,updated_by,change_origin,old_cost_policy,new_cost_policy)
 VALUES(current_policy.version+1,current_policy.limits,merged,NULL,'migration',current_policy.cost_policy,current_policy.cost_policy);
 UPDATE public.radar_operational_limits SET version=version+1,limits=merged,updated_by=NULL,updated_at=NOW() WHERE singleton=TRUE;
END;
$$;
REVOKE ALL ON FUNCTION private.backfill_radar_operational_defaults(JSONB) FROM PUBLIC,yux_api,yux_worker,yux_runtime;
SELECT private.backfill_radar_operational_defaults('{"maxDecisionCallsPerCompany":3,"maxDeepSearchesPerCompany":1,"maxFallbackAttemptsPerEffect":1}'::jsonb);
