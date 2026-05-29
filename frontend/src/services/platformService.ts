import { supabase } from '@/lib/supabase'
import type {
  BillingCycle,
  Blueprint,
  Contract,
  ContractDetails,
  ContractModule,
  ContractStatus,
  Membership,
  Organization,
  PackageDefinition,
  PermissionKey,
  PlatformModule,
  PortalContractContext,
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
    status: row.status as ContractStatus,
    startsAt: row.starts_at,
    endsAt: row.ends_at || undefined,
    name: row.name || undefined,
    value: row.value !== null && row.value !== undefined ? Number(row.value) : undefined,
    billingCycle: row.billing_cycle as BillingCycle | undefined,
    notes: row.notes || undefined,
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

function mapContractDetails(row: any): ContractDetails {
  return {
    ...mapContract(row),
    package: row.packages ? mapPackage(row.packages) : null,
    modules: Array.isArray(row.contract_modules)
      ? row.contract_modules.map(mapContractModule)
      : [],
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

  async getContracts() {
    const { data, error } = await supabase
      .from('contracts')
      .select('*, packages(*, package_modules(module_key)), contract_modules(*)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []).map(mapContractDetails)
  }

  async getContractById(contractId: string) {
    const { data, error } = await supabase
      .from('contracts')
      .select('*, packages(*, package_modules(module_key)), contract_modules(*)')
      .eq('id', contractId)
      .single()

    if (error) throw error
    return mapContractDetails(data)
  }

  async getActiveContractForClient(clientId: string): Promise<ContractDetails | null> {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('contracts')
      .select('*, packages(*, package_modules(module_key)), contract_modules(*)')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .lte('starts_at', today)
      .or(`ends_at.is.null,ends_at.gte.${today}`)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data ? mapContractDetails(data) : null
  }

  async getClientForUser(userId: string) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, company_name, contact_name, email, user_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    return data
      ? {
          id: data.id,
          companyName: data.company_name,
          contactName: data.contact_name,
          email: data.email,
          userId: data.user_id,
        }
      : null
  }

  async getPortalContractContextForUser(userId: string): Promise<PortalContractContext> {
    const client = await this.getClientForUser(userId)
    if (!client) {
      return { contract: null, enabledModuleKeys: [] }
    }

    const contract = await this.getActiveContractForClient(client.id)
    return {
      contract,
      enabledModuleKeys: contract
        ? contract.modules.filter(module => module.enabled).map(module => module.moduleKey)
        : [],
    }
  }

  async createContract(input: {
    clientId: string
    packageId: string
    name: string
    status: ContractStatus
    startsAt: string
    endsAt?: string
    value?: number
    billingCycle: BillingCycle
    notes?: string
  }) {
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        client_id: input.clientId,
        package_id: input.packageId,
        name: input.name,
        status: input.status,
        starts_at: input.startsAt,
        ends_at: input.endsAt || null,
        value: input.value ?? null,
        billing_cycle: input.billingCycle,
        notes: input.notes || null,
      })
      .select('*, packages(*, package_modules(module_key)), contract_modules(*)')
      .single()

    if (error) throw error
    return mapContractDetails(data)
  }

  async updateContract(contractId: string, input: Partial<{
    packageId: string
    name: string
    status: ContractStatus
    startsAt: string
    endsAt?: string | null
    value?: number | null
    billingCycle: BillingCycle
    notes?: string | null
  }>) {
    const payload: Record<string, unknown> = {}

    if (input.packageId !== undefined) payload.package_id = input.packageId
    if (input.name !== undefined) payload.name = input.name
    if (input.status !== undefined) payload.status = input.status
    if (input.startsAt !== undefined) payload.starts_at = input.startsAt
    if (input.endsAt !== undefined) payload.ends_at = input.endsAt
    if (input.value !== undefined) payload.value = input.value
    if (input.billingCycle !== undefined) payload.billing_cycle = input.billingCycle
    if (input.notes !== undefined) payload.notes = input.notes

    const { data, error } = await supabase
      .from('contracts')
      .update(payload)
      .eq('id', contractId)
      .select('*, packages(*, package_modules(module_key)), contract_modules(*)')
      .single()

    if (error) throw error
    return mapContractDetails(data)
  }

  async setContractModule(contractId: string, moduleKey: string, enabled: boolean) {
    const { data, error } = await supabase
      .from('contract_modules')
      .upsert({
        contract_id: contractId,
        module_key: moduleKey,
        enabled,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return mapContractModule(data)
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
