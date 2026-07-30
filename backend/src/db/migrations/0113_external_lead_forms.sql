-- Public intake for external lead forms.

ALTER TABLE public.landing_page_forms
  ADD COLUMN IF NOT EXISTS public_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allowed_origins TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS public_token_rotated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submission_count INTEGER NOT NULL DEFAULT 0 CHECK (submission_count >= 0),
  ADD COLUMN IF NOT EXISTS last_submission_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_landing_page_forms_public_token_hash
  ON public.landing_page_forms(public_token_hash)
  WHERE public_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.landing_page_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES public.landing_page_forms(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  external_submission_id TEXT,
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('received', 'processed', 'duplicate', 'failed')),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  error_code TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_landing_page_form_submissions_org_created
  ON public.landing_page_form_submissions(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_page_form_submissions_form_created
  ON public.landing_page_form_submissions(form_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_page_form_submissions_lead
  ON public.landing_page_form_submissions(lead_id);

DROP TRIGGER IF EXISTS update_landing_page_form_submissions_updated_at ON public.landing_page_form_submissions;

CREATE TRIGGER update_landing_page_form_submissions_updated_at
  BEFORE UPDATE ON public.landing_page_form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.landing_page_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_form_submissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landing_page_form_submissions_tenant_access ON public.landing_page_form_submissions;

CREATE POLICY landing_page_form_submissions_tenant_access ON public.landing_page_form_submissions
  FOR ALL USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));

GRANT SELECT, INSERT, UPDATE ON public.landing_page_form_submissions TO authenticated, service_role;
