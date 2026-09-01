import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionConversationPlanCard } from './MissionConversationPlanCard'
import type { MissionConversationMessagePayload } from '@/types/actionEngine'

const payload: MissionConversationMessagePayload = {
  kind: 'plan',
  planId: 'plan-1',
  approvalId: 'approval-1',
  subjectHash: 'a'.repeat(64),
  missionVersion: 4,
  sources: ['strategy-1', 'company-1'],
  decisionSummary: {
    headline: 'Criar um funil comercial e quatro e-mails de nutrição.',
    changes: [{ entityType: 'pipeline', operation: 'create', quantity: 1, label: 'funil comercial' }],
    contactImpact: { existingContacts: 12, futureEligibleContacts: true, channels: ['email'] },
    economics: { estimatedCostBrl: '340', maximumCostBrl: '500', estimatedHumanMinutes: 45 },
    irreversibleEffects: [{ capabilityKey: 'email.send', description: 'E-mails enviados não podem ser recolhidos.' }],
    assumptions: [{ key: 'tone', value: 'consultivo', source: 'company_context' }],
    technicalProof: { planRevision: 1, planHash: 'b'.repeat(64), manifestHash: 'c'.repeat(64), sourceCount: 2 },
    decisionSubjectHash: 'a'.repeat(64),
  },
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('MissionConversationPlanCard', () => {
  it('keeps the plan decision and its verified sources inside the conversation', async () => {
    const onApprove = vi.fn()
    const { root } = await render(<MissionConversationPlanCard payload={payload} canApprove busy={false} onApprove={onApprove} onRequestChanges={vi.fn()} />)
    expect(document.body.textContent).toContain('Criar um funil comercial')
    expect(document.body.textContent).toContain('R$\u00a0340,00')
    expect(document.body.textContent).toContain('2 fonte(s) verificadas')
    expect(document.body.textContent).not.toContain('a'.repeat(64))
    clickButton('Li os impactos e aprovo este plano')
    expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ planId: 'plan-1', approvalId: 'approval-1', missionVersion: 4 }))
    act(() => root.unmount())
  })

  it('collects a structured change reason before returning the plan to the agent', async () => {
    const onRequestChanges = vi.fn()
    const { root } = await render(<MissionConversationPlanCard payload={payload} canApprove busy={false} onApprove={vi.fn()} onRequestChanges={onRequestChanges} />)
    clickButton('Pedir alterações no plano')
    const select = document.body.querySelector('select') as HTMLSelectElement
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'wrong_icp')
      select.dispatchEvent(new Event('change', { bubbles: true }))
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, 'Priorize empresas de Londrina com mais de 20 funcionários.')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.dispatchEvent(new Event('change', { bubbles: true }))
    })
    clickButton('Enviar alterações')
    expect(onRequestChanges).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: 'approval-1' }),
      'wrong_icp',
      'Priorize empresas de Londrina com mais de 20 funcionários.',
    )
    act(() => root.unmount())
  })
})

async function render(element: React.ReactNode): Promise<{ root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  return { root }
}

function clickButton(text: string) {
  const button = [...document.body.querySelectorAll('button')].find(candidate => candidate.textContent?.includes(text))
  if (!button) throw new Error(`button_not_found:${text}`)
  act(() => button.click())
}
