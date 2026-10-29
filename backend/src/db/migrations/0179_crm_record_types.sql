-- Types belong to one contracted CRM; legacy leads and definitions remain valid.
CREATE TABLE public.crm_record_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, id)
);
CREATE UNIQUE INDEX crm_record_types_active_name
  ON public.crm_record_types (crm_instance_id, lower(btrim(name))) WHERE is_active;
CREATE INDEX crm_record_types_org ON public.crm_record_types (organization_id);

ALTER TABLE public.crm_custom_field_definitions
  ADD COLUMN record_type_id UUID,
  ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT crm_custom_field_record_type_scope
    FOREIGN KEY (crm_instance_id, record_type_id)
    REFERENCES public.crm_record_types(crm_instance_id, id);
CREATE INDEX crm_custom_field_record_type ON public.crm_custom_field_definitions(record_type_id);

ALTER TABLE public.leads
  ADD COLUMN record_type_id UUID,
  ADD CONSTRAINT lead_record_type_scope
    FOREIGN KEY (crm_instance_id, record_type_id)
    REFERENCES public.crm_record_types(crm_instance_id, id);
CREATE INDEX leads_record_type ON public.leads(record_type_id) WHERE record_type_id IS NOT NULL;

ALTER TABLE public.crm_record_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_record_types FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_record_types TO yux_api;
CREATE POLICY crm_record_types_api_access ON public.crm_record_types
  FOR ALL TO yux_api
  USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));
