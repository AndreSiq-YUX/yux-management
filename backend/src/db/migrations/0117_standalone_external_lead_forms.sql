-- Allow external lead forms to exist independently from a YUX landing page.

ALTER TABLE public.landing_page_forms
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS initial_stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL;

UPDATE public.landing_page_forms form
SET organization_id = page.organization_id,
    contract_id = page.contract_id,
    pipeline_id = COALESCE(form.pipeline_id, page.pipeline_id),
    initial_stage_id = COALESCE(form.initial_stage_id, page.initial_stage_id)
FROM public.landing_pages page
WHERE page.id = form.landing_page_id
  AND (form.organization_id IS NULL OR form.contract_id IS NULL);

ALTER TABLE public.landing_page_forms
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN contract_id SET NOT NULL,
  ALTER COLUMN landing_page_id DROP NOT NULL;

ALTER TABLE public.landing_page_form_submissions
  ALTER COLUMN landing_page_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_landing_page_forms_contract_created
  ON public.landing_page_forms(contract_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_page_forms_organization_created
  ON public.landing_page_forms(organization_id, created_at DESC);

DROP POLICY IF EXISTS "Portal users read external lead forms" ON public.landing_page_forms;
CREATE POLICY "Portal users read external lead forms" ON public.landing_page_forms
  FOR SELECT USING (private.rls_can_access_organization(organization_id));

DROP POLICY IF EXISTS "Portal users read external lead form mappings" ON public.landing_page_field_mappings;
CREATE POLICY "Portal users read external lead form mappings" ON public.landing_page_field_mappings
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.landing_page_forms form
      WHERE form.id = landing_page_field_mappings.form_id
        AND private.rls_can_access_organization(form.organization_id)
    )
  );
