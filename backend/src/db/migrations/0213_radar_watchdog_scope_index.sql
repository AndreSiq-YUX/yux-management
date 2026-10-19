-- Metadata-only tenant index, like the existing dispatch outbox. Avoid relying
-- on a SECURITY DEFINER owner's ability to bypass FORCE RLS on tenant payloads.
DROP FUNCTION private.radar_watchdog_scopes();
CREATE TABLE public.radar_research_watchdog_scopes (
 organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE
);
INSERT INTO public.radar_research_watchdog_scopes(organization_id)
 SELECT organization_id FROM public.radar_capture_operations
 UNION SELECT organization_id FROM public.radar_research_requests;
ALTER TABLE public.radar_research_watchdog_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_research_watchdog_scopes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_research_watchdog_scopes FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT INSERT ON public.radar_research_watchdog_scopes TO yux_api,yux_worker;
GRANT SELECT ON public.radar_research_watchdog_scopes TO yux_worker;
CREATE POLICY radar_watchdog_scope_read ON public.radar_research_watchdog_scopes FOR SELECT TO yux_worker
 USING(current_setting('app.service_role',true)='worker');
CREATE POLICY radar_watchdog_scope_insert ON public.radar_research_watchdog_scopes FOR INSERT TO yux_api,yux_worker
 WITH CHECK(private.rls_can_access_organization(organization_id));
CREATE POLICY radar_watchdog_scope_worker_insert ON public.radar_research_watchdog_scopes AS RESTRICTIVE FOR INSERT TO yux_worker
 WITH CHECK(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]));
CREATE FUNCTION private.radar_record_watchdog_scope() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.radar_research_watchdog_scopes(organization_id) VALUES(NEW.organization_id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END;
$$;
CREATE TRIGGER radar_capture_watchdog_scope AFTER INSERT ON public.radar_capture_operations FOR EACH ROW EXECUTE FUNCTION private.radar_record_watchdog_scope();
CREATE TRIGGER radar_request_watchdog_scope AFTER INSERT ON public.radar_research_requests FOR EACH ROW EXECUTE FUNCTION private.radar_record_watchdog_scope();
REVOKE ALL ON FUNCTION private.radar_record_watchdog_scope() FROM PUBLIC,yux_api,yux_worker,yux_runtime;
