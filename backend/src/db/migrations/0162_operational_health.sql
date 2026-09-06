CREATE TABLE IF NOT EXISTS public.worker_process_heartbeats (
  instance_id UUID PRIMARY KEY,
  queue_classes TEXT[] NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object')
);

CREATE INDEX IF NOT EXISTS idx_worker_process_heartbeats_seen
  ON public.worker_process_heartbeats(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.provider_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  provider_key TEXT NOT NULL,
  model TEXT,
  correlation_id TEXT NOT NULL,
  reported_usage JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reported_usage)='object'),
  cost_brl NUMERIC(14,6),
  measurement_status TEXT NOT NULL CHECK (measurement_status IN ('measured','estimated','unavailable')),
  measurement_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_usage_events_provider_created
  ON public.provider_usage_events(provider_key,created_at DESC);

ALTER TABLE public.worker_process_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_process_heartbeats FORCE ROW LEVEL SECURITY;
ALTER TABLE public.provider_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_usage_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_heartbeats_worker_write ON public.worker_process_heartbeats;
CREATE POLICY worker_heartbeats_worker_write ON public.worker_process_heartbeats
  FOR ALL USING (COALESCE(current_setting('app.service_role',TRUE),'')='worker')
  WITH CHECK (COALESCE(current_setting('app.service_role',TRUE),'')='worker');
DROP POLICY IF EXISTS worker_heartbeats_internal_read ON public.worker_process_heartbeats;
CREATE POLICY worker_heartbeats_internal_read ON public.worker_process_heartbeats
  FOR SELECT USING (private.rls_is_internal());

DROP POLICY IF EXISTS provider_usage_service_write ON public.provider_usage_events;
CREATE POLICY provider_usage_service_write ON public.provider_usage_events
  FOR INSERT WITH CHECK (COALESCE(current_setting('app.service_role',TRUE),'') IN ('worker','runtime'));
DROP POLICY IF EXISTS provider_usage_internal_read ON public.provider_usage_events;
CREATE POLICY provider_usage_internal_read ON public.provider_usage_events
  FOR SELECT USING (private.rls_is_internal());

GRANT SELECT ON public.worker_process_heartbeats, public.provider_usage_events TO yux_api;
GRANT SELECT,INSERT,UPDATE ON public.worker_process_heartbeats TO yux_worker;
GRANT INSERT ON public.provider_usage_events TO yux_worker, yux_runtime;

GRANT SELECT ON public.platform_provider_connections, public.platform_provider_secrets TO yux_worker;
DROP POLICY IF EXISTS platform_provider_connections_worker_read ON public.platform_provider_connections;
CREATE POLICY platform_provider_connections_worker_read ON public.platform_provider_connections
  FOR SELECT USING (COALESCE(current_setting('app.service_role',TRUE),'')='worker');
DROP POLICY IF EXISTS platform_provider_secrets_worker_read ON public.platform_provider_secrets;
CREATE POLICY platform_provider_secrets_worker_read ON public.platform_provider_secrets
  FOR SELECT USING (COALESCE(current_setting('app.service_role',TRUE),'')='worker');
