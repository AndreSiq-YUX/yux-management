import { apiRequest } from '@/lib/apiClient'
import type {
  AdminHubSummary,
  ClientModuleLimit,
  ClientModuleLimitSource,
  EmailProviderConnection,
  EmailProviderConnectionStatus,
  PlatformAdminAuditEvent,
  PlatformLimitStatus,
  PlatformProviderConnection,
  PlatformProviderStatus,
  PlatformProviderType,
  PlatformUsageCounter,
  Smtp2GoAdminSummary,
  Smtp2GoSubaccount,
  Smtp2GoSubaccountStatus,
} from '@/types/adminPlatform'

const numberValue = (value: number | string | null | undefined) => Number(value || 0)
const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export interface ClientModuleLimitInput {
  id?: string
  organizationId: string
  contractId?: string | null
  moduleKey: string
  limitKey: string
  limitValue: number
  source?: ClientModuleLimitSource
  effectiveFrom?: string
  effectiveUntil?: string | null
  metadata?: Record<string, unknown>
}

export interface PlatformAdminAuditEventInput {
  actorUserId?: string | null
  actorRole?: string | null
  eventType: string
  entityType: string
  entityId?: string | null
  organizationId?: string | null
  contractId?: string | null
  safeBefore?: Record<string, unknown>
  safeAfter?: Record<string, unknown>
  note?: string | null
}

export interface PlatformProviderConnectionInput {
  id?: string
  providerType: PlatformProviderType
  providerKey: string
  displayName: string
  environment?: string
  status?: PlatformProviderStatus
  publicConfig?: Record<string, unknown>
  secretReference?: string | null
  isDefault?: boolean
  fallbackProviderId?: string | null
}

export interface EmailProviderConnectionInput {
  id?: string
  organizationId: string
  status?: EmailProviderConnectionStatus
  tokenReference?: string | null
  defaultFromEmail?: string | null
  defaultFromName?: string | null
  dailySendLimit?: number
  metadata?: Record<string, unknown>
}

export interface Smtp2GoSubaccountInput {
  id?: string
  organizationId: string
  connectionId: string
  smtp2goAccountId: string
  name: string
  monthlyQuota?: number
  dailySendLimit?: number
  status?: Smtp2GoSubaccountStatus
  metadata?: Record<string, unknown>
}

export interface AdminChannelConnectionRow {
  id: string
  organizationName: string
  channel: string
  displayName: string
  providerAccountId?: string
  healthStatus: string
  tokenState?: string
  providerVerifyState?: string
  lastEventAt?: string
}

export function mapProviderConnectionRow(row: any): PlatformProviderConnection {
  return {
    id: row.id,
    providerType: row.provider_type as PlatformProviderType,
    providerKey: row.provider_key,
    displayName: row.display_name,
    environment: row.environment,
    status: row.status as PlatformProviderStatus,
    publicConfig: objectValue(row.public_config),
    secretReference: row.secret_reference || null,
    lastCheckedAt: row.last_checked_at || null,
    lastError: row.last_error || null,
    isDefault: Boolean(row.is_default),
    fallbackProviderId: row.fallback_provider_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapEmailProviderConnectionRow(row: any): EmailProviderConnection {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: row.provider,
    status: row.status as EmailProviderConnectionStatus,
    tokenReference: row.token_reference || null,
    defaultFromEmail: row.default_from_email || null,
    defaultFromName: row.default_from_name || null,
    dailySendLimit: numberValue(row.daily_send_limit),
    lastVerifiedAt: row.last_verified_at || null,
    protectedError: row.protected_error || null,
    metadata: objectValue(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapSmtp2GoSubaccountRow(row: any): Smtp2GoSubaccount {
  return {
    id: row.id,
    organizationId: row.organization_id || row.organizationId,
    connectionId: row.connection_id || row.connectionId,
    smtp2goAccountId: row.smtp2go_account_id || row.smtp2goAccountId,
    name: row.name,
    monthlyQuota: numberValue(row.monthly_quota ?? row.monthlyQuota),
    dailySendLimit: numberValue(row.daily_send_limit ?? row.dailySendLimit),
    status: row.status as Smtp2GoSubaccountStatus,
    metadata: objectValue(row.metadata),
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  }
}

export function mapClientModuleLimitRow(row: any): ClientModuleLimit {
  return {
    id: row.id,
    organizationId: row.organization_id,
    contractId: row.contract_id || null,
    moduleKey: row.module_key,
    limitKey: row.limit_key,
    limitValue: numberValue(row.limit_value),
    source: row.source as ClientModuleLimitSource,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until || null,
    metadata: objectValue(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapUsageCounterRow(row: any): PlatformUsageCounter {
  return {
    id: row.id,
    organizationId: row.organization_id,
    contractId: row.contract_id || null,
    moduleKey: row.module_key,
    resourceKey: row.resource_key,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    usedValue: numberValue(row.used_value),
    limitValue: row.limit_value === null || row.limit_value === undefined ? null : numberValue(row.limit_value),
    status: row.status as PlatformLimitStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapAuditEventRow(row: any): PlatformAdminAuditEvent {
  return {
    id: row.id,
    actorUserId: row.actor_user_id || null,
    actorRole: row.actor_role || null,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id || null,
    organizationId: row.organization_id || null,
    contractId: row.contract_id || null,
    safeBefore: objectValue(row.safe_before),
    safeAfter: objectValue(row.safe_after),
    note: row.note || null,
    createdAt: row.created_at,
  }
}

export function mapAdminChannelConnectionRow(row: any): AdminChannelConnectionRow {
  return {
    id: row.id,
    organizationName: row.organizations?.name || row.organization_id,
    channel: row.channel,
    displayName: row.provider_display_name || row.name,
    providerAccountId: row.provider_account_id || undefined,
    healthStatus: row.health_status || 'not_configured',
    tokenState: row.token_state || undefined,
    providerVerifyState: row.provider_verify_state || undefined,
    lastEventAt: row.last_event_at || undefined,
  }
}

export function buildClientModuleLimitPayload(input: ClientModuleLimitInput) {
  return {
    ...(input.id ? { id: input.id } : {}),
    organization_id: input.organizationId,
    contract_id: input.contractId || null,
    module_key: input.moduleKey,
    limit_key: input.limitKey,
    limit_value: input.limitValue,
    source: input.source || 'contract',
    effective_from: input.effectiveFrom || new Date().toISOString().slice(0, 10),
    effective_until: input.effectiveUntil || null,
    metadata: input.metadata || {},
  }
}

export function buildAuditEventPayload(input: PlatformAdminAuditEventInput) {
  return {
    actor_user_id: input.actorUserId || null,
    actor_role: input.actorRole || null,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId || null,
    organization_id: input.organizationId || null,
    contract_id: input.contractId || null,
    safe_before: input.safeBefore || {},
    safe_after: input.safeAfter || {},
    note: input.note || null,
  }
}

export function buildProviderConnectionPayload(input: PlatformProviderConnectionInput) {
  return {
    ...(input.id ? { id: input.id } : {}),
    provider_type: input.providerType,
    provider_key: input.providerKey.trim(),
    display_name: input.displayName.trim(),
    environment: input.environment?.trim() || 'production',
    status: input.status || 'not_configured',
    public_config: input.publicConfig || {},
    secret_reference: input.secretReference?.trim() || null,
    is_default: Boolean(input.isDefault),
    fallback_provider_id: input.fallbackProviderId || null,
  }
}

export function buildEmailProviderConnectionPayload(input: EmailProviderConnectionInput) {
  return {
    ...(input.id ? { id: input.id } : {}),
    organization_id: input.organizationId,
    provider: 'smtp2go',
    status: input.status || 'needs_setup',
    token_reference: input.tokenReference?.trim() || null,
    default_from_email: input.defaultFromEmail?.trim() || null,
    default_from_name: input.defaultFromName?.trim() || null,
    daily_send_limit: input.dailySendLimit ?? 500,
    metadata: input.metadata || {},
  }
}

export function buildSmtp2GoSubaccountPayload(input: Smtp2GoSubaccountInput) {
  return {
    ...(input.id ? { id: input.id } : {}),
    organization_id: input.organizationId,
    connection_id: input.connectionId,
    smtp2go_account_id: input.smtp2goAccountId.trim(),
    name: input.name.trim(),
    monthly_quota: input.monthlyQuota ?? 0,
    daily_send_limit: input.dailySendLimit ?? 500,
    status: input.status || 'active',
    metadata: input.metadata || {},
  }
}

export class AdminPlatformService {
  async getProviderConnections(): Promise<PlatformProviderConnection[]> {
    return apiRequest<PlatformProviderConnection[]>('/platform/admin/provider-connections')
  }

  async upsertProviderConnection(input: PlatformProviderConnectionInput): Promise<PlatformProviderConnection> {
    return apiRequest<PlatformProviderConnection>('/platform/admin/provider-connections', {
      method: 'POST',
      body: input,
    })
  }

  async getEmailProviderConnections(): Promise<EmailProviderConnection[]> {
    return apiRequest<EmailProviderConnection[]>('/platform/admin/email-provider-connections')
  }

  async upsertEmailProviderConnection(input: EmailProviderConnectionInput): Promise<EmailProviderConnection> {
    return apiRequest<EmailProviderConnection>('/platform/admin/email-provider-connections', {
      method: 'POST',
      body: input,
    })
  }

  async getSmtp2GoSubaccounts(): Promise<Smtp2GoSubaccount[]> {
    return apiRequest<Smtp2GoSubaccount[]>('/platform/admin/smtp2go-subaccounts')
  }

  async upsertSmtp2GoSubaccount(input: Smtp2GoSubaccountInput): Promise<Smtp2GoSubaccount> {
    return apiRequest<Smtp2GoSubaccount>('/platform/admin/smtp2go-subaccounts', {
      method: 'POST',
      body: input,
    })
  }

  async getClientModuleLimits(organizationId?: string): Promise<ClientModuleLimit[]> {
    const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''
    return apiRequest<ClientModuleLimit[]>(`/platform/admin/client-module-limits${query}`)
  }

  async upsertClientModuleLimit(input: ClientModuleLimitInput): Promise<ClientModuleLimit> {
    return apiRequest<ClientModuleLimit>('/platform/admin/client-module-limits', {
      method: 'POST',
      body: input,
    })
  }

  async getUsageCounters(organizationId?: string): Promise<PlatformUsageCounter[]> {
    const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''
    return apiRequest<PlatformUsageCounter[]>(`/platform/admin/usage-counters${query}`)
  }

  async getAuditEvents(limit = 50): Promise<PlatformAdminAuditEvent[]> {
    return apiRequest<PlatformAdminAuditEvent[]>(`/platform/admin/audit-events?limit=${encodeURIComponent(String(limit))}`)
  }

  async getAdminChannelConnections(): Promise<AdminChannelConnectionRow[]> {
    return apiRequest<AdminChannelConnectionRow[]>('/platform/admin/channel-connections')
  }

  async recordAuditEvent(input: PlatformAdminAuditEventInput): Promise<PlatformAdminAuditEvent> {
    return apiRequest<PlatformAdminAuditEvent>('/platform/admin/audit-events', {
      method: 'POST',
      body: input,
    })
  }

  async getAdminHubSummary(): Promise<AdminHubSummary> {
    return apiRequest<AdminHubSummary>('/platform/admin/hub-summary')
  }

  async getSmtp2GoSummary(): Promise<Smtp2GoAdminSummary> {
    return apiRequest<Smtp2GoAdminSummary>('/platform/admin/smtp2go-summary')
  }

  async getGlobalUploadLimit(): Promise<number> {
    const response = await apiRequest<{ limit: number }>('/platform/admin/upload-limit/global')
    return response.limit
  }

  async updateGlobalUploadLimit(limit: number): Promise<void> {
    await apiRequest('/platform/admin/upload-limit/global', {
      method: 'PUT',
      body: { limit },
    })
  }

  async getOrganizationsWithLimits(): Promise<Array<{ id: string; name: string; slug: string; limit: number | null }>> {
    return apiRequest<Array<{ id: string; name: string; slug: string; limit: number | null }>>(
      '/platform/admin/upload-limit/organizations',
    )
  }

  async updateClientUploadLimit(organizationId: string, limit: number): Promise<void> {
    await apiRequest(`/platform/admin/upload-limit/organizations/${organizationId}`, {
      method: 'PUT',
      body: { limit },
    })
  }
}

export const adminPlatformService = new AdminPlatformService()
