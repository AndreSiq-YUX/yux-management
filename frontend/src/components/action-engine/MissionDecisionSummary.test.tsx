import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionDecisionSummary } from './MissionDecisionSummary'
import { MissionTechnicalProof } from './MissionTechnicalProof'
import type { MissionDecisionSummary as DecisionSummary, MissionPlan } from '@/types/actionEngine'

const hash = 'a'.repeat(64)
const summary: DecisionSummary = {
  headline: 'Criar um funil comercial e uma sequência de nutrição.',
  changes: [
    { entityType: 'pipeline', operation: 'create', quantity: 1, label: 'funil comercial' },
    { entityType: 'email', operation: 'create', quantity: 4, label: 'e-mails de nutrição' },
  ],
  contactImpact: { existingContacts: 12, futureEligibleContacts: true, channels: ['email'] },
  economics: { estimatedCostBrl: '340', maximumCostBrl: '500', estimatedHumanMinutes: 45 },
  irreversibleEffects: [
    { capabilityKey: 'email.send', description: 'O envio de e-mail não pode ser desfeito.' },
    { capabilityKey: 'whatsapp.send', description: 'A mensagem de WhatsApp não pode ser recolhida.' },
  ],
  assumptions: [{ key: 'tone', value: 'consultivo', source: 'company_context' }],
  technicalProof: { planRevision: 2, planHash: 'b'.repeat(64), manifestHash: 'c'.repeat(64), sourceCount: 3 },
  decisionSubjectHash: hash,
}

const plan: MissionPlan = {
  id: 'plan-1', organizationId: 'org-1', missionId: 'mission-1', revision: 2,
  status: 'pending_approval', packVersionId: 'pack-1', packContentHash: 'd'.repeat(64),
  planHash: summary.technicalProof.planHash, parameters: {}, deviations: [], estimatedEconomics: {},
  capabilityManifestHash: summary.technicalProof.manifestHash,
  capabilityManifest: [{ key: 'email.send', version: 1, definitionHash: 'e'.repeat(64), effect: 'external', recoveryKind: 'irreversible' }],
  steps: [{ stepKey: 'email.send', capabilityKey: 'email.send', capabilityVersion: 1, dependsOn: ['email.prepare'], parameters: {}, approvalRequired: true, protected: true }],
  createdAt: '2026-08-22T00:00:00Z', updatedAt: '2026-08-22T00:00:00Z',
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('MissionDecisionSummary', () => {
  it('leads owners through changes, contacts, economics, assumptions and every irreversible warning', async () => {
    const { root } = await render(<MissionDecisionSummary summary={summary} approvalSubjectHash={hash} canApprove busy={false} onApprove={vi.fn()} />)
    const text = document.body.textContent ?? ''
    expect(text.indexOf('O que será alterado')).toBeLessThan(text.indexOf('Efeitos que não podem ser desfeitos'))
    expect(text).toContain('12 contato(s) existente(s)')
    expect(text).toContain('R$ 340,00')
    expect(text).toContain('Teto absoluto: R$ 500,00')
    expect(text).toContain('Contexto da Empresa')
    expect(text).toContain('O envio de e-mail não pode ser desfeito.')
    expect(text).toContain('A mensagem de WhatsApp não pode ser recolhida.')
    expect(text).not.toContain(hash)
    expect(findButton('Li os impactos e aprovo este plano')).toBeDefined()
    act(() => root.unmount())
  })

  it('hides authorization from read-only users and blocks a changed decision subject', async () => {
    let rendered = await render(<MissionDecisionSummary summary={summary} approvalSubjectHash={hash} canApprove={false} busy={false} onApprove={vi.fn()} />)
    expect(findButton('Li os impactos e aprovo este plano')).toBeUndefined()
    expect(document.body.textContent).toContain('não autorizar a execução')
    act(() => rendered.root.unmount())
    document.body.innerHTML = ''

    rendered = await render(<MissionDecisionSummary summary={summary} approvalSubjectHash={'f'.repeat(64)} canApprove busy={false} onApprove={vi.fn()} />)
    expect(document.body.textContent).toContain('O plano mudou')
    expect(findButton('Li os impactos e aprovo este plano')?.hasAttribute('disabled')).toBe(true)
    act(() => rendered.root.unmount())
  })

  it('puts hashes, DAG, versions and recovery classes only in operator technical proof', async () => {
    const { root } = await render(<MissionTechnicalProof summary={summary} plan={plan} />)
    expect(document.body.textContent).toContain('Prova técnica')
    expect(document.body.textContent).toContain(hash)
    expect(document.body.textContent).toContain('email.send@1')
    expect(document.body.textContent).toContain('irreversible')
    expect(document.body.textContent).toContain('depende de: email.prepare')
    expect(document.body.textContent).toContain('Claims e permissões serão revalidados')
    act(() => root.unmount())
  })
})

async function render(element: ReactNode): Promise<{ root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  return { root }
}

function findButton(text: string) { return [...document.body.querySelectorAll('button')].find(button => button.textContent?.includes(text)) }
