import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionDetail } from './MissionDetail'
import type { ActionMission } from '@/types/actionEngine'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('MissionDetail', () => {
  it('shows a clear next step and hides empty operational panels before a plan exists', () => {
    const onCommand = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <MemoryRouter>
          <MissionDetail
            mission={draftMission()}
            plan={null}
            actions={[]}
            approvals={[]}
            artifacts={[]}
            metrics={{}}
            economics={null}
            operationalControls={null}
            backHref="/missions"
            canWrite
            showTechnicalProof={false}
            onCommand={onCommand}
            onApprovePlan={vi.fn()}
            onShareSimulation={vi.fn()}
            onApprovalDecision={vi.fn()}
            onRetryAction={vi.fn()}
            onResolveHuman={vi.fn()}
            onCapabilityControl={vi.fn()}
            onRequestAutonomyGrant={vi.fn()}
            onApproveAutonomyGrant={vi.fn()}
            onRevokeAutonomyGrant={vi.fn()}
            onRefreshArtifacts={vi.fn()}
          />
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('Pedido recebido')
    expect(container.textContent).toContain('Acontecendo agora')
    expect(container.textContent).toContain('O que você pediu')
    expect(container.textContent).toContain('O que o agente entendeu')
    expect(container.textContent).toContain('Nenhuma decisão pendente agora')
    expect(container.textContent).toContain('Continuar pedido')
    expect(container.textContent).toContain('Resultado a definir com o agente')
    expect(container.textContent).not.toContain('supervisor interpreted outcome')
    expect(container.textContent).not.toContain('Resultados observados')
    expect(container.textContent).not.toContain('Execução')
    expect(container.textContent).not.toContain('Economia da missão')

    const continueButton = [...container.querySelectorAll('button')]
      .find(button => button.textContent?.includes('Continuar pedido'))
    act(() => continueButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onCommand).toHaveBeenCalledWith('qualify')

    act(() => root.unmount())
  })
})

function draftMission(): ActionMission {
  return {
    id: 'mission-1',
    organizationId: 'org-1',
    packVersionId: 'pack-version-1',
    status: 'draft',
    mode: 'assisted',
    title: 'Captar empresas de Londrina',
    objective: 'Criar uma campanha para captar pequenas e médias empresas em Londrina.',
    goal: {
      statement: 'Criar uma campanha para captar pequenas e médias empresas em Londrina.',
      requestedOutcome: 'supervisor_interpreted_outcome',
      scopeHints: ['campaigns'],
      constraints: {},
      acceptanceCriteria: [],
    },
    autonomyEnvelope: {
      mode: 'assisted',
      allowedModules: ['campaigns'],
      allowedCapabilityKeys: [],
      maxTotalCostBrl: '100',
      maxHumanHours: '2',
      expiresAt: '2026-09-30T23:59:59.000Z',
      alwaysRequireApprovalFor: ['destructive'],
    },
    packSelection: {
      strategy: 'supervisor',
      packs: [{ key: 'revenue_recovery', version: '0.2.0' }],
    },
    parameters: {
      targetRevenueBrl: '1',
      deadlineDays: 30,
      inactiveDays: 60,
      canarySize: 20,
      maxPopulation: 100,
      maxTotalCostBrl: '100',
      maxHumanHours: '2',
      minimumValueCostRatio: '1',
      channels: ['human_task'],
    },
    budget: { maxTotalCostBrl: '100', maxHumanHours: '2' },
    deadlineAt: '2026-09-30T23:59:59.000Z',
    version: 1,
    createdBy: 'user-1',
    createdAt: '2026-08-31T12:00:00.000Z',
    updatedAt: '2026-08-31T12:00:00.000Z',
  }
}
