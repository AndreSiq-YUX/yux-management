-- Basic contract support: tickets and ticket messages without omnichannel coupling.

CREATE OR REPLACE FUNCTION private.can_read_support_contract(target_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      JOIN public.contract_modules cm
        ON cm.contract_id = c.id
       AND cm.module_key = 'support'
       AND cm.enabled = TRUE
      WHERE c.id = target_contract_id
        AND c.status = 'active'
        AND private.can_access_client(c.client_id)
    );
$$;

CREATE OR REPLACE FUNCTION private.can_create_support_ticket(target_contract_id UUID, target_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      JOIN public.contract_modules cm
        ON cm.contract_id = c.id
       AND cm.module_key = 'support'
       AND cm.enabled = TRUE
      WHERE c.id = target_contract_id
        AND c.client_id = target_client_id
        AND c.status = 'active'
        AND private.can_access_client(target_client_id)
    );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_support_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = target_organization_id
    );
$$;

REVOKE ALL ON FUNCTION private.can_read_support_contract(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_create_support_ticket(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_support_organization(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_support_contract(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_create_support_ticket(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_support_organization(UUID) TO authenticated;

CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  subject TEXT NOT NULL CHECK (BTRIM(subject) <> ''),
  category TEXT NOT NULL DEFAULT 'technical' CHECK (category IN ('technical', 'billing', 'content', 'access', 'request', 'other')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_client', 'resolved', 'closed')),
  sla_due_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_tickets_resolution_state CHECK (
    (status = 'resolved' AND resolved_at IS NOT NULL)
    OR (status <> 'resolved')
  ),
  CONSTRAINT support_tickets_closed_state CHECK (
    (status = 'closed' AND closed_at IS NOT NULL)
    OR (status <> 'closed')
  )
);

CREATE TABLE public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('client', 'internal', 'system')),
  author_name TEXT,
  body TEXT NOT NULL CHECK (BTRIM(body) <> ''),
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_messages_internal_author CHECK (
    is_internal = FALSE OR author_type IN ('internal', 'system')
  )
);

CREATE INDEX idx_support_tickets_organization_status ON public.support_tickets(organization_id, status);
CREATE INDEX idx_support_tickets_client_status ON public.support_tickets(client_id, status);
CREATE INDEX idx_support_tickets_contract_status ON public.support_tickets(contract_id, status);
CREATE INDEX idx_support_tickets_project_id ON public.support_tickets(project_id);
CREATE INDEX idx_support_tickets_sla_status ON public.support_tickets(sla_due_at, status);
CREATE INDEX idx_support_messages_ticket_created ON public.support_messages(ticket_id, created_at);

CREATE OR REPLACE FUNCTION private.sync_support_ticket_status_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'resolved' THEN
    NEW.resolved_at := COALESCE(NEW.resolved_at, NOW());
    NEW.closed_at := NULL;
  ELSIF NEW.status = 'closed' THEN
    NEW.closed_at := COALESCE(NEW.closed_at, NOW());
    NEW.resolved_at := COALESCE(NEW.resolved_at, NOW());
  ELSE
    NEW.resolved_at := NULL;
    NEW.closed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_support_ticket_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_ticket_id UUID;
  next_last_message_at TIMESTAMPTZ;
BEGIN
  target_ticket_id := COALESCE(NEW.ticket_id, OLD.ticket_id);

  SELECT MAX(created_at)
  INTO next_last_message_at
  FROM public.support_messages
  WHERE ticket_id = target_ticket_id;

  UPDATE public.support_tickets
  SET last_message_at = next_last_message_at,
      updated_at = NOW()
  WHERE id = target_ticket_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION private.sync_support_ticket_status_timestamps() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_support_ticket_last_message() FROM PUBLIC;

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_support_messages_updated_at
  BEFORE UPDATE ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sync_support_ticket_status_timestamps
  BEFORE INSERT OR UPDATE OF status ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION private.sync_support_ticket_status_timestamps();

CREATE TRIGGER sync_support_ticket_last_message_after_message_change
  AFTER INSERT OR UPDATE OR DELETE ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION private.sync_support_ticket_last_message();

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users manage support tickets" ON public.support_tickets
  FOR ALL USING (private.can_manage_support_organization(organization_id))
  WITH CHECK (private.can_manage_support_organization(organization_id));

CREATE POLICY "Portal users read support tickets" ON public.support_tickets
  FOR SELECT USING (private.can_read_support_contract(contract_id));

CREATE POLICY "Portal users create support tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (
    status = 'open'
    AND private.can_create_support_ticket(contract_id, client_id)
  );

CREATE POLICY "Internal users manage support messages" ON public.support_messages
  FOR ALL USING (EXISTS (
    SELECT 1
    FROM public.support_tickets st
    WHERE st.id = ticket_id
      AND private.can_manage_support_organization(st.organization_id)
  )) WITH CHECK (EXISTS (
    SELECT 1
    FROM public.support_tickets st
    WHERE st.id = ticket_id
      AND private.can_manage_support_organization(st.organization_id)
  ));

CREATE POLICY "Portal users read public support messages" ON public.support_messages
  FOR SELECT USING (
    is_internal = FALSE
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets st
      WHERE st.id = ticket_id
        AND private.can_read_support_contract(st.contract_id)
    )
  );

CREATE POLICY "Portal users create public support messages" ON public.support_messages
  FOR INSERT WITH CHECK (
    is_internal = FALSE
    AND author_type = 'client'
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets st
      WHERE st.id = ticket_id
        AND private.can_read_support_contract(st.contract_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_messages TO authenticated;

INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('client_member', 'support.write')
ON CONFLICT (role_key, permission_key) DO NOTHING;

UPDATE public.platform_modules
SET base = false,
    internal_route = '/support',
    portal_route = '/portal/support',
    required_permissions = ARRAY['support.read'],
    updated_at = NOW()
WHERE key = 'support';

NOTIFY pgrst, 'reload schema';
