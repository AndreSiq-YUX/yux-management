-- Restrict contract data so clients only read their own active contract data.

CREATE OR REPLACE FUNCTION public.is_internal_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.roles r ON r.key = m.role_key
    WHERE m.user_id = auth.uid()
      AND r.scope = 'internal'
  )
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('ADMIN', 'MANAGER')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_contract(contract_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = contract_client_id
        AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN public.memberships m ON m.organization_id = o.id
      WHERE o.client_id = contract_client_id
        AND m.user_id = auth.uid()
    );
$$;

DROP POLICY IF EXISTS "Authenticated users can read contracts" ON public.contracts;
DROP POLICY IF EXISTS "Authenticated users can write contracts" ON public.contracts;
DROP POLICY IF EXISTS "Internal users can manage contracts" ON public.contracts;
DROP POLICY IF EXISTS "Contract owners can read contracts" ON public.contracts;

CREATE POLICY "Internal users can manage contracts"
  ON public.contracts
  FOR ALL
  USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

CREATE POLICY "Contract owners can read contracts"
  ON public.contracts
  FOR SELECT
  USING (public.can_read_contract(client_id));

DROP POLICY IF EXISTS "Authenticated users can read contract_modules" ON public.contract_modules;
DROP POLICY IF EXISTS "Authenticated users can write contract_modules" ON public.contract_modules;
DROP POLICY IF EXISTS "Internal users can manage contract_modules" ON public.contract_modules;
DROP POLICY IF EXISTS "Contract owners can read contract_modules" ON public.contract_modules;

CREATE POLICY "Internal users can manage contract_modules"
  ON public.contract_modules
  FOR ALL
  USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

CREATE POLICY "Contract owners can read contract_modules"
  ON public.contract_modules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.contracts c
      WHERE c.id = contract_modules.contract_id
        AND public.can_read_contract(c.client_id)
    )
  );

NOTIFY pgrst, 'reload schema';
