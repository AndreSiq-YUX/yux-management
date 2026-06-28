import type pg from 'pg'

const numberValue = (value: number | string | null | undefined) => Number(value || 0)
const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
const isUndefinedTableError = (error: unknown) =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '42P01')

export type PlatformProviderConnectionInput = {
  id?: string
  providerType: string
  providerKey: string
  displayName: string
  environment?: string
  status?: string
  publicConfig?: Record<string, unknown>
  secretReference?: string | null
  isDefault?: boolean
  fallbackProviderId?: string | null
}

export type EmailProviderConnectionInput = {
  id?: string
  organizationId: string
  status?: string
  tokenReference?: string | null
  defaultFromEmail?: string | null
  defaultFromName?: string | null
  dailySendLimit?: number
  metadata?: Record<string, unknown>
}

export type Smtp2GoSubaccountInput = {
  id?: string
  organizationId: string
  connectionId: string
  smtp2goAccountId: string
  name: string
  monthlyQuota?: number
  dailySendLimit?: number
  status?: string
  metadata?: Record<string, unknown>
}

export type ClientModuleLimitInput = {
  id?: string
  organizationId: string
  contractId?: string | null
  moduleKey: string
  limitKey: string
  limitValue: number
  source?: string
  effectiveFrom?: string
  effectiveUntil?: string | null
  metadata?: Record<string, unknown>
}

export type PlatformAdminAuditEventInput = {
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

export async function getProviderConnections(pool: pg.Pool) {
  const result = await pool.query(
    `SELECT id, provider_type, provider_key, display_name, environment, status, public_config,
            secret_reference, last_checked_at, last_error, is_default, fallback_provider_id, created_at, updated_at
     FROM public.platform_provider_connections
     ORDER BY provider_type ASC, provider_key ASC`,
  )

  return result.rows.map(mapProviderConnection)
}

export async function upsertProviderConnection(pool: pg.Pool, input: PlatformProviderConnectionInput) {
  const result = await pool.query(
    `INSERT INTO public.platform_provider_connections (
       id, provider_type, provider_key, display_name, environment, status, public_config,
       secret_reference, is_default, fallback_provider_id, updated_at
     )
     VALUES (
       COALESCE($1::uuid, gen_random_uuid()), $2::public.platform_provider_type, $3, $4, $5,
       $6::public.platform_provider_status, $7::jsonb, $8, $9, $10::uuid, NOW()
     )
     ON CONFLICT (provider_type, provider_key, environment) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       status = EXCLUDED.status,
       public_config = EXCLUDED.public_config,
       secret_reference = EXCLUDED.secret_reference,
       is_default = EXCLUDED.is_default,
       fallback_provider_id = EXCLUDED.fallback_provider_id,
       updated_at = NOW()
     RETURNING id, provider_type, provider_key, display_name, environment, status, public_config,
       secret_reference, last_checked_at, last_error, is_default, fallback_provider_id, created_at, updated_at`,
    [
      input.id ?? null,
      input.providerType,
      input.providerKey.trim(),
      input.displayName.trim(),
      input.environment?.trim() || 'production',
      input.status || 'not_configured',
      JSON.stringify(input.publicConfig ?? {}),
      input.secretReference?.trim() || null,
      Boolean(input.isDefault),
      input.fallbackProviderId ?? null,
    ],
  )

  return mapProviderConnection(result.rows[0])
}

export async function getEmailProviderConnections(pool: pg.Pool) {
  const result = await pool.query(
    `SELECT id, organization_id, provider, status, token_reference, default_from_email, default_from_name,
            daily_send_limit, last_verified_at, protected_error, metadata, created_at, updated_at
     FROM public.email_provider_connections
     ORDER BY created_at DESC`,
  )

  return result.rows.map(mapEmailProviderConnection)
}

export async function getSmtp2GoSubaccounts(pool: pg.Pool) {
  let result: pg.QueryResult

  try {
    result = await pool.query(
      `SELECT id, organization_id, connection_id, smtp2go_account_id, name, monthly_quota,
              daily_send_limit, status, metadata, created_at, updated_at
       FROM public.smtp2go_subaccounts
       ORDER BY created_at DESC`,
    )
  } catch (error) {
    if (isUndefinedTableError(error)) return []
    throw error
  }

  return result.rows.map(mapSmtp2GoSubaccount)
}

export async function upsertEmailProviderConnection(pool: pg.Pool, input: EmailProviderConnectionInput) {
  const result = await pool.query(
    `INSERT INTO public.email_provider_connections (
       id, organization_id, provider, status, token_reference, default_from_email, default_from_name,
       daily_send_limit, metadata, updated_at
     )
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, 'smtp2go', $3, $4, $5, $6, $7, $8::jsonb, NOW())
     ON CONFLICT (organization_id, provider) DO UPDATE SET
       status = EXCLUDED.status,
       token_reference = EXCLUDED.token_reference,
       default_from_email = EXCLUDED.default_from_email,
       default_from_name = EXCLUDED.default_from_name,
       daily_send_limit = EXCLUDED.daily_send_limit,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id, organization_id, provider, status, token_reference, default_from_email, default_from_name,
       daily_send_limit, last_verified_at, protected_error, metadata, created_at, updated_at`,
    [
      input.id ?? null,
      input.organizationId,
      input.status || 'needs_setup',
      input.tokenReference?.trim() || null,
      input.defaultFromEmail?.trim() || null,
      input.defaultFromName?.trim() || null,
      input.dailySendLimit ?? 500,
      JSON.stringify(input.metadata ?? {}),
    ],
  )

  return mapEmailProviderConnection(result.rows[0])
}

export async function upsertSmtp2GoSubaccount(pool: pg.Pool, input: Smtp2GoSubaccountInput) {
  const result = await pool.query(
    `INSERT INTO public.smtp2go_subaccounts (
       id, organization_id, connection_id, smtp2go_account_id, name, monthly_quota,
       daily_send_limit, status, metadata, updated_at
     )
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
     ON CONFLICT (connection_id, smtp2go_account_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       name = EXCLUDED.name,
       monthly_quota = EXCLUDED.monthly_quota,
       daily_send_limit = EXCLUDED.daily_send_limit,
       status = EXCLUDED.status,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id, organization_id, connection_id, smtp2go_account_id, name, monthly_quota,
       daily_send_limit, status, metadata, created_at, updated_at`,
    [
      input.id ?? null,
      input.organizationId,
      input.connectionId,
      input.smtp2goAccountId.trim(),
      input.name.trim(),
      input.monthlyQuota ?? 0,
      input.dailySendLimit ?? 500,
      input.status || 'active',
      JSON.stringify(input.metadata ?? {}),
    ],
  )

  return mapSmtp2GoSubaccount(result.rows[0])
}

export async function getClientModuleLimits(pool: pg.Pool, organizationId?: string) {
  const result = await pool.query(
    `SELECT id, organization_id, contract_id, module_key, limit_key, limit_value, source,
            effective_from, effective_until, metadata, created_at, updated_at
     FROM public.client_module_limits
     WHERE ($1::uuid IS NULL OR organization_id = $1)
     ORDER BY module_key ASC, limit_key ASC`,
    [organizationId ?? null],
  )

  return result.rows.map(mapClientModuleLimit)
}

export async function upsertClientModuleLimit(pool: pg.Pool, input: ClientModuleLimitInput) {
  const payload = [
    input.organizationId,
    input.contractId ?? null,
    input.moduleKey,
    input.limitKey,
    input.limitValue,
    input.source || 'contract',
    input.effectiveFrom ?? new Date().toISOString().slice(0, 10),
    input.effectiveUntil ?? null,
    JSON.stringify(input.metadata ?? {}),
  ]

  const existing = await pool.query<{ id: string }>(
    `SELECT id
     FROM public.client_module_limits
     WHERE organization_id = $1
       AND (($2::uuid IS NULL AND contract_id IS NULL) OR contract_id = $2)
       AND module_key = $3
       AND limit_key = $4
     LIMIT 1`,
    [input.organizationId, input.contractId ?? null, input.moduleKey, input.limitKey],
  )

  const result = existing.rows[0]?.id
    ? await pool.query(
        `UPDATE public.client_module_limits
         SET organization_id = $1,
             contract_id = $2,
             module_key = $3,
             limit_key = $4,
             limit_value = $5,
             source = $6,
             effective_from = $7,
             effective_until = $8,
             metadata = $9::jsonb,
             updated_at = NOW()
         WHERE id = $10
         RETURNING id, organization_id, contract_id, module_key, limit_key, limit_value, source,
           effective_from, effective_until, metadata, created_at, updated_at`,
        [...payload, existing.rows[0].id],
      )
    : await pool.query(
        `INSERT INTO public.client_module_limits (
           organization_id, contract_id, module_key, limit_key, limit_value, source,
           effective_from, effective_until, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         RETURNING id, organization_id, contract_id, module_key, limit_key, limit_value, source,
           effective_from, effective_until, metadata, created_at, updated_at`,
        payload,
      )

  return mapClientModuleLimit(result.rows[0])
}

export async function getUsageCounters(pool: pg.Pool, organizationId?: string) {
  const result = await pool.query(
    `SELECT id, organization_id, contract_id, module_key, resource_key, period_start, period_end,
            used_value, limit_value, status, created_at, updated_at
     FROM public.platform_usage_counters
     WHERE ($1::uuid IS NULL OR organization_id = $1)
     ORDER BY period_end DESC`,
    [organizationId ?? null],
  )

  return result.rows.map(mapUsageCounter)
}

export async function getAuditEvents(pool: pg.Pool, limit = 50) {
  const result = await pool.query(
    `SELECT id, actor_user_id, actor_role, event_type, entity_type, entity_id,
            organization_id, contract_id, safe_before, safe_after, note, created_at
     FROM public.platform_admin_audit_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  )

  return result.rows.map(mapAuditEvent)
}

export async function recordAuditEvent(pool: pg.Pool, input: PlatformAdminAuditEventInput) {
  const result = await pool.query(
    `INSERT INTO public.platform_admin_audit_events (
       actor_user_id, actor_role, event_type, entity_type, entity_id,
       organization_id, contract_id, safe_before, safe_after, note
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
     RETURNING id, actor_user_id, actor_role, event_type, entity_type, entity_id,
       organization_id, contract_id, safe_before, safe_after, note, created_at`,
    [
      input.actorUserId ?? null,
      input.actorRole ?? null,
      input.eventType,
      input.entityType,
      input.entityId ?? null,
      input.organizationId ?? null,
      input.contractId ?? null,
      JSON.stringify(input.safeBefore ?? {}),
      JSON.stringify(input.safeAfter ?? {}),
      input.note ?? null,
    ],
  )

  return mapAuditEvent(result.rows[0])
}

export async function getAdminChannelConnections(pool: pg.Pool) {
  const result = await pool.query(
    `SELECT c.id, c.organization_id, o.name AS organization_name, c.channel, c.name,
            c.provider_account_id, c.provider_display_name, c.health_status, c.token_state,
            c.provider_verify_state, c.last_event_at
     FROM public.channel_connections c
     LEFT JOIN public.organizations o ON o.id = c.organization_id
     WHERE c.channel = ANY($1::text[])
     ORDER BY c.updated_at DESC`,
    [['whatsapp', 'instagram', 'messenger']],
  )

  return result.rows.map((row) => ({
    id: row.id,
    organizationName: row.organization_name ?? row.organization_id,
    channel: row.channel,
    displayName: row.provider_display_name ?? row.name,
    providerAccountId: row.provider_account_id ?? undefined,
    healthStatus: row.health_status ?? 'not_configured',
    tokenState: row.token_state ?? undefined,
    providerVerifyState: row.provider_verify_state ?? undefined,
    lastEventAt: row.last_event_at ?? undefined,
  }))
}

export async function getAdminHubSummary(pool: pg.Pool) {
  const [clients, contracts, modules, providers, usage] = await Promise.all([
    pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM public.organizations WHERE kind = 'client'"),
    pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM public.contracts WHERE status = 'active'"),
    pool.query<{ count: string }>('SELECT COUNT(DISTINCT module_key) AS count FROM public.contract_modules WHERE enabled = TRUE'),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM public.platform_provider_connections
       WHERE status = ANY($1::public.platform_provider_status[])`,
      [['degraded', 'failed', 'needs_reauth', 'stale']],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM public.platform_usage_counters
       WHERE status = ANY($1::text[])`,
      [['near_limit', 'over_limit', 'blocked']],
    ),
  ])

  return {
    clientCount: Number(clients.rows[0]?.count ?? 0),
    activeContractCount: Number(contracts.rows[0]?.count ?? 0),
    activeModuleCount: Number(modules.rows[0]?.count ?? 0),
    failingProviderCount: Number(providers.rows[0]?.count ?? 0),
    nearLimitCount: Number(usage.rows[0]?.count ?? 0),
  }
}

export async function getSmtp2GoSummary(pool: pg.Pool, today = new Date().toISOString().slice(0, 10)) {
  const [connections, subaccounts, usage, suppressions] = await Promise.all([
    queryCountOrZero(pool, 'SELECT COUNT(*) AS count FROM public.email_provider_connections'),
    queryCountOrZero(pool, 'SELECT COUNT(*) AS count FROM public.smtp2go_subaccounts'),
    queryUsageOrZero(
      pool,
      `SELECT COALESCE(SUM(sent_count), 0) AS sent_today,
              COALESCE(SUM(failed_count), 0) AS failed_today
       FROM public.email_usage_counters
       WHERE period_date = $1`,
      [today],
    ),
    queryCountOrZero(pool, 'SELECT COUNT(*) AS count FROM public.email_suppression_entries'),
  ])

  return {
    connectionCount: connections,
    subaccountCount: subaccounts,
    sentToday: numberValue(usage.sentToday),
    failedToday: numberValue(usage.failedToday),
    suppressedCount: suppressions,
  }
}

async function queryCountOrZero(pool: pg.Pool, sql: string, params: unknown[] = []) {
  try {
    const result = await pool.query<{ count: string }>(sql, params)
    return Number(result.rows[0]?.count ?? 0)
  } catch (error) {
    if (isUndefinedTableError(error)) return 0
    throw error
  }
}

async function queryUsageOrZero(pool: pg.Pool, sql: string, params: unknown[] = []) {
  try {
    const result = await pool.query<{ sent_today: string | number | null; failed_today: string | number | null }>(sql, params)
    return {
      sentToday: result.rows[0]?.sent_today ?? 0,
      failedToday: result.rows[0]?.failed_today ?? 0,
    }
  } catch (error) {
    if (isUndefinedTableError(error)) return { sentToday: 0, failedToday: 0 }
    throw error
  }
}

export async function getGlobalUploadLimit(pool: pg.Pool) {
  const result = await pool.query<{ value: Record<string, unknown> | null }>(
    `SELECT value
     FROM public.system_config
     WHERE key = 'global_max_upload_size_mb'
     LIMIT 1`,
  )

  const limit = result.rows[0]?.value?.limit
  return numberValue(typeof limit === 'string' || typeof limit === 'number' ? limit : null) || 10
}

export async function updateGlobalUploadLimit(pool: pg.Pool, limit: number) {
  await pool.query(
    `INSERT INTO public.system_config (key, value, updated_at)
     VALUES ('global_max_upload_size_mb', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify({ limit })],
  )
}

export async function getOrganizationsWithLimits(pool: pg.Pool) {
  const result = await pool.query<{
    id: string
    name: string
    slug: string
    max_upload_size_mb: number | string | null
  }>(
    `SELECT o.id, o.name, o.slug, s.max_upload_size_mb
     FROM public.organizations o
     LEFT JOIN public.omnichannel_settings s ON s.organization_id = o.id
     WHERE o.kind = 'client'
     ORDER BY o.name ASC`,
  )

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    limit: row.max_upload_size_mb === null || row.max_upload_size_mb === undefined ? null : numberValue(row.max_upload_size_mb),
  }))
}

export async function updateClientUploadLimit(pool: pg.Pool, organizationId: string, limit: number) {
  await pool.query(
    `INSERT INTO public.omnichannel_settings (
       organization_id, max_upload_size_mb, default_response_mode, retention_months,
       attachment_retention_months, anonymize_on_retention, crm_sync_filters, business_hours,
       ai_token_prices, updated_at
     )
     VALUES ($1, $2, 'assisted', 12, 12, FALSE, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, NOW())
     ON CONFLICT (organization_id) DO UPDATE SET
       max_upload_size_mb = EXCLUDED.max_upload_size_mb,
       updated_at = NOW()`,
    [organizationId, limit],
  )
}

function mapProviderConnection(row: any) {
  return {
    id: row.id,
    providerType: row.provider_type,
    providerKey: row.provider_key,
    displayName: row.display_name,
    environment: row.environment,
    status: row.status,
    publicConfig: objectValue(row.public_config),
    secretReference: row.secret_reference ?? null,
    lastCheckedAt: row.last_checked_at ?? null,
    lastError: row.last_error ?? null,
    isDefault: Boolean(row.is_default),
    fallbackProviderId: row.fallback_provider_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapEmailProviderConnection(row: any) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: row.provider,
    status: row.status,
    tokenReference: row.token_reference ?? null,
    defaultFromEmail: row.default_from_email ?? null,
    defaultFromName: row.default_from_name ?? null,
    dailySendLimit: numberValue(row.daily_send_limit),
    lastVerifiedAt: row.last_verified_at ?? null,
    protectedError: row.protected_error ?? null,
    metadata: objectValue(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSmtp2GoSubaccount(row: any) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    connectionId: row.connection_id,
    smtp2goAccountId: row.smtp2go_account_id,
    name: row.name,
    monthlyQuota: numberValue(row.monthly_quota),
    dailySendLimit: numberValue(row.daily_send_limit),
    status: row.status,
    metadata: objectValue(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapClientModuleLimit(row: any) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    contractId: row.contract_id ?? null,
    moduleKey: row.module_key,
    limitKey: row.limit_key,
    limitValue: numberValue(row.limit_value),
    source: row.source,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until ?? null,
    metadata: objectValue(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapUsageCounter(row: any) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    contractId: row.contract_id ?? null,
    moduleKey: row.module_key,
    resourceKey: row.resource_key,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    usedValue: numberValue(row.used_value),
    limitValue: row.limit_value === null || row.limit_value === undefined ? null : numberValue(row.limit_value),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAuditEvent(row: any) {
  return {
    id: row.id,
    actorUserId: row.actor_user_id ?? null,
    actorRole: row.actor_role ?? null,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id ?? null,
    organizationId: row.organization_id ?? null,
    contractId: row.contract_id ?? null,
    safeBefore: objectValue(row.safe_before),
    safeAfter: objectValue(row.safe_after),
    note: row.note ?? null,
    createdAt: row.created_at,
  }
}
