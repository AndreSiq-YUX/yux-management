-- Runtime gets one bounded value, not raw operational policy or cost settings.
CREATE FUNCTION private.radar_fallback_limit() RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE((limits->>'maxFallbackAttemptsPerEffect')::bigint,1) FROM public.radar_operational_limits WHERE singleton=TRUE
$$;
REVOKE ALL ON FUNCTION private.radar_fallback_limit() FROM PUBLIC,yux_api,yux_worker;
GRANT EXECUTE ON FUNCTION private.radar_fallback_limit() TO yux_runtime;
