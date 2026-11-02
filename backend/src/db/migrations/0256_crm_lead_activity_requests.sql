CREATE TABLE public.crm_lead_activity_requests (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  lead_id UUID NOT NULL REFERENCES public.leads(id),
  payload_hash TEXT NOT NULL,
  result JSONB NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_lead_activity_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_activity_requests FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON public.crm_lead_activity_requests TO yux_api;
CREATE POLICY lead_activity_request_scope ON public.crm_lead_activity_requests TO yux_api
  USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
