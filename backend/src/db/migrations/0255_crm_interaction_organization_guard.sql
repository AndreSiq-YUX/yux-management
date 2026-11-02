-- Interactions do not have enrollment_id. Access that column only for the
-- tables that declare it; SQL expressions are not guaranteed to short-circuit.
CREATE OR REPLACE FUNCTION private.validate_crm_lead_organization()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id=NEW.lead_id AND l.organization_id=NEW.organization_id) THEN
    RAISE EXCEPTION 'CRM record and lead must belong to the same organization';
  END IF;
  IF TG_TABLE_NAME IN ('crm_tasks','automation_executions') THEN
    IF NEW.enrollment_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.crm_sequence_enrollments e WHERE e.id=NEW.enrollment_id AND e.organization_id=NEW.organization_id AND e.lead_id=NEW.lead_id
    ) THEN
      RAISE EXCEPTION 'CRM record and enrollment must belong to the same lead and organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
