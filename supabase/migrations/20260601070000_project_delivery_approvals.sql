-- Project delivery workflow: client-visible tasks, deliverables, approvals, and timeline.

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS is_client_visible BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.project_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'delivered', 'in_review', 'approved', 'changes_requested', 'rejected')),
  due_date DATE,
  delivered_at TIMESTAMPTZ,
  external_url TEXT,
  is_client_visible BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('deliverable', 'document', 'creative')),
  target_id UUID NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'changes_requested', 'rejected', 'cancelled')),
  is_client_visible BOOLEAN NOT NULL DEFAULT true,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested', 'rejected')),
  comment TEXT,
  decided_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT approval_decisions_comment_required CHECK (
    decision = 'approved' OR NULLIF(BTRIM(comment), '') IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.project_timeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL DEFAULT 'manual_update'
    CHECK (entry_type IN ('manual_update', 'deliverable_created', 'approval_requested', 'approval_decided', 'status_changed')),
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'automatic')),
  is_client_visible BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_deliverables_project_id
  ON public.project_deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_project_id
  ON public.approval_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_target
  ON public.approval_requests(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_approval_decisions_request_id
  ON public.approval_decisions(approval_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_timeline_entries_project_id
  ON public.project_timeline_entries(project_id, created_at DESC);

ALTER TABLE public.project_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_timeline_entries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.can_access_approval_request(target_request_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.approval_requests ar
    WHERE ar.id = target_request_id
      AND ar.is_client_visible
      AND private.can_access_project(ar.project_id)
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_approval_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_approval_request(UUID) TO authenticated;

DROP POLICY IF EXISTS "Client members can read project_tasks" ON public.project_tasks;
CREATE POLICY "Client members can read visible project_tasks" ON public.project_tasks
  FOR SELECT USING (is_client_visible AND private.can_access_project(project_id));

CREATE POLICY "Internal users can manage project_deliverables" ON public.project_deliverables
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Client members can read visible project_deliverables" ON public.project_deliverables
  FOR SELECT USING (is_client_visible AND private.can_access_project(project_id));

CREATE POLICY "Internal users can manage approval_requests" ON public.approval_requests
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Client members can read visible approval_requests" ON public.approval_requests
  FOR SELECT USING (is_client_visible AND private.can_access_project(project_id));

CREATE POLICY "Internal users can manage approval_decisions" ON public.approval_decisions
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Client members can read approval_decisions" ON public.approval_decisions
  FOR SELECT USING (private.can_access_approval_request(approval_request_id));
CREATE POLICY "Client members can create approval_decisions" ON public.approval_decisions
  FOR INSERT WITH CHECK (
    decided_by = auth.uid()
    AND private.can_access_approval_request(approval_request_id)
  );

CREATE POLICY "Internal users can manage project_timeline_entries" ON public.project_timeline_entries
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Client members can read visible project_timeline_entries" ON public.project_timeline_entries
  FOR SELECT USING (is_client_visible AND private.can_access_project(project_id));

CREATE OR REPLACE FUNCTION private.record_deliverable_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.project_timeline_entries (
    project_id, entry_type, title, body, metadata, origin, is_client_visible, created_by
  ) VALUES (
    NEW.project_id,
    'deliverable_created',
    'Entregavel criado',
    NEW.title,
    jsonb_build_object('deliverable_id', NEW.id),
    'automatic',
    NEW.is_client_visible,
    auth.uid()
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.record_approval_requested()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.project_timeline_entries (
    project_id, entry_type, title, body, metadata, origin, is_client_visible, created_by
  ) VALUES (
    NEW.project_id,
    'approval_requested',
    'Aprovacao solicitada',
    NEW.title,
    jsonb_build_object('approval_request_id', NEW.id, 'target_type', NEW.target_type, 'target_id', NEW.target_id),
    'automatic',
    NEW.is_client_visible,
    auth.uid()
  );
  RETURN NEW;
END;
$$;

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

REVOKE ALL ON FUNCTION private.record_deliverable_created() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.record_approval_requested() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.record_approval_decision() FROM PUBLIC;

DROP TRIGGER IF EXISTS record_deliverable_created ON public.project_deliverables;
CREATE TRIGGER record_deliverable_created
  AFTER INSERT ON public.project_deliverables
  FOR EACH ROW EXECUTE FUNCTION private.record_deliverable_created();

DROP TRIGGER IF EXISTS record_approval_requested ON public.approval_requests;
CREATE TRIGGER record_approval_requested
  AFTER INSERT ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION private.record_approval_requested();

DROP TRIGGER IF EXISTS record_approval_decision ON public.approval_decisions;
CREATE TRIGGER record_approval_decision
  AFTER INSERT ON public.approval_decisions
  FOR EACH ROW EXECUTE FUNCTION private.record_approval_decision();

DROP TRIGGER IF EXISTS update_project_deliverables_updated_at ON public.project_deliverables;
CREATE TRIGGER update_project_deliverables_updated_at
  BEFORE UPDATE ON public.project_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_approval_requests_updated_at ON public.approval_requests;
CREATE TRIGGER update_approval_requests_updated_at
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_deliverables TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_timeline_entries TO authenticated;

NOTIFY pgrst, 'reload schema';
