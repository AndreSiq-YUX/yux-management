import { createHash, randomBytes } from 'node:crypto'
import type pg from 'pg'
import { storeProviderSecretToPool } from '../../lib/edge-compat/providerSecrets.js'

const whatsappScopes = ['whatsapp_business_management', 'whatsapp_business_messaging'] as const
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ResponseMode = 'automatic' | 'assisted' | 'manual'

export type VerifiedWhatsAppConnection = {
  organizationId: string
  userId: string
  wabaId: string
  phoneNumberId: string
  displayPhoneNumber: string
  verifiedName?: string | null
  accessToken: string
  expiresAt: string | null
  assistantId?: string | null
  teamId?: string | null
  queueId?: string | null
  responseModeOverride?: ResponseMode | null
  expectedConnectionId?: string
}

export type WhatsAppConnectionResult = {
  id: string
  organizationId: string
  phoneNumberId: string
  state: 'pending' | 'connected'
}

export type WhatsAppConnectionSettings = {
  assistantId: string | null
  teamId: string | null
  queueId: string | null
  responseModeOverride: ResponseMode | null
}

function required(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}_required`)
  return value.trim()
}

function optionalUuid(value: string | null | undefined, label: string) {
  if (value == null || value === '') return null
  const normalized = required(value, label)
  if (!uuidPattern.test(normalized)) throw new Error(`${label}_invalid`)
  return normalized
}

function optionalResponseMode(value: ResponseMode | null | undefined) {
  if (value == null) return null
  if (value !== 'automatic' && value !== 'assisted' && value !== 'manual') {
    throw new Error('response_mode_override_invalid')
  }
  return value
}

function inboundTokenHash() {
  return createHash('sha256').update(randomBytes(32)).digest('hex')
}

function isUniquePhoneConflict(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; constraint?: unknown }
  return candidate.code === '23505' && (
    candidate.constraint === 'channel_connections_active_whatsapp_phone_unique'
    || candidate.constraint === 'channel_connections_phone_number_id_unique'
  )
}

function connectionConflictError() {
  return Object.assign(new Error('whatsapp_phone_number_already_connected'), { statusCode: 409 })
}

async function validateOrganizationBindings(
  client: Pick<pg.Pool, 'query'>,
  input: { organizationId: string; assistantId: string | null; teamId: string | null; queueId: string | null },
) {
  const result = await client.query<{ assistant_ok: boolean; team_ok: boolean; queue_ok: boolean }>(
    `SELECT
       ($2::uuid IS NULL OR EXISTS (
         SELECT 1 FROM public.ai_assistants WHERE id = $2 AND organization_id = $1
       )) AS assistant_ok,
       ($3::uuid IS NULL OR EXISTS (
         SELECT 1 FROM public.omnichannel_teams WHERE id = $3 AND organization_id = $1
       )) AS team_ok,
       ($4::uuid IS NULL OR EXISTS (
         SELECT 1 FROM public.conversation_queues WHERE id = $4 AND organization_id = $1
       )) AS queue_ok`,
    [input.organizationId, input.assistantId, input.teamId, input.queueId],
  )
  const row = result.rows[0]
  if (!row?.assistant_ok || !row.team_ok || !row.queue_ok) {
    throw Object.assign(new Error('whatsapp_connection_binding_organization_mismatch'), { statusCode: 400 })
  }
}

/**
 * Persists a server-verified WhatsApp asset and its access token atomically.
 * The token is accepted only here, never returned in the public result, and is
 * stored through the existing encrypted provider-secret store.
 */
export async function upsertVerifiedWhatsAppConnection(
  pool: pg.Pool,
  input: VerifiedWhatsAppConnection,
): Promise<WhatsAppConnectionResult> {
  const organizationId = required(input.organizationId, 'organization_id')
  const userId = required(input.userId, 'user_id')
  const wabaId = required(input.wabaId, 'waba_id')
  const phoneNumberId = required(input.phoneNumberId, 'phone_number_id')
  const displayPhoneNumber = required(input.displayPhoneNumber, 'display_phone_number')
  const verifiedName = typeof input.verifiedName === 'string' && input.verifiedName.trim()
    ? input.verifiedName.trim()
    : displayPhoneNumber
  const accessToken = required(input.accessToken, 'access_token')
  const requestedAssistantId = input.assistantId === undefined ? undefined : optionalUuid(input.assistantId, 'assistant_id')
  const requestedTeamId = input.teamId === undefined ? undefined : optionalUuid(input.teamId, 'team_id')
  const requestedQueueId = input.queueId === undefined ? undefined : optionalUuid(input.queueId, 'queue_id')
  const requestedResponseModeOverride = input.responseModeOverride === undefined ? undefined : optionalResponseMode(input.responseModeOverride)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const active = await client.query<{ id: string; organization_id: string }>(
      `SELECT id, organization_id
       FROM public.channel_connections
       WHERE channel = 'whatsapp' AND phone_number_id = $1 AND is_active = TRUE
       FOR UPDATE`,
      [phoneNumberId],
    )
    if (active.rows[0] && active.rows[0].organization_id !== organizationId) throw connectionConflictError()

    const existing = await client.query<{
      id: string
      assistant_id: string | null
      team_id: string | null
      queue_id: string | null
      response_mode_override: ResponseMode | null
    }>(
      `SELECT id, assistant_id, team_id, queue_id, response_mode_override
       FROM public.channel_connections
       WHERE organization_id = $1 AND channel = 'whatsapp' AND phone_number_id = $2
       ORDER BY is_active DESC, updated_at DESC
       LIMIT 1
       FOR UPDATE`,
      [organizationId, phoneNumberId],
    )
    const existingRow = existing.rows[0]
    if (input.expectedConnectionId && existingRow?.id !== input.expectedConnectionId) {
      throw Object.assign(new Error('whatsapp_reconnect_target_changed'), { statusCode: 409 })
    }
    const assistantId = requestedAssistantId === undefined ? existingRow?.assistant_id || null : requestedAssistantId
    const teamId = requestedTeamId === undefined ? existingRow?.team_id || null : requestedTeamId
    const queueId = requestedQueueId === undefined ? existingRow?.queue_id || null : requestedQueueId
    const responseModeOverride = requestedResponseModeOverride === undefined
      ? existingRow?.response_mode_override || null
      : requestedResponseModeOverride
    await validateOrganizationBindings(client, { organizationId, assistantId, teamId, queueId })

    const connectionName = `WhatsApp ${phoneNumberId}`
    const connectionId = existing.rows[0]?.id || (await client.query<{ id: string }>(
      `INSERT INTO public.channel_connections (
         organization_id, channel, name, is_active, adapter_key, inbound_token_hash,
         provider_account_id, provider_asset_id, phone_number_id, display_phone_number,
         provider_display_name, provider_scopes, provider_verify_state, token_state,
         health_status, fallback_mode, assistant_id, team_id, queue_id, response_mode_override,
         connected_by_user_id, connected_at
       ) VALUES ($1, 'whatsapp', $2, TRUE, 'meta_whatsapp', $3,
         $4, $5, $6, $7, $8, $9, 'verified', 'connected', 'connected', 'official',
         $10, $11, $12, $13, $14, NOW())
       RETURNING id`,
      [
        organizationId, connectionName, inboundTokenHash(), wabaId, phoneNumberId,
        phoneNumberId, displayPhoneNumber, verifiedName, [...whatsappScopes], assistantId, teamId,
        queueId, responseModeOverride, userId,
      ],
    )).rows[0]?.id

    if (!connectionId) throw new Error('whatsapp_connection_persistence_failed')

    if (existing.rows[0]) {
      await client.query(
        `UPDATE public.channel_connections
         SET name = $2, is_active = TRUE, adapter_key = 'meta_whatsapp',
             provider_account_id = $3, provider_asset_id = $4, phone_number_id = $4,
             display_phone_number = $5, provider_display_name = $6, provider_scopes = $7,
             provider_verify_state = 'verified', token_state = 'connected',
             health_status = 'connected', health_summary = NULL, fallback_mode = 'official',
             assistant_id = $8, team_id = $9, queue_id = $10, response_mode_override = $11,
             connected_by_user_id = $12, connected_at = COALESCE(connected_at, NOW()),
             disconnected_at = NULL, updated_at = NOW()
         WHERE id = $1`,
        [
          connectionId, connectionName, wabaId, phoneNumberId, displayPhoneNumber, verifiedName,
          [...whatsappScopes], assistantId, teamId, queueId, responseModeOverride, userId,
        ],
      )
    }

    const secret = await storeProviderSecretToPool(client, {
      organizationId,
      provider: 'meta_social',
      targetKind: 'publishing',
      connectionTable: 'channel_connections',
      connectionId,
      secretKind: 'access_token',
      value: accessToken,
      expiresAt: input.expiresAt || null,
      metadata: { channel: 'whatsapp', wabaId, phoneNumberId },
    })

    await client.query(
      `UPDATE public.channel_connections
       SET protected_metadata_references = jsonb_build_object('accessTokenReference', $2::text),
           token_state = 'connected', provider_verify_state = 'verified',
           health_status = 'connected', updated_at = NOW()
       WHERE id = $1`,
      [connectionId, secret.reference],
    )

    await client.query('COMMIT')
    return { id: connectionId, organizationId, phoneNumberId, state: 'connected' }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    if (isUniquePhoneConflict(error)) throw connectionConflictError()
    throw error
  } finally {
    client.release()
  }
}

export async function updateWhatsAppConnectionSettings(pool: pg.Pool, input: {
  organizationId: string
  connectionId: string
  settings: WhatsAppConnectionSettings
}) {
  const organizationId = required(input.organizationId, 'organization_id')
  const connectionId = required(input.connectionId, 'connection_id')
  const assistantId = optionalUuid(input.settings.assistantId, 'assistant_id')
  const teamId = optionalUuid(input.settings.teamId, 'team_id')
  const queueId = optionalUuid(input.settings.queueId, 'queue_id')
  const responseModeOverride = optionalResponseMode(input.settings.responseModeOverride)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await validateOrganizationBindings(client, { organizationId, assistantId, teamId, queueId })
    const result = await client.query<{
      id: string
      assistant_id: string | null
      team_id: string | null
      queue_id: string | null
      response_mode_override: ResponseMode | null
    }>(
      `UPDATE public.channel_connections
          SET assistant_id = $3, team_id = $4, queue_id = $5,
              response_mode_override = $6, updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND channel = 'whatsapp'
        RETURNING id, assistant_id, team_id, queue_id, response_mode_override`,
      [connectionId, organizationId, assistantId, teamId, queueId, responseModeOverride],
    )
    const row = result.rows[0]
    if (!row) throw Object.assign(new Error('whatsapp_connection_not_found'), { statusCode: 404 })
    await client.query('COMMIT')
    return {
      id: row.id,
      assistantId: row.assistant_id,
      teamId: row.team_id,
      queueId: row.queue_id,
      responseModeOverride: row.response_mode_override,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}
