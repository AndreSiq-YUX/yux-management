import { describe, expect, it } from 'vitest'
import {
  buildAssistantRunMetadata,
  getMissingCollectedFields,
  shouldHandoffToHuman,
} from './assistantRules'
import type { AiAssistantSettings } from '@/types/aiAssistant'

const settings: AiAssistantSettings = {
  id: 'assistant-1',
  organizationId: 'org-1',
  name: 'Assistente Comercial',
  tone: 'consultivo',
  status: 'active',
  summaryEnabled: true,
  classificationEnabled: true,
  objectives: [{ id: 'objective-1', label: 'Qualificar lead', objectiveType: 'lead_qualification', instructions: 'Priorize agenda.' }],
  requiredFields: [
    { id: 'field-1', fieldKey: 'name', label: 'Nome' },
    { id: 'field-2', fieldKey: 'phone', label: 'Telefone' },
  ],
  handoffRules: [{
    id: 'handoff-1',
    name: 'Reclamacao negativa',
    ruleType: 'sentiment_intent',
    conditions: { sentiment: 'negative', intent: 'complaint' },
    minConfidence: 0.7,
    isEnabled: true,
  }],
  safetyRules: [{ id: 'safety-1', name: 'Sem diagnostico', ruleType: 'medical', instructions: 'Nao diagnosticar.', severity: 'high', isEnabled: true }],
  knowledgeLinks: [{ id: 'knowledge-1', title: 'FAQ publicada', status: 'published' }],
  createdAt: '2026-06-03T12:00:00.000Z',
  updatedAt: '2026-06-03T12:00:00.000Z',
}

describe('assistantRules', () => {
  it('detects missing collected fields in configured order', () => {
    expect(getMissingCollectedFields(['name'], ['name', 'phone'])).toEqual(['phone'])
  })

  it('triggers human handoff from configured sentiment and intent conditions', () => {
    expect(shouldHandoffToHuman({
      sentiment: 'negative',
      intent: 'complaint',
      confidence: 0.82,
    }, settings)).toBe(true)
  })

  it('builds sanitized assistant metadata for AI runs', () => {
    expect(buildAssistantRunMetadata(settings)).toEqual(expect.objectContaining({
      assistantId: 'assistant-1',
      name: 'Assistente Comercial',
      tone: 'consultivo',
      objectives: ['Qualificar lead'],
      requiredFields: ['name', 'phone'],
      safetyRules: ['Sem diagnostico'],
    }))
  })
})
