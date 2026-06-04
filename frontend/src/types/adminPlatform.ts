export type PlatformProviderType =
  | 'llm'
  | 'email'
  | 'whatsapp'
  | 'ads'
  | 'webhook'
  | 'automation'
  | 'storage'
  | 'database'
  | 'internal_service'

export type PlatformProviderStatus =
  | 'not_configured'
  | 'active'
  | 'degraded'
  | 'failed'
  | 'disabled'
  | 'needs_reauth'
  | 'stale'

export type PlatformLimitStatus = 'ok' | 'near_limit' | 'over_limit' | 'blocked'

export type ClientModuleLimitSource = 'package' | 'contract' | 'manual_override'

export interface ClientModuleLimit {
  id: string
  organizationId: string
  contractId?: string | null
  moduleKey: string
  limitKey: string
  limitValue: number
  source: ClientModuleLimitSource
  effectiveFrom: string
  effectiveUntil?: string | null
  metadata: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

export interface PlatformProviderConnection {
  id: string
  providerType: PlatformProviderType
  providerKey: string
  displayName: string
  environment: string
  status: PlatformProviderStatus
  publicConfig: Record<string, unknown>
  secretReference?: string | null
  lastCheckedAt?: string | null
  lastError?: string | null
  isDefault: boolean
  fallbackProviderId?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ClientProviderSetting {
  id: string
  organizationId: string
  providerConnectionId: string
  moduleKey?: string | null
  status: PlatformProviderStatus
  publicConfig: Record<string, unknown>
  secretReference?: string | null
  limits: Record<string, unknown>
  inheritsGlobal: boolean
  lastCheckedAt?: string | null
  lastError?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface PlatformUsageCounter {
  id: string
  organizationId: string
  contractId?: string | null
  moduleKey: string
  resourceKey: string
  periodStart: string
  periodEnd: string
  usedValue: number
  limitValue?: number | null
  status: PlatformLimitStatus
  createdAt?: string
  updatedAt?: string
}

export interface PlatformAdminAuditEvent {
  id: string
  actorUserId?: string | null
  actorRole?: string | null
  eventType: string
  entityType: string
  entityId?: string | null
  organizationId?: string | null
  contractId?: string | null
  safeBefore: Record<string, unknown>
  safeAfter: Record<string, unknown>
  note?: string | null
  createdAt: string
}

export interface PlatformAdminHealthSummary {
  failingProviderCount: number
  degradedProviderCount: number
  staleProviderCount: number
  needsReauthProviderCount: number
  nearLimitCount: number
  overLimitCount: number
  blockedLimitCount: number
  recentAuditEventCount: number
}

export interface AdminHubSummary {
  clientCount: number
  activeContractCount: number
  activeModuleCount: number
  failingProviderCount: number
  nearLimitCount: number
}
