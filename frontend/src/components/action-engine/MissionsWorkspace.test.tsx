import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionsWorkspace } from './MissionsWorkspace'
import { actionEngineService } from '@/services/actionEngineService'
import type { MissionConversation } from '@/types/actionEngine'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

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
})

async function renderWorkspace() { const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container); await act(async () => { root.render(<MemoryRouter><MissionsWorkspace organizationId="00000000-0000-4000-8000-000000000001" contractId="00000000-0000-4000-8000-000000000002" canWrite detailHref={id => `/missions/${id}`} conversationHref={id => `/missions/conversations/${id}`} /></MemoryRouter>); await flush(); await flush() }); return { root } }
function activeConversation(): MissionConversation { return { id: '00000000-0000-4000-8000-000000000010', organizationId: '00000000-0000-4000-8000-000000000001', status: 'awaiting_user', title: 'Campanha para Londrina', currentBrief: {}, contextReadiness: { status: 'needs_information' }, version: 2, createdBy: 'user-1', createdAt: '2026-08-31T12:00:00.000Z', updatedAt: '2026-08-31T12:00:00.000Z', messages: [] } }
async function click(text: string) { const button = [...document.body.querySelectorAll('button')].find(item => item.textContent?.includes(text)); expect(button).toBeDefined(); await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush() }) }
async function clickByLabel(label: string) { const button = document.body.querySelector(`button[aria-label="${label}"]`); expect(button).not.toBeNull(); await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush() }) }
async function change(element: HTMLTextAreaElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); await flush() }) }
