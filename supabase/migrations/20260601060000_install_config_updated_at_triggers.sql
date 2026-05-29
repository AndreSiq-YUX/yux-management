-- Keep audit timestamps database-owned for configurable platform records.

DROP TRIGGER IF EXISTS update_blueprints_updated_at ON public.blueprints;
CREATE TRIGGER update_blueprints_updated_at
  BEFORE UPDATE ON public.blueprints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contract_modules_updated_at ON public.contract_modules;
CREATE TRIGGER update_contract_modules_updated_at
  BEFORE UPDATE ON public.contract_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contracts_updated_at ON public.contracts;
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_memberships_updated_at ON public.memberships;
CREATE TRIGGER update_memberships_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_packages_updated_at ON public.packages;
CREATE TRIGGER update_packages_updated_at
  BEFORE UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_modules_updated_at ON public.platform_modules;
CREATE TRIGGER update_platform_modules_updated_at
  BEFORE UPDATE ON public.platform_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_roles_updated_at ON public.roles;
CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
