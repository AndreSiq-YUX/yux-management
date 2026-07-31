-- Structured lead identity, consent evidence and immutable form-submission snapshots.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS normalized_email TEXT GENERATED ALWAYS AS (LOWER(BTRIM(email))) STORED,
  ADD COLUMN IF NOT EXISTS contact_identifier UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS profile TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS fit_score SMALLINT,
  ADD COLUMN IF NOT EXISTS intent_score SMALLINT,
  ADD COLUMN IF NOT EXISTS crm_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_fit_score_range_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_fit_score_range_check
  CHECK (fit_score IS NULL OR fit_score BETWEEN 0 AND 100);

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_intent_score_range_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_intent_score_range_check
  CHECK (intent_score IS NULL OR intent_score BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS idx_leads_organization_normalized_email
  ON public.leads(organization_id, normalized_email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_organization_contact_identifier
  ON public.leads(organization_id, contact_identifier);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_organization_crm_contact_id
  ON public.leads(organization_id, crm_contact_id)
  WHERE crm_contact_id IS NOT NULL AND BTRIM(crm_contact_id) <> '';

ALTER TABLE public.landing_page_form_submissions
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS page_url TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS request_origin TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS consent_code TEXT,
  ADD COLUMN IF NOT EXISTS consent_version TEXT,
  ADD COLUMN IF NOT EXISTS privacy_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS fit_score SMALLINT,
  ADD COLUMN IF NOT EXISTS intent_score SMALLINT,
  ADD COLUMN IF NOT EXISTS crm_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.landing_page_form_submissions
  DROP CONSTRAINT IF EXISTS landing_page_form_submissions_fit_score_range_check;
ALTER TABLE public.landing_page_form_submissions
  ADD CONSTRAINT landing_page_form_submissions_fit_score_range_check
  CHECK (fit_score IS NULL OR fit_score BETWEEN 0 AND 100);

ALTER TABLE public.landing_page_form_submissions
  DROP CONSTRAINT IF EXISTS landing_page_form_submissions_intent_score_range_check;
ALTER TABLE public.landing_page_form_submissions
  ADD CONSTRAINT landing_page_form_submissions_intent_score_range_check
  CHECK (intent_score IS NULL OR intent_score BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS idx_form_submissions_lead_history
  ON public.landing_page_form_submissions(organization_id, lead_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_form_submissions_crm_contact
  ON public.landing_page_form_submissions(organization_id, crm_contact_id)
  WHERE crm_contact_id IS NOT NULL AND BTRIM(crm_contact_id) <> '';
