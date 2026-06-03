export type PlatformMode = 'internal' | 'portal'

export type OrganizationKind = 'yux' | 'client'

export type ContractStatus = 'draft' | 'active' | 'paused' | 'cancelled' | 'completed'

export type BillingCycle = 'one_time' | 'monthly' | 'quarterly' | 'yearly'

export interface Organization {
  id: string
  name: string
  slug: string
  kind: OrganizationKind
  createdAt: string
  updatedAt: string
}

export type PermissionKey =
  | 'platform.manage'
  | 'clients.read'
  | 'clients.write'
  | 'crm.read'
  | 'crm.write'
  | 'leads.read'
  | 'leads.write'
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
  createdAt: string
  updatedAt: string
}

export interface PlatformContext {
  mode: PlatformMode
  organization: Organization | null
  membership: Membership | null
  role: PlatformRole | null
  enabledModuleKeys: string[]
}
