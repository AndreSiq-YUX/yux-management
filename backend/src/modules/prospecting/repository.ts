import type {
  ChannelPermissionStatus,
  ProspectingChannel,
  ProspectingEligibility,
  ProspectingPolicySnapshot,
  QuietHours,
} from './types.js'

export type Queryable = {
  query<TRow = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: TRow[]; rowCount?: number | null }>
}

type PolicyRow = {
  id: string
  organization_id: string
  crm_instance_id: string | null
  default_sequence_id: string | null
  whatsapp_connection_id: string | null
  enabled: boolean
  kill_switch: boolean
  require_human_first_contact: boolean
  require_whatsapp_permission: boolean
  require_template_outside_window: boolean
  daily_limit: number
  max_attempts_per_lead: number
  quiet_hours: unknown
  policy_version: string
  legal_reviewed_at: string | null
  legal_reviewed_by: string | null
}

export type ProspectingEligibilityInput = {
  organizationId: string
  leadId?: string
  opportunityId?: string
  channel: ProspectingChannel
  address?: string | null
  now?: Date
}

const defaultQuietHours: QuietHours = {
  timezone: 'America/Sao_Paulo',
  start: '20:00',
  end: '08:00',
}

const missingPolicySnapshot: ProspectingPolicySnapshot = {
  policyVersion: 'unconfigured',
  enabled: false,
  killSwitch: true,
  requireHumanFirstContact: true,
  requireWhatsappPermission: true,
  requireTemplateOutsideWindow: true,
  dailyLimit: 1,
  maxAttemptsPerLead: 1,
  quietHours: defaultQuietHours,
}

export async function getProspectingPolicy(pool: Queryable, organizationId: string) {
  const result = await pool.query<PolicyRow>(
    `SELECT id, organization_id, crm_instance_id, default_sequence_id, whatsapp_connection_id,
            enabled, kill_switch, require_human_first_contact, require_whatsapp_permission,
            require_template_outside_window, daily_limit, max_attempts_per_lead,
            quiet_hours, policy_version, legal_reviewed_at, legal_reviewed_by
     FROM public.prospecting_policies
     WHERE organization_id = $1
     LIMIT 1`,
    [organizationId],
  )
  return result.rows[0] ?? null
}

export async function resolveProspectingEligibility(
  pool: Queryable,
  input: ProspectingEligibilityInput,
): Promise<ProspectingEligibility> {
  const policyRow = await getProspectingPolicy(pool, input.organizationId)
  if (!policyRow) {
    return { allowed: false, blockedReasons: ['prospecting_policy_missing'], policy: missingPolicySnapshot }
  }

  const now = input.now ?? new Date()
  const policy = mapPolicySnapshot(policyRow)
  const blockedReasons: string[] = []
  const normalizedAddress = input.address ? normalizeChannelAddress(input.channel, input.address) : undefined

  if (!policyRow.enabled) blockedReasons.push('prospecting_policy_disabled')
  if (policyRow.kill_switch) blockedReasons.push('prospecting_kill_switch_active')
  if (!policyRow.legal_reviewed_at) blockedReasons.push('prospecting_legal_review_required')
  if (isInsideQuietHours(now, policy.quietHours)) blockedReasons.push('prospecting_quiet_hours')

  if (input.opportunityId) {
    const optOut = await pool.query<{ blocked: boolean }>(
      `SELECT TRUE AS blocked
       FROM public.radar_compliance_logs
       WHERE organization_id = $1 AND opportunity_id = $2 AND opt_out = TRUE
       LIMIT 1`,
      [input.organizationId, input.opportunityId],
    )
    if (optOut.rows[0]) blockedReasons.push('prospect_opted_out')
  }

  const daily = await pool.query<{ daily_count: number | string }>(
    `SELECT COUNT(*)::int AS daily_count
     FROM public.radar_outreach_events
     WHERE organization_id = $1
       AND event_type = 'contact_queued'
       AND occurred_at >= $2::timestamptz - INTERVAL '24 hours'`,
    [input.organizationId, now.toISOString()],
  )
  if (Number(daily.rows[0]?.daily_count ?? 0) >= policy.dailyLimit) blockedReasons.push('prospecting_daily_limit_reached')

  if (input.leadId) {
    const attempts = await pool.query<{ attempt_count: number | string }>(
      `SELECT COUNT(*)::int AS attempt_count
       FROM public.radar_outreach_events
       WHERE organization_id = $1 AND lead_id = $2
         AND event_type = 'contact_queued'`,
      [input.organizationId, input.leadId],
    )
    if (Number(attempts.rows[0]?.attempt_count ?? 0) >= policy.maxAttemptsPerLead) {
      blockedReasons.push('prospecting_lead_attempt_limit_reached')
    }
  }

  if (input.channel === 'email' || input.channel === 'whatsapp') {
    if (!normalizedAddress) {
      blockedReasons.push('channel_address_required')
    } else {
      const permission = await pool.query<{ status: ChannelPermissionStatus }>(
        `SELECT status
         FROM public.lead_channel_permissions
         WHERE organization_id = $1 AND channel = $2 AND address = $3
         LIMIT 1`,
        [input.organizationId, input.channel, normalizedAddress],
      )
      if (permission.rows[0]?.status === 'revoked') blockedReasons.push('channel_permission_revoked')
      if (!permission.rows[0] || permission.rows[0].status !== 'granted') blockedReasons.push('channel_permission_required')
    }
  }

  if (input.channel === 'whatsapp') {
    if (!policyRow.whatsapp_connection_id) {
      blockedReasons.push('whatsapp_connection_required')
    } else {
      const connection = await pool.query<{ id: string }>(
        `SELECT id
         FROM public.channel_connections
         WHERE id = $1 AND organization_id = $2 AND channel = 'whatsapp' AND is_active = TRUE
         LIMIT 1`,
        [policyRow.whatsapp_connection_id, input.organizationId],
      )
      if (!connection.rows[0]) blockedReasons.push('whatsapp_connection_inactive')
    }
  }

  return {
    allowed: blockedReasons.length === 0,
    blockedReasons: [...new Set(blockedReasons)],
    ...(normalizedAddress ? { normalizedAddress } : {}),
    policy,
  }
}

export async function recordChannelPermission(
  pool: Queryable,
  input: {
    organizationId: string
    leadId?: string | null
    channel: Exclude<ProspectingChannel, 'task'>
    address: string
    status: ChannelPermissionStatus
    source: string
    permissionCategory?: string
    noticeCode?: string | null
    noticeVersion?: string | null
    evidence?: Record<string, unknown>
    recordedBy?: string | null
    occurredAt?: Date
  },
) {
  const address = normalizeChannelAddress(input.channel, input.address)
  const occurredAt = (input.occurredAt ?? new Date()).toISOString()
  const result = await pool.query<{ id: string; status: ChannelPermissionStatus; address: string }>(
    `INSERT INTO public.lead_channel_permissions (
       organization_id, lead_id, channel, address, status, permission_category,
       source, notice_code, notice_version, evidence, granted_at, revoked_at, recorded_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (organization_id, channel, address) DO UPDATE SET
       lead_id = COALESCE(EXCLUDED.lead_id, public.lead_channel_permissions.lead_id),
       status = EXCLUDED.status,
       permission_category = EXCLUDED.permission_category,
       source = EXCLUDED.source,
       notice_code = EXCLUDED.notice_code,
       notice_version = EXCLUDED.notice_version,
       evidence = EXCLUDED.evidence,
       granted_at = EXCLUDED.granted_at,
       revoked_at = EXCLUDED.revoked_at,
       recorded_by = EXCLUDED.recorded_by,
       updated_at = NOW()
     RETURNING id, status, address`,
    [
      input.organizationId,
      input.leadId ?? null,
      input.channel,
      address,
      input.status,
      input.permissionCategory ?? 'commercial_prospecting',
      input.source,
      input.noticeCode ?? null,
      input.noticeVersion ?? null,
      input.evidence ?? {},
      input.status === 'granted' ? occurredAt : null,
      input.status === 'revoked' ? occurredAt : null,
      input.recordedBy ?? null,
    ],
  )
  return result.rows[0]
}

export function normalizeChannelAddress(channel: ProspectingChannel, address: string) {
  const value = address.trim()
  if (channel === 'email') return value.toLocaleLowerCase()
  if (channel === 'whatsapp' || channel === 'phone') {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 10 || digits.length === 11) return `55${digits}`
    return digits
  }
  return value
}

export function isInsideQuietHours(now: Date, quietHours: QuietHours) {
  const start = parseClock(quietHours.start)
  const end = parseClock(quietHours.end)
  if (start === null || end === null) return true

  let localMinutes: number
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: quietHours.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const hour = Number(parts.find(part => part.type === 'hour')?.value)
    const minute = Number(parts.find(part => part.type === 'minute')?.value)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return true
    localMinutes = hour * 60 + minute
  } catch {
    return true
  }

  if (start === end) return false
  if (start < end) return localMinutes >= start && localMinutes < end
  return localMinutes >= start || localMinutes < end
}

function mapPolicySnapshot(row: PolicyRow): ProspectingPolicySnapshot {
  return {
    policyId: row.id,
    policyVersion: row.policy_version,
    enabled: row.enabled,
    killSwitch: row.kill_switch,
    requireHumanFirstContact: true,
    requireWhatsappPermission: row.require_whatsapp_permission,
    requireTemplateOutsideWindow: row.require_template_outside_window,
    dailyLimit: Number(row.daily_limit),
    maxAttemptsPerLead: Number(row.max_attempts_per_lead),
    quietHours: parseQuietHours(row.quiet_hours),
    ...(row.legal_reviewed_at ? { legalReviewedAt: new Date(row.legal_reviewed_at).toISOString() } : {}),
  }
}

function parseQuietHours(value: unknown): QuietHours {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultQuietHours
  const record = value as Record<string, unknown>
  if (typeof record.timezone !== 'string' || typeof record.start !== 'string' || typeof record.end !== 'string') return defaultQuietHours
  return { timezone: record.timezone, start: record.start, end: record.end }
}

function parseClock(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}
