import { describe, expect, it, vi } from 'vitest'
import {
  buildHumanHandoffPayload,
  buildLeadConversationLinkPayload,
  buildLeadFromConversationPayload,
  buildResponseSuggestionPayload,
  mapFieldSuggestion,
  mapLeadAiInsight,
  mapLeadConversationLink,
  mapResponseSuggestion,
} from './crmConversationService'

vi.mock('@/lib/crmConversationDataClient', () => ({
  crmConversationDataClient: {},
}))

describe('crmConversationService payload builders and mappers', () => {
  it('builds link payload with provider-neutral metadata', () => {
    expect(buildLeadConversationLinkPayload({
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      leadId: 'lead-1',
      conversationId: 'conversation-1',
      channel: 'whatsapp',
      matchMethod: 'phone',
      matchScore: 95,
      contactPhone: '+55 11 99999-0000',
      linkedBy: 'user-1',
    })).toMatchObject({
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      conversation_id: 'conversation-1',
      channel: 'whatsapp',
      status: 'linked',
      match_method: 'phone',
      match_score: 95,
      contact_phone: '+55 11 99999-0000',
      linked_by: 'user-1',
    })
  })

  it('builds lead payload from a WhatsApp conversation without requiring email from contact', () => {
    const payload = buildLeadFromConversationPayload({
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      pipelineId: 'pipeline-1',
      stageId: 'stage-1',
      conversationId: 'conversation-1',
      channel: 'whatsapp',
      name: ' Ana ',
      phone: '+55 11 99999-0000',
    })

    expect(payload).toMatchObject({
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      name: 'Ana',
      email: 'whatsapp-5511999990000@lead.local',
      whatsapp_phone: '+55 11 99999-0000',
      whatsapp_opt_in: true,
      source_kind: 'organic',
    })
  })

  it('builds response suggestion and handoff payloads', () => {
    expect(buildResponseSuggestionPayload({
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      leadId: 'lead-1',
      conversationId: 'conversation-1',
      channel: 'whatsapp',
      body: '  Posso te ajudar agora.  ',
      quickReplyId: 'reply-1',
    })).toEqual({
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      conversation_id: 'conversation-1',
      channel: 'whatsapp',
      body: 'Posso te ajudar agora.',
      status: 'draft',
      template_id: null,
      quick_reply_id: 'reply-1',
      ai_insight_id: null,
      requires_approval: true,
    })

    expect(buildHumanHandoffPayload({
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      leadId: 'lead-1',
      conversationId: 'conversation-1',
      reason: ' Cliente pediu humano ',
      lockedBy: 'user-1',
    })).toMatchObject({
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      conversation_id: 'conversation-1',
      locked_by: 'user-1',
      reason: 'Cliente pediu humano',
      active: true,
    })
  })

  it('maps rows to frontend CRM AI types', () => {
    expect(mapLeadConversationLink({
      id: 'link-1',
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      conversation_id: 'conversation-1',
      channel: 'whatsapp',
      status: 'linked',
      match_method: 'phone',
      match_score: '95',
      contact_phone: null,
      contact_email: 'ana@example.com',
      linked_by: null,
      linked_at: null,
      created_at: '2026-06-04T12:00:00Z',
      updated_at: '2026-06-04T12:00:00Z',
    })).toMatchObject({
      id: 'link-1',
      matchScore: 95,
      contactEmail: 'ana@example.com',
    })

    expect(mapLeadAiInsight({
      id: 'insight-1',
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      conversation_id: null,
      ai_run_id: null,
      summary: 'Quer agendar',
      intent: 'agendamento',
      sentiment: 'positive',
      urgency: 'high',
      objections: ['preco'],
      risks: [],
      next_best_action: 'responder',
      confidence: '0.92',
      metadata: {},
      created_at: '2026-06-04T12:00:00Z',
    })).toMatchObject({
      summary: 'Quer agendar',
      confidence: 0.92,
      objections: ['preco'],
    })

    expect(mapFieldSuggestion({
      id: 'suggestion-1',
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      conversation_id: null,
      field_key: 'intent',
      current_value: null,
      suggested_value: 'agendamento',
      confidence: '0.88',
      reason: null,
      status: 'pending',
      confirmed_by: null,
      confirmed_at: null,
      created_at: '2026-06-04T12:00:00Z',
    })).toMatchObject({
      fieldKey: 'intent',
      suggestedValue: 'agendamento',
      confidence: 0.88,
    })

    expect(mapResponseSuggestion({
      id: 'response-1',
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      conversation_id: 'conversation-1',
      channel: 'whatsapp',
      body: 'Oi',
      status: 'draft',
      template_id: null,
      quick_reply_id: null,
      ai_insight_id: null,
      requires_approval: true,
      approved_by: null,
      sent_message_id: null,
      created_at: '2026-06-04T12:00:00Z',
      updated_at: '2026-06-04T12:00:00Z',
    })).toMatchObject({
      id: 'response-1',
      requiresApproval: true,
    })
  })
})
