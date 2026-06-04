import { describe, expect, it } from 'vitest'
import {
  canPublishAutomation,
  estimateAutomationRisk,
  normalizeAutomationTrigger,
  sanitizeAutomationRunPayload,
  validateAutomationAction,
} from './intelligentAutomationRules'

describe('intelligentAutomationRules', () => {
  it('normalizes known triggers into module-scoped events', () => {
    expect(normalizeAutomationTrigger('lead.created')).toMatchObject({ module: 'crm', key: 'lead.created' })
    expect(normalizeAutomationTrigger('invoice.overdue')).toMatchObject({ module: 'finance', key: 'invoice.overdue' })
  })

  it('blocks unsafe email actions without consent policy', () => {
    expect(validateAutomationAction({
      actionType: 'send_email',
      payload: { emailKind: 'marketing', templateId: 'template-1' },
    })).toEqual({ ok: false, reason: 'marketing_email_requires_consent_policy' })
  })

  it('requires human review for high-risk AI actions', () => {
    expect(estimateAutomationRisk([
      { actionType: 'ai_generate_proposal', orderIndex: 1, payload: { sendAutomatically: true } },
    ])).toMatchObject({ level: 'high', requiresHumanApproval: true })
  })

  it('allows publishing complete low-risk automations', () => {
    expect(canPublishAutomation({
      status: 'draft',
      triggers: [{ triggerType: 'lead.created', config: {} }],
      conditions: [{ field: 'lead.emailOptIn', operator: 'equals', value: true }],
      actions: [{ actionType: 'create_task', orderIndex: 1, payload: { title: 'Ligar' } }],
    })).toEqual({ ok: true })
  })

  it('redacts secrets and tokens from run payloads', () => {
    expect(sanitizeAutomationRunPayload({ token: 'abc', nested: { apiSecret: 'xyz', value: 1 } })).toEqual({
      token: '[redacted]',
      nested: { apiSecret: '[redacted]', value: 1 },
    })
  })
})
