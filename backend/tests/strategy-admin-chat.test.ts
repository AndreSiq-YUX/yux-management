import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../src/config/env.js'
import {
  prepareStrategyAdminChat,
  processStrategyAdminChat,
} from '../src/modules/strategy-engine/admin-chat.js'

const actorUserId = '10000000-0000-4000-8000-000000000001'
const organizationId = '10000000-0000-4000-8000-000000000002'
const profileId = '10000000-0000-4000-8000-000000000003'
const sessionId = '10000000-0000-4000-8000-000000000004'
const routeId = '10000000-0000-4000-8000-000000000005'
const userMessageId = '10000000-0000-4000-8000-000000000006'
const assistantMessageId = '10000000-0000-4000-8000-000000000007'

afterEach(() => vi.unstubAllGlobals())

describe('strategy admin chat adapter', () => {
  it('creates durable queued chat rows before dispatching the harness job', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: profileId }] })
      .mockResolvedValueOnce({ rows: [{ id: sessionId, organization_id: organizationId, title: 'Analise inicial' }] })
      .mockResolvedValueOnce({ rows: [{ id: routeId, provider: 'openrouter', model_name: 'openai/gpt-4.1-mini' }] })
      .mockResolvedValueOnce({ rows: [{ id: userMessageId, session_id: sessionId, role: 'user', content: 'Diagnostique', status: 'completed' }] })
      .mockResolvedValueOnce({ rows: [{ id: assistantMessageId, session_id: sessionId, role: 'assistant', content: 'Estrategista analisando contexto...', status: 'queued' }] })
      .mockResolvedValueOnce({ rows: [] })

    const prepared = await prepareStrategyAdminChat({ query } as never, actorUserId, {
      message: 'Diagnostique',
      mode: 'initial_analysis',
      organizationId,
    })

    expect(prepared.assistantMessage).toMatchObject({ id: assistantMessageId, status: 'queued' })
    expect(prepared.jobBody).toMatchObject({
      sessionId,
      assistantMessageId,
      actorUserId,
      organizationId,
      message: 'Diagnostique',
    })
    expect(String(query.mock.calls[4][0])).toContain("'queued'")
  })

  it('maps the queued request to the harness wire format and completes the assistant message', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: assistantMessageId, status: 'completed', content: 'Plano priorizado' }] })
      .mockResolvedValueOnce({ rows: [{ id: sessionId, title: 'Diagnostique a operacao' }] })
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body))
      expect(payload).toMatchObject({
        profile_key: 'growth_strategist',
        source: 'strategy_admin',
        organization_id: organizationId,
        mode: 'diagnostic_48h',
      })
      expect(payload).not.toHaveProperty('organizationId')
      return new Response(JSON.stringify({
        run: { id: 'run-1' },
        synthesis: {
          answer: 'Plano priorizado',
          provider: 'openrouter',
          model: 'openai/gpt-4.1-mini',
          workflow_key: 'diagnostic_48h',
          supporting_cards: ['card-1'],
        },
        policy: { autonomy_mode: 'approval_required' },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetcher)

    const result = await processStrategyAdminChat({ query } as never, {
      YUX_AGENT_RUNTIME_URL: 'http://harness:8080',
      YUX_AGENT_RUNTIME_TOKEN: 'runtime-token',
    } as AppEnv, {
      message: 'Diagnostique a operacao',
      mode: 'diagnostic_48h',
      organizationId,
      sessionId,
      assistantMessageId,
      actorUserId,
    })

    expect(result.assistantMessage).toMatchObject({ status: 'completed', content: 'Plano priorizado' })
    expect(String(query.mock.calls[1][0])).toContain("status='completed'")
    expect(query.mock.calls[1][1]).toContain('Plano priorizado')
  })
})
