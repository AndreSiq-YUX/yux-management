-- Harden exposed tables used by the internal app and client portal.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

INSERT INTO public.memberships (user_id, organization_id, role_key)
SELECT
  u.id,
  o.id,
  CASE
    WHEN LOWER(au.email) = 'admin@yux.com.br' THEN 'yux_admin'
    ELSE 'yux_manager'
  END
FROM auth.users au
JOIN public.users u ON u.id = au.id
JOIN public.organizations o ON o.slug = 'yux'
WHERE LOWER(au.email) IN ('admin@yux.com.br', 'manager@yux.com.br')
ON CONFLICT (user_id, organization_id) DO UPDATE SET
  role_key = EXCLUDED.role_key,
  updated_at = NOW();

CREATE OR REPLACE FUNCTION private.is_internal_user()
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
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_client(target_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = target_client_id
        AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN public.memberships m ON m.organization_id = o.id
      WHERE o.client_id = target_client_id
        AND m.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION private.can_access_project(target_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = target_project_id
      AND private.can_access_client(p.client_id)
  );
$$;

REVOKE ALL ON FUNCTION private.is_internal_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_client(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_project(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_internal_user() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_client(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_project(UUID) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read users" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can write users" ON public.users;
CREATE POLICY "Internal users can manage users" ON public.users
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can read clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can write clients" ON public.clients;
CREATE POLICY "Internal users can manage clients" ON public.clients
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Client members can read clients" ON public.clients
  FOR SELECT USING (private.can_access_client(id));

DROP POLICY IF EXISTS "Authenticated users can read projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can write projects" ON public.projects;
CREATE POLICY "Internal users can manage projects" ON public.projects
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Client members can read projects" ON public.projects
  FOR SELECT USING (private.can_access_client(client_id));

DROP POLICY IF EXISTS "Authenticated users can read project_phases" ON public.project_phases;
DROP POLICY IF EXISTS "Authenticated users can write project_phases" ON public.project_phases;
CREATE POLICY "Internal users can manage project_phases" ON public.project_phases
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Client members can read project_phases" ON public.project_phases
  FOR SELECT USING (private.can_access_project(project_id));

DROP POLICY IF EXISTS "Authenticated users can read project_tasks" ON public.project_tasks;
DROP POLICY IF EXISTS "Authenticated users can write project_tasks" ON public.project_tasks;
CREATE POLICY "Internal users can manage project_tasks" ON public.project_tasks
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Client members can read project_tasks" ON public.project_tasks
  FOR SELECT USING (private.can_access_project(project_id));

DROP POLICY IF EXISTS "Authenticated users can read organizations" ON public.organizations;
DROP POLICY IF EXISTS "Authenticated users can write organizations" ON public.organizations;
CREATE POLICY "Internal users can manage organizations" ON public.organizations
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Members can read organizations" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.organization_id = organizations.id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read memberships" ON public.memberships;
DROP POLICY IF EXISTS "Authenticated users can write memberships" ON public.memberships;
CREATE POLICY "Internal users can manage memberships" ON public.memberships
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Users can read own memberships" ON public.memberships
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can write roles" ON public.roles;
DROP POLICY IF EXISTS "Authenticated users can write role_permissions" ON public.role_permissions;
CREATE POLICY "Internal users can manage roles" ON public.roles
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users can manage role_permissions" ON public.role_permissions
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());

DROP POLICY IF EXISTS "Authenticated users can write platform_modules" ON public.platform_modules;
DROP POLICY IF EXISTS "Authenticated users can write packages" ON public.packages;
DROP POLICY IF EXISTS "Authenticated users can write package_modules" ON public.package_modules;
DROP POLICY IF EXISTS "Authenticated users can write blueprints" ON public.blueprints;
DROP POLICY IF EXISTS "Authenticated users can write blueprint_modules" ON public.blueprint_modules;
CREATE POLICY "Internal users can manage platform_modules" ON public.platform_modules
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users can manage packages" ON public.packages
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users can manage package_modules" ON public.package_modules
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users can manage blueprints" ON public.blueprints
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users can manage blueprint_modules" ON public.blueprint_modules
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());

DROP POLICY IF EXISTS "Authenticated users can read campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Authenticated users can write campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Authenticated users can read leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can write leads" ON public.leads;
CREATE POLICY "Internal users can manage campaigns" ON public.campaigns
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users can manage leads" ON public.leads
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());

DO $$
BEGIN
  IF TO_REGCLASS('public.interactions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Authenticated users can read interactions" ON public.interactions;
    DROP POLICY IF EXISTS "Authenticated users can write interactions" ON public.interactions;
    CREATE POLICY "Internal users can manage interactions" ON public.interactions
      FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
  END IF;

  IF TO_REGCLASS('public.system_config') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Authenticated users can read system_config" ON public.system_config;
    DROP POLICY IF EXISTS "Authenticated users can write system_config" ON public.system_config;
    CREATE POLICY "Internal users can manage system_config" ON public.system_config
      FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
  END IF;
END
$$;

DROP POLICY IF EXISTS "Internal users can manage contracts" ON public.contracts;
DROP POLICY IF EXISTS "Contract owners can read contracts" ON public.contracts;
CREATE POLICY "Internal users can manage contracts" ON public.contracts
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Contract owners can read active contracts" ON public.contracts
  FOR SELECT USING (status = 'active' AND private.can_access_client(client_id));

DROP POLICY IF EXISTS "Internal users can manage contract_modules" ON public.contract_modules;
DROP POLICY IF EXISTS "Contract owners can read contract_modules" ON public.contract_modules;
CREATE POLICY "Internal users can manage contract_modules" ON public.contract_modules
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Contract owners can read active contract_modules" ON public.contract_modules
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.contracts c
      WHERE c.id = contract_modules.contract_id
        AND c.status = 'active'
        AND private.can_access_client(c.client_id)
    )
  );

DROP FUNCTION IF EXISTS public.can_read_contract(UUID);
DROP FUNCTION IF EXISTS public.is_internal_user();

NOTIFY pgrst, 'reload schema';
