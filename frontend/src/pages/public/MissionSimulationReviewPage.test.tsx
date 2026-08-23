import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionSimulationReviewPage } from './MissionSimulationReviewPage'
import { actionEngineService } from '@/services/actionEngineService'
import type { PublicSimulationReport } from '@/types/actionEngine'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('MissionSimulationReviewPage', () => {
  it('states simulation authority limits and stores stakeholder feedback without approval', async () => {
    vi.spyOn(actionEngineService, 'getPublicSimulationReport').mockResolvedValue(report)
    const submit = vi.spyOn(actionEngineService, 'submitSimulationFeedback').mockResolvedValue({ id: 'feedback-1', decision: 'support', createdAt: '', executionApproved: false })
    const container = document.createElement('div'); document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/mission-simulation/review/report-token']}><Routes><Route path="/mission-simulation/review/:token" element={<MissionSimulationReviewPage />} /></Routes></MemoryRouter>)
      await flush()
    })
    expect(document.body.textContent).toContain('Simulação — nenhum efeito executado.')
    expect(document.body.textContent).toContain('Este parecer não aprova execução')
    expect(document.body.textContent).toContain('2')
    await change('input', 'Stakeholder')
    await click('Enviar parecer')
    expect(submit).toHaveBeenCalledWith('report-token', expect.objectContaining({ reviewerName: 'Stakeholder', decision: 'support' }))
    expect(document.body.textContent).toContain('Parecer registrado')
    act(() => root.unmount())
  })
})

const report = {
  id: 'report-1', reportHash: 'a'.repeat(64), expiresAt: '2026-08-29T12:00:00Z',
  snapshot: {
    schemaVersion: 1, redactionVersion: 1, reportId: 'report-1', reportHash: 'a'.repeat(64),
    missionTitle: 'Criar funil comercial', objective: 'Preparar funil e nutrição', planRevision: 1,
    changes: [{ quantity: 2, label: 'artefatos' }], contactImpact: { existingContacts: 0, futureEligibleContacts: true, channels: ['email'] },
    economics: { estimatedCostBrl: '340', maximumCostBrl: '500', estimatedHumanMinutes: 45 },
    irreversibleEffects: [{ description: 'Envios não podem ser desfeitos.' }], assumptions: [],
    technicalProof: { packVersion: 'b'.repeat(64), planHash: 'c'.repeat(64), manifestHash: 'd'.repeat(64), sourceCount: 2 },
    createdAt: '2026-08-22T12:00:00Z', expiresAt: '2026-08-29T12:00:00Z',
    disclaimer: 'Simulação - nenhum efeito executado.',
  },
} as PublicSimulationReport

async function change(selector: string, value: string) { const element = document.body.querySelector(selector) as HTMLInputElement; await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set?.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); await flush() }) }
async function click(text: string) { const button = [...document.body.querySelectorAll('button')].find(item => item.textContent?.includes(text)); expect(button).toBeDefined(); await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush() }) }
