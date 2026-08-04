import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../src/config/env.js'
import { handleInboundMessage } from '../src/jobs/handlers/omnichannel.js'

class FakeOmnichannelPool {
  queries: Array<{ sql: string; params: unknown[] }> = []

  constructor(
    private readonly responseMode = 'assisted',
    private readonly assistantContext?: Record<string, unknown>,
  ) {}

  async query(sql: string, params: unknown[] = []) {
    this.queries.push({ sql, params })
    const normalized = sql.replace(/\s+/g, ' ').trim()
    if (normalized.includes("SET status = 'processing'")) return { rows: [{ id: 'event-1' }] }
    if (normalized.includes('FROM public.omnichannel_contacts')) return { rows: [{ id: 'contact-1' }] }
    if (normalized.includes('FROM public.conversations')) return { rows: [{ id: 'conversation-1', response_mode: this.responseMode }] }
    if (normalized.includes("'inbound','contact'")) return { rows: [{ id: 'inbound-1' }] }
    if (normalized.includes('FROM public.organizations organization')) return { rows: this.assistantContext ? [this.assistantContext] : [] }
    if (normalized.includes("'outbound','ai'")) return { rows: [{ id: 'ai-message-1' }] }
    return { rows: [] }
  }
}

const env = {
  YUX_AGENT_RUNTIME_URL: 'http://agent-runtime:8080',
  YUX_AGENT_RUNTIME_TOKEN: 'runtime-token',
} as AppEnv

afterEach(() => vi.unstubAllGlobals())

describe('Omnichannel AI conversation loop', () => {
  it('persists an AI suggestion and waits for approval when autonomy does not allow send', async () => {
    const pool = new FakeOmnichannelPool()
    const add = vi.fn(async () => ({}))
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body))
      expect(request).toMatchObject({ source: 'whatsapp', conversation_id: 'conversation-1' })
      return {
        ok: true,
        json: async () => ({
          run: { id: 'agent-run-1' },
          synthesis: {
            reply: { body: 'Qual e o principal desafio comercial hoje?', language: 'pt-BR' },
            classification: { intent: 'qualification', stage: 'lead', sentiment: 'neutral', urgency: 'none', confidence: 0.9 },
            qualification: { fitScoreDelta: 0, intentScoreDelta: 5, objections: [], nextBestAction: 'Perguntar contexto' },
          },
          policy: { autonomy_mode: 'suggestion', requires_approval: true, should_send: false, should_handoff: false, blocked: false },
        }),
      }
    }))

    const result = await handleInboundMessage(pool as never, env, {
      eventId: 'event-1',
      organizationId: 'org-1',
      connectionId: 'connection-1',
      inbound: {
        contact: { externalId: '5543999990000', phone: '+5543999990000', displayName: 'Lead' },
        message: { externalMessageId: 'wamid-1', contentType: 'text', body: 'Quero saber mais', metadata: {} },
      },
    }, { add })

    expect(result).toMatchObject({ conversationId: 'conversation-1', messageId: 'inbound-1', aiMessageId: 'ai-message-1' })
    expect(add).not.toHaveBeenCalled()
    const aiInsert = pool.queries.find(query => query.sql.includes("'outbound','ai'"))
    expect(String(aiInsert?.params[3])).toContain('"approvalStatus":"waiting_approval"')
    expect(String(aiInsert?.params[3])).toContain('"agentExecutionRunId":"agent-run-1"')
  })

  it('keeps an agent auto-send decision waiting for approval in assisted mode', async () => {
    const pool = new FakeOmnichannelPool('assisted')
    const add = vi.fn(async () => ({}))
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        run: { id: 'agent-run-2' },
        synthesis: {
          reply: { body: 'Posso explicar como funciona.', language: 'pt-BR' },
          classification: { intent: 'interest', sentiment: 'positive' },
          qualification: {},
        },
        policy: { should_send: true, should_handoff: false, blocked: false },
      }),
    })))

    await handleInboundMessage(pool as never, env, {
      eventId: 'event-1', organizationId: 'org-1', connectionId: 'connection-1',
      inbound: {
        contact: { externalId: '5543999990000', phone: '+5543999990000' },
        message: { externalMessageId: 'wamid-2', contentType: 'text', body: 'Como funciona?', metadata: {} },
      },
    }, { add })

    expect(add).not.toHaveBeenCalled()
    const aiInsert = pool.queries.find(query => query.sql.includes("'outbound','ai'"))
    expect(String(aiInsert?.params[3])).toContain('"approvalStatus":"waiting_approval"')
  })

  it('queues an approved AI reply only when the conversation is automatic', async () => {
    const pool = new FakeOmnichannelPool('automatic')
    const add = vi.fn(async () => ({}))
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        run: { id: 'agent-run-3' },
        synthesis: {
          reply: { body: 'Vamos avancar.', language: 'pt-BR' },
          classification: { intent: 'interest', sentiment: 'positive' },
          qualification: {},
        },
        policy: { should_send: true, should_handoff: false, blocked: false },
      }),
    })))

    await handleInboundMessage(pool as never, env, {
      eventId: 'event-1', organizationId: 'org-1', connectionId: 'connection-1',
      inbound: {
        contact: { externalId: '5543999990000', phone: '+5543999990000' },
        message: { externalMessageId: 'wamid-3', contentType: 'text', body: 'Quero avancar', metadata: {} },
      },
    }, { add })

    expect(add).toHaveBeenCalledWith('omnichannel.dispatchOutbound', { messageId: 'ai-message-1', source: 'ai_autonomy' })
    const aiInsert = pool.queries.find(query => query.sql.includes("'outbound','ai'"))
    expect(String(aiInsert?.params[3])).toContain('"approvalStatus":"approved"')
  })

  it('uses the configured assistant context and blocks an automatic reply that violates the brand rules', async () => {
    const pool = new FakeOmnichannelPool('automatic', {
      assistant_id: 'assistant-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      profile_key: 'ai_sdr_yux',
      vocabulary_dont: ['garantia de resultado'],
      forbidden_topics: ['política partidária'],
    })
    const add = vi.fn(async () => ({}))
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body))
      expect(request).toMatchObject({
        assistant_id: 'assistant-1',
        client_id: 'client-1',
        contract_id: 'contract-1',
        profile_key: 'ai_sdr_yux',
      })
      return {
        ok: true,
        json: async () => ({
          run: { id: 'agent-run-guardrail' },
          synthesis: {
            reply: { body: 'Oferecemos garantia de resultado para sua empresa.' },
            classification: { intent: 'interest', sentiment: 'positive' },
            qualification: {},
          },
          policy: { should_send: true, should_handoff: false, blocked: false },
        }),
      }
    }))

    await handleInboundMessage(pool as never, env, {
      eventId: 'event-1', organizationId: 'org-1', connectionId: 'connection-1',
      inbound: {
        contact: { externalId: '5543999990000', phone: '+5543999990000' },
        message: { externalMessageId: 'wamid-4', contentType: 'text', body: 'Vocês garantem resultado?', metadata: {} },
      },
    }, { add })

    expect(add).not.toHaveBeenCalled()
    const aiInsert = pool.queries.find(query => query.sql.includes("'outbound','ai'"))
    expect(String(aiInsert?.params[3])).toContain('"approvalStatus":"blocked"')
    expect(String(aiInsert?.params[3])).toContain('"blockedByBrandGuardrail":true')
    expect(String(aiInsert?.params[3])).toContain('garantia de resultado')
    const handoff = pool.queries.find(query => query.sql.includes('INSERT INTO public.handoff_events'))
    expect(handoff?.params[1]).toBe('brand_guardrail_blocked')
  })
})
