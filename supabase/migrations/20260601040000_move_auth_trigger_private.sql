-- Move privileged trigger code out of the exposed public schema.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    'CLIENT'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

DROP FUNCTION IF EXISTS public.handle_new_user();

ALTER FUNCTION private.is_internal_user() SET search_path = '';
ALTER FUNCTION private.can_access_client(UUID) SET search_path = '';
ALTER FUNCTION private.can_access_project(UUID) SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.role_permissions rp ON rp.role_key = m.role_key
    WHERE m.user_id = auth.uid()
      AND rp.permission_key = 'platform.manage'
  );
$$;

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;

DROP POLICY IF EXISTS "Internal users can manage memberships" ON public.memberships;
CREATE POLICY "Internal users can manage memberships" ON public.memberships
  FOR ALL USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS "Internal users can manage roles" ON public.roles;
CREATE POLICY "Internal users can manage roles" ON public.roles
  FOR ALL USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS "Internal users can manage role_permissions" ON public.role_permissions;
CREATE POLICY "Internal users can manage role_permissions" ON public.role_permissions
  FOR ALL USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS "Internal users can manage platform_modules" ON public.platform_modules;
CREATE POLICY "Internal users can manage platform_modules" ON public.platform_modules
  FOR ALL USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS "Internal users can manage packages" ON public.packages;
CREATE POLICY "Internal users can manage packages" ON public.packages
  FOR ALL USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS "Internal users can manage package_modules" ON public.package_modules;
CREATE POLICY "Internal users can manage package_modules" ON public.package_modules
  FOR ALL USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());
