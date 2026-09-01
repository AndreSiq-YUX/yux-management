import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionConversationWorkspace } from './MissionConversationWorkspace'
import { actionEngineService } from '@/services/actionEngineService'
import type { MissionConversation } from '@/types/actionEngine'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock)

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.useRealTimers() })

describe('MissionConversationWorkspace', () => {
  it('shows the accepted request immediately and explains the Harness processing state', async () => {
    vi.spyOn(actionEngineService, 'getMissionConversation').mockResolvedValue(conversation({ status: 'collecting_context' }))
    const { root } = await renderWorkspace()
    expect(document.body.textContent).toContain('Quero criar uma campanha completa')
    expect(document.body.textContent).toContain('Consultando estratégia YUX e contexto da empresa…')
    expect(document.body.querySelector('[aria-live="polite"]')?.textContent).toContain('consultando a estratégia YUX')
    act(() => root.unmount())
  })

  it('renders grouped questions, quick replies and separates methodology from customer context', async () => {
    const data = conversation({ status: 'awaiting_user', withAgent: true })
    vi.spyOn(actionEngineService, 'getMissionConversation').mockResolvedValue(data)
    const append = vi.spyOn(actionEngineService, 'appendMissionConversationMessage').mockResolvedValue({ conversation: { ...data, status: 'collecting_context', version: 3 }, jobId: 'job-2' })
    const { root } = await renderWorkspace()
    expect(document.body.textContent).toContain('Qual público devemos priorizar?')
    await click('Usar pequenas empresas')
    expect(append).toHaveBeenCalledWith(data.id, expect.objectContaining({ message: 'Usar pequenas empresas', expectedVersion: 2 }))
    await click('Contexto usado')
    expect(document.body.textContent).toContain('Estratégia YUX')
    expect(document.body.textContent).toContain('Contexto da empresa')
    expect(document.body.textContent).toContain('Metodologia YUX')
    expect(document.body.textContent).toContain('Perfil de cliente ideal')
    act(() => root.unmount())
  })

  it('sends on Enter and preserves Shift+Enter as a line break', async () => {
    const data = conversation({ status: 'awaiting_user', withAgent: true })
    vi.spyOn(actionEngineService, 'getMissionConversation').mockResolvedValue(data)
    const append = vi.spyOn(actionEngineService, 'appendMissionConversationMessage').mockResolvedValue({ conversation: { ...data, status: 'collecting_context', version: 3 }, jobId: 'job-3' })
    const { root } = await renderWorkspace()
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    await change(textarea, 'Primeira linha')
    await act(async () => { textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })); await flush() })
    expect(append).not.toHaveBeenCalled()
    await act(async () => { textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await flush() })
    expect(append).toHaveBeenCalledWith(data.id, expect.objectContaining({ message: 'Primeira linha' }))
    act(() => root.unmount())
  })

  it('retries an uncertain request with the same client message id', async () => {
    const data = conversation({ status: 'awaiting_user', withAgent: true })
    vi.spyOn(actionEngineService, 'getMissionConversation').mockResolvedValue(data)
    const append = vi.spyOn(actionEngineService, 'appendMissionConversationMessage')
      .mockRejectedValueOnce(new Error('Conexão interrompida'))
      .mockResolvedValueOnce({ conversation: { ...data, status: 'collecting_context', version: 3 }, jobId: 'job-retry' })
    const { root } = await renderWorkspace()
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    await change(textarea, 'Usar PMEs de Londrina')
    await clickByLabel('Enviar mensagem')
    expect(document.body.textContent).toContain('Tentar novamente')
    await click('Tentar novamente')
    expect(append).toHaveBeenCalledTimes(2)
    expect(append.mock.calls[1][1].clientMessageId).toBe(append.mock.calls[0][1].clientMessageId)
    act(() => root.unmount())
  })

  it('renders hostile message markup as inert content', async () => {
    const data = conversation({ status: 'awaiting_user' })
    data.messages[0]!.content = '<script>window.__missionInjected=true</script><img src=x onerror="window.__missionInjected=true">'
    vi.spyOn(actionEngineService, 'getMissionConversation').mockResolvedValue(data)
    const { root } = await renderWorkspace()
    expect(document.body.querySelector('script')).toBeNull()
    expect(document.body.querySelector('img')).toBeNull()
    expect((window as unknown as { __missionInjected?: boolean }).__missionInjected).toBeUndefined()
    act(() => root.unmount())
  })
})

async function renderWorkspace() {
  const container = document.createElement('div'); document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter><MissionConversationWorkspace conversationId="00000000-0000-4000-8000-000000000010" organizationId="00000000-0000-4000-8000-000000000001" canWrite backHref="/missions" missionHref={id => `/missions/${id}`} correctionHref={() => '/portal/empresa/perfil'} /></MemoryRouter>)
    await flush()
  })
  return { root }
}

function conversation({ status, withAgent = false }: { status: MissionConversation['status']; withAgent?: boolean }): MissionConversation {
  const base: MissionConversation = {
    id: '00000000-0000-4000-8000-000000000010', organizationId: '00000000-0000-4000-8000-000000000001', status,
    title: 'Campanha de aquisição', currentBrief: {}, briefHash: 'a'.repeat(64), contextReadiness: { status: 'needs_information' }, version: withAgent ? 2 : 1,
    createdBy: 'user-1', createdAt: '2026-08-31T12:00:00.000Z', updatedAt: '2026-08-31T12:00:00.000Z',
    messages: [{ id: 'message-1', organizationId: '00000000-0000-4000-8000-000000000001', conversationId: '00000000-0000-4000-8000-000000000010', sequence: 1, actorType: 'user', messageKind: 'text', content: 'Quero criar uma campanha completa', structuredPayload: {}, sourceRefs: [], createdAt: '2026-08-31T12:00:00.000Z' }],
  }
  if (withAgent) base.messages.push({
    id: 'message-2', organizationId: base.organizationId, conversationId: base.id, sequence: 2, actorType: 'agent', messageKind: 'question', content: 'Entendi o objetivo. Só preciso confirmar o público.',
    structuredPayload: { kind: 'questions', questions: [{ key: 'audience', label: 'Qual público devemos priorizar?', whyNeeded: 'Isso define a segmentação.', priority: 1, answerType: 'single_choice', choices: ['Usar pequenas empresas'] }], readiness: { status: 'needs_information', missing: [{ key: 'audience', category: 'audience', reason: 'Defina o público da campanha.' }] }, suggestedActions: [{ key: 'small', label: 'Usar pequenas empresas', kind: 'quick_reply' }] },
    sourceRefs: [
      { ref: 'yux:card-1', kind: 'strategy_card', id: 'card-1', version: '1', contentHash: 'a'.repeat(64), visibility: 'client_safe', title: 'Black Book', displayMode: 'generic' },
      { ref: 'customer:source-1', kind: 'knowledge_source', id: 'source-1', version: '1', contentHash: 'b'.repeat(64), visibility: 'both', title: 'Perfil de cliente ideal', displayMode: 'named' },
    ], createdAt: '2026-08-31T12:00:02.000Z',
  })
  return base
}

async function click(text: string) { const button = [...document.body.querySelectorAll('button')].find(item => item.textContent?.includes(text)); expect(button).toBeDefined(); await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush() }) }
async function clickByLabel(label: string) { const button = document.body.querySelector(`button[aria-label="${label}"]`); expect(button).not.toBeNull(); await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush() }) }
async function change(element: HTMLTextAreaElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); await flush() }) }
