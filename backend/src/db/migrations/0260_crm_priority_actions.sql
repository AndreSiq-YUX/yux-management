ALTER TABLE public.crm_priority_configs
  ADD CONSTRAINT crm_priority_effects_require_activation
  CHECK (NOT effects_enabled OR active_activation_id IS NOT NULL);

GRANT UPDATE(effects_enabled) ON public.crm_priority_configs TO yux_api;
GRANT SELECT(effects_enabled) ON public.crm_priority_configs TO yux_worker;

CREATE TABLE public.crm_priority_task_effects (
  transition_id UUID PRIMARY KEY REFERENCES public.crm_priority_transitions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  crm_instance_id UUID NOT NULL,
  task_id UUID REFERENCES public.lead_tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (crm_instance_id,organization_id)
    REFERENCES public.crm_priority_configs(crm_instance_id,organization_id) ON DELETE CASCADE
);

CREATE INDEX crm_priority_task_effect_scope ON public.crm_priority_task_effects(crm_instance_id,organization_id);
CREATE INDEX crm_priority_task_effect_task ON public.crm_priority_task_effects(task_id) WHERE task_id IS NOT NULL;

ALTER TABLE public.crm_priority_task_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_priority_task_effects FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_priority_task_effects FROM PUBLIC,yux_api,yux_worker;
GRANT SELECT,INSERT ON public.crm_priority_task_effects TO yux_worker;
CREATE POLICY priority_task_effect_scope ON public.crm_priority_task_effects TO yux_worker
  USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));
