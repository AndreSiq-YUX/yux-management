-- Immutable, expiring shadow-simulation reports and non-authoritative external feedback.

CREATE TABLE IF NOT EXISTS public.action_simulation_reports (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.action_plans(id) ON DELETE CASCADE,
  plan_revision INTEGER NOT NULL CHECK (plan_revision > 0),
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  report_hash TEXT NOT NULL CHECK (report_hash ~ '^[a-f0-9]{64}$'),
  redaction_version INTEGER NOT NULL DEFAULT 1 CHECK (redaction_version > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  pdf_data BYTEA NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_action_simulation_reports_mission
  ON public.action_simulation_reports(organization_id, mission_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.action_simulation_report_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.action_simulation_reports(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('support','request_changes','reject')),
  reason_key TEXT,
  reviewer_name TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(reviewer_name)) BETWEEN 2 AND 100),
  comment TEXT CHECK (comment IS NULL OR CHAR_LENGTH(comment) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.action_simulation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_simulation_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.action_simulation_report_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_simulation_report_feedback FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS action_simulation_reports_internal ON public.action_simulation_reports;
CREATE POLICY action_simulation_reports_internal ON public.action_simulation_reports
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

DROP POLICY IF EXISTS action_simulation_report_feedback_internal ON public.action_simulation_report_feedback;
CREATE POLICY action_simulation_report_feedback_internal ON public.action_simulation_report_feedback
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());
