import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionsWorkspace } from './MissionsWorkspace'
import { actionEngineService } from '@/services/actionEngineService'
import type { ActionMission, MissionConversation } from '@/types/actionEngine'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('MissionsWorkspace', () => {
  it('uses conversation as the primary entry and shows active requests above the portfolio', async () => {
    vi.spyOn(actionEngineService, 'listMissions').mockResolvedValue([])
    vi.spyOn(actionEngineService, 'listMissionConversations').mockResolvedValue([activeConversation()])
    const { root } = await renderWorkspace()
    expect(document.body.textContent).toContain('Conversar com o agente')
    expect(document.body.textContent).toContain('Pedidos em conversa')
    expect(document.body.textContent).toContain('Campanha para Londrina')
    expect(document.body.textContent?.indexOf('Pedidos em conversa')).toBeLessThan(document.body.textContent?.indexOf('Portfólio de missões') ?? 0)
    act(() => root.unmount())
  })

  it('starts with natural language instead of opening the legacy form', async () => {
    vi.spyOn(actionEngineService, 'listMissions').mockResolvedValue([])
    vi.spyOn(actionEngineService, 'listMissionConversations').mockResolvedValue([])
    const create = vi.spyOn(actionEngineService, 'createMissionConversation').mockResolvedValue({ conversation: activeConversation(), jobId: 'job-1' })
    const { root } = await renderWorkspace()
    await click('Conversar com o agente')
    expect(document.body.textContent).toContain('Pode explicar do seu jeito')
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    await change(textarea, 'Quero lançar uma campanha para captar PMEs.')
    await clickByLabel('Enviar mensagem')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ message: 'Quero lançar uma campanha para captar PMEs.' }))
    act(() => root.unmount())
  })

  it('explains a legacy form context instead of replacing the conversation with a form', async () => {
    vi.spyOn(actionEngineService, 'listMissions').mockResolvedValue([])
    vi.spyOn(actionEngineService, 'listMissionConversations').mockResolvedValue([])
    const { root } = await renderWorkspace({ mode: 'form', reasonCode: 'mission_conversation_disabled' })
    expect(document.body.textContent).not.toContain('Conversar com o agente')
    expect(document.body.textContent).toContain('A conversa com o agente está temporariamente indisponível')
    expect(document.body.textContent).not.toContain('Criar missão')
    expect(document.body.textContent).not.toContain('Descreva o resultado desejado')
    expect(document.body.textContent).not.toContain('Pode explicar do seu jeito')
    act(() => root.unmount())
  })

  it('explains that the conversation has not been released for this workspace without showing a limited alternative', async () => {
    vi.spyOn(actionEngineService, 'listMissions').mockResolvedValue([])
    vi.spyOn(actionEngineService, 'listMissionConversations').mockResolvedValue([activeConversation()])
    const { root } = await renderWorkspace({ mode: 'unavailable', reasonCode: 'mission_conversation_not_allowlisted' })
    expect(document.body.textContent).toContain('A conversa com o agente ainda não foi liberada para este workspace')
    expect(document.body.textContent).toContain('Campanha para Londrina')
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.textContent).not.toContain('Criar missão')
    act(() => root.unmount())
  })

  it('preserves the portfolio and typed request when conversation creation fails', async () => {
    vi.spyOn(actionEngineService, 'listMissions').mockResolvedValue([])
    vi.spyOn(actionEngineService, 'listMissionConversations').mockResolvedValue([activeConversation()])
    vi.spyOn(actionEngineService, 'createMissionConversation').mockRejectedValue(new Error('Serviço temporariamente indisponível'))
    const { root } = await renderWorkspace()
    await click('Conversar com o agente')
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    await change(textarea, 'Texto que deve continuar aqui')
    await clickByLabel('Enviar mensagem')
    expect(document.body.textContent).toContain('Campanha para Londrina')
    expect(document.body.textContent).toContain('O texto foi preservado')
    expect((document.body.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Texto que deve continuar aqui')
    act(() => root.unmount())
  })

  it('keeps existing missions visible and offers the permitted alternative when creation is unavailable', async () => {
    vi.spyOn(actionEngineService, 'listMissions').mockResolvedValue([])
    vi.spyOn(actionEngineService, 'listMissionConversations').mockResolvedValue([activeConversation()])
    const { root } = await renderWorkspace({ mode: 'unavailable', reasonCode: 'mission_write_not_permitted' })
    expect(document.body.textContent).toContain('Campanha para Londrina')
    expect(document.body.textContent).toContain('solicitar a criação a um administrador do workspace')
    expect(document.body.textContent).not.toContain('Pode explicar do seu jeito')
    act(() => root.unmount())
  })

  it('explains when mission creation is disabled globally without suggesting a permission workaround', async () => {
    vi.spyOn(actionEngineService, 'listMissions').mockResolvedValue([])
    vi.spyOn(actionEngineService, 'listMissionConversations').mockResolvedValue([activeConversation()])
    const { root } = await renderWorkspace({ mode: 'unavailable', reasonCode: 'mission_supervisor_disabled' })
    expect(document.body.textContent).toContain('Supervisor de Missões não está habilitado')
    expect(document.body.textContent).not.toContain('solicitar a criação a um administrador do workspace')
    expect(document.body.textContent).toContain('Campanha para Londrina')
    act(() => root.unmount())
  })
})

describe('MissionsWorkspace (portal profile)', () => {
  it('puts conversations that wait for the client first, with status text and the gradient action', async () => {
    vi.spyOn(actionEngineService, 'listMissions').mockResolvedValue([portalMission()])
    vi.spyOn(actionEngineService, 'listMissionConversations').mockResolvedValue([activeConversation()])
    vi.spyOn(actionEngineService, 'getEconomics').mockResolvedValue({ producedValueBrl: '2500', humanFreeExecutionRate: '1' })
    const { root } = await renderWorkspace(undefined, 'portal')
    const text = document.body.textContent ?? ''
    expect(text).toContain('Missões')
    expect(text).toContain('Aguardando sua resposta')
    expect(text.indexOf('Aguardando sua resposta')).toBeLessThan(text.indexOf('Suas missões'))
    const respond = [...document.body.querySelectorAll('a')].find(link => link.textContent === 'Responder ao agente')
    expect(respond?.getAttribute('href')).toBe('/missions/conversations/00000000-0000-4000-8000-000000000010')
    expect(respond?.className).toContain('bg-brand-gradient')
    for (const forbidden of ['Action Engine', 'governad', 'Target']) expect(text).not.toContain(forbidden)
    act(() => root.unmount())
  })

  it('shows mission progress toward the goal as produced value over target, clamped to 100%', async () => {
    vi.spyOn(actionEngineService, 'listMissions').mockResolvedValue([portalMission(), portalMission({ id: 'mission-2', title: 'Funil de nutrição', parameters: { targetRevenueBrl: '1000' } as ActionMission['parameters'] }), portalMission({ id: 'mission-3', title: 'Sem meta', parameters: { targetRevenueBrl: '0' } as ActionMission['parameters'] })])
    vi.spyOn(actionEngineService, 'listMissionConversations').mockResolvedValue([])
    vi.spyOn(actionEngineService, 'getEconomics').mockImplementation(async missionId => ({ producedValueBrl: missionId === 'mission-1' ? '2500' : '5000', humanFreeExecutionRate: '1' }))
    const { root } = await renderWorkspace(undefined, 'portal')
    const bars = [...document.body.querySelectorAll('[role="progressbar"]')]
    expect(bars.map(bar => [bar.getAttribute('aria-label'), bar.getAttribute('aria-valuenow')])).toEqual([
      ['Campanha para Londrina', '25'],
      ['Funil de nutrição', '100'],
    ])
    expect(document.body.textContent).toContain('Meta:')
    expect(document.body.textContent).toContain('Prazo:')
    expect(document.body.textContent).toContain('Sem meta definida')
    act(() => root.unmount())
  })

  it('closes the new-mission conversation window with Esc and returns focus to the trigger', async () => {
    vi.spyOn(actionEngineService, 'listMissions').mockResolvedValue([])
    vi.spyOn(actionEngineService, 'listMissionConversations').mockResolvedValue([])
    const { root } = await renderWorkspace(undefined, 'portal')
    await click('Conversar com o agente')
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.contains(document.activeElement)).toBe(true)
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush() })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    act(() => root.unmount())
  })
})

function portalMission(overrides: Partial<ActionMission> = {}): ActionMission {
  return {
    id: 'mission-1', organizationId: '00000000-0000-4000-8000-000000000001', packVersionId: 'v1', status: 'active', mode: 'assisted',
    title: 'Campanha para Londrina', objective: 'Captar empresas da região', goal: { statement: 'Captar empresas', requestedOutcome: 'campaign_launch' } as ActionMission['goal'],
    autonomyEnvelope: {} as ActionMission['autonomyEnvelope'], packSelection: {}, parameters: { targetRevenueBrl: '10000' } as ActionMission['parameters'], budget: {},
    deadlineAt: '2026-12-31T12:00:00.000Z', version: 1, createdBy: 'user-1', createdAt: '2026-08-31T12:00:00.000Z', updatedAt: '2026-08-31T12:00:00.000Z',
    ...overrides,
  }
}

async function renderWorkspace(missionCreation: { mode: 'conversation' | 'form' | 'unavailable'; reasonCode: string | null } = { mode: 'conversation', reasonCode: null }, profile: 'default' | 'portal' = 'default') { const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container); await act(async () => { root.render(<MemoryRouter><MissionsWorkspace profile={profile} organizationId="00000000-0000-4000-8000-000000000001" contractId="00000000-0000-4000-8000-000000000002" canWrite missionCreation={missionCreation} detailHref={id => `/missions/${id}`} conversationHref={id => `/missions/conversations/${id}`} /></MemoryRouter>); await flush(); await flush() }); return { root } }
function activeConversation(): MissionConversation { return { id: '00000000-0000-4000-8000-000000000010', organizationId: '00000000-0000-4000-8000-000000000001', status: 'awaiting_user', title: 'Campanha para Londrina', currentBrief: {}, briefHash: 'a'.repeat(64), contextReadiness: { status: 'needs_information' }, version: 2, createdBy: 'user-1', createdAt: '2026-08-31T12:00:00.000Z', updatedAt: '2026-08-31T12:00:00.000Z', messages: [] } }
async function click(text: string) { const button = [...document.body.querySelectorAll('button')].find(item => item.textContent?.includes(text)); expect(button).toBeDefined(); await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush() }) }
async function clickByLabel(label: string) { const button = document.body.querySelector(`button[aria-label="${label}"]`); expect(button).not.toBeNull(); await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush() }) }
async function change(element: HTMLTextAreaElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); await flush() }) }
