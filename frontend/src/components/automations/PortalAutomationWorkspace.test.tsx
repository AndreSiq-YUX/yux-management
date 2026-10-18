import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutomationWorkspace } from './AutomationWorkspace'
import { AUTOMATION_MOBILE_EDIT_NOTICE } from './PortalAutomationWorkspace'
import type { AutomationFlow } from '@/types/automation'

const flow: AutomationFlow = {
  id: 'flow-1',
  organizationId: 'org-1',
  name: 'Follow-up Instagram',
  description: 'Fluxo comercial',
  status: 'published',
  isEnabled: true,
  triggers: [{ id: 'trigger-1', triggerType: 'lead.stage_changed', config: {} }],
  conditions: [{ id: 'condition-1', field: 'source', operator: 'equals', value: 'instagram' }],
  actions: [{ id: 'action-1', actionType: 'create_task', orderIndex: 1, payload: { title: 'Ligar' } }],
  executionRuns: [
    { id: 'run-1', status: 'failed', eventType: 'lead.stage_changed', lastError: 'provider failed', startedAt: '2026-06-03T13:00:00.000Z', completedAt: '2026-06-03T13:00:02.000Z' },
  ],
  createdAt: '2026-06-03T12:00:00.000Z',
  updatedAt: '2026-06-03T13:00:00.000Z',
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

function render(ui: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<MemoryRouter>{ui}</MemoryRouter>))
  return container
}

const buttonByText = (text: string, scope: ParentNode = document.body) =>
  Array.from(scope.querySelectorAll('button')).find(button => button.textContent?.includes(text)) as HTMLButtonElement | undefined

const click = (element: Element | undefined | null) => {
  expect(element).toBeTruthy()
  act(() => { (element as HTMLElement).click() })
}

describe('AutomationWorkspace (portal variant)', () => {
  it('opens with "O que você quer automatizar?" and the templates first, with the technical builder behind Modo avançado', () => {
    const onCreateFromTemplate = vi.fn()
    render(<AutomationWorkspace variant="portal" flows={[flow]} onCreateFromTemplate={onCreateFromTemplate} />)

    const text = document.body.textContent ?? ''
    expect(text).toContain('O que você quer automatizar?')
    expect(text.indexOf('O que você quer automatizar?')).toBeLessThan(text.indexOf('Seus fluxos'))
    expect(text).toContain('Responder lead novo')
    // modelo interno (portalVisible: false) não aparece para o cliente
    expect(text).not.toContain('Avisar campanha com CPL alto')
    // glossário
    expect(text).toContain('gatilho')
    expect(text).not.toMatch(/\btrigger\b/i)
    expect(text).not.toContain('Templates')

    // construtor técnico escondido
    expect(text).not.toContain('Construtor guiado')
    const toggle = buttonByText('Modo avançado')!
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    click(document.body.querySelector('button[aria-label="Criar fluxo: Responder lead novo"]'))
    expect(onCreateFromTemplate).toHaveBeenCalledWith('objective:new_lead_response')

    click(buttonByText('Follow-up Instagram'))
    expect(document.body.textContent).toContain('Gatilho')
    expect(document.body.textContent).toContain('Lead mudou de etapa')
    expect(document.body.textContent).toContain('Origem do lead é igual a instagram')
    expect(document.body.textContent).not.toContain('Construtor guiado')

    click(toggle)
    expect(buttonByText('Modo avançado')!.getAttribute('aria-pressed')).toBe('true')
    expect(document.body.textContent).toContain('Construtor guiado')
    expect(document.body.textContent).toContain('Modo de teste')
    expect(document.body.textContent).toContain('Quando (Gatilho)')
  })

  it('warns that editing works better on the computer while still showing the flow on mobile', () => {
    render(<AutomationWorkspace variant="portal" flows={[flow]} />)
    click(buttonByText('Follow-up Instagram'))
    click(buttonByText('Modo avançado'))

    const notice = document.body.querySelector('[data-testid="automation-mobile-edit-notice"]')
    expect(AUTOMATION_MOBILE_EDIT_NOTICE).toBe('A edição de fluxos funciona melhor no computador.')
    expect(notice?.textContent).toBe(AUTOMATION_MOBILE_EDIT_NOTICE)
    // visível só abaixo de 1024px
    expect(notice?.className).toContain('lg:hidden')
    // continua mostrando o fluxo (visualização) e o construtor
    expect(document.body.textContent).toContain('Follow-up Instagram')
    expect(document.body.textContent).toContain('Construtor guiado')
  })

  it('pauses without asking when nothing is running, and asks first when executions are in progress', async () => {
    const onToggleFlow = vi.fn()
    render(<AutomationWorkspace variant="portal" flows={[flow]} onToggleFlow={onToggleFlow} />)
    click(buttonByText('Follow-up Instagram'))
    click(buttonByText('Pausar'))
    expect(onToggleFlow).toHaveBeenCalledWith('flow-1', false)

    onToggleFlow.mockClear()
    act(() => root!.unmount())
    document.body.innerHTML = ''
    const running = { ...flow, executionRuns: [{ id: 'run-2', status: 'processing' as const, startedAt: '2026-06-03T13:00:00.000Z' }] }
    render(<AutomationWorkspace variant="portal" flows={[running]} onToggleFlow={onToggleFlow} />)
    click(buttonByText('Follow-up Instagram'))
    click(buttonByText('Pausar'))
    expect(onToggleFlow).not.toHaveBeenCalled()
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Pausar este fluxo?')
    expect(dialog?.textContent).toContain('1 execução está em andamento')
    await act(async () => { buttonByText('Pausar fluxo', dialog!)!.click() })
    expect(onToggleFlow).toHaveBeenCalledWith('flow-1', false)
  })

  it('always asks before deleting a flow', async () => {
    const onDeleteFlow = vi.fn()
    render(<AutomationWorkspace variant="portal" flows={[flow]} onDeleteFlow={onDeleteFlow} />)
    click(buttonByText('Follow-up Instagram'))
    click(buttonByText('Excluir'))
    expect(onDeleteFlow).not.toHaveBeenCalled()
    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('Excluir este fluxo?')
    expect(dialog.textContent).toContain('Esta ação não pode ser desfeita')
    await act(async () => { buttonByText('Excluir fluxo', dialog)!.click() })
    expect(onDeleteFlow).toHaveBeenCalledWith('flow-1')
  })

  it('maps the routes to sections: Modelos de fluxo and Execuções keep the B8 pending Reprocessar', () => {
    render(<AutomationWorkspace variant="portal" flows={[flow]} initialSection="Templates" />)
    expect(document.body.querySelector('h1')?.textContent).toBe('Modelos de fluxo')
    expect(document.body.textContent).toContain('Por setor')
    expect(document.body.textContent).not.toContain('O que você quer automatizar?')

    act(() => root!.unmount())
    document.body.innerHTML = ''
    render(<AutomationWorkspace variant="portal" flows={[flow]} initialSection="Execucoes" />)
    expect(document.body.querySelector('h1')?.textContent).toBe('Execuções')
    expect(document.body.textContent).toContain('Follow-up Instagram')
    expect(document.body.textContent).toContain('Falhou')
    expect(document.body.textContent).toContain('Lead mudou de etapa')
    const retry = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.includes('Reprocessar'))
    expect(retry?.textContent).toContain('Pendente')
  })

  it('lists 10 executions at a time with "Mostrar mais" (+10)', () => {
    const runs = Array.from({ length: 23 }, (_, index) => ({
      id: `run-${index + 1}`,
      status: 'completed' as const,
      eventType: 'lead.stage_changed',
      startedAt: new Date(Date.UTC(2026, 5, 3, 13, 0, 0) - index * 60_000).toISOString(),
      completedAt: new Date(Date.UTC(2026, 5, 3, 13, 0, 2) - index * 60_000).toISOString(),
    }))
    render(<AutomationWorkspace variant="portal" flows={[{ ...flow, executionRuns: runs }]} initialSection="Execucoes" />)
    const rowCount = () => document.body.querySelectorAll('tbody tr, [data-testid="responsive-table-card"], article').length
    expect(document.body.textContent).toContain('Mostrando 10 de 23')
    const initial = rowCount()
    expect(initial).toBeGreaterThanOrEqual(10)

    click(buttonByText('Mostrar mais'))
    expect(document.body.textContent).toContain('Mostrando 20 de 23')
    click(buttonByText('Mostrar mais'))
    expect(buttonByText('Mostrar mais')).toBeUndefined()
    expect(document.body.textContent).not.toContain('Mostrando')
  })

  it('shows an honest empty state when there are no flows', () => {
    render(<AutomationWorkspace variant="portal" flows={[]} />)
    expect(document.body.textContent).toContain('Nenhum fluxo ainda')
    expect(document.body.textContent).toContain('Criar do zero')
  })
})
