import { afterEach, describe, expect, it, vi } from 'vitest'
import { actionEngineService } from './actionEngineService'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('actionEngineService mission conversations', () => {
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
