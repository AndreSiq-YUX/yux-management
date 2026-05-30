-- Keep generic approvals safe while only deliverables are implemented.

CREATE OR REPLACE FUNCTION private.validate_approval_request_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.target_type = 'deliverable' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.project_deliverables d
      WHERE d.id = NEW.target_id
        AND d.project_id = NEW.project_id
        AND d.is_client_visible
    ) THEN
      RAISE EXCEPTION 'Approval target must be a visible deliverable from the same project';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Approval target type % is not available yet', NEW.target_type;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_approval_request_target() FROM PUBLIC;

DROP TRIGGER IF EXISTS validate_approval_request_target ON public.approval_requests;
CREATE TRIGGER validate_approval_request_target
  BEFORE INSERT OR UPDATE OF project_id, target_type, target_id ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION private.validate_approval_request_target();

CREATE OR REPLACE FUNCTION private.record_approval_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_request public.approval_requests%ROWTYPE;
BEGIN
  UPDATE public.approval_requests
  SET status = NEW.decision, decided_at = NEW.created_at, updated_at = NOW()
  WHERE id = NEW.approval_request_id
  RETURNING * INTO target_request;

  IF target_request.target_type = 'deliverable' THEN
    UPDATE public.project_deliverables
    SET status = NEW.decision, updated_at = NOW()
    WHERE id = target_request.target_id
      AND project_id = target_request.project_id;
  END IF;

  INSERT INTO public.project_timeline_entries (
    project_id, entry_type, title, body, metadata, origin, is_client_visible, created_by
  ) VALUES (
    target_request.project_id,
    'approval_decided',
    CASE NEW.decision
      WHEN 'approved' THEN 'Item aprovado'
      WHEN 'changes_requested' THEN 'Ajustes solicitados'
      ELSE 'Item rejeitado'
    END,
    NEW.comment,
    jsonb_build_object('approval_request_id', NEW.approval_request_id, 'decision_id', NEW.id, 'decision', NEW.decision),
    'automatic',
    target_request.is_client_visible,
    NEW.decided_by
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.record_approval_decision() FROM PUBLIC;

