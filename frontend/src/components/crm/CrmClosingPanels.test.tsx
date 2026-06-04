import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { ClosingChecklistPanel } from './ClosingChecklistPanel'
import { LeadProposalLauncher } from './LeadProposalLauncher'
import { ProposalEventTimeline } from './ProposalEventTimeline'
import { ProposalRecommendationPanel } from './ProposalRecommendationPanel'
import type { CrmLead } from '@/types/crm'
import type { PackageDefinition } from '@/types/platform'

const lead: CrmLead = {
  id: 'lead-1',
  organizationId: 'org-1',
  crmInstanceId: 'crm-1',
  pipelineId: 'pipeline-1',
  stageId: 'stage-1',
  name: 'Ana Lead',
  email: 'ana@example.com',
  source: 'Meta Ads',
  status: 'open',
  score: 80,
  createdAt: '2026-06-04T12:00:00Z',
  updatedAt: '2026-06-04T12:00:00Z',
}

const packages: PackageDefinition[] = [{
  id: 'pkg-1',
  key: 'growth',
  name: 'Growth',
  description: 'Pacote',
  moduleKeys: ['crm', 'proposals'],
  createdAt: '2026-06-04T12:00:00Z',
  updatedAt: '2026-06-04T12:00:00Z',
}]

describe('CRM closing panels', () => {
  it('renders launcher, recommendations, checklist and timeline', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <div>
          <LeadProposalLauncher lead={lead} packages={packages} packageId="pkg-1" onPackageChange={() => {}} onCreate={() => {}} />
          <ProposalRecommendationPanel packages={packages} recommendations={[{
            id: 'rec-1',
            organizationId: 'org-1',
            crmInstanceId: 'crm-1',
            leadId: 'lead-1',
            packageId: 'pkg-1',
            moduleKeys: ['crm'],
            score: 90,
            reasons: [],
            status: 'suggested',
            createdAt: '2026-06-04T12:00:00Z',
            updatedAt: '2026-06-04T12:00:00Z',
          }]} />
          <ClosingChecklistPanel proposals={[]} checklists={[]} conversionRuns={[]} />
          <ProposalEventTimeline events={[]} />
        </div>,
      )
    })

    expect(container.innerHTML).toContain('Nova proposta')
    expect(container.innerHTML).toContain('Recomendacoes comerciais')
    expect(container.innerHTML).toContain('Fechamento e onboarding')
    expect(container.innerHTML).toContain('Linha do tempo da proposta')

    act(() => root.unmount())
  })
})
