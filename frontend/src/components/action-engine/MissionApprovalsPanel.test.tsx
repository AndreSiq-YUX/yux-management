import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionApprovalsPanel } from './MissionApprovalsPanel'
import type { MissionApproval } from '@/types/actionEngine'

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('MissionApprovalsPanel', () => {
  it('collects a structured reason before returning a plan for changes', async () => {
    const onDecision = vi.fn()
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => { root.render(<MissionApprovalsPanel approvals={[approval]} canWrite onDecision={onDecision} />) })

    expect(findButton('Aprovar')).toBeUndefined()
    expect(findButton('Solicitar mudanças')).toBeDefined()
    await click('Solicitar mudanças')
    expect(document.body.textContent).toContain('Público ou ICP incorreto')
    expect(document.body.textContent).toContain('Custo acima do aceitável')
    await select('Motivo da decisão', 'cost_too_high')
    await change('Comentário da decisão', 'Reduzir o teto da missão.')
    await click('Confirmar decisão')
    expect(onDecision).toHaveBeenCalledWith(approval, 'changes_requested', 'cost_too_high', 'Reduzir o teto da missão.')
    act(() => root.unmount())
  })

  it('requires an explanation for other and hides controls from read-only reviewers', async () => {
    const onDecision = vi.fn()
    let root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => { root.render(<MissionApprovalsPanel approvals={[approval]} canWrite onDecision={onDecision} />) })
    await click('Rejeitar')
    await select('Motivo da decisão', 'other')
    expect(findButton('Confirmar decisão')?.hasAttribute('disabled')).toBe(true)
    await change('Comentário da decisão', 'Não atende a estratégia atual.')
    expect(findButton('Confirmar decisão')?.hasAttribute('disabled')).toBe(false)
    act(() => root.unmount())

    document.body.innerHTML = ''
    root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => { root.render(<MissionApprovalsPanel approvals={[approval]} canWrite={false} onDecision={onDecision} />) })
    expect(findButton('Solicitar mudanças')).toBeUndefined()
    expect(findButton('Rejeitar')).toBeUndefined()
    act(() => root.unmount())
  })
})

const approval: MissionApproval = {
  id: 'approval-1', missionId: 'mission-1', planId: 'plan-1', approvalType: 'plan', status: 'pending',
  subjectHash: 'a'.repeat(64), requestedPayload: { decisionSummary: { headline: 'Criar funil e nutrição' } }, createdAt: '2026-08-22T12:00:00Z',
}

function findButton(text: string) { return [...document.body.querySelectorAll('button')].find(button => button.textContent?.includes(text)) }
async function click(text: string) { const button = findButton(text); expect(button).toBeDefined(); await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })) }) }
async function select(label: string, value: string) { const element = document.body.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement; await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(element, value); element.dispatchEvent(new Event('change', { bubbles: true })) }) }
async function change(label: string, value: string) { const element = document.body.querySelector(`textarea[aria-label="${label}"]`) as HTMLTextAreaElement; await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })) }) }
