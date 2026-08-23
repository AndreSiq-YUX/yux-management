import { describe, expect, it, vi } from 'vitest'
import {
  assertSafeDecisionNotificationPayload,
  buildSafeDecisionNotificationPayload,
  deliverDecisionNotification,
  enqueuePendingDecisionNotifications,
  persistDecisionNotificationSchedule,
  planDecisionNotificationChannels,
} from '../src/modules/action-engine/decision-notifications.js'

const approvalId = '00000000-0000-4000-8000-000000000001'
const missionId = '00000000-0000-4000-8000-000000000002'

describe('Mission decision notifications', () => {
  it('persists and enqueues creation, 4-hour and 24-hour deliveries with stable deduplication IDs', async () => {
    const scheduledAt = new Date('2026-08-22T12:00:00Z')
    const persisted: Array<{ sql: string; params: unknown[] }> = []
    await persistDecisionNotificationSchedule({ query: async (sql: string, params: unknown[]) => { persisted.push({ sql, params }); return { rows: [] } } } as never, {
      approvalId, organizationId: '00000000-0000-4000-8000-000000000003', now: scheduledAt,
    })
    expect(persisted[0]?.params.slice(2)).toEqual([
      '2026-08-22T12:00:00.000Z', '2026-08-22T16:00:00.000Z', '2026-08-23T12:00:00.000Z',
    ])

    const add = vi.fn().mockResolvedValue({ id: 'job-1' })
    const schedules = [
      { id: 'schedule-1', approval_id: approvalId, escalation_stage: 'created', due_at: '2026-08-22T12:00:00.000Z' },
      { id: 'schedule-2', approval_id: approvalId, escalation_stage: '4h', due_at: '2026-08-22T16:00:00.000Z' },
      { id: 'schedule-3', approval_id: approvalId, escalation_stage: '24h', due_at: '2026-08-23T12:00:00.000Z' },
    ]
    await enqueuePendingDecisionNotifications({ query: async (sql: string) => ({ rows: sql.includes('SELECT id, approval_id') ? schedules : [] }) } as never, { add } as never, { now: scheduledAt })
    expect(add).toHaveBeenCalledTimes(3)
    expect(add).toHaveBeenNthCalledWith(1, 'action-engine.deliverDecisionNotification', { approvalId, stage: 'created' }, expect.objectContaining({ delay: 0 }))
    expect(add).toHaveBeenNthCalledWith(2, 'action-engine.deliverDecisionNotification', { approvalId, stage: '4h' }, expect.objectContaining({ delay: 14_400_000 }))
    expect(add).toHaveBeenNthCalledWith(3, 'action-engine.deliverDecisionNotification', { approvalId, stage: '24h' }, expect.objectContaining({ delay: 86_400_000 }))
    expect(new Set(add.mock.calls.map(call => call[2].jobId)).size).toBe(3)
  })

  it('uses in-product as the fallback and requires explicit WhatsApp consent', () => {
    expect(planDecisionNotificationChannels({
      emailEnabled: false, recipientEmail: 'owner@yux.test', whatsappEnabled: true,
      whatsappPhone: '+5543999999999', whatsappConsentAt: null,
    })).toEqual(['in_product'])
    expect(planDecisionNotificationChannels({
      emailEnabled: true, recipientEmail: 'owner@yux.test', whatsappEnabled: true,
      whatsappPhone: '+5543999999999', whatsappConsentAt: '2026-08-22T00:00:00Z',
    })).toEqual(['in_product', 'email', 'whatsapp'])
  })

  it('builds client-safe authenticated routes and rejects PII or provider references', () => {
    const payload = buildSafeDecisionNotificationPayload({
      mission_title: 'Missão da ana@example.com', recipient_role: 'client_admin', mission_id: missionId,
      expires_at: '2026-08-30T00:00:00Z',
      requested_payload: { decisionSummary: { changes: [{}, {}], economics: { estimatedCostBrl: '340.00' } } },
    })
    expect(payload.missionTitle).toBe('Missão com decisão pendente')
    expect(payload.summary).toBe('Revise 2 alteração(ões) propostas, com custo estimado de R$ 340,00.')
    expect(payload.href).toBe(`/portal/missoes/${missionId}`)
    expect(() => assertSafeDecisionNotificationPayload({ leadEmail: 'ana@example.com' })).toThrow('decision_notification_payload_sensitive')
    expect(() => assertSafeDecisionNotificationPayload({ providerReference: 'wamid.secret' })).toThrow('decision_notification_payload_sensitive')
    expect(() => assertSafeDecisionNotificationPayload({ phone: '+55 43 99999-9999' })).toThrow('decision_notification_payload_sensitive')
  })

  it('delivers configured channels once and makes duplicate jobs no-op', async () => {
    const database = new NotificationDatabase(decisionRow())
    const add = vi.fn().mockResolvedValue({ id: 'email-job' })
    const queueEmail = vi.fn().mockResolvedValue('email-request-1')
    const sendWhatsApp = vi.fn().mockResolvedValue(undefined)

    const first = await deliverDecisionNotification(database as never, { add } as never, { approvalId, stage: 'created' }, { queueEmail, sendWhatsApp })
    expect(first.results).toEqual([
      { channel: 'in_product', status: 'delivered' },
      { channel: 'email', status: 'queued' },
      { channel: 'whatsapp', status: 'delivered' },
    ])
    expect(add).toHaveBeenCalledWith('email.send', { requestId: 'email-request-1' }, expect.any(Object))
    expect(sendWhatsApp).toHaveBeenCalledTimes(1)

    const duplicate = await deliverDecisionNotification(database as never, { add } as never, { approvalId, stage: 'created' }, { queueEmail, sendWhatsApp })
    expect(duplicate.results?.every(result => result.status === 'duplicate')).toBe(true)
    expect(queueEmail).toHaveBeenCalledTimes(1)
    expect(sendWhatsApp).toHaveBeenCalledTimes(1)
  })

  it.each(['approved', 'rejected', 'cancelled', 'expired'])('does not deliver reminders after approval status becomes %s', async approvalStatus => {
    const queue = { add: vi.fn() }
    const result = await deliverDecisionNotification(new NotificationDatabase(decisionRow({ approval_status: approvalStatus })) as never, queue as never, { approvalId, stage: '4h' })
    expect(result).toEqual({ skipped: 'approval_not_pending' })
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('does not deliver an expired pending approval', async () => {
    const queue = { add: vi.fn() }
    const expired = await deliverDecisionNotification(new NotificationDatabase(decisionRow({ expires_at: '2026-08-21T00:00:00Z' })) as never, queue as never, { approvalId, stage: '24h' }, { now: new Date('2026-08-22T00:00:00Z') })
    expect(expired).toEqual({ skipped: 'approval_expired' })
    expect(queue.add).not.toHaveBeenCalled()
  })
})

function decisionRow(overrides: Record<string, unknown> = {}) {
  return {
    approval_id: approvalId, approval_status: 'pending', expires_at: '2026-08-30T00:00:00Z',
    organization_id: '00000000-0000-4000-8000-000000000003', mission_id: missionId,
    mission_title: 'Criar funil comercial', recipient_user_id: '00000000-0000-4000-8000-000000000004',
    recipient_email: 'owner@yux.test', recipient_role: 'client_admin',
    requested_payload: { decisionSummary: { changes: [{}], economics: { estimatedCostBrl: '25.00' } } },
    email_enabled: true, whatsapp_enabled: true, whatsapp_phone: '+5543999999999',
    whatsapp_consent_at: '2026-08-20T00:00:00Z', ...overrides,
  }
}

class NotificationDatabase {
  private claims = new Set<string>()
  constructor(private row: ReturnType<typeof decisionRow>) {}

  async query(sql: string, params: unknown[] = []) {
    if (sql.includes('FROM public.action_approvals approval')) return { rows: [this.row] }
    if (sql.includes('INSERT INTO public.action_decision_notifications')) {
      const key = `${params[4]}:${params[5]}`
      if (this.claims.has(key)) return { rows: [] }
      this.claims.add(key)
      return { rows: [{ id: `notification-${this.claims.size}` }] }
    }
    return { rows: [] }
  }
}
