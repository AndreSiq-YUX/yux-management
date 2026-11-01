ALTER TABLE public.lead_scoring_models ADD COLUMN calculation_mode TEXT NOT NULL DEFAULT 'weighted' CHECK (calculation_mode IN ('weighted','sum')),
  ADD COLUMN warm_threshold INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN hot_threshold INTEGER NOT NULL DEFAULT 70,
  ADD CONSTRAINT scoring_temperature_order CHECK (warm_threshold >= 0 AND warm_threshold < hot_threshold AND hot_threshold <= 100);

CREATE TABLE public.crm_qualification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id),
  model_id UUID NOT NULL REFERENCES public.lead_scoring_models(id),
  name TEXT NOT NULL,
  definition JSONB NOT NULL CHECK(jsonb_typeof(definition)='object'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX crm_qualification_model ON public.crm_qualification_rules(model_id) WHERE is_active;
CREATE TABLE public.crm_score_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  lead_id UUID NOT NULL REFERENCES public.leads(id),
  rule_id UUID NOT NULL REFERENCES public.crm_qualification_rules(id),
  source_key TEXT NOT NULL,
  points INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lead_id,rule_id,source_key)
);
CREATE INDEX crm_score_contributions_lead ON public.crm_score_contributions(lead_id);
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['crm_qualification_rules','crm_score_contributions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO yux_api,yux_worker',t);
    EXECUTE format('CREATE POLICY qualification_scope ON public.%I FOR ALL TO yux_api,yux_worker USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id))',t);
  END LOOP;
END $$;
