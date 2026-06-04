import { supabase } from '@/lib/supabase'
import { buildPipelineFromBlueprint, summarizeBlueprintApplication } from '@/lib/platform/blueprintApplicationRules'
import { formatLocalDateOnly } from '@/lib/platform/contracts'
import { crmGovernanceService } from '@/services/crmGovernanceService'
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

  async upsertModule(input: {
    key: string
    name: string
    base: boolean
    internalRoute?: string | null
    portalRoute?: string | null
    requiredPermissions?: string[]
  }) {
    const { data, error } = await supabase
      .from('platform_modules')
      .upsert({
        key: input.key.trim(),
        name: input.name.trim(),
        base: input.base,
        internal_route: input.internalRoute?.trim() || null,
        portal_route: input.portalRoute?.trim() || null,
        required_permissions: input.requiredPermissions || [],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
      .select()
      .single()

    if (error) throw error
    return mapModule(data)
  }

  async upsertPackage(input: {
    id?: string
    key: string
    name: string
    description: string
    moduleKeys: string[]
  }) {
    const { data, error } = await supabase
      .from('packages')
      .upsert({
        ...(input.id ? { id: input.id } : {}),
        key: input.key.trim(),
        name: input.name.trim(),
        description: input.description.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
      .select('*, package_modules(module_key)')
      .single()

    if (error) throw error

    await this.setPackageModules(data.id, input.moduleKeys)
    return this.getPackageById(data.id)
  }

  async getPackageById(packageId: string) {
    const { data, error } = await supabase
      .from('packages')
      .select('*, package_modules(module_key)')
      .eq('id', packageId)
      .single()

    if (error) throw error
    return mapPackage(data)
  }

  async setPackageModules(packageId: string, moduleKeys: string[]) {
    const uniqueModuleKeys = Array.from(new Set(moduleKeys))
    const { error: deleteError } = await supabase
      .from('package_modules')
      .delete()
      .eq('package_id', packageId)

    if (deleteError) throw deleteError

    if (uniqueModuleKeys.length === 0) return []

    const { data, error } = await supabase
      .from('package_modules')
      .insert(uniqueModuleKeys.map(moduleKey => ({
        package_id: packageId,
        module_key: moduleKey,
      })))
      .select()

    if (error) throw error
    return data || []
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
    const today = formatLocalDateOnly()
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
    const { data: directClient, error: directClientError } = await supabase
      .from('clients')
      .select('id, company_name, contact_name, email, user_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (directClientError) throw directClientError
    if (directClient) return mapClientSummary(directClient)

    const { data: memberships, error: membershipsError } = await supabase
      .from('memberships')
      .select('organization_id')
      .eq('user_id', userId)

    if (membershipsError) throw membershipsError
    if (!memberships?.length) return null

    const { data: organization, error: organizationError } = await supabase
      .from('organizations')
      .select('client_id')
      .in('id', memberships.map(item => item.organization_id))
      .not('client_id', 'is', null)
      .limit(1)
      .maybeSingle()

    if (organizationError) throw organizationError
    if (!organization?.client_id) return null

    const { data: organizationClient, error: organizationClientError } = await supabase
      .from('clients')
      .select('id, company_name, contact_name, email, user_id')
      .eq('id', organization.client_id)
      .maybeSingle()

    if (organizationClientError) throw organizationClientError
    return organizationClient ? mapClientSummary(organizationClient) : null
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
      .select(`
        *,
        blueprint_modules(module_key),
        blueprint_pipeline_templates(*, blueprint_pipeline_stages(*)),
        blueprint_custom_fields(*),
        blueprint_message_templates(*),
        blueprint_automation_templates(*),
        blueprint_report_presets(*),
        blueprint_application_runs(*)
      `)
      .order('name')

    if (error) throw error
    return (data || []).map(mapBlueprint)
  }

  async getBlueprintById(blueprintId: string) {
    const { data, error } = await supabase
      .from('blueprints')
      .select(`
        *,
        blueprint_modules(module_key),
        blueprint_pipeline_templates(*, blueprint_pipeline_stages(*)),
        blueprint_custom_fields(*),
        blueprint_message_templates(*),
        blueprint_automation_templates(*),
        blueprint_report_presets(*),
        blueprint_application_runs(*)
      `)
      .eq('id', blueprintId)
      .single()

    if (error) throw error
    return mapBlueprint(data)
  }

  async applyBlueprintToContract(input: BlueprintApplicationInput) {
    const { data: existingRun, error: existingRunError } = await supabase
      .from('blueprint_application_runs')
      .select('*')
      .eq('blueprint_id', input.blueprintId)
      .eq('contract_id', input.contractId)
      .maybeSingle()

    if (existingRunError) throw existingRunError
    if (existingRun?.status === 'succeeded') {
      return mapBlueprintApplicationRun(existingRun)
    }

    const blueprint = await this.getBlueprintById(input.blueprintId)
    const pipelineTemplate = buildPipelineFromBlueprint(blueprint)
    const summary = summarizeBlueprintApplication(blueprint)
    const now = new Date().toISOString()

    const { data: run, error: runError } = await supabase
      .from('blueprint_application_runs')
      .upsert({
        blueprint_id: input.blueprintId,
        contract_id: input.contractId,
        organization_id: input.organizationId,
        status: 'running',
        summary,
        error: null,
        started_at: now,
        completed_at: null,
      }, { onConflict: 'blueprint_id,contract_id' })
      .select('*')
      .single()

    if (runError) throw runError

    try {
      let crmInstanceId: string | undefined

      if (blueprint.moduleKeys.length) {
        const { error: moduleError } = await supabase
          .from('contract_modules')
          .upsert(blueprint.moduleKeys.map(moduleKey => ({
            contract_id: input.contractId,
            module_key: moduleKey,
            enabled: true,
            updated_at: now,
          })), { onConflict: 'contract_id,module_key' })

        if (moduleError) throw moduleError
      }

      if (blueprint.moduleKeys.includes('crm')) {
        const crmInstance = await crmGovernanceService.createInstance({
          organizationId: input.organizationId,
          contractId: input.contractId,
          sectorKey: blueprint.sector,
          blueprintId: blueprint.id,
          blueprintApplicationRunId: run.id,
          sellerSeatLimit: 3,
          managerSeatLimit: 1,
          adminSeatLimit: 1,
          defaultAssignmentMode: 'queue',
        })
        crmInstanceId = crmInstance.id
      }

      const { data: pipeline, error: pipelineError } = await supabase
        .from('crm_pipelines')
        .upsert({
          organization_id: input.organizationId,
          ...(crmInstanceId ? { crm_instance_id: crmInstanceId } : {}),
          name: pipelineTemplate.name,
          description: pipelineTemplate.description || blueprint.description,
          is_default: false,
          is_active: true,
        }, { onConflict: 'organization_id,name' })
        .select('*')
        .single()

      if (pipelineError) throw pipelineError

      const { error: stagesError } = await supabase
        .from('crm_pipeline_stages')
        .upsert(pipelineTemplate.stages.map(stage => ({
          pipeline_id: pipeline.id,
          key: stage.key,
          name: stage.name,
          color: stage.color || '#64748b',
          order_index: stage.orderIndex,
          is_won: Boolean(stage.isWon),
          is_lost: Boolean(stage.isLost),
          is_active: true,
        })), { onConflict: 'pipeline_id,key' })

      if (stagesError) throw stagesError

      const completedSummary = {
        ...summary,
        pipelineId: pipeline.id,
        linkedMessageTemplateKeys: blueprint.messageTemplates?.map(item => item.key) || [],
        linkedAutomationTemplateKeys: blueprint.automationTemplates?.map(item => item.key) || [],
        linkedReportPresetKeys: blueprint.reportPresets?.map(item => item.key) || [],
      }

      const { data: completedRun, error: completedRunError } = await supabase
        .from('blueprint_application_runs')
        .update({
          status: 'succeeded',
          pipeline_id: pipeline.id,
          summary: completedSummary,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)
        .select('*')
        .single()

      if (completedRunError) throw completedRunError
      return mapBlueprintApplicationRun(completedRun)
    } catch (error) {
      await supabase
        .from('blueprint_application_runs')
        .update({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Erro ao aplicar blueprint',
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)

      throw error
    }
  }
}

export const platformService = new PlatformService()
