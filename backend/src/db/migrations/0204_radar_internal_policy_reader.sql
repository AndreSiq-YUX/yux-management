-- Server-only policy enforcement for client-triggered research. The public
-- Admin endpoint still checks global yux_admin; raw table RLS is unchanged.
CREATE FUNCTION private.radar_operational_policy()
RETURNS TABLE(version INTEGER,limits JSONB,cost_policy JSONB,updated_at TIMESTAMPTZ,updated_by UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT policy.version,policy.limits,policy.cost_policy,policy.updated_at,policy.updated_by FROM public.radar_operational_limits policy WHERE policy.singleton=TRUE
$$;
REVOKE ALL ON FUNCTION private.radar_operational_policy() FROM PUBLIC,yux_runtime;
GRANT EXECUTE ON FUNCTION private.radar_operational_policy() TO yux_api,yux_worker;
