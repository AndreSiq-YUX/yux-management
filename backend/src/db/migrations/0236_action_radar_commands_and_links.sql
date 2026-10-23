CREATE TABLE public.action_radar_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  mission_id UUID NOT NULL REFERENCES public.action_missions(id),
  action_run_id UUID NOT NULL REFERENCES public.action_runs(id),
  actor_user_id UUID NOT NULL REFERENCES public.app_users(id),
  command_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  command_hash TEXT NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
  request_id UUID NOT NULL DEFAULT gen_random_uuid(),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(organization_id,idempotency_key)
);
CREATE TABLE public.action_radar_operation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  mission_id UUID NOT NULL REFERENCES public.action_missions(id),
  action_run_id UUID NOT NULL REFERENCES public.action_runs(id),
  operation_type TEXT NOT NULL CHECK(operation_type IN('capture','research')),
  operation_id UUID NOT NULL,
  request_id UUID NOT NULL,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id),
  configuration_revision INTEGER NOT NULL CHECK(configuration_revision>0),
  criteria_revision INTEGER NOT NULL CHECK(criteria_revision>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,action_run_id,operation_type)
);
CREATE INDEX action_radar_links_mission ON public.action_radar_operation_links(organization_id,mission_id);
ALTER TABLE public.action_radar_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_radar_commands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.action_radar_operation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_radar_operation_links FORCE ROW LEVEL SECURITY;
CREATE POLICY action_radar_commands_scope ON public.action_radar_commands FOR ALL
  USING(private.rls_is_internal() AND private.rls_can_access_organization(organization_id))
  WITH CHECK(private.rls_is_internal() AND private.rls_can_access_organization(organization_id));
CREATE POLICY action_radar_links_scope ON public.action_radar_operation_links FOR ALL
  USING(private.rls_is_internal() AND private.rls_can_access_organization(organization_id))
  WITH CHECK(private.rls_is_internal() AND private.rls_can_access_organization(organization_id));
GRANT SELECT,INSERT,UPDATE ON public.action_radar_commands,public.action_radar_operation_links TO yux_worker;
GRANT SELECT ON public.action_radar_operation_links TO yux_api;
