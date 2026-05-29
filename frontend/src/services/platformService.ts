import { supabase } from '@/lib/supabase'
import type {
  Blueprint,
  Contract,
  ContractModule,
  Membership,
  Organization,
  PackageDefinition,
  PermissionKey,
  PlatformModule,
  PlatformRole,
  RoleScope,
} from '@/types/platform'

function mapOrganization(row: any): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRole(row: any): PlatformRole {
  const permissions = Array.isArray(row.role_permissions)
    ? row.role_permissions.map((item: any) => item.permission_key)
    : []

  return {
    key: row.key,
    name: row.name,
    scope: row.scope as RoleScope,
    permissions: permissions as PermissionKey[],
  }
}

function mapMembership(row: any): Membership {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    roleKey: row.role_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapModule(row: any): PlatformModule {
  return {
    key: row.key,
    name: row.name,
    base: row.base,
    internalRoute: row.internal_route,
    portalRoute: row.portal_route,
    requiredPermissions: row.required_permissions || [],
  }
}

function mapPackage(row: any): PackageDefinition {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description || '',
    moduleKeys: Array.isArray(row.package_modules)
      ? row.package_modules.map((item: any) => item.module_key)
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapContract(row: any): Contract {
  return {
    id: row.id,
    clientId: row.client_id,
    packageId: row.package_id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapContractModule(row: any): ContractModule {
  return {
    contractId: row.contract_id,
    moduleKey: row.module_key,
    enabled: row.enabled,
  }
}

function mapBlueprint(row: any): Blueprint {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    sector: row.sector,
    description: row.description || '',
    moduleKeys: Array.isArray(row.blueprint_modules)
      ? row.blueprint_modules.map((item: any) => item.module_key)
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PlatformService {
  async getOrganizations() {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('name')

    if (error) throw error
    return (data || []).map(mapOrganization)
  }

  async getRoles() {
    const { data, error } = await supabase
      .from('roles')
      .select('*, role_permissions(permission_key)')
      .order('name')

    if (error) throw error
    return (data || []).map(mapRole)
  }

  async getMembershipsForUser(userId: string) {
    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .eq('user_id', userId)

    if (error) throw error
    return (data || []).map(mapMembership)
  }

  async getModules() {
    const { data, error } = await supabase
      .from('platform_modules')
      .select('*')
      .order('name')

    if (error) throw error
    return (data || []).map(mapModule)
  }

  async getPackages() {
    const { data, error } = await supabase
      .from('packages')
      .select('*, package_modules(module_key)')
      .order('name')

    if (error) throw error
    return (data || []).map(mapPackage)
  }

  async getContractsForClient(clientId: string) {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []).map(mapContract)
  }

  async getContractModules(contractId: string) {
    const { data, error } = await supabase
      .from('contract_modules')
      .select('*')
      .eq('contract_id', contractId)

    if (error) throw error
    return (data || []).map(mapContractModule)
  }

  async getBlueprints() {
    const { data, error } = await supabase
      .from('blueprints')
      .select('*, blueprint_modules(module_key)')
      .order('name')

    if (error) throw error
    return (data || []).map(mapBlueprint)
  }
}

export const platformService = new PlatformService()
