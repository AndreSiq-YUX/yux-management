import { describe, expect, it } from 'vitest'
import { JOB_NAMES, createBullMqJobId, createIdempotencyKey } from '../src/jobs/queue.js'

describe('job idempotency', () => {
  it('registers durable Mission conversation processing', () => {
    expect(JOB_NAMES).toContain('action-engine.processMissionConversation')
    expect(createIdempotencyKey('action-engine.processMissionConversation', {
      conversationId: 'conversation-1', organizationId: 'org-1', requestedVersion: 2,
    })).toBe(createIdempotencyKey('action-engine.processMissionConversation', {
      requestedVersion: 2, organizationId: 'org-1', conversationId: 'conversation-1',
    }))
  })
  it('registers provider-effect reconciliation as a durable job', () => {
    expect(JOB_NAMES).toContain('action-engine.reconcileProviderEffect')
    expect(createIdempotencyKey('action-engine.reconcileProviderEffect', {
      effectId: 'effect-1', organizationId: 'org-1', scheduledFor: '2026-08-22T12:01:00.000Z',
    })).toMatch(/^action-engine\.reconcileProviderEffect-/)
  })

  it('creates the same key for equivalent payloads with different key order', () => {
    const first = createIdempotencyKey('automation.dispatch', {
      organizationId: 'org-1',
      automationId: 'automation-1',
      payload: {
        leadId: 'lead-1',
        score: 91,
      },
    })

    const second = createIdempotencyKey('automation.dispatch', {
      payload: {
        score: 91,
        leadId: 'lead-1',
      },
      automationId: 'automation-1',
      organizationId: 'org-1',
    })

    expect(second).toBe(first)
  })

  it('creates different keys when the job name or payload changes', () => {
    const basePayload = {
      organizationId: 'org-1',
      messageId: 'message-1',
    }

    expect(createIdempotencyKey('omnichannel.processMessage', basePayload)).not.toBe(
      createIdempotencyKey('email.send', basePayload),
    )
    expect(createIdempotencyKey('omnichannel.processMessage', basePayload)).not.toBe(
      createIdempotencyKey('omnichannel.processMessage', { ...basePayload, messageId: 'message-2' }),
    )
  })

  it('supports stable idempotency for CRM sequence jobs', () => {
    expect(createIdempotencyKey('crm.sequence.dispatchDue', { scheduledAt: '2026-06-27T12:00:00.000Z' })).toBe(
      createIdempotencyKey('crm.sequence.dispatchDue', { scheduledAt: '2026-06-27T12:00:00.000Z' }),
    )
    expect(createIdempotencyKey('crm.sequence.processExecution', { executionId: 'execution-1' })).not.toBe(
      createIdempotencyKey('crm.sequence.processExecution', { executionId: 'execution-2' }),
    )
  })

  it('never emits the colon reserved by BullMQ in custom job IDs', () => {
    const idempotencyKey = createIdempotencyKey('company-intelligence.discoverWebsite', {
      runId: 'run-1',
    })
    const scheduledKey = createBullMqJobId('maintenance', '2026-08-04T21:30:00.000Z')

    expect(idempotencyKey).not.toContain(':')
    expect(scheduledKey).not.toContain(':')
    expect(scheduledKey).toBe('maintenance-2026-08-04T21-30-00.000Z')
  })
})
