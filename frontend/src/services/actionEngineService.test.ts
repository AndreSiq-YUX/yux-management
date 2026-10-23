import { afterEach, describe, expect, it, vi } from 'vitest'
import { actionEngineService } from './actionEngineService'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('actionEngineService mission conversations', () => {
  it.each([502, 503, 504])('recovers a temporary HTTP %i failure using the identical idempotent message', async status => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('Bad Gateway', { status }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ conversation: { id: 'conversation-1' }, jobId: 'accepted' }, 202))
    vi.stubGlobal('fetch', fetchMock)
    const result = actionEngineService.appendMissionConversationMessage('conversation-1', { organizationId: 'org-1', expectedVersion: 14, message: 'Conhece o Radar?' })
    const accepted = expect(result).resolves.toMatchObject({ jobId: 'accepted' })
    await vi.runAllTimersAsync()
    await accepted
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const bodies = fetchMock.mock.calls.map(call => call[1].body)
    expect(new Set(bodies).size).toBe(1)
    expect(JSON.parse(bodies[0]).clientMessageId).toBeTruthy()
  })

  it.each([403, 409, 500])('does not repeat a definitive HTTP %i failure', async status => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'definitive_failure' }, status))
    vi.stubGlobal('fetch', fetchMock)
    await expect(actionEngineService.appendMissionConversationMessage('conversation-1', { organizationId: 'org-1', expectedVersion: 14, message: 'Radar' })).rejects.toMatchObject({ status })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps rollout-disabled responses definitive and bounds transport retries', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'mission_conversations_disabled' }, 503))
    vi.stubGlobal('fetch', fetchMock)
    await expect(actionEngineService.appendMissionConversationMessage('conversation-1', { organizationId: 'org-1', expectedVersion: 14, message: 'Radar' })).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockReset().mockImplementation(async () => new Response('Unavailable', { status: 504 }))
    const result = actionEngineService.appendMissionConversationMessage('conversation-1', { organizationId: 'org-1', expectedVersion: 14, message: 'Radar', clientMessageId: 'same-message' })
    const rejected = expect(result).rejects.toMatchObject({ status: 504 })
    await vi.runAllTimersAsync()
    await rejected
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(new Set(fetchMock.mock.calls.map(call => call[1].body)).size).toBe(1)
  })

  it('creates a conversation with stable idempotency identifiers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ conversation: { id: 'conversation-1' }, jobId: 'job-1' }, 202))
    vi.stubGlobal('fetch', fetchMock)
    await actionEngineService.createMissionConversation({
      organizationId: 'org-1', contractId: 'contract-1', message: 'Criar campanha',
      clientMessageId: 'message-key', idempotencyKey: 'request-key',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/action-engine/mission-conversations', expect.objectContaining({ method: 'POST' }))
    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(options.headers).get('Idempotency-Key')).toBe('request-key')
    expect(JSON.parse(String(options.body))).toEqual(expect.objectContaining({ organizationId: 'org-1', contractId: 'contract-1', message: 'Criar campanha', clientMessageId: 'message-key' }))
  })

  it('appends and confirms against the exact conversation version', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ conversation: {}, jobId: 'job-2' }, 202)))
    vi.stubGlobal('fetch', fetchMock)
    await actionEngineService.appendMissionConversationMessage('conversation-1', { organizationId: 'org-1', expectedVersion: 4, message: 'PMEs', clientMessageId: 'message-2' })
    await actionEngineService.confirmMissionConversationBrief('conversation-1', { organizationId: 'org-1', expectedVersion: 5, briefHash: 'brief-hash' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/action-engine/mission-conversations/conversation-1/messages')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ organizationId: 'org-1', expectedVersion: 4, message: 'PMEs', clientMessageId: 'message-2' })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/action-engine/mission-conversations/conversation-1/confirm')
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ organizationId: 'org-1', expectedVersion: 5, briefHash: 'brief-hash' })
  })

  it('retries asynchronous processing without resending the user message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ conversation: {}, jobId: 'job-retry' }, 202))
    vi.stubGlobal('fetch', fetchMock)
    await actionEngineService.retryMissionConversationProcessing('conversation-1', { organizationId: 'org-1', expectedVersion: 4 })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/action-engine/mission-conversations/conversation-1/retry')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ organizationId: 'org-1', expectedVersion: 4 })
  })
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
