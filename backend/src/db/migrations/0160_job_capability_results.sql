-- Persist source time for provider metrics and keep synthetic channel events in
-- a dedicated sandbox ledger that cannot become a real customer conversation.

ALTER TABLE public.campaign_metric_snapshots
  ADD COLUMN IF NOT EXISTS source_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.omnichannel_simulation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('webchat','whatsapp','instagram','messenger')),
  event_type TEXT NOT NULL CHECK (BTRIM(event_type) <> ''),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_omnichannel_simulation_events_org_created
  ON public.omnichannel_simulation_events(organization_id, created_at DESC);

ALTER TABLE public.omnichannel_simulation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_simulation_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS omnichannel_simulation_events_internal
  ON public.omnichannel_simulation_events;
CREATE POLICY omnichannel_simulation_events_internal
  ON public.omnichannel_simulation_events
  FOR ALL
  TO yux_api,yux_worker
  USING (
    private.rls_is_internal()
    AND private.rls_can_access_organization(organization_id)
  )
  WITH CHECK (
    private.rls_is_internal()
    AND private.rls_can_access_organization(organization_id)
  );

GRANT SELECT,INSERT,UPDATE,DELETE ON public.omnichannel_simulation_events TO yux_api,yux_worker;
