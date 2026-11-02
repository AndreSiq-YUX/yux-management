CREATE TABLE public.crm_lead_reconciliations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  lead_id UUID NOT NULL REFERENCES public.leads(id),
  actor_id UUID NOT NULL REFERENCES public.users(id),
  applied_fields TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_lead_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_reconciliations FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON public.crm_lead_reconciliations TO yux_api;
CREATE POLICY reconciliation_scope ON public.crm_lead_reconciliations TO yux_api
  USING(private.rls_can_access_organization(organization_id))
  WITH CHECK(private.rls_can_access_organization(organization_id));
