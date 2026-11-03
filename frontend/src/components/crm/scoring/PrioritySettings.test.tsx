import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { PrioritySettings } from './PrioritySettings'
import { crmPriorityService } from '@/services/crmPriorityService'

vi.mock('@/services/crmPriorityService', () => ({
  crmPriorityService: {
    model: vi.fn(),
    save: vi.fn(),
    preview: vi.fn(),
    publish: vi.fn(),
    activate: vi.fn(),
    setEffects: vi.fn(),
  },
}))

it('requires a complete preview of the saved revision and explicit publication confirmation', async () => {
  const draft = {
    fitWeight: 50,
    temperatureWeight: 50,
    minimumCoverage: 50,
    historyDays: 90,
    timeZone: 'UTC',
    fitGroups: [
      {
        id: 'group',
        label: 'Empresa',
        maxPoints: 100,
        recordTypeId: null,
        alternatives: [
          {
            fieldKey: 'lead.company',
            operator: 'exists' as const,
            recordTypeId: null,
            points: 100,
            bands: [],
            estimated: false,
          },
        ],
      },
    ],
    interestGroups: [],
    inactivity: [],
    exclusions: [],
    fitBands: [{ id: 'fit', label: 'Potencial', min: 0 }],
    temperatureBands: [{ id: 'cold', label: 'Frio', min: 0 }],
    queues: [{ id: 'queue', label: 'Acompanhar' }],
    matrix: [{ fitBandId: 'fit', temperatureBandId: 'cold', queueId: 'queue' }],
  }
  vi.mocked(crmPriorityService.model).mockResolvedValue({
    revision: 3,
    canEdit: true,
    draft,
    activeActivationId: null,
    activeVersionId: null,
    effectsEnabled: false,
    versions: [],
    fields: [
      { key: 'lead.company', label: 'Empresa', type: 'text', recordTypeId: null, options: [] },
    ],
    recordTypes: [],
  })
  vi.mocked(crmPriorityService.preview).mockResolvedValue({
    revision: 3,
    runId: 'run',
    results: [],
    nextCursor: null,
    historyDays: 90,
    totals: { processed: 2, ranked: 1, excluded: 0, needsData: 1, byQueue: { queue: 1 } },
  })
  vi.mocked(crmPriorityService.publish).mockResolvedValue({
    activationId: 'active',
    versionId: 'version',
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const button = (name: string) =>
    Array.from(host.querySelectorAll('button')).find((node) => node.textContent === name)!
  try {
    await act(async () => root.render(<PrioritySettings crmInstanceId="instance" />))
    expect(button('Publicar modelo').disabled).toBe(true)
    expect(button('Ativar tarefas automáticas')).toBeUndefined()
    await act(async () => button('Simular carteira').click())
    expect(crmPriorityService.preview).toHaveBeenCalledWith({
      crmInstanceId: 'instance',
      revision: 3,
    })
    await act(async () => button('Publicar modelo').click())
    expect(crmPriorityService.publish).not.toHaveBeenCalled()
    await act(async () =>
      Array.from(document.querySelectorAll('button'))
        .find((node) => node.textContent === 'Confirmar publicação')!
        .click(),
    )
    expect(crmPriorityService.publish).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 3, runId: 'run' }),
    )
    expect(crmPriorityService.setEffects).not.toHaveBeenCalled()
    vi.mocked(crmPriorityService.setEffects).mockResolvedValue({ effectsEnabled: true })
    await act(async () => button('Ativar tarefas automáticas').click())
    expect(crmPriorityService.setEffects).not.toHaveBeenCalled()
    await act(async () =>
      Array.from(document.querySelectorAll('button'))
        .find((node) => node.textContent === 'Confirmar alteração')!
        .click(),
    )
    expect(crmPriorityService.setEffects).toHaveBeenCalledWith({
      crmInstanceId: 'instance',
      expectedActivationId: 'active',
      enabled: true,
    })
    expect(button('Pausar tarefas automáticas')).toBeDefined()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
