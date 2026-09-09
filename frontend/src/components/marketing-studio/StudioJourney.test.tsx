import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceContextV1 } from '@/types/generated/workspace'
import type { StudioJourneySummary } from '@/types/marketingStudio'

const service = vi.hoisted(() => ({
  getJourneySummary: vi.fn(),
  createJourneyPlan: vi.fn(),
  createJourneyContentVersion: vi.fn(),
  submitJourneyContentForReview: vi.fn(),
  decideJourneyContentReview: vi.fn(),
  createJourneyPublishingIntent: vi.fn(),
}))

vi.mock('@/services/marketingStudioService', () => ({ marketingStudioService: service }))
vi.mock('@/hooks/usePortalWorkspacePath', () => ({ usePortalWorkspacePath: () => (href = '/portal') => href }))

import { StudioJourney } from './StudioJourney'

const workspaceContext: WorkspaceContextV1 = {
  schemaVersion: 1,
  organizationId: '00000000-0000-4000-8000-000000000001',
  contractId: '00000000-0000-4000-8000-000000000002',
  kind: 'client',
  role: 'client_admin',
  moduleKeys: ['marketing_studio'],
  canConfigure: true,
  missionCreation: { mode: 'conversation', reasonCode: null },
}

const emptySummary: StudioJourneySummary = {
  organizationId: workspaceContext.organizationId,
  contractId: workspaceContext.contractId!,
  clientId: 'client-1',
  window: { since: '2026-08-01T00:00:00.000Z', until: '2026-09-01T00:00:00.000Z' },
  counts: { activeFlows: 0, generatedAssets: 0, pendingReviews: 0, scheduledAssets: 0, failedPublications: 0 },
  links: {
    activeFlows: '/portal/marketing/studio#flows', generatedAssets: '/portal/marketing/studio#contents',
    pendingReviews: '/portal/marketing/studio#reviews', scheduledAssets: '/portal/marketing/studio#calendar',
    failedPublications: '/portal/marketing/studio#publishing',
  },
  campaigns: [], contents: [], workflows: [], publishingRuns: [], calendarItems: [], connections: [],
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('StudioJourney', () => {
  it('mostra zero real e inicia pelo contexto da campanha sem canvas demonstrativo', async () => {
    service.getJourneySummary.mockResolvedValue(emptySummary)
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => { root.render(<StudioJourney workspaceContext={workspaceContext} />); await flush() })

    expect(document.body.textContent).toContain('Nenhuma campanha planejada')
    expect(document.body.textContent).toContain('Fluxos ativos0')
    expect(document.body.textContent).toContain('Conteúdos no período0')
    expect(document.body.textContent).not.toContain('Sincronizado')
    expect(document.body.textContent).not.toContain('Editor de nós')
    expect([...document.querySelectorAll('a')].map(link => link.getAttribute('href'))).toEqual(expect.arrayContaining([
      '/portal/marketing/studio#flows',
      '/portal/marketing/studio#contents',
      '/portal/marketing/studio#reviews',
      '/portal/marketing/studio#calendar',
      '/portal/marketing/studio#publishing',
    ]))

    const planButton = [...document.querySelectorAll('button')].find(button => button.textContent === 'Planejar campanha')!
    await act(async () => { planButton.click(); await flush() })
    expect(document.querySelector('[aria-label="Público"]')).toBeTruthy()
    expect(document.querySelector('[aria-label="Oferta"]')).toBeTruthy()
    expect(document.querySelector('[aria-label="Canal"]')).toBeTruthy()
    expect(document.querySelector('[aria-label="Restrições"]')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Builder avançado')
    act(() => root.unmount())
  })

  it('oferece revisão e builder somente para entidades persistidas', async () => {
    service.getJourneySummary.mockResolvedValue({
      ...emptySummary,
      counts: { ...emptySummary.counts, activeFlows: 1, generatedAssets: 1, pendingReviews: 1 },
      workflows: [{ id: 'flow-1', workflowKey: 'studio_campaign_journey', name: 'Fluxo persistido', status: 'active', triggerType: 'manual', config: {}, createdAt: emptySummary.window.since, updatedAt: emptySummary.window.until }],
      contents: [{
        id: 'content-1', title: 'Versão para revisão', contentType: 'creative_brief', channel: 'linkedin',
        status: 'in_review', body: 'Texto aprovado pelo fluxo', latestVersionId: 'version-1', latestVersionNumber: 1,
        reviewId: 'review-1', reviewStatus: 'pending', reviewVersionId: 'version-1',
        createdAt: emptySummary.window.since, updatedAt: emptySummary.window.until,
      }],
    } satisfies StudioJourneySummary)
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => { root.render(<StudioJourney workspaceContext={workspaceContext} />); await flush() })

    expect(document.body.textContent).toContain('Versão para revisão')
    expect(document.body.textContent).toContain('Aprovar')
    expect(document.body.textContent).toContain('Pedir ajustes')
    expect(document.body.textContent).toContain('Rejeitar')
    expect(document.body.textContent).toContain('Builder avançado')
    expect(document.body.textContent).toContain('Fluxo persistido')
    act(() => root.unmount())
  })
})

async function flush() {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}
