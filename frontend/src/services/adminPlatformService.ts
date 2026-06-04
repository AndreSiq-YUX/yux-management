import { supabase } from '@/lib/supabase'
import { summarizeAdminHub } from '@/lib/platform/adminRules'
import type {
  ClientModuleLimit,
  ClientModuleLimitSource,
  PlatformAdminAuditEvent,
  PlatformLimitStatus,
  PlatformProviderConnection,
  PlatformProviderStatus,
  PlatformProviderType,
  PlatformUsageCounter,
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

export class AdminPlatformService {
  async getProviderConnections(): Promise<PlatformProviderConnection[]> {
    const { data, error } = await supabase
      .from('platform_provider_connections')
      .select('*')
      .order('provider_type')

    if (error) throw error
    return (data || []).map(mapProviderConnectionRow)
  }

  async getClientModuleLimits(organizationId?: string): Promise<ClientModuleLimit[]> {
    let query = supabase
      .from('client_module_limits')
      .select('*')
      .order('module_key')

    if (organizationId) query = query.eq('organization_id', organizationId)

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapClientModuleLimitRow)
  }

  async upsertClientModuleLimit(input: ClientModuleLimitInput): Promise<ClientModuleLimit> {
    const payload = buildClientModuleLimitPayload(input)
    let lookup = supabase
      .from('client_module_limits')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('module_key', input.moduleKey)
      .eq('limit_key', input.limitKey)

    lookup = input.contractId
      ? lookup.eq('contract_id', input.contractId)
      : lookup.is('contract_id', null)

    const existing = await lookup.maybeSingle()
    if (existing.error) throw existing.error

    const mutation = existing.data?.id
      ? supabase.from('client_module_limits').update(payload).eq('id', existing.data.id)
      : supabase.from('client_module_limits').insert(payload)

    const { data, error } = await mutation
      .select()
      .single()

    if (error) throw error
    return mapClientModuleLimitRow(data)
  }

  async getUsageCounters(organizationId?: string): Promise<PlatformUsageCounter[]> {
    let query = supabase
      .from('platform_usage_counters')
      .select('*')
      .order('period_end', { ascending: false })

    if (organizationId) query = query.eq('organization_id', organizationId)

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapUsageCounterRow)
  }

  async getAuditEvents(limit = 50): Promise<PlatformAdminAuditEvent[]> {
    const { data, error } = await supabase
      .from('platform_admin_audit_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return (data || []).map(mapAuditEventRow)
  }

  async recordAuditEvent(input: PlatformAdminAuditEventInput): Promise<PlatformAdminAuditEvent> {
    const { data, error } = await supabase
      .from('platform_admin_audit_events')
      .insert(buildAuditEventPayload(input))
      .select()
      .single()

    if (error) throw error
    return mapAuditEventRow(data)
  }

  async getAdminHubSummary() {
    const [clients, contracts, modules, providers, usage] = await Promise.all([
      supabase.from('organizations').select('id').eq('kind', 'client'),
      supabase.from('contracts').select('id, status'),
      supabase.from('contract_modules').select('module_key, enabled').eq('enabled', true),
      supabase.from('platform_provider_connections').select('id, status'),
      supabase.from('platform_usage_counters').select('id, status'),
    ])

    if (clients.error) throw clients.error
    if (contracts.error) throw contracts.error
    if (modules.error) throw modules.error
    if (providers.error) throw providers.error
    if (usage.error) throw usage.error

    return summarizeAdminHub({
      clients: clients.data || [],
      contracts: contracts.data || [],
      modules: (modules.data || []).map((item: any) => item.module_key),
      providers: providers.data || [],
      usage: usage.data || [],
    })
  }
}

export const adminPlatformService = new AdminPlatformService()
