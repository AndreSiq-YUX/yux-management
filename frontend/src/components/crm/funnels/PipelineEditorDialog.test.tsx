import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PipelineEditorDialog } from './PipelineEditorDialog'
import type { CrmPipeline } from '@/types/crm'

const pipeline: CrmPipeline = {
  id: 'pipeline-1',
  organizationId: 'org-1',
  crmInstanceId: 'instance-1',
  name: 'Vendas',
  description: 'Funil principal',
  isDefault: true,
  isActive: true,
  stages: [
    { id: 'stage-1', pipelineId: 'pipeline-1', key: 'new', name: 'Novo', color: '#2563eb', orderIndex: 0, isWon: false, isLost: false, isActive: true },
    { id: 'stage-2', pipelineId: 'pipeline-1', key: 'won', name: 'Ganho', color: '#16a34a', orderIndex: 1, isWon: true, isLost: false, isActive: true },
  ],
}

const callbacks = () => ({
  onCreatePipeline: vi.fn().mockResolvedValue(pipeline),
  onUpdatePipeline: vi.fn().mockResolvedValue(pipeline),
  onCreateStage: vi.fn().mockResolvedValue(pipeline.stages![0]),
  onUpdateStage: vi.fn().mockResolvedValue(pipeline.stages![0]),
  onReorderStages: vi.fn().mockResolvedValue(pipeline),
})

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('PipelineEditorDialog', () => {
  it('renders accessible stage configuration and reorder controls', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const handlers = callbacks()

    await act(async () => {
      root.render(
        <PipelineEditorDialog
          open
          pipeline={pipeline}
          pipelines={[pipeline]}
          organizationId="org-1"
          crmInstanceId="instance-1"
          maxPipelineCount={3}
          canEdit
          onOpenChange={vi.fn()}
          {...handlers}
        />,
      )
      await flush()
    })

    expect(document.body.textContent).toContain('Etapas do funil')
    expect(document.body.querySelector('button[aria-label="Mover etapa Novo para baixo"]')).not.toBeNull()
    expect(document.body.querySelector('button[aria-label="Mover etapa Ganho para cima"]')).not.toBeNull()
    expect(document.body.querySelector('button[aria-label="Mover etapa Novo para cima"]')?.hasAttribute('disabled')).toBe(true)

    act(() => root.unmount())
  })

  it('validates the pipeline name before creating it', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const handlers = callbacks()

    await act(async () => {
      root.render(
        <PipelineEditorDialog
          open
          pipeline={null}
          pipelines={[]}
          organizationId="org-1"
          crmInstanceId="instance-1"
          maxPipelineCount={3}
          canEdit
          onOpenChange={vi.fn()}
          {...handlers}
        />,
      )
      await flush()
    })

    const form = document.body.querySelector('form')
    expect(form).not.toBeNull()
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flush()
    })

    expect(document.body.textContent).toContain('Informe o nome do funil.')
    expect(handlers.onCreatePipeline).not.toHaveBeenCalled()

    act(() => root.unmount())
  })
})
