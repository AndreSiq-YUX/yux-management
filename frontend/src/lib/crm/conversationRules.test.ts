import { describe, expect, it } from 'vitest'
import {
  buildAiFieldPatch,
  canSendTemplate,
  isSlaBreached,
  normalizePhoneForLeadMatch,
  scoreConversationLeadMatch,
  shouldCreateLeadFromConversation,
  shouldPauseAutomationForHuman,
} from './conversationRules'
import type { LeadAiFieldSuggestion } from '@/types/crmAi'

const conversation = {
  organizationId: 'org-1',
  crmInstanceId: 'crm-1',
  phone: '+55 (11) 99999-0000',
  email: 'ana@example.com',
  name: 'Ana Lead',
}

const lead = {
  id: 'lead-1',
  organizationId: 'org-1',
  crmInstanceId: 'crm-1',
  phone: '11999990000',
  email: 'ana@example.com',
  name: 'Ana Lead',
}

describe('conversationRules', () => {
  it('normalizes phone numbers for duplicate matching', () => {
    expect(normalizePhoneForLeadMatch('(11) 99999-0000')).toBe('5511999990000')
    expect(normalizePhoneForLeadMatch('+55 11 99999-0000')).toBe('5511999990000')

    const score = scoreConversationLeadMatch(conversation, lead)
    expect(score.safeToAutoLink).toBe(true)
    expect(score.score).toBe(100)
    expect(score.reasons).toContain('phone_match')
  })

  it('blocks unsafe cross-instance match', () => {
    const score = scoreConversationLeadMatch(conversation, {
      ...lead,
      id: 'lead-other-instance',
      crmInstanceId: 'crm-2',
    })

    expect(score.score).toBe(0)
    expect(score.safeToAutoLink).toBe(false)
    expect(score.unsafeReason).toBe('crm_instance_mismatch')
  })

  it('decides when a conversation can create a lead', () => {
    expect(shouldCreateLeadFromConversation({
      contact: { phone: '+55 11 98888-0000', name: 'Novo contato' },
      matches: [{ leadId: 'lead-1', score: 0, reasons: [], safeToAutoLink: false }],
    })).toBe(true)

    expect(shouldCreateLeadFromConversation({
      contact: { phone: '+55 11 99999-0000' },
      matches: [scoreConversationLeadMatch(conversation, lead)],
    })).toBe(false)
  })

  it('detects SLA breach only while unresolved', () => {
    const now = new Date('2026-06-04T12:00:00.000Z')

    expect(isSlaBreached({ dueAt: '2026-06-04T11:59:00.000Z', status: 'open' }, now)).toBe(true)
    expect(isSlaBreached({ dueAt: '2026-06-04T11:59:00.000Z', resolvedAt: '2026-06-04T12:00:00.000Z' }, now)).toBe(false)
  })

  it('blocks sends when contact opted out', () => {
    expect(canSendTemplate({
      channel: 'whatsapp',
      requiresOptIn: true,
      whatsappOptIn: false,
      templateStatus: 'active',
    })).toBe(false)

    expect(canSendTemplate({
      channel: 'email',
      optedOut: true,
      templateStatus: 'active',
    })).toBe(false)
  })

  it('pauses automation for human handoff', () => {
    expect(shouldPauseAutomationForHuman({ activeHandoffLock: true })).toBe(true)
    expect(shouldPauseAutomationForHuman({ status: 'waiting_human' })).toBe(true)
    expect(shouldPauseAutomationForHuman({ responseMode: 'automatic' })).toBe(false)
  })

  it('builds field patch only from confirmed suggestions', () => {
    const suggestions: LeadAiFieldSuggestion[] = [
      {
        id: 'suggestion-1',
        organizationId: 'org-1',
        crmInstanceId: 'crm-1',
        leadId: 'lead-1',
        fieldKey: 'intent',
        suggestedValue: 'agendamento',
        confidence: 0.92,
        status: 'pending',
        createdAt: '2026-06-04T12:00:00.000Z',
      },
      {
        id: 'suggestion-2',
        organizationId: 'org-1',
        crmInstanceId: 'crm-1',
        leadId: 'lead-1',
        fieldKey: 'sentiment',
        suggestedValue: 'positive',
        confidence: 0.8,
        status: 'rejected',
        createdAt: '2026-06-04T12:00:00.000Z',
      },
    ]

    expect(buildAiFieldPatch(suggestions, ['suggestion-1'])).toEqual([{
      suggestionId: 'suggestion-1',
      fieldKey: 'intent',
      value: 'agendamento',
    }])
  })
})
