INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('client_admin', 'automations.read'),
  ('client_admin', 'automations.write'),
  ('client_member', 'automations.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION private.guard_published_automation_version()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'published' THEN
      RAISE EXCEPTION 'published_automation_version_immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published'
     AND (NEW.flow_id IS DISTINCT FROM OLD.flow_id
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
       OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.published_at IS DISTINCT FROM OLD.published_at) THEN
    RAISE EXCEPTION 'published_automation_version_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS automation_flow_versions_immutable ON public.automation_flow_versions;
CREATE TRIGGER automation_flow_versions_immutable
  BEFORE UPDATE OR DELETE ON public.automation_flow_versions
  FOR EACH ROW EXECUTE FUNCTION private.guard_published_automation_version();
