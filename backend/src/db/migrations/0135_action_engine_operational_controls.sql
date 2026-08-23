-- Mission budget alert ledger and auditable capability switch deactivation.

CREATE TABLE IF NOT EXISTS public.action_budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  envelope_version INTEGER NOT NULL CHECK (envelope_version > 0),
  threshold_percent INTEGER NOT NULL CHECK (threshold_percent IN (50,80,95)),
  consumed_brl NUMERIC(18,6) NOT NULL,
  maximum_brl NUMERIC(18,6) NOT NULL CHECK (maximum_brl > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, envelope_version, threshold_percent)
);

ALTER TABLE public.action_engine_kill_switches
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_action_budget_alerts_mission
  ON public.action_budget_alerts(mission_id, envelope_version, threshold_percent);

CREATE OR REPLACE FUNCTION private.guard_action_budget_alerts_append_only()
RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'action_budget_alerts_append_only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS action_budget_alerts_append_only ON public.action_budget_alerts;
CREATE TRIGGER action_budget_alerts_append_only BEFORE UPDATE OR DELETE ON public.action_budget_alerts
  FOR EACH ROW EXECUTE FUNCTION private.guard_action_budget_alerts_append_only();

ALTER TABLE public.action_budget_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_budget_alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_budget_alerts_internal ON public.action_budget_alerts;
CREATE POLICY action_budget_alerts_internal ON public.action_budget_alerts
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());
