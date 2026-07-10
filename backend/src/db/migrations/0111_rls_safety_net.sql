-- Defense-in-depth tenant controls for the self-hosted PostgreSQL backend.
-- The API sets app.current_role and app.current_orgs inside each query
-- transaction; see backend/src/db/client.ts.

CREATE OR REPLACE FUNCTION private.rls_is_internal()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT current_setting('app.current_role', true) IN ('yux_admin', 'yux_operator')
$$;

CREATE OR REPLACE FUNCTION private.rls_is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT current_setting('app.current_role', true) = 'yux_admin'
$$;

CREATE OR REPLACE FUNCTION private.rls_can_access_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.rls_is_internal()
    OR target_organization_id = ANY(
      COALESCE(NULLIF(current_setting('app.current_orgs', true), ''), '{}')::UUID[]
    )
$$;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leads_tenant_safety_net ON public.leads;
CREATE POLICY leads_tenant_safety_net ON public.leads
  FOR ALL USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_tenant_safety_net ON public.conversations;
CREATE POLICY conversations_tenant_safety_net ON public.conversations
  FOR ALL USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_tenant_safety_net ON public.messages;
CREATE POLICY messages_tenant_safety_net ON public.messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.conversations conversation
      WHERE conversation.id = messages.conversation_id
        AND private.rls_can_access_organization(conversation.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations conversation
      WHERE conversation.id = messages.conversation_id
        AND private.rls_can_access_organization(conversation.organization_id)
    )
  );

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_tenant_safety_net ON public.invoices;
CREATE POLICY invoices_tenant_safety_net ON public.invoices
  FOR ALL USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_tickets_tenant_safety_net ON public.support_tickets;
CREATE POLICY support_tickets_tenant_safety_net ON public.support_tickets
  FOR ALL USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));

ALTER TABLE public.platform_provider_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_provider_secrets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_provider_secrets_admin_only ON public.platform_provider_secrets;
CREATE POLICY platform_provider_secrets_admin_only ON public.platform_provider_secrets
  FOR ALL USING (private.rls_is_platform_admin())
  WITH CHECK (private.rls_is_platform_admin());

ALTER TABLE public.provider_integration_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_integration_secrets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_integration_secrets_admin_only ON public.provider_integration_secrets;
CREATE POLICY provider_integration_secrets_admin_only ON public.provider_integration_secrets
  FOR ALL USING (private.rls_is_platform_admin())
  WITH CHECK (private.rls_is_platform_admin());
