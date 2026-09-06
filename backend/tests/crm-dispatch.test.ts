import { describe, expect, it, vi } from 'vitest'
import { handleCrmSequenceDeliveryRequested } from '../src/jobs/handlers/crm-dispatch.js'
import { createDomainEventEnvelope } from '../src/modules/events/types.js'

const ids = {
  event: '10000000-0000-4000-8000-000000000001',
  organization: '10000000-0000-4000-8000-000000000002',
  execution: '10000000-0000-4000-8000-000000000003',
  lead: '10000000-0000-4000-8000-000000000004',
  message: '10000000-0000-4000-8000-000000000005',
  request: '10000000-0000-4000-8000-000000000006',
}

class FakePool {
  updates: Array<{ sql: string; values: unknown[] }> = []

  constructor(private readonly intent: Record<string, unknown>) {}

  async query(sql: string, values: unknown[] = []) {
    if (sql.includes('FROM public.automation_executions') && sql.includes('SELECT id')) {
      return { rows: [{ id: ids.execution, organization_id: ids.organization, lead_id: ids.lead, status: 'completed' }] }
    }
    if (sql.includes('FROM public.messages message')) return { rows: [this.intent] }
    if (sql.includes('FROM public.email_send_requests request')) return { rows: [this.intent] }
    this.updates.push({ sql, values })
    return { rows: [], rowCount: 1 }
  }
}

describe('CRM sequence durable dispatch consumer', () => {
  it('queues an eligible WhatsApp intent with a stable execution identity', async () => {
    const pool = new FakePool({
      id: ids.message,
      delivery_status: 'queued',
      content_type: 'template',
      metadata: { recipientOptIn: true, templateName: 'follow_up' },
      phone: '+5511999999999',
      consent_metadata: {},
      connection_active: true,
      token_state: 'connected',
      phone_number_id: 'phone-id',
      access_token_reference: 'secret-ref',
      inside_customer_window: false,
      opted_out: false,
      permission_revoked: false,
    })
    const add = vi.fn(async () => ({}))
    const result = await handleCrmSequenceDeliveryRequested(pool as never, event('whatsapp', { messageId: ids.message }), { add })

    expect(result).toMatchObject({ queued: true, channel: 'whatsapp', messageId: ids.message })
    expect(add).toHaveBeenCalledWith(
      'omnichannel.dispatchOutbound',
      { messageId: ids.message, organizationId: ids.organization, executionId: ids.execution },
      { jobId: `crm-sequence-whatsapp-${ids.execution}` },
    )
  })

  it('persists a visible block when WhatsApp consent was revoked before dispatch', async () => {
    const pool = new FakePool({
      id: ids.message,
      delivery_status: 'queued',
      content_type: 'template',
      metadata: { recipientOptIn: true, templateName: 'follow_up' },
      phone: '+5511999999999',
      consent_metadata: {},
      connection_active: true,
      token_state: 'connected',
      phone_number_id: 'phone-id',
      access_token_reference: 'secret-ref',
      inside_customer_window: false,
      opted_out: false,
      permission_revoked: true,
    })
    const add = vi.fn(async () => ({}))
    const result = await handleCrmSequenceDeliveryRequested(pool as never, event('whatsapp', { messageId: ids.message }), { add })

    expect(result).toMatchObject({ blocked: true, reason: 'recipient_opted_out' })
    expect(add).not.toHaveBeenCalled()
    expect(pool.updates.some(update => update.sql.includes("delivery_status = 'failed'"))).toBe(true)
    expect(pool.updates.some(update => String(update.values[1]).includes('delivery_blocked:recipient_opted_out'))).toBe(true)
  })

  it('suppresses a queued email when an opt-out exists before dispatch', async () => {
    const pool = new FakePool({
      id: ids.request,
      status: 'queued',
      email_kind: 'operational',
      recipient_opt_in: true,
      suppressed: true,
    })
    const add = vi.fn(async () => ({}))
    const result = await handleCrmSequenceDeliveryRequested(pool as never, event('email', { requestId: ids.request }), { add })

    expect(result).toMatchObject({ blocked: true, reason: 'recipient_suppressed' })
    expect(add).not.toHaveBeenCalled()
    expect(pool.updates.some(update => update.values.includes('suppressed'))).toBe(true)
  })
})

function event(channel: 'email' | 'whatsapp', intent: Record<string, unknown>) {
  return createDomainEventEnvelope({
    eventId: ids.event,
    eventType: 'crm.sequence.delivery_requested',
    organizationId: ids.organization,
    aggregateType: 'sequence_execution',
    aggregateId: ids.execution,
    leadId: ids.lead,
    actor: { type: 'system' },
    payload: { executionId: ids.execution, channel, ...intent },
  })
}
