import { describe, expect, it } from 'vitest'
import {
  buildOmnichannelFilters,
  deriveProviderHealth,
  mapAiRun,
  mapKnowledgePublication,
  mapOmnichannelConversation,
  mapOmnichannelMessage,
  mapPortalConversation,
} from './omnichannelService'

describe('omnichannel service mappings', () => {
  it('maps conversation list rows with contact, connection, queue, team and assigned user summaries', () => {
    expect(mapOmnichannelConversation({
      id: 'conversation-1',
      organization_id: 'org-1',
      contact_id: 'contact-1',
      connection_id: 'connection-1',
      channel: 'whatsapp',
      status: 'assigned',
      response_mode: 'assisted',
      queue_id: 'queue-1',
      team_id: 'team-1',
      assigned_user_id: 'user-1',
      lead_id: 'lead-1',
      subject: 'Lead enterprise',
      summary: 'Quer contratar suporte',
      classification: 'sales',
      sentiment: 'positive',
      commercial_intent: 'high',
      scheduling_intent: 'requested',
      last_message_at: '2026-06-01T12:00:00Z',
      sla_deadline_at: '2026-06-01T13:00:00Z',
      resolved_at: null,
      created_at: '2026-06-01T10:00:00Z',
      updated_at: '2026-06-01T12:30:00Z',
      omnichannel_contacts: {
        id: 'contact-1',
        display_name: 'Ana Cliente',
        email: 'ana@example.com',
        phone: '+5511999999999',
        lead_id: 'lead-1',
        client_id: null,
      },
      channel_connections: {
        id: 'connection-1',
        channel: 'whatsapp',
        name: 'WhatsApp comercial',
        adapter_key: 'meta-whatsapp',
        is_active: true,
        provider_account_id: 'waba-1',
        phone_number_id: 'phone-number-1',
        provider_verify_state: 'verified',
        token_state: 'connected',
        last_provider_sync_at: '2026-06-01T12:15:00Z',
        protected_metadata_references: { accessTokenEnv: 'WHATSAPP_ACCESS_TOKEN' },
      },
      conversation_queues: { id: 'queue-1', name: 'Comercial' },
      omnichannel_teams: { id: 'team-1', name: 'Vendas' },
      users: { id: 'user-1', name: 'Marina' },
      conversation_tags: [{ tag: 'vip' }, { tag: 'enterprise' }],
    })).toMatchObject({
      id: 'conversation-1',
      organizationId: 'org-1',
      contact: { displayName: 'Ana Cliente', email: 'ana@example.com' },
      connection: {
        name: 'WhatsApp comercial',
        adapterKey: 'meta-whatsapp',
        phoneNumberId: 'phone-number-1',
        tokenState: 'connected',
        health: { label: 'WhatsApp conectado' },
      },
      queue: { name: 'Comercial' },
      team: { name: 'Vendas' },
      assignedUser: { name: 'Marina' },
      tags: ['vip', 'enterprise'],
    })
  })

  it('derives explicit WhatsApp provider health states', () => {
    expect(deriveProviderHealth({
      isActive: true,
      channel: 'whatsapp',
      phoneNumberId: 'phone-number-1',
      providerVerifyState: 'verified',
      tokenState: 'connected',
    })).toEqual({ state: 'healthy', label: 'WhatsApp conectado' })

    expect(deriveProviderHealth({
      isActive: true,
      channel: 'whatsapp',
      phoneNumberId: 'phone-number-1',
      providerVerifyState: 'verified',
      tokenState: 'needs_reauth',
    })).toEqual({ state: 'blocked', label: 'WhatsApp precisa reautenticar' })
  })

  it('maps message rows with attachment metadata', () => {
    expect(mapOmnichannelMessage({
      id: 'message-1',
      conversation_id: 'conversation-1',
      connection_id: 'connection-1',
      direction: 'inbound',
      author_type: 'contact',
      author_user_id: null,
      content_type: 'text',
      body: 'Oi',
      external_message_id: 'external-1',
      delivery_status: 'delivered',
      metadata: { channelMessage: true },
      created_at: '2026-06-01T12:00:00Z',
      updated_at: '2026-06-01T12:00:00Z',
      message_attachments: [{
        id: 'attachment-1',
        message_id: 'message-1',
        storage_path: 'org-1/conversation-1/file.pdf',
        filename: 'file.pdf',
        mime_type: 'application/pdf',
        byte_size: '2048',
        retention_deadline_at: '2027-06-01T12:00:00Z',
        created_at: '2026-06-01T12:00:00Z',
        updated_at: '2026-06-01T12:00:00Z',
      }],
    })).toMatchObject({
      id: 'message-1',
      attachments: [{ filename: 'file.pdf', byteSize: 2048 }],
    })
  })

  it('maps AI run numeric values returned as strings or numbers', () => {
    expect(mapAiRun({
      id: 'run-1',
      organization_id: 'org-1',
      conversation_id: 'conversation-1',
      inbound_message_id: 'inbound-1',
      outbound_message_id: 'outbound-1',
      logical_provider: 'n8n',
      model: 'provider-neutral',
      status: 'completed',
      input_tokens: '1200',
      output_tokens: 300,
      estimated_cost: '0.0042',
      latency_ms: '840',
      fallback_used: false,
      protected_error_text: null,
      metadata: { confidence: 0.87 },
      created_at: '2026-06-01T12:00:00Z',
      updated_at: '2026-06-01T12:00:00Z',
    })).toMatchObject({
      inputTokens: 1200,
      outputTokens: 300,
      estimatedCost: 0.0042,
      latencyMs: 840,
    })
  })

  it('omits protected internal fields from portal mapper results', () => {
    const portalConversation = mapPortalConversation({
      id: 'conversation-1',
      organization_id: 'org-1',
      contact_id: 'contact-1',
      connection_id: 'connection-1',
      channel: 'email',
      status: 'open',
      response_mode: 'manual',
      queue_id: null,
      team_id: null,
      assigned_user_id: null,
      lead_id: null,
      subject: 'Suporte',
      summary: 'Resumo para cliente',
      classification: 'support',
      sentiment: 'neutral',
      commercial_intent: 'none',
      scheduling_intent: 'none',
      last_message_at: null,
      sla_deadline_at: null,
      resolved_at: null,
      created_at: '2026-06-01T10:00:00Z',
      updated_at: '2026-06-01T10:00:00Z',
      ai_message_runs: [{
        estimated_cost: '10.5',
        protected_error_text: 'provider stack trace',
        metadata: { margin: 30 },
      }],
      channel_webhook_events: [{
        protected_error_text: 'raw webhook failure',
        sanitized_payload: { provider: 'secret-ish' },
      }],
    })

    expect(JSON.stringify(portalConversation)).not.toContain('protected')
    expect(JSON.stringify(portalConversation)).not.toContain('estimatedCost')
    expect(JSON.stringify(portalConversation)).not.toContain('margin')
    expect(JSON.stringify(portalConversation)).not.toContain('webhook')
  })

  it('builds filters excluding empty values', () => {
    expect(buildOmnichannelFilters({
      organizationId: 'org-1',
      channel: '',
      status: 'open',
      queueId: undefined,
      teamId: 'team-1',
      assignedUserId: null,
      sla: 'overdue',
      tag: '',
      handoff: false,
    })).toEqual({
      organization_id: 'org-1',
      status: 'open',
      team_id: 'team-1',
      sla: 'overdue',
      handoff: false,
    })
  })

  it('maps knowledge publication snapshots detached from later draft edits', () => {
    const row = {
      id: 'publication-1',
      organization_id: 'org-1',
      entry_id: 'entry-1',
      body_snapshot: 'Resposta publicada',
      publisher_user_id: 'user-1',
      published_at: '2026-06-01T12:00:00Z',
      knowledge_entries: {
        id: 'entry-1',
        title: 'FAQ',
        body: 'Rascunho editado depois',
        status: 'draft',
      },
    }

    const publication = mapKnowledgePublication(row)
    row.body_snapshot = 'Mudou'
    row.knowledge_entries.body = 'Outro rascunho'

    expect(publication).toMatchObject({
      bodySnapshot: 'Resposta publicada',
      entry: { body: 'Rascunho editado depois' },
    })
  })
})
