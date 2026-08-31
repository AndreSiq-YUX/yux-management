import { afterEach, describe, expect, it, vi } from 'vitest'
import { invokeMissionConversationTurn } from '../src/lib/agent-runtime-client.js'
import type { AppEnv } from '../src/config/env.js'
import type { MissionConversationTurnRequestWire } from '../src/modules/action-engine/generated/mission-wire.js'

const env = {
  YUX_AGENT_RUNTIME_URL: 'https://runtime.example/', YUX_AGENT_RUNTIME_TOKEN: 'secret-token',
} as AppEnv
const request = {
  schemaVersion: 1, organization_id: 'org-1', conversation_id: 'conversation-1',
  audience: 'client_user', user_message: 'Quero uma campanha', transcript: [], rollingSummary: '',
  currentBrief: {}, operationalContext: {}, allowedActionPacks: [], allowedCapabilityKeys: [],
} as MissionConversationTurnRequestWire
const valid = {
  schemaVersion: 1, kind: 'message', reply: 'Vamos começar.', understood: {}, questions: [],
  readiness: { status: 'needs_information', knownFacts: [], assumptions: [], missing: [] },
  brief: { objective: '', requestedOutcome: '', scopeHints: [], constraints: {}, acceptanceCriteria: [], packKeys: [] },
  suggestedActions: [], sources: [], retrievalTraceId: 'trace-1', contextHash: 'a'.repeat(64),
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Mission conversation runtime client', () => {
  it('uses the typed endpoint, bearer token and exactly one HTTP call', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(valid), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const response = await invokeMissionConversationTurn(env, request)
    expect(response.retrievalTraceId).toBe('trace-1')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[0]).toBe('https://runtime.example/missions/conversations/turn')
    expect((fetch.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer secret-token' })
  })

  it('runtime-validates the response and redacts unsafe provider detail', async () => {
    const invalidFetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ...valid, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 99 } }), { status: 200 }))
    vi.stubGlobal('fetch', invalidFetch)
    await expect(invokeMissionConversationTurn(env, request)).rejects.toThrow()
    expect(invalidFetch).toHaveBeenCalledTimes(1)

    const failedFetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ detail: 'provider failed <script>alert(1)</script>' }), { status: 503 }))
    vi.stubGlobal('fetch', failedFetch)
    await expect(invokeMissionConversationTurn(env, request)).rejects.toThrow('mission_conversation_runtime_503')
    expect(failedFetch).toHaveBeenCalledTimes(1)
  })

  it('aborts after the shared 60-second timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })))
    const pending = invokeMissionConversationTurn(env, request)
    const rejection = expect(pending).rejects.toThrow('aborted')
    await vi.advanceTimersByTimeAsync(60_000)
    await rejection
  })
})
