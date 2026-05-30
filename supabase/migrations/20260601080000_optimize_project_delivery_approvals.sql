-- Index new foreign keys and avoid per-row auth.uid() evaluation in approval inserts.

CREATE INDEX IF NOT EXISTS idx_project_deliverables_phase_id
  ON public.project_deliverables(phase_id);
CREATE INDEX IF NOT EXISTS idx_project_deliverables_created_by
  ON public.project_deliverables(created_by);
CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_by
  ON public.approval_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_approval_decisions_decided_by
  ON public.approval_decisions(decided_by);
CREATE INDEX IF NOT EXISTS idx_project_timeline_entries_created_by
  ON public.project_timeline_entries(created_by);

DROP POLICY IF EXISTS "Client members can create approval_decisions" ON public.approval_decisions;
CREATE POLICY "Client members can create approval_decisions" ON public.approval_decisions
  FOR INSERT WITH CHECK (
    decided_by = (SELECT auth.uid())
    AND private.can_access_approval_request(approval_request_id)
  );

