import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionSimulationShareDialog } from './MissionSimulationShareDialog'
import { actionEngineService } from '@/services/actionEngineService'
import type { ActionMission, MissionPlan, SimulationReportShare } from '@/types/actionEngine'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('MissionSimulationShareDialog', () => {
  it('creates, copies, downloads and revokes one immutable shadow report', async () => {
    const share = { id: 'report-1', token: 'token-1', url: '/mission-simulation/review/token-1', expiresAt: '2026-08-29T12:00:00Z', reportHash: 'a'.repeat(64), snapshot: {} } as SimulationReportShare
    const create = vi.spyOn(actionEngineService, 'createSimulationReport').mockResolvedValue(share)
    const revoke = vi.spyOn(actionEngineService, 'revokeSimulationReport').mockResolvedValue({ id: 'report-1', revoked: true })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const container = document.createElement('div'); document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<MissionSimulationShareDialog open mission={mission} plan={plan} onOpenChange={vi.fn()} />) })

    await click('Gerar link seguro')
    expect(create).toHaveBeenCalledWith(mission, plan.id, 7)
    expect(document.body.textContent).toContain('Relatório pronto')
    expect(document.body.textContent).toContain('Nenhum efeito será executado')
    expect(document.body.querySelector('a[href="/api/action-engine/public/simulation-reports/token-1/pdf"]')).not.toBeNull()
    await click('Copiar link')
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${share.url}`)
    await click('Revogar link')
    expect(revoke).toHaveBeenCalledWith(mission.organizationId, share.id)
    act(() => root.unmount())
  })
})

const mission = { id: 'mission-1', organizationId: 'org-1', mode: 'shadow' } as ActionMission
const plan = { id: 'plan-1' } as MissionPlan
function findButton(text: string) { return [...document.body.querySelectorAll('button')].find(button => button.textContent?.includes(text)) }
async function click(text: string) { const button = findButton(text); expect(button).toBeDefined(); await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush() }) }
