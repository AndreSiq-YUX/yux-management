import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionLearningPanel } from './MissionLearningPanel'
import type { LearningExperiment, LearningRecommendation, MissionLearningMemory } from '@/types/actionEngine'

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('MissionLearningPanel', () => {
  it('keeps memory approval explicit and creates shadow experiments without production effects', async () => {
    const onReviewMemory = vi.fn()
    const onCreateExperiment = vi.fn()
    const { root } = await render(<MissionLearningPanel
      memories={[memory]}
      recommendations={[recommendation]}
      experiments={[]}
      promotions={[]}
      onReviewMemory={onReviewMemory}
      onCreateExperiment={onCreateExperiment}
      onDecideExperiment={vi.fn()}
    />)

    expect(document.body.textContent).toContain('Somente resumos aprovados entram no contexto')
    expect(document.body.textContent).toContain('Uma recomendação nunca altera produção diretamente')
    await act(async () => findButton('Aprovar memória')?.click())
    expect(onReviewMemory).toHaveBeenCalledWith(memory, 'approved')
    await act(async () => findButton('Criar experimento shadow')?.click())
    expect(onCreateExperiment).toHaveBeenCalledWith(recommendation)
    act(() => root.unmount())
  })

  it('only enables promotion after the golden and comparison gates pass', async () => {
    const onDecideExperiment = vi.fn()
    const { root } = await render(<MissionLearningPanel
      memories={[]}
      recommendations={[{ ...recommendation, status: 'shadow_testing' }]}
      experiments={[experiment]}
      promotions={[]}
      onReviewMemory={vi.fn()}
      onCreateExperiment={vi.fn()}
      onDecideExperiment={onDecideExperiment}
    />)

    expect(document.body.textContent).toContain('Efeitos em produção: nenhum')
    const promotion = findButton('Solicitar promoção')!
    expect(promotion.disabled).toBe(false)
    await act(async () => promotion.click())
    expect(onDecideExperiment).toHaveBeenCalledWith(experiment, 'approved')
    act(() => root.unmount())
  })
})

const memory: MissionLearningMemory = {
  id: 'memory-1', organizationId: 'org-1', missionId: 'mission-1', packKey: 'revenue_recovery', packVersion: '1',
  outcomeHash: 'c'.repeat(64), evidenceIds: ['evidence-1'], summary: {}, reviewStatus: 'pending', createdAt: '2026-08-31T12:00:00Z',
}
const recommendation: LearningRecommendation = {
  id: 'recommendation-1', organizationId: 'org-1', missionId: 'mission-1', memorySummaryId: 'memory-1', recommendationType: 'pack_change',
  targetKey: 'revenue_recovery', rationale: 'Ajustar ordem das etapas.', evidenceIds: ['evidence-1'], expectedImpact: {},
  recommendationHash: 'a'.repeat(64), status: 'proposed', createdAt: '2026-08-31T12:00:00Z',
}
const experiment: LearningExperiment = {
  id: 'experiment-1', organizationId: 'org-1', recommendationId: recommendation.id, status: 'completed',
  baselineHash: 'd'.repeat(64), candidateConfig: {}, candidateConfigHash: 'e'.repeat(64), baselineMetrics: { cost: '10' }, candidateMetrics: { cost: '9' },
  comparison: { passed: true }, goldenCorpusHash: 'b'.repeat(64), goldenGatePassed: true,
  productionEffectsObserved: false, createdBy: 'admin-1', createdAt: '2026-08-31T12:00:00Z',
}

async function render(element: ReactNode): Promise<{ root: Root }> {
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container)
  await act(async () => { root.render(element) }); return { root }
}
function findButton(text: string) { return [...document.body.querySelectorAll('button')].find(button => button.textContent?.includes(text)) }
