ALTER TABLE public.radar_candidate_records ADD COLUMN crm_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;
CREATE INDEX radar_candidate_crm_link_idx ON public.radar_candidate_records(organization_id,crm_lead_id) WHERE crm_lead_id IS NOT NULL;
CREATE INDEX radar_lead_company_identity_idx ON public.leads(organization_id,crm_instance_id,(attribution_context->>'radarCnpj'))
  WHERE attribution_context->>'radarCnpj' IS NOT NULL;
