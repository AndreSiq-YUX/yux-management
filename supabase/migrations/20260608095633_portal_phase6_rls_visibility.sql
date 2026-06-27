-- Phase 6 portal visibility fixes.
-- Marketing Studio records are scoped by organization_id, while contracts are
-- scoped by client_id. The original helper compared those ids directly, which
-- hid valid portal rows from client users.
CREATE OR REPLACE FUNCTION private.has_active_marketing_studio_contract(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    JOIN public.contracts c
      ON c.client_id = o.client_id
     AND c.status = 'active'
    JOIN public.contract_modules cm
      ON cm.contract_id = c.id
     AND cm.module_key = 'marketing_studio'
     AND cm.enabled = TRUE
    WHERE o.id = target_organization_id
      AND o.kind = 'client'
  );
$$;

REVOKE ALL ON FUNCTION private.has_active_marketing_studio_contract(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_active_marketing_studio_contract(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Omnichannel users read channel connections" ON public.channel_connections;
CREATE POLICY "Omnichannel users read channel connections"
  ON public.channel_connections
  FOR SELECT TO authenticated
  USING (private.can_access_omnichannel_organization(organization_id, 'read'));

UPDATE public.contract_modules
SET enabled = TRUE,
    updated_at = NOW()
WHERE contract_id = '660e8400-e29b-41d4-a716-446655440001'
  AND module_key = 'finance';

NOTIFY pgrst, 'reload schema';
