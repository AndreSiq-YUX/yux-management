import type pg from 'pg'
import type { AppJobQueue } from '../../server.js'
import { createBullMqJobId } from '../../jobs/queue.js'
import { queueEmailRequest } from '../email-delivery/service.js'
import { loadProviderSecretFromPool } from '../../lib/edge-compat/providerSecrets.js'
import { sendWhatsAppOperationalNotification } from '../../lib/edge-compat/whatsappProvider.js'

export type DecisionNotificationStage = 'created' | '4h' | '24h'
export type DecisionNotificationChannel = 'in_product' | 'email' | 'whatsapp'

type Queryable = Pick<pg.Pool, 'query'>

type DecisionRow = {
  approval_id: string
  approval_status: string
  expires_at: string | null
  organization_id: string
  mission_id: string
  mission_title: string
  recipient_user_id: string
  recipient_email: string | null
  recipient_role: string | null
  requested_payload: Record<string, unknown>
  email_enabled: boolean
  whatsapp_enabled: boolean
  whatsapp_phone: string | null
  whatsapp_consent_at: string | null
}

export type DecisionNotificationPayload = {
  missionTitle: string
  summary: string
  expiresAt: string | null
  href: string
}

export async function persistDecisionNotificationSchedule(db: Queryable, input: {
  approvalId: string
  organizationId: string
  now?: Date
}) {
  const now = input.now ?? new Date()
  await db.query(
    `INSERT INTO public.action_decision_notification_schedule (organization_id, approval_id, escalation_stage, due_at)
     VALUES ($1,$2,'created',$3), ($1,$2,'4h',$4), ($1,$2,'24h',$5)
     ON CONFLICT (approval_id, escalation_stage) DO NOTHING`,
    [input.organizationId, input.approvalId, now.toISOString(), new Date(now.getTime() + 4 * 60 * 60 * 1_000).toISOString(), new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString()],
  )
}

export async function enqueuePendingDecisionNotifications(
  db: Queryable,
  queue: Pick<AppJobQueue, 'add'>,
  input: { approvalId?: string; limit?: number; now?: Date } = {},
) {
  const now = input.now ?? new Date()
  const result = await db.query<{ id: string; approval_id: string; escalation_stage: DecisionNotificationStage; due_at: string }>(
    `SELECT id, approval_id, escalation_stage, due_at
       FROM public.action_decision_notification_schedule
      WHERE enqueued_at IS NULL AND ($1::uuid IS NULL OR approval_id = $1)
      ORDER BY due_at LIMIT $2`,
    [input.approvalId ?? null, input.limit ?? 100],
  )
  for (const row of result.rows) {
    try {
      await queue.add(
        'action-engine.deliverDecisionNotification',
        { approvalId: row.approval_id, stage: row.escalation_stage },
        {
          delay: Math.max(0, new Date(row.due_at).getTime() - now.getTime()),
          jobId: createBullMqJobId('mission-decision', row.approval_id, row.escalation_stage),
        },
      )
      await db.query(`UPDATE public.action_decision_notification_schedule SET enqueued_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1 AND enqueued_at IS NULL`, [row.id])
    } catch (error) {
      const safeError = (error instanceof Error ? error.message : String(error)).slice(0, 500).replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
      await db.query(`UPDATE public.action_decision_notification_schedule SET last_error = $2, updated_at = NOW() WHERE id = $1`, [row.id, safeError])
    }
  }
  return { processed: result.rows.length }
}

export function planDecisionNotificationChannels(input: {
  emailEnabled: boolean
  recipientEmail: string | null
  whatsappEnabled: boolean
  whatsappPhone: string | null
  whatsappConsentAt: string | null
}): DecisionNotificationChannel[] {
  const channels: DecisionNotificationChannel[] = ['in_product']
  if (input.emailEnabled && input.recipientEmail) channels.push('email')
  if (input.whatsappEnabled && input.whatsappPhone && input.whatsappConsentAt) channels.push('whatsapp')
  return channels
}

export function buildSafeDecisionNotificationPayload(row: Pick<DecisionRow, 'mission_title' | 'recipient_role' | 'requested_payload' | 'expires_at' | 'mission_id'>): DecisionNotificationPayload {
  const summary = record(row.requested_payload.decisionSummary)
  const changes = Array.isArray(summary.changes) ? summary.changes.length : 0
  const economics = record(summary.economics)
  const estimatedCost = safeDecimal(economics.estimatedCostBrl)
  const missionTitle = unsafeText(row.mission_title) ? 'Missão com decisão pendente' : row.mission_title.trim().slice(0, 120)
  const safeSummary = changes > 0
    ? `Revise ${changes} alteração(ões) propostas${estimatedCost ? `, com custo estimado de R$ ${estimatedCost}` : ''}.`
    : 'Uma missão precisa da sua revisão antes de continuar.'
  const href = row.recipient_role?.startsWith('client_')
    ? `/portal/missoes/${row.mission_id}`
    : `/missions/${row.mission_id}`
  const payload = { missionTitle, summary: safeSummary, expiresAt: row.expires_at, href }
  assertSafeDecisionNotificationPayload(payload)
  return payload
}

export function assertSafeDecisionNotificationPayload(payload: unknown): void {
  const serialized = JSON.stringify(payload)
  if (unsafeText(serialized) || /lead(email|phone|id)|provider(reference|message|external)|access.?token|secret/i.test(serialized)) {
    throw new Error('decision_notification_payload_sensitive')
  }
}

export async function deliverDecisionNotification(
  pool: Queryable,
  queue: Pick<AppJobQueue, 'add'>,
  data: Record<string, unknown>,
  dependencies: {
    queueEmail?: typeof queueDecisionEmail
    sendWhatsApp?: typeof sendDecisionWhatsApp
    now?: Date
  } = {},
) {
  const approvalId = stringField(data.approvalId, 'approvalId')
  const stage = stageField(data.stage)
  const row = await loadDecision(pool, approvalId)
  const now = dependencies.now ?? new Date()
  if (!row) {
    if (stage === 'created') throw new Error('approval_not_found')
    return { skipped: 'approval_not_found' }
  }
  if (row.approval_status !== 'pending') return { skipped: 'approval_not_pending' }
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return { skipped: 'approval_expired' }

  const payload = buildSafeDecisionNotificationPayload(row)
  const channels = planDecisionNotificationChannels({
    emailEnabled: row.email_enabled, recipientEmail: row.recipient_email,
    whatsappEnabled: row.whatsapp_enabled, whatsappPhone: row.whatsapp_phone,
    whatsappConsentAt: row.whatsapp_consent_at,
  })
  const results: Array<{ channel: DecisionNotificationChannel; status: string }> = []
  for (const channel of channels) {
    const notificationId = await claimDelivery(pool, row, channel, stage, payload)
    if (!notificationId) {
      results.push({ channel, status: 'duplicate' })
      continue
    }
    try {
      if (channel === 'in_product') {
        await finishDelivery(pool, notificationId, 'delivered')
        results.push({ channel, status: 'delivered' })
      } else if (channel === 'email') {
        const requestId = await (dependencies.queueEmail ?? queueDecisionEmail)(pool, row, payload, stage)
        await queue.add('email.send', { requestId }, { jobId: createBullMqJobId('mission-decision-email', notificationId) })
        await finishDelivery(pool, notificationId, 'queued', requestId)
        results.push({ channel, status: 'queued' })
      } else {
        await (dependencies.sendWhatsApp ?? sendDecisionWhatsApp)(pool, row, payload)
        await finishDelivery(pool, notificationId, 'delivered')
        results.push({ channel, status: 'delivered' })
      }
    } catch (error) {
      await failDelivery(pool, notificationId, error)
      throw error
    }
  }
  return { approvalId, stage, results }
}

async function loadDecision(pool: Queryable, approvalId: string): Promise<DecisionRow | null> {
  const result = await pool.query<DecisionRow>(
    `SELECT approval.id AS approval_id, approval.status AS approval_status, approval.expires_at,
            approval.organization_id, mission.id AS mission_id, mission.title AS mission_title,
            mission.created_by AS recipient_user_id, app_user.email AS recipient_email,
            app_user.role AS recipient_role, approval.requested_payload,
            COALESCE(preference.email_enabled, false) AS email_enabled,
            COALESCE(preference.whatsapp_enabled, false) AS whatsapp_enabled,
            preference.whatsapp_phone, preference.whatsapp_consent_at
       FROM public.action_approvals approval
       JOIN public.action_missions mission ON mission.id = approval.mission_id
       LEFT JOIN app_users app_user ON app_user.id = mission.created_by AND app_user.is_active = true
       LEFT JOIN public.action_decision_notification_preferences preference
         ON preference.organization_id = approval.organization_id AND preference.user_id = mission.created_by
      WHERE approval.id = $1 LIMIT 1`,
    [approvalId],
  )
  return result.rows[0] ?? null
}

async function claimDelivery(pool: Queryable, row: DecisionRow, channel: DecisionNotificationChannel, stage: DecisionNotificationStage, payload: DecisionNotificationPayload) {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO public.action_decision_notifications (
       organization_id, mission_id, approval_id, recipient_user_id, channel, escalation_stage, status, safe_payload
     ) VALUES ($1,$2,$3,$4,$5,$6,'sending',$7)
     ON CONFLICT (approval_id, channel, escalation_stage) DO UPDATE
       SET status = 'sending', last_error = NULL, updated_at = NOW()
       WHERE public.action_decision_notifications.status = 'failed'
     RETURNING id`,
    [row.organization_id, row.mission_id, row.approval_id, row.recipient_user_id, channel, stage, payload],
  )
  return result.rows[0]?.id ?? null
}

async function finishDelivery(pool: Queryable, notificationId: string, status: 'queued' | 'delivered', emailRequestId?: string) {
  await pool.query(
    `UPDATE public.action_decision_notifications SET status = $2, email_request_id = COALESCE($3, email_request_id),
            delivered_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END, updated_at = NOW()
      WHERE id = $1`,
    [notificationId, status, emailRequestId ?? null],
  )
}

async function failDelivery(pool: Queryable, notificationId: string, error: unknown) {
  const safeError = (error instanceof Error ? error.message : String(error)).slice(0, 500).replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
  await pool.query(`UPDATE public.action_decision_notifications SET status = 'failed', last_error = $2, updated_at = NOW() WHERE id = $1`, [notificationId, safeError])
}

async function queueDecisionEmail(pool: Queryable, row: DecisionRow, payload: DecisionNotificationPayload, stage: DecisionNotificationStage) {
  if (!row.recipient_email) throw new Error('decision_notification_email_missing')
  const request = await queueEmailRequest(pool, {
    organizationId: row.organization_id, leadId: null, emailKind: 'operational',
    recipientEmail: row.recipient_email, recipientOptIn: true,
    subject: `Decisão pendente: ${payload.missionTitle}`,
    bodyHtml: `<p>${escapeHtml(payload.summary)}</p><p><a href="${escapeHtml(payload.href)}">Revisar missão</a></p>`,
    bodyText: `${payload.summary}\n\nRevisar missão: ${payload.href}`,
    idempotencyKey: `mission-decision:${row.approval_id}:${stage}`,
    moduleKey: 'action_engine', sourceEntityType: 'action_approval', sourceEntityId: row.approval_id,
    metadata: { approvalId: row.approval_id, missionId: row.mission_id, stage },
  })
  return request.id
}

async function sendDecisionWhatsApp(pool: Queryable, row: DecisionRow, payload: DecisionNotificationPayload) {
  if (!row.whatsapp_phone || !row.whatsapp_consent_at) throw new Error('whatsapp_notification_consent_required')
  const connection = await pool.query<{ phone_number_id: string | null; protected_metadata_references: Record<string, unknown> }>(
    `SELECT phone_number_id, protected_metadata_references FROM public.channel_connections
      WHERE organization_id = $1 AND channel = 'whatsapp' AND is_active = true
      ORDER BY updated_at DESC LIMIT 1`,
    [row.organization_id],
  )
  const selected = connection.rows[0]
  const reference = selected?.protected_metadata_references?.accessTokenReference
  if (!selected?.phone_number_id || typeof reference !== 'string') throw new Error('whatsapp_connection_required')
  const secret = await loadProviderSecretFromPool(pool, reference)
  if (secret.expired) throw new Error('whatsapp_access_token_expired')
  const response = await sendWhatsAppOperationalNotification({
    to: row.whatsapp_phone, body: `${payload.missionTitle}\n${payload.summary}\n${payload.href}`,
    consentGranted: true, phoneNumberId: selected.phone_number_id, accessToken: secret.value,
  })
  if (!response.ok) throw new Error(response.error || `whatsapp_provider_http_${response.status}`)
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function safeDecimal(value: unknown) { return typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value) ? value.replace('.', ',') : null }
function unsafeText(value: string) {
  const withoutUuids = value.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/gi, '')
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(withoutUuids)) return true
  return (withoutUuids.match(/\+?[\d\s().-]{10,}/g) ?? [])
    .some(candidate => {
      const digits = candidate.replace(/\D/g, '').length
      return digits >= 10 && digits <= 15
    })
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character)) }
function stringField(value: unknown, label: string) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`); return value.trim() }
function stageField(value: unknown): DecisionNotificationStage { if (value === 'created' || value === '4h' || value === '24h') return value; throw new Error('decision notification stage is invalid') }
