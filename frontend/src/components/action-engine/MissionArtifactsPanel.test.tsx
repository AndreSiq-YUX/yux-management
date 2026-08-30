import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HumanTaskResolutionDialog } from './HumanTaskResolutionDialog'
import { MissionArtifactsPanel } from './MissionArtifactsPanel'
import type { MissionActionRun, MissionArtifact } from '@/types/actionEngine'

const proposedHash = 'a'.repeat(64)
const currentHash = 'b'.repeat(64)
const artifact: MissionArtifact = {
  key: 'education_1', kind: 'email', title: 'Educação 1', status: 'draft', contentHash: currentHash,
  staleApproval: true, approvalSubjectHash: 'c'.repeat(64),
  proposedVersion: { status: 'proposed', contentHash: proposedHash },
  currentVersion: { status: 'draft', contentHash: currentHash, entityId: 'email-1' },
  data: { subject: 'Como estruturar o diagnóstico', previewText: 'Um roteiro consultivo', bodyText: 'Conteúdo útil. Sair: {{unsubscribe_url}}' },
  citations: [{ id: 'source-secret', label: 'Base de conhecimento publicada', category: 'knowledge' }],
  complianceWarnings: ['Sem promessas absolutas'],
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('MissionArtifactsPanel', () => {
  it('shows reviewable content, warnings and exact hashes without leaking source ids to clients', async () => {
    const onRefresh = vi.fn()
    const { root } = await render(<MissionArtifactsPanel artifacts={[artifact]} canWrite={false} showTechnicalProof={false} onRefresh={onRefresh} />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('Como estruturar o diagnóstico')
    expect(text).toContain('[link para descadastro]')
    expect(text).toContain('Sem promessas absolutas')
    expect(text).toContain(proposedHash)
    expect(text).toContain(currentHash)
    expect(text).not.toContain('source-secret')
    expect(text).toContain('somente leitura')
    await act(async () => findButton('Atualizar revisão')?.click())
    expect(onRefresh).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })

  it('shows citation ids only inside operator technical proof', async () => {
    const { root } = await render(<MissionArtifactsPanel artifacts={[artifact]} canWrite showTechnicalProof onRefresh={vi.fn()} />)
    expect(document.body.textContent).toContain('source-secret')
    expect(document.body.textContent).not.toContain('somente leitura')
    act(() => root.unmount())
  })
})

describe('HumanTaskResolutionDialog', () => {
  it('requires positive actual minutes before completing the task', async () => {
    const onConfirm = vi.fn()
    const { root } = await render(<HumanTaskResolutionDialog action={humanAction} busy={false} onCancel={vi.fn()} onConfirm={onConfirm} />)
    const confirm = findButton('Registrar e concluir')!
    expect(confirm.disabled).toBe(true)
    const input = document.querySelector<HTMLInputElement>('#actual-minutes')!
    await act(async () => { setInput(input, '0') })
    expect(document.body.textContent).toContain('entre 1 e 1.440')
    expect(confirm.disabled).toBe(true)
    await act(async () => { setInput(input, '42') })
    expect(confirm.disabled).toBe(false)
    await act(async () => confirm.click())
    expect(onConfirm).toHaveBeenCalledWith(42)
    act(() => root.unmount())
  })
})

const humanAction: MissionActionRun = {
  id: 'action-1', missionId: 'mission-1', planId: 'plan-1', status: 'running', input: {}, output: {},
  stepKey: 'human-review', capabilityKey: 'human.task.create', capabilityVersion: 1, approvalRequired: false,
}

async function render(element: ReactNode): Promise<{ root: Root }> {
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container)
  await act(async () => { root.render(element) }); return { root }
}
function findButton(text: string) { return [...document.body.querySelectorAll('button')].find(button => button.textContent?.includes(text)) }
function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }))
}
