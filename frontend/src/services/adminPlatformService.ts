import { supabase } from '@/lib/supabase'
import { summarizeAdminHub } from '@/lib/platform/adminRules'
import type {
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

export class AdminPlatformService {
  async getProviderConnections(): Promise<PlatformProviderConnection[]> {
    const { data, error } = await supabase
      .from('platform_provider_connections')
      .select('*')
      .order('provider_type')

    if (error) throw error
    return (data || []).map(mapProviderConnectionRow)
  }

  async upsertProviderConnection(input: PlatformProviderConnectionInput): Promise<PlatformProviderConnection> {
    const { data, error } = await supabase
      .from('platform_provider_connections')
      .upsert(buildProviderConnectionPayload(input), { onConflict: 'provider_type,provider_key,environment' })
      .select()
      .single()

    if (error) throw error
    return mapProviderConnectionRow(data)
  }

  async getEmailProviderConnections(): Promise<EmailProviderConnection[]> {
    const { data, error } = await supabase
      .from('email_provider_connections')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []).map(mapEmailProviderConnectionRow)
  }

  async upsertEmailProviderConnection(input: EmailProviderConnectionInput): Promise<EmailProviderConnection> {
    const { data, error } = await supabase
      .from('email_provider_connections')
      .upsert(buildEmailProviderConnectionPayload(input), { onConflict: 'organization_id,provider' })
      .select()
      .single()

    if (error) throw error
    return mapEmailProviderConnectionRow(data)
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

  async getSmtp2GoSummary(): Promise<Smtp2GoAdminSummary> {
    const today = new Date().toISOString().slice(0, 10)
    const [connections, subaccounts, usage, suppressions] = await Promise.all([
      supabase.from('email_provider_connections').select('id', { count: 'exact', head: true }),
      supabase.from('smtp2go_subaccounts').select('id', { count: 'exact', head: true }),
      supabase.from('email_usage_counters').select('sent_count, failed_count').eq('period_date', today),
      supabase.from('email_suppression_entries').select('id', { count: 'exact', head: true }),
    ])

    if (connections.error) throw connections.error
    if (subaccounts.error) throw subaccounts.error
    if (usage.error) throw usage.error
    if (suppressions.error) throw suppressions.error

    return {
      connectionCount: connections.count || 0,
      subaccountCount: subaccounts.count || 0,
      sentToday: (usage.data || []).reduce((sum: number, row: any) => sum + numberValue(row.sent_count), 0),
      failedToday: (usage.data || []).reduce((sum: number, row: any) => sum + numberValue(row.failed_count), 0),
      suppressedCount: suppressions.count || 0,
    }
  }

  async getGlobalUploadLimit(): Promise<number> {
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'global_max_upload_size_mb')
      .maybeSingle()

    if (error || !data || !data.value) return 10
    return Number((data.value as any).limit || 10)
  }

  async updateGlobalUploadLimit(limit: number): Promise<void> {
    const { error } = await supabase
      .from('system_config')
      .upsert({
        key: 'global_max_upload_size_mb',
        value: { limit },
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' })

    if (error) throw error
  }

  async getOrganizationsWithLimits(): Promise<Array<{ id: string; name: string; slug: string; limit: number | null }>> {
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('kind', 'client')
      .order('name')
    if (orgsError) throw orgsError

    const { data: settings, error: settingsError } = await supabase
      .from('omnichannel_settings')
      .select('organization_id, max_upload_size_mb')
    if (settingsError) throw settingsError

    const settingsMap = new Map(settings?.map(s => [s.organization_id, s.max_upload_size_mb]))

    return (orgs || []).map(org => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      limit: settingsMap.get(org.id) ?? null
    }))
  }

  async updateClientUploadLimit(organizationId: string, limit: number): Promise<void> {
    const { data: existing, error: findError } = await supabase
      .from('omnichannel_settings')
      .select('organization_id')
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (findError) throw findError

    if (existing) {
      const { error } = await supabase
        .from('omnichannel_settings')
        .update({ max_upload_size_mb: limit, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('omnichannel_settings')
        .insert({
          organization_id: organizationId,
          max_upload_size_mb: limit,
          default_response_mode: 'assisted',
          retention_months: 12,
          attachment_retention_months: 12,
          anonymize_on_retention: false,
          crm_sync_filters: {},
          business_hours: {},
          ai_token_prices: {}
        })
      if (error) throw error
    }
  }
}

export const adminPlatformService = new AdminPlatformService()
