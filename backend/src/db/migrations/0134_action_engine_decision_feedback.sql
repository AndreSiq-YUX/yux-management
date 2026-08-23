-- Append-only structured decision evidence for plan, action and external simulation review.

ALTER TABLE public.action_simulation_reports
  ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES public.action_approvals(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.action_decision_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE CASCADE,
  approval_id UUID NOT NULL REFERENCES public.action_approvals(id) ON DELETE CASCADE,
  simulation_report_id UUID REFERENCES public.action_simulation_reports(id) ON DELETE SET NULL,
  feedback_version INTEGER NOT NULL DEFAULT 1 CHECK (feedback_version > 0),
  reviewer_type TEXT NOT NULL CHECK (reviewer_type IN ('authenticated','external')),
  reviewer_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('support','changes_requested','rejected')),
  reason_key TEXT CHECK (reason_key IN (
    'wrong_icp','wrong_tone','cost_too_high','scope_too_broad','scope_too_narrow',
    'timing_wrong','channel_wrong','compliance_risk','outcome_wrong','other'
  )),
  comment_redacted TEXT,
  subject_hash TEXT NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((decision = 'support' AND reason_key IS NULL) OR (decision <> 'support' AND reason_key IS NOT NULL)),
  CHECK (reason_key IS DISTINCT FROM 'other' OR CHAR_LENGTH(BTRIM(COALESCE(comment_redacted,''))) >= 3)
);

CREATE INDEX IF NOT EXISTS idx_action_decision_feedback_learning
  ON public.action_decision_feedback(organization_id, reason_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_decision_feedback_subject
  ON public.action_decision_feedback(approval_id, subject_hash, created_at DESC);

CREATE OR REPLACE FUNCTION private.guard_action_decision_feedback_append_only()
RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'action_decision_feedback_append_only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS action_decision_feedback_append_only ON public.action_decision_feedback;
CREATE TRIGGER action_decision_feedback_append_only BEFORE UPDATE OR DELETE ON public.action_decision_feedback
  FOR EACH ROW EXECUTE FUNCTION private.guard_action_decision_feedback_append_only();

ALTER TABLE public.action_decision_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_decision_feedback FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_decision_feedback_internal ON public.action_decision_feedback;
CREATE POLICY action_decision_feedback_internal ON public.action_decision_feedback
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());
