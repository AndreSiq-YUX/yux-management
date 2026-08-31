BEGIN;

CREATE TABLE IF NOT EXISTS public.action_autonomy_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE CASCADE,
  grant_version INTEGER NOT NULL CHECK (grant_version > 0),
  mission_version INTEGER NOT NULL CHECK (mission_version > 0),
  envelope JSONB NOT NULL,
  envelope_hash TEXT NOT NULL CHECK (envelope_hash ~ '^[a-f0-9]{64}$'),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > starts_at),
  UNIQUE (mission_id, grant_version),
  UNIQUE (id, organization_id)
);

CREATE TABLE IF NOT EXISTS public.action_autonomy_grant_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  grant_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('requested','approved','activated','revoked','expired')),
  actor_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  subject_hash TEXT CHECK (subject_hash IS NULL OR subject_hash ~ '^[a-f0-9]{64}$'),
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  FOREIGN KEY (grant_id, organization_id)
    REFERENCES public.action_autonomy_grants(id, organization_id) ON DELETE CASCADE,
  UNIQUE (grant_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_action_autonomy_grants_mission
  ON public.action_autonomy_grants(organization_id, mission_id, grant_version DESC);
CREATE INDEX IF NOT EXISTS idx_action_autonomy_grant_events_grant
  ON public.action_autonomy_grant_events(organization_id, grant_id, occurred_at);

CREATE OR REPLACE FUNCTION private.guard_action_autonomy_grants_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'action_autonomy_grant_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_autonomy_grants_immutable ON public.action_autonomy_grants;
CREATE TRIGGER action_autonomy_grants_immutable BEFORE UPDATE OR DELETE ON public.action_autonomy_grants
  FOR EACH ROW EXECUTE FUNCTION private.guard_action_autonomy_grants_immutable();
DROP TRIGGER IF EXISTS action_autonomy_grant_events_append_only ON public.action_autonomy_grant_events;
CREATE TRIGGER action_autonomy_grant_events_append_only BEFORE UPDATE OR DELETE ON public.action_autonomy_grant_events
  FOR EACH ROW EXECUTE FUNCTION private.guard_action_autonomy_grants_immutable();

ALTER TABLE public.action_autonomy_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_autonomy_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.action_autonomy_grant_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_autonomy_grant_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS action_autonomy_grants_tenant ON public.action_autonomy_grants;
CREATE POLICY action_autonomy_grants_tenant ON public.action_autonomy_grants
  USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));
DROP POLICY IF EXISTS action_autonomy_grant_events_tenant ON public.action_autonomy_grant_events;
CREATE POLICY action_autonomy_grant_events_tenant ON public.action_autonomy_grant_events
  USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));

COMMIT;
