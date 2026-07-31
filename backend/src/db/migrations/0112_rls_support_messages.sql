-- Extends the RLS safety net (0111) to support_messages, which was left out.
-- Messages inherit tenant scope from their parent support ticket.

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_messages_tenant_safety_net ON public.support_messages;
CREATE POLICY support_messages_tenant_safety_net ON public.support_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets ticket
      WHERE ticket.id = support_messages.ticket_id
        AND private.rls_can_access_organization(ticket.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets ticket
      WHERE ticket.id = support_messages.ticket_id
        AND private.rls_can_access_organization(ticket.organization_id)
    )
  );
