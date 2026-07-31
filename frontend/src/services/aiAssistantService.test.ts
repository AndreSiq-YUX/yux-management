import { describe, expect, it } from 'vitest'
import {
  buildAssistantPayload,
  buildRequiredFieldPayload,
  mapAiAssistant,
} from './aiAssistantService'

describe('aiAssistantService helpers', () => {
  it('builds assistant payloads scoped by organization, client and contract', () => {
    expect(buildAssistantPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      name: ' SDR Comercial ',
      tone: 'consultivo',
      summaryEnabled: true,
      classificationEnabled: false,
    })).toEqual(expect.objectContaining({
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      name: 'SDR Comercial',
      tone: 'consultivo',
      status: 'active',
      summary_enabled: true,
      classification_enabled: false,
    }))
  })

  it('builds required field payloads with explicit labels and source', () => {
    expect(buildRequiredFieldPayload('assistant-1', {
      fieldKey: 'phone',
      label: 'Telefone',
      source: 'contact',
    })).toEqual({
      assistant_id: 'assistant-1',
      field_key: 'phone',
      label: 'Telefone',
      source: 'contact',
      is_required: true,
      order_index: 0,
    })
  })

  it('maps assistant settings with objectives, rules and knowledge links', () => {
    expect(mapAiAssistant({
      id: 'assistant-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: null,
      name: 'SDR Comercial',
      tone: 'consultivo',
      status: 'active',
      summary_enabled: true,
      classification_enabled: true,
      created_at: '2026-06-03T12:00:00.000Z',
      updated_at: '2026-06-03T12:00:00.000Z',
      ai_assistant_objectives: [{ id: 'objective-1', label: 'Qualificar', objective_type: 'lead_qualification', instructions: 'Perguntar prazo.' }],
      ai_assistant_required_fields: [{ id: 'field-1', field_key: 'phone', label: 'Telefone', source: 'contact', is_required: true, order_index: 1 }],
      ai_assistant_handoff_rules: [{ id: 'handoff-1', name: 'Humano', rule_type: 'human_request', conditions: { humanRequested: true }, min_confidence: 0.7, is_enabled: true }],
      ai_assistant_safety_rules: [{ id: 'safety-1', name: 'LGPD', rule_type: 'privacy', instructions: 'Nao expor dados.', severity: 'high', is_enabled: true }],
      ai_assistant_knowledge_links: [{ id: 'link-1', knowledge_entry_id: 'entry-1', knowledge_entries: { id: 'entry-1', title: 'FAQ', status: 'published' } }],
    })).toMatchObject({
      id: 'assistant-1',
      clientId: 'client-1',
      objectives: [{ label: 'Qualificar' }],
      requiredFields: [{ fieldKey: 'phone' }],
      handoffRules: [{ name: 'Humano' }],
      safetyRules: [{ name: 'LGPD' }],
      knowledgeLinks: [{ title: 'FAQ' }],
    })
  })
})
