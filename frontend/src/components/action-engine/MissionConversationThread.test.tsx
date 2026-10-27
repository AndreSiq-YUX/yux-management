import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { MissionConversationThread } from './MissionConversationThread'
import type { MissionConversation, MissionConversationMessage } from '@/types/actionEngine'

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
let root: Root | undefined
afterEach(() => { act(() => root?.unmount()); root = undefined; document.body.innerHTML = ''; vi.restoreAllMocks() })

const question = { key: 'segment', label: 'Qual segmento tem maior margem?', whyNeeded: 'Ajuda a priorizar.', priority: 1,
  answerType: 'single_choice' as const, choices: ['Padarias', 'Restaurantes'] }
function message(id: string, payload: MissionConversationMessage['structuredPayload'] = {}): MissionConversationMessage {
  return { id, organizationId: 'org-a', conversationId: 'conversation', sequence: Number(id), actorType: 'agent', messageKind: 'question',
    content: 'Eu começaria por segmentos com recompra frequente, testando uma oferta de entrada por região.',
    structuredPayload: payload, sourceRefs: [], createdAt: '2026-10-27T12:00:00Z' }
}
async function render(messages: MissionConversationMessage[], options: { canWrite?: boolean; processing?: boolean } = {}) {
  const element = document.createElement('div'); document.body.appendChild(element); root = createRoot(element)
  const onQuickReply = vi.fn(); const onInlineCorrection = vi.fn()
  const onConfirmBrief = vi.fn()
  await act(async () => { root!.render(<MemoryRouter><MissionConversationThread
    conversation={{ id: 'conversation', messages, status: 'awaiting_user' } as MissionConversation}
    processing={options.processing ?? false} canWrite={options.canWrite ?? true} onQuickReply={onQuickReply}
    correctionTarget={() => ({ mode: 'navigate', path: '/integracoes', fields: [] })} onInlineCorrection={onInlineCorrection}
    onConfirmBrief={onConfirmBrief}
  /></MemoryRouter>) })
  return { element, onQuickReply, onInlineCorrection, onConfirmBrief }
}

it('keeps advice first and does not repeat questions as warnings or duplicate quick replies', async () => {
  const { element, onQuickReply } = await render([message('1', { questions: [question],
    readiness: { status: 'needs_information', missing: [{ key: 'segment', category: 'audience', reason: 'INFORMACAO_DUPLICADA' }] },
    suggestedActions: [{ key: 'duplicate', label: 'Padarias', kind: 'quick_reply' }] })])
  expect(element.textContent).toContain('recompra frequente')
  expect(element.textContent).not.toContain('INFORMACAO_DUPLICADA')
  const choices = [...element.querySelectorAll('button')].filter(button => button.textContent === 'Padarias')
  expect(choices).toHaveLength(1)
  act(() => choices[0].click())
  expect(onQuickReply).toHaveBeenCalledWith('Padarias')
})

it('keeps old questions in collapsed history without actionable controls', async () => {
  const user = { ...message('2'), actorType: 'user' as const, content: 'Vamos priorizar restaurantes.' }
  const { element } = await render([message('1', { questions: [question], suggestedActions: [{ key: 'old', label: 'Resposta antiga', kind: 'quick_reply' }] }), user, message('3')])
  expect([...element.querySelectorAll('button')].some(button => ['Padarias', 'Resposta antiga'].includes(button.textContent ?? ''))).toBe(false)
  const history = [...element.querySelectorAll('details')].find(details => details.textContent?.includes(question.label))
  expect(history).toBeDefined(); expect(history?.open).toBe(false)
})

it('groups technical prerequisites under execution with a configuration link, never an inline request', async () => {
  const { element } = await render([message('1', { readiness: { status: 'needs_configuration', missing: [
    { key: 'email_connection', category: 'integration', reason: 'O remetente precisa ser verificado.', requiredFor: ['mission_execution'] },
  ] } })])
  const details = element.querySelector('details')
  expect(details?.querySelector('summary')?.textContent).toContain('Antes de executar')
  expect(details?.open).toBe(false)
  expect(element.querySelector('a')?.textContent).toContain('Ver configuração')
  expect(element.textContent).not.toContain('Preencher esta informação')
})

it.each([{ canWrite: false }, { processing: true }])('does not offer quick replies without an editable current turn: %j', async options => {
  const { element } = await render([message('1', { questions: [question], suggestedActions: [{ key: 'next', label: 'Continuar', kind: 'quick_reply' }] })], options)
  expect([...element.querySelectorAll('button')].some(button => ['Padarias', 'Continuar'].includes(button.textContent ?? ''))).toBe(false)
})

it('keeps current brief confirmation explicit and removes stale confirmation actions', async () => {
  const brief = { ...message('1', { brief: { title: 'Teste regional', objective: 'Validar recompra', maxTotalCostBrl: '0' } }), messageKind: 'brief' as const }
  const { element, onConfirmBrief } = await render([brief])
  const confirm = [...element.querySelectorAll('button')].find(button => button.textContent === 'Confirmar e preparar plano')!
  expect(confirm).toBeDefined(); act(() => confirm.click()); expect(onConfirmBrief).toHaveBeenCalledOnce()
  act(() => root?.unmount()); root = undefined; document.body.innerHTML = ''
  const old = await render([brief, { ...message('2'), actorType: 'user', content: 'Quero revisar o público antes.' }])
  expect(old.element.textContent).toContain('Validar recompra')
  expect([...old.element.querySelectorAll('button')].some(button => button.textContent === 'Confirmar e preparar plano')).toBe(false)
})
