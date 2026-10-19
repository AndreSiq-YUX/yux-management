ALTER TABLE public.radar_capture_operations
 ADD COLUMN analysis_refresh_authorizations JSONB NOT NULL DEFAULT '[]'::jsonb,
 ADD CONSTRAINT radar_capture_analysis_authorizations_array CHECK(jsonb_typeof(analysis_refresh_authorizations)='array');

COMMENT ON COLUMN public.radar_capture_operations.analysis_refresh_authorizations IS
 'Append-only Admin approvals scoped to a resume request, criteria revision and existing candidate IDs. Does not authorize uncertain-call replay, discovery, higher budgets or TLS exceptions.';
