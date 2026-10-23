-- Service execution stays scoped even when the orchestrator reads global pack metadata.
CREATE POLICY action_radar_commands_worker ON public.action_radar_commands FOR ALL TO yux_worker
 USING(current_setting('app.service_role',true)='worker' AND organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]))
 WITH CHECK(current_setting('app.service_role',true)='worker' AND organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]));
CREATE POLICY action_radar_commands_worker_scope ON public.action_radar_commands AS RESTRICTIVE FOR ALL TO yux_worker
 USING(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]))
 WITH CHECK(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]));
CREATE POLICY action_radar_links_worker ON public.action_radar_operation_links FOR ALL TO yux_worker
 USING(current_setting('app.service_role',true)='worker' AND organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]))
 WITH CHECK(current_setting('app.service_role',true)='worker' AND organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]));
CREATE POLICY action_radar_links_worker_scope ON public.action_radar_operation_links AS RESTRICTIVE FOR ALL TO yux_worker
 USING(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]))
 WITH CHECK(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]));
GRANT SELECT,INSERT ON public.radar_capture_requests TO yux_worker;
CREATE POLICY capture_request_worker ON public.radar_capture_requests FOR ALL TO yux_worker
 USING(current_setting('app.service_role',true)='worker' AND private.rls_can_access_organization(organization_id))
 WITH CHECK(current_setting('app.service_role',true)='worker' AND private.rls_can_access_organization(organization_id));
CREATE POLICY capture_request_worker_scope ON public.radar_capture_requests AS RESTRICTIVE FOR ALL TO yux_worker
 USING(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]))
 WITH CHECK(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]));

-- SELECT FOR SHARE requires UPDATE privilege. Give acceptance the shared lock
-- without granting workers any right to change the global operational policy.
CREATE FUNCTION private.lock_radar_operational_limits() RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 BEGIN
   PERFORM version FROM public.radar_operational_limits WHERE singleton=TRUE FOR SHARE;
 END $$;
REVOKE ALL ON FUNCTION private.lock_radar_operational_limits() FROM PUBLIC,yux_runtime;
GRANT EXECUTE ON FUNCTION private.lock_radar_operational_limits() TO yux_api,yux_worker;
