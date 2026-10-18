import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { AutomationWorkspace } from './AutomationWorkspace'
import type { AutomationFlow } from '@/types/automation'

const flow: AutomationFlow = {
  id: 'flow-1',
  organizationId: 'org-1',
  name: 'Follow-up Instagram',
  description: 'Fluxo comercial',
  status: 'published',
  isEnabled: true,
  sectorTemplateKey: 'clinic',
  lastError: 'provider failed',
  triggers: [{ id: 'trigger-1', triggerType: 'lead.stage_changed', config: { stageId: 'stage-2' } }],
  conditions: [{ id: 'condition-1', field: 'source', operator: 'equals', value: 'instagram' }],
  actions: [{ id: 'action-1', actionType: 'create_task', orderIndex: 1, payload: { title: 'Ligar' } }],
  executionRuns: [{ id: 'run-1', status: 'failed', lastError: 'provider failed', startedAt: '2026-06-03T13:00:00.000Z' }],
  createdAt: '2026-06-03T12:00:00.000Z',
  updatedAt: '2026-06-03T13:00:00.000Z',
}

describe('AutomationWorkspace', () => {
  it('renders intelligent automation navigation areas', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(<AutomationWorkspace flows={[]} />)
    })

    expect(container.innerHTML).toContain('Automações Inteligentes')
    expect(container.textContent).toContain('Fluxos, sequências, modelos, execuções e e-mails.')
    expect(container.textContent).not.toContain('YUX Hub')
    expect(container.innerHTML).toContain('Painel')
    expect(container.innerHTML).toContain('Automações')
    expect(container.innerHTML).toContain('Sequências')
    expect(container.innerHTML).toContain('Modelos')
    expect(container.innerHTML).toContain('Execuções')
    expect(container.innerHTML).toContain('Configurações')

    act(() => root.unmount())
  })

  it('marks the run reprocess action as pending without executing anything', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(<AutomationWorkspace flows={[flow]} />)
    })
    act(() => {
      Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Execuções'))!.click()
    })
    act(() => {
      container.querySelector<HTMLElement>('article div.cursor-pointer')!.click()
    })

    const retry = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Reprocessar'))
    expect(retry).toBeTruthy()
    expect(retry!.textContent).toContain('Pendente')
    expect(container.textContent).not.toContain('Tentar novamente')

    act(() => root.unmount())
  })

  it('switches between automation sections', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(<AutomationWorkspace flows={[]} />)
    })

    act(() => {
      Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Configurações'))!.click()
    })
    expect(container.innerHTML).toContain('Configuracoes de email')

    act(() => {
      Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Modelos'))!.click()
    })
    expect(container.innerHTML).toContain('Modelos setoriais')

    act(() => root.unmount())
  })

  it('renders backend unavailable notice and disables write actions', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onCreateFlow = vi.fn()

    act(() => {
      root.render(
        <AutomationWorkspace
          flows={[flow]}
          loadError="A base de automacoes ainda nao esta disponivel no backend alvo."
          backendUnavailable
          onCreateFlow={onCreateFlow}
        />,
      )
    })

    expect(container.innerHTML).toContain('Backend de automacoes pendente')
    const createButton = container.querySelector<HTMLButtonElement>('button[title="Criar fluxo"]')!
    expect(createButton.disabled).toBe(true)

    act(() => {
      createButton.click()
    })

    expect(onCreateFlow).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('renders flows, blocks, execution history, errors and template badges', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onCreateFlow = vi.fn()
    const onToggleFlow = vi.fn()
    const onPublishFlow = vi.fn()

    act(() => {
      root.render(
        <AutomationWorkspace
          flows={[flow]}
          onCreateFlow={onCreateFlow}
          onToggleFlow={onToggleFlow}
          onPublishFlow={onPublishFlow}
        />,
      )
    })

    const html = container.innerHTML
    expect(html).toContain('Follow-up Instagram')
    expect(html).toContain('published')
    expect(html).toContain('Ativo')
    expect(html).toContain('lead.stage_changed')
    expect(html).toContain('source equals instagram')
    expect(html).toContain('create_task')
    expect(html).toContain('provider failed')
    expect(html).toContain('clinic')
    expect(html).toContain('run-1')

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Alternar fluxo"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Publicar fluxo"]')!.click()
    })

    expect(onToggleFlow).toHaveBeenCalledWith('flow-1', false)
    
    act(() => {
      const confirmButton = Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Publicar') && btn.closest('[role="dialog"]')
      )
      confirmButton?.click()
    })
    
    expect(onPublishFlow).toHaveBeenCalledWith('flow-1')

    act(() => root.unmount())
  })
})
