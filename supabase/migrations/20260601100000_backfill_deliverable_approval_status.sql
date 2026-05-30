-- Synchronize deliverables that received decisions before status propagation existed.

UPDATE public.project_deliverables d
SET status = latest.status,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (ar.target_id)
    ar.target_id,
    ar.status
  FROM public.approval_requests ar
  WHERE ar.target_type = 'deliverable'
    AND ar.status IN ('approved', 'changes_requested', 'rejected')
  ORDER BY ar.target_id, ar.decided_at DESC NULLS LAST, ar.updated_at DESC
) latest
WHERE d.id = latest.target_id
  AND d.status IS DISTINCT FROM latest.status;

