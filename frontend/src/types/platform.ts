export type PlatformMode = 'internal' | 'portal' | 'client_workspace'

export type OrganizationKind = 'yux' | 'client'

export type ContractStatus = 'draft' | 'active' | 'paused' | 'cancelled' | 'completed'

export type BillingCycle = 'one_time' | 'monthly' | 'quarterly' | 'yearly'

export interface Organization {
  id: string
  name: string
  slug: string
  kind: OrganizationKind
  clientId?: string
  isInternalGrowthWorkspace?: boolean
  workspacePurpose?: string
  strategyPackScope?: string
  createdAt: string
  updatedAt: string
}

export type PermissionKey =
  | 'platform.manage'
  | 'clients.read'
  | 'clients.write'
  | 'crm.read'
  | 'crm.write'
  | 'radar:manage'
  | 'leads.read'
  | 'leads.write'
  | 'landing_pages.read'
  | 'landing_pages.write'
  | 'projects.read'
  | 'projects.write'
  | 'deliveries.read'
  | 'deliveries.write'
  | 'approvals.read'
  | 'approvals.write'
  | 'proposals.read'
  | 'proposals.write'
  | 'campaigns.read'
  | 'campaigns.write'
  | 'marketing_studio.read'
  | 'marketing_studio.write'
  | 'marketing_studio.configure'
  | 'marketing_studio.supervise'
  | 'reports.read'
  | 'reports.write'
  | 'automations.read'
  | 'automations.write'
  | 'support.read'
  | 'support.write'
  | 'omnichannel.read'
  | 'omnichannel.write'
  | 'omnichannel.supervise'
  | 'omnichannel.configure'
  | 'finance.read'
  | 'finance.write'
  | 'blueprints.read'
  | 'blueprints.write'

export type RoleScope = 'internal' | 'client'

export interface PlatformRole {
  key: string
  name: string
  scope: RoleScope
  permissions: PermissionKey[]
}

export interface Membership {
  id: string
  userId: string
  organizationId: string
  roleKey: string
  createdAt: string
  updatedAt: string
}

export interface PlatformModule {
  key: string
  name: string
  base: boolean
  internalRoute: string | null
  portalRoute: string | null
  requiredPermissions: PermissionKey[]
}

export interface PackageDefinition {
  id: string
  key: string
  name: string
  description: string
  moduleKeys: string[]
  createdAt: string
  updatedAt: string
}

export interface Contract {
  id: string
  clientId: string
  packageId: string
  status: ContractStatus
  name?: string
  value?: number
  billingCycle?: BillingCycle
  notes?: string
  startsAt: string
  endsAt?: string
  createdAt: string
  updatedAt: string
}

export interface ContractModule {
  contractId: string
  moduleKey: string
  enabled: boolean
}

export interface ContractDetails extends Contract {
  package: PackageDefinition | null
  modules: ContractModule[]
}

export interface PortalContractContext {
  contract: ContractDetails | null
  enabledModuleKeys: string[]
}

export interface Blueprint {
  id: string
  key: string
  name: string
  sector: string
  description: string
  moduleKeys: string[]
  pipelineTemplate?: BlueprintPipelineTemplate
  customFields?: BlueprintCustomField[]
  messageTemplates?: BlueprintMessageTemplate[]
  automationTemplates?: BlueprintAutomationTemplate[]
  reportPresets?: BlueprintReportPreset[]
  applicationRuns?: BlueprintApplicationRun[]
  createdAt: string
  updatedAt: string
}

export interface BlueprintPipelineTemplate {
  id?: string
  blueprintId?: string
  key: string
  name: string
  description?: string
  stages: BlueprintPipelineStage[]
}

export interface BlueprintPipelineStage {
  id?: string
  templateId?: string
  key: string
  name: string
  color?: string
  orderIndex: number
  isWon?: boolean
  isLost?: boolean
}

export interface BlueprintCustomField {
  id?: string
  blueprintId?: string
  key: string
  label: string
  fieldType: 'text' | 'number' | 'date' | 'select' | 'boolean'
  required?: boolean
  options?: string[]
}

export interface BlueprintMessageTemplate {
  id?: string
  blueprintId?: string
  key: string
  name: string
  channel: 'whatsapp' | 'email' | 'webchat'
  body: string
}

export interface BlueprintAutomationTemplate {
  id?: string
  blueprintId?: string
  key: string
  name: string
  triggerEvent: string
  draftPayload: Record<string, unknown>
}

export interface BlueprintReportPreset {
  id?: string
  blueprintId?: string
  key: string
  name: string
  metricKeys: string[]
}

export interface BlueprintApplicationRun {
  id: string
  blueprintId: string
  contractId: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  summary: Record<string, unknown>
  error?: string
  createdAt: string
  updatedAt: string
}

export interface BlueprintApplicationSummary {
  moduleCount: number
  stageCount: number
  customFieldCount: number
  messageTemplateCount: number
  automationTemplateCount: number
  reportPresetCount: number
}

export interface BlueprintApplicationInput {
  blueprintId: string
  contractId: string
  organizationId: string
}

export interface PlatformContext {
  mode: PlatformMode
  organization: Organization | null
  membership: Membership | null
  role: PlatformRole | null
  enabledModuleKeys: string[]
}
