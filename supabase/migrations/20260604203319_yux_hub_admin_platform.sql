-- YUX Hub admin platform data foundation.

DO $$
BEGIN
  CREATE TYPE public.platform_provider_type AS ENUM (
    'llm',
    'email',
    'whatsapp',
    'ads',
    'webhook',
    'automation',
    'storage',
    'database',
    'internal_service'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.platform_provider_status AS ENUM (
    'not_configured',
    'active',
    'degraded',
    'failed',
    'disabled',
    'needs_reauth',
    'stale'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.client_module_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  limit_key TEXT NOT NULL,
  limit_value NUMERIC NOT NULL CHECK (limit_value >= 0),
  source TEXT NOT NULL DEFAULT 'contract' CHECK (source IN ('package', 'contract', 'manual_override')),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, contract_id, module_key, limit_key),
  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE TABLE IF NOT EXISTS public.platform_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type public.platform_provider_type NOT NULL,
  provider_key TEXT NOT NULL CHECK (BTRIM(provider_key) <> ''),
  display_name TEXT NOT NULL CHECK (BTRIM(display_name) <> ''),
  environment TEXT NOT NULL DEFAULT 'production' CHECK (BTRIM(environment) <> ''),
  status public.platform_provider_status NOT NULL DEFAULT 'not_configured',
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_config) = 'object'),
  secret_reference TEXT,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  fallback_provider_id UUID REFERENCES public.platform_provider_connections(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_type, provider_key, environment),
  CHECK (fallback_provider_id IS NULL OR fallback_provider_id <> id)
);

CREATE TABLE IF NOT EXISTS public.client_provider_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_connection_id UUID NOT NULL REFERENCES public.platform_provider_connections(id) ON DELETE CASCADE,
  module_key TEXT,
  status public.platform_provider_status NOT NULL DEFAULT 'not_configured',
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_config) = 'object'),
  secret_reference TEXT,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object'),
  inherits_global BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider_connection_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.platform_usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  used_value NUMERIC NOT NULL DEFAULT 0 CHECK (used_value >= 0),
  limit_value NUMERIC CHECK (limit_value IS NULL OR limit_value >= 0),
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'near_limit', 'over_limit', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, contract_id, module_key, resource_key, period_start, period_end),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.platform_admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  safe_before JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_before) = 'object'),
  safe_after JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_after) = 'object'),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_module_limits_org_module
  ON public.client_module_limits(organization_id, module_key);
CREATE INDEX IF NOT EXISTS idx_client_module_limits_contract
  ON public.client_module_limits(contract_id) WHERE contract_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_module_limits_without_contract
  ON public.client_module_limits(organization_id, module_key, limit_key)
  WHERE contract_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_client_module_limits_effective
  ON public.client_module_limits(effective_from, effective_until);
CREATE INDEX IF NOT EXISTS idx_provider_connections_type_status
  ON public.platform_provider_connections(provider_type, status);
CREATE INDEX IF NOT EXISTS idx_provider_connections_default
  ON public.platform_provider_connections(provider_type, environment) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_client_provider_settings_org
  ON public.client_provider_settings(organization_id, module_key);
CREATE INDEX IF NOT EXISTS idx_client_provider_settings_provider
  ON public.client_provider_settings(provider_connection_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_provider_settings_global_module
  ON public.client_provider_settings(organization_id, provider_connection_id)
  WHERE module_key IS NULL;
CREATE INDEX IF NOT EXISTS idx_platform_usage_counters_org_period
  ON public.platform_usage_counters(organization_id, period_start DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_usage_counters_without_contract
  ON public.platform_usage_counters(organization_id, module_key, resource_key, period_start, period_end)
  WHERE contract_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_platform_usage_counters_status
  ON public.platform_usage_counters(status, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_events_created
  ON public.platform_admin_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_events_org
  ON public.platform_admin_audit_events(organization_id, created_at DESC) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_events_entity
  ON public.platform_admin_audit_events(entity_type, entity_id) WHERE entity_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_client_module_limits_updated_at ON public.client_module_limits;
CREATE TRIGGER update_client_module_limits_updated_at
  BEFORE UPDATE ON public.client_module_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_provider_connections_updated_at ON public.platform_provider_connections;
CREATE TRIGGER update_platform_provider_connections_updated_at
  BEFORE UPDATE ON public.platform_provider_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_provider_settings_updated_at ON public.client_provider_settings;
CREATE TRIGGER update_client_provider_settings_updated_at
  BEFORE UPDATE ON public.client_provider_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_usage_counters_updated_at ON public.platform_usage_counters;
CREATE TRIGGER update_platform_usage_counters_updated_at
  BEFORE UPDATE ON public.platform_usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.client_module_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins manage client module limits" ON public.client_module_limits;
CREATE POLICY "Platform admins manage client module limits" ON public.client_module_limits
  FOR ALL TO authenticated USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins manage provider connections" ON public.platform_provider_connections;
CREATE POLICY "Platform admins manage provider connections" ON public.platform_provider_connections
  FOR ALL TO authenticated USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins manage client provider settings" ON public.client_provider_settings;
CREATE POLICY "Platform admins manage client provider settings" ON public.client_provider_settings
  FOR ALL TO authenticated USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins manage usage counters" ON public.platform_usage_counters;
CREATE POLICY "Platform admins manage usage counters" ON public.platform_usage_counters
  FOR ALL TO authenticated USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins read audit events" ON public.platform_admin_audit_events;
CREATE POLICY "Platform admins read audit events" ON public.platform_admin_audit_events
  FOR SELECT TO authenticated USING (private.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins insert audit events" ON public.platform_admin_audit_events;
CREATE POLICY "Platform admins insert audit events" ON public.platform_admin_audit_events
  FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin());

REVOKE ALL ON public.client_module_limits FROM anon;
REVOKE ALL ON public.platform_provider_connections FROM anon;
REVOKE ALL ON public.client_provider_settings FROM anon;
REVOKE ALL ON public.platform_usage_counters FROM anon;
REVOKE ALL ON public.platform_admin_audit_events FROM anon;
REVOKE USAGE ON TYPE public.platform_provider_type FROM anon;
REVOKE USAGE ON TYPE public.platform_provider_status FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_module_limits TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_provider_connections TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_provider_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_usage_counters TO authenticated, service_role;
GRANT SELECT, INSERT ON public.platform_admin_audit_events TO authenticated, service_role;
GRANT USAGE ON TYPE public.platform_provider_type TO authenticated, service_role;
GRANT USAGE ON TYPE public.platform_provider_status TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
