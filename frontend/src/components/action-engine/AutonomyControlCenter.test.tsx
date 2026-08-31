import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutonomyControlCenter } from './AutonomyControlCenter'
import type { ActionMission, MissionOperationalControls } from '@/types/actionEngine'

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('AutonomyControlCenter', () => {
  it('shows envelope, remaining limits, exact hash and degraded provider warning', async () => {
    const onApproveGrant = vi.fn()
    const root = await render(controls, { onApproveGrant })
    const text = document.body.textContent ?? ''
    expect(text).toContain('R$ 75,00')
    expect(text).toContain('1,5 h')
    expect(text).toContain('46')
    expect(text).toContain('Operação degradada')
    expect(text).toContain('Provedor de mídia com latência elevada.')
    expect(text).toContain(hash)
    await act(async () => findButton('Aprovar este hash')?.click())
    expect(onApproveGrant).toHaveBeenCalledWith(controls.autonomy.grants[0])
    act(() => root.unmount())
  })

  it('allows one-click mission pause and requires a reason to revoke an active grant', async () => {
    const onPause = vi.fn(); const onRevokeGrant = vi.fn()
    const active = { ...controls, autonomy: { ...controls.autonomy, grants: [{ ...controls.autonomy.grants[0], status: 'active' as const }] } }
    const root = await render(active, { onPause, onRevokeGrant })
    await act(async () => findButton('Pausar missão')?.click())
    expect(onPause).toHaveBeenCalledOnce()
    await act(async () => findButton('Revogar autonomia')?.click())
    expect(findButton('Confirmar revogação')?.disabled).toBe(true)
    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="Motivo da revogação"]')!
    await act(async () => setTextarea(textarea, 'Incidente confirmado no provedor'))
    await act(async () => findButton('Confirmar revogação')?.click())
    expect(onRevokeGrant).toHaveBeenCalledWith(active.autonomy.grants[0], 'Incidente confirmado no provedor')
    act(() => root.unmount())
  })

  it('keeps client access read-only and identifies an expired grant', async () => {
    const expired = { ...controls, canManagePolicy: false, autonomy: { ...controls.autonomy, grants: [{ ...controls.autonomy.grants[0], status: 'expired' as const }], remaining: { ...controls.autonomy.remaining!, seconds: 0 } } }
    const root = await render(expired, {}, false)
    expect(document.body.textContent).toContain('Expirada')
    expect(document.body.textContent).toContain('Visualização somente leitura')
    expect(findButton('Solicitar autonomia')).toBeUndefined()
    expect(findButton('Aprovar este hash')).toBeUndefined()
    expect(findButton('Pausar missão')).toBeUndefined()
    act(() => root.unmount())
  })
})

const hash = 'a'.repeat(64)
const mission: ActionMission = {
  id: 'mission-1', organizationId: 'org-1', packVersionId: 'pack-1', status: 'active', mode: 'autonomous', title: 'Missão', objective: 'Objetivo',
  goal: { statement: 'Gerar resultado', requestedOutcome: 'revenue', scopeHints: [], constraints: {}, acceptanceCriteria: [] },
  autonomyEnvelope: { mode: 'autonomous', allowedModules: ['crm'], allowedCapabilityKeys: ['crm.pipeline.draft'], maxTotalCostBrl: '100', maxHumanHours: '2', maxExternalContacts: 50, expiresAt: '2030-01-01T00:00:00Z', alwaysRequireApprovalFor: [] },
  packSelection: {}, parameters: { targetRevenueBrl: '1000', deadlineDays: 10, inactiveDays: 30, canarySize: 10, maxPopulation: 100, maxTotalCostBrl: '100', maxHumanHours: '2', minimumValueCostRatio: '2', channels: ['human_task'] },
  budget: {}, version: 4, createdBy: 'user-1', createdAt: '2026-08-31T12:00:00Z', updatedAt: '2026-08-31T12:00:00Z',
}
const controls: MissionOperationalControls = {
  budget: { currency: 'BRL', envelopeVersion: 4, actualCostBrl: '25', reservedCostBrl: '0', consumedCostBrl: '25', remainingCostBrl: '75', maximumCostBrl: '100', consumedPercent: '25', alertThresholds: [50, 80, 95], exhausted: false },
  readiness: { ready: true, checks: [], availableChannels: ['human_task'] }, capabilities: [], canManagePolicy: true,
  autonomy: {
    grants: [{ id: 'grant-1', grantVersion: 1, missionVersion: 4, envelope: mission.autonomyEnvelope, envelopeHash: hash, status: 'pending', startsAt: '2026-08-31T12:00:00Z', expiresAt: '2030-01-01T00:00:00Z' }],
    usage: { costBrl: '25', humanMinutes: '30', externalContacts: 4, unresolvedExternalEffects: 0 },
    remaining: { costBrl: '75', humanMinutes: '90', externalContacts: 46, seconds: 90000 },
    health: { status: 'degraded', warnings: [{ code: 'ads_provider_degraded', message: 'Provedor de mídia com latência elevada.' }] },
  },
}

async function render(value: MissionOperationalControls, handlers: Partial<Parameters<typeof AutonomyControlCenter>[0]> = {}, canWrite = true) {
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  await act(async () => { root.render(<MemoryRouter><AutonomyControlCenter mission={mission} controls={value} canWrite={canWrite} onPause={vi.fn()} onRequestGrant={vi.fn()} onApproveGrant={vi.fn()} onRevokeGrant={vi.fn()} onCapabilityControl={vi.fn()} {...handlers} /></MemoryRouter>) })
  return root
}
function findButton(text: string) { return [...document.body.querySelectorAll('button')].find(button => button.textContent?.includes(text)) }
function setTextarea(input: HTMLTextAreaElement, value: string) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) }
