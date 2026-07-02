import { apiRequest } from '@/lib/apiClient'
import type {
  BillingCycle,
  Blueprint,
  BlueprintApplicationInput,
  BlueprintApplicationRun,
  BlueprintAutomationTemplate,
  BlueprintCustomField,
  BlueprintMessageTemplate,
  BlueprintPipelineStage,
  BlueprintPipelineTemplate,
  BlueprintReportPreset,
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
    clientId: row.client_id || undefined,
    isInternalGrowthWorkspace: Boolean(row.is_internal_growth_workspace),
    workspacePurpose: row.workspace_purpose || 'client_delivery',
    strategyPackScope: row.strategy_pack_scope || 'client',
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

function mapClientSummary(row: any) {
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    userId: row.user_id,
  }
}

function mapBlueprint(row: any): Blueprint {
  const pipelineTemplates = Array.isArray(row.blueprint_pipeline_templates)
    ? row.blueprint_pipeline_templates.map(mapBlueprintPipelineTemplate)
    : []

  return {
    id: row.id,
    key: row.key,
    name: row.name,
    sector: row.sector,
    description: row.description || '',
    moduleKeys: Array.isArray(row.blueprint_modules)
      ? row.blueprint_modules.map((item: any) => item.module_key)
      : [],
    pipelineTemplate: pipelineTemplates[0],
    customFields: Array.isArray(row.blueprint_custom_fields)
      ? row.blueprint_custom_fields.map(mapBlueprintCustomField)
      : [],
    messageTemplates: Array.isArray(row.blueprint_message_templates)
      ? row.blueprint_message_templates.map(mapBlueprintMessageTemplate)
      : [],
    automationTemplates: Array.isArray(row.blueprint_automation_templates)
      ? row.blueprint_automation_templates.map(mapBlueprintAutomationTemplate)
      : [],
    reportPresets: Array.isArray(row.blueprint_report_presets)
      ? row.blueprint_report_presets.map(mapBlueprintReportPreset)
      : [],
    applicationRuns: Array.isArray(row.blueprint_application_runs)
      ? row.blueprint_application_runs.map(mapBlueprintApplicationRun)
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapBlueprintPipelineStage(row: any): BlueprintPipelineStage {
  return {
    id: row.id,
    templateId: row.template_id,
    key: row.key,
    name: row.name,
    color: row.color || undefined,
    orderIndex: row.order_index,
    isWon: row.is_won,
    isLost: row.is_lost,
  }
}

function mapBlueprintPipelineTemplate(row: any): BlueprintPipelineTemplate {
  return {
    id: row.id,
    blueprintId: row.blueprint_id,
    key: row.key,
    name: row.name,
    description: row.description || undefined,
    stages: Array.isArray(row.blueprint_pipeline_stages)
      ? row.blueprint_pipeline_stages.map(mapBlueprintPipelineStage)
      : [],
  }
}

function mapBlueprintCustomField(row: any): BlueprintCustomField {
  return {
    id: row.id,
    blueprintId: row.blueprint_id,
    key: row.key,
    label: row.label,
    fieldType: row.field_type,
    required: row.required,
    options: Array.isArray(row.options) ? row.options : [],
  }
}

function mapBlueprintMessageTemplate(row: any): BlueprintMessageTemplate {
  return {
    id: row.id,
    blueprintId: row.blueprint_id,
    key: row.key,
    name: row.name,
    channel: row.channel,
    body: row.body,
  }
}

function mapBlueprintAutomationTemplate(row: any): BlueprintAutomationTemplate {
  return {
    id: row.id,
    blueprintId: row.blueprint_id,
    key: row.key,
    name: row.name,
    triggerEvent: row.trigger_event,
    draftPayload: row.draft_payload || {},
  }
}

function mapBlueprintReportPreset(row: any): BlueprintReportPreset {
  return {
    id: row.id,
    blueprintId: row.blueprint_id,
    key: row.key,
    name: row.name,
    metricKeys: row.metric_keys || [],
  }
}

function mapBlueprintApplicationRun(row: any): BlueprintApplicationRun {
  return {
    id: row.id,
    blueprintId: row.blueprint_id,
    contractId: row.contract_id,
    status: row.status,
    summary: row.summary || {},
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PlatformService {
  async getOrganizations() {
    return apiRequest<Organization[]>('/platform/organizations')
  }

  async createClientOrganization(input: {
    clientId: string
    name: string
    slug?: string
  }) {
    return apiRequest<Organization>('/platform/organizations/client', {
      method: 'POST',
      body: input,
    })
  }

  async getRoles() {
    return apiRequest<PlatformRole[]>('/platform/roles')
  }

  async getMembershipsForUser(userId: string) {
    return apiRequest<Membership[]>(`/platform/users/${userId}/memberships`)
  }

  async getModules() {
    return apiRequest<PlatformModule[]>('/platform/modules')
  }

  async getPackages() {
    return apiRequest<PackageDefinition[]>('/platform/packages')
  }

  async upsertModule(input: {
    key: string
    name: string
    base: boolean
    internalRoute?: string | null
    portalRoute?: string | null
    requiredPermissions?: string[]
  }) {
    return apiRequest<PlatformModule>('/platform/modules/upsert', {
      method: 'POST',
      body: input,
    })
  }

  async upsertPackage(input: {
    id?: string
    key: string
    name: string
    description: string
    moduleKeys: string[]
  }) {
    return apiRequest<PackageDefinition>('/platform/packages/upsert', {
      method: 'POST',
      body: input,
    })
  }

  async getPackageById(packageId: string) {
    return apiRequest<PackageDefinition>(`/platform/packages/${packageId}`)
  }

  async setPackageModules(packageId: string, moduleKeys: string[]) {
    return apiRequest<Array<{ packageId: string; moduleKey: string }>>(`/platform/packages/${packageId}/modules`, {
      method: 'PUT',
      body: { moduleKeys },
    })
  }

  async getContracts() {
    return apiRequest<ContractDetails[]>('/platform/contracts')
  }

  async getContractById(contractId: string) {
    return apiRequest<ContractDetails>(`/platform/contracts/${contractId}`)
  }

  async getActiveContractForClient(clientId: string): Promise<ContractDetails | null> {
    return apiRequest<ContractDetails | null>(`/platform/clients/${clientId}/active-contract`)
  }

  async getClientForUser(userId: string) {
    return apiRequest<{
      id: string
      companyName: string
      contactName: string
      email: string
      userId?: string
    } | null>(`/platform/users/${userId}/client`)
  }

  async getPortalContractContextForUser(userId: string): Promise<PortalContractContext> {
    return apiRequest<PortalContractContext>(`/platform/users/${userId}/portal-contract-context`)
  }

  async getPortalContractContextForClient(clientId: string): Promise<PortalContractContext> {
    return apiRequest<PortalContractContext>(`/platform/clients/${clientId}/portal-contract-context`)
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
    return apiRequest<ContractDetails>('/platform/contracts', {
      method: 'POST',
      body: input,
    })
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
    return apiRequest<ContractDetails>(`/platform/contracts/${contractId}`, {
      method: 'PATCH',
      body: input,
    })
  }

  async setContractModule(contractId: string, moduleKey: string, enabled: boolean) {
    return apiRequest<ContractModule>(`/platform/contracts/${contractId}/modules/${moduleKey}`, {
      method: 'PUT',
      body: { enabled },
    })
  }

  async getContractsForClient(clientId: string) {
    return apiRequest<Contract[]>(`/platform/clients/${clientId}/contracts`)
  }

  async getContractModules(contractId: string) {
    return apiRequest<ContractModule[]>(`/platform/contracts/${contractId}/modules`)
  }

  async getBlueprints() {
    return apiRequest<Blueprint[]>('/platform/blueprints')
  }

  async getBlueprintById(blueprintId: string) {
    return apiRequest<Blueprint>(`/platform/blueprints/${blueprintId}`)
  }

  async applyBlueprintToContract(input: BlueprintApplicationInput) {
    return apiRequest<BlueprintApplicationRun>('/platform/blueprints/apply', {
      method: 'POST',
      body: input,
    })
  }
}

export const platformService = new PlatformService()
