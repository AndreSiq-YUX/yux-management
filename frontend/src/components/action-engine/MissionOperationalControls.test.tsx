import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionOperationalControls } from './MissionOperationalControls'
import type { MissionOperationalControls as Controls } from '@/types/actionEngine'

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('Mission operational controls', () => {
  it('shows budget burn-down and only backend-authorized correction links', async () => {
    const root = await render(controls)
    expect(document.body.textContent).toContain('R$ 96,00')
    expect(document.body.textContent).toContain('R$ 4,00')
    expect(document.body.textContent).toContain('50%, 80%, 95%')
    expect(document.body.textContent).toContain('Conectar e-mail')
    expect(document.body.querySelector('a')?.getAttribute('href')).toBe('/omnichannel/settings')
    expect([...document.body.querySelectorAll('a')].some(link => link.getAttribute('href') === '/platform/contracts')).toBe(false)
    act(() => root.unmount())
  })

  it('pauses only the selected capability version after an explicit reason', async () => {
    const onCapabilityControl = vi.fn()
    const root = await render(controls, onCapabilityControl)
    const rows = [...document.body.querySelectorAll('section .divide-y > div')]
    const emailRow = rows.find(row => row.textContent?.includes('email.send@1'))
    const crmRow = rows.find(row => row.textContent?.includes('crm.pipeline.draft@1'))
    expect(emailRow?.textContent).toContain('Ativa')
    expect(crmRow?.textContent).toContain('Ativa')
    const pause = [...(emailRow?.querySelectorAll('button') ?? [])].find(button => button.textContent?.includes('Pausar'))
    await act(async () => { pause?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect([...(emailRow?.querySelectorAll('button') ?? [])].find(button => button.textContent?.includes('Confirmar controle'))?.hasAttribute('disabled')).toBe(true)
    const textarea = emailRow?.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, 'Incidente no provedor de e-mail'); textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => { [...(emailRow?.querySelectorAll('button') ?? [])].find(button => button.textContent?.includes('Confirmar controle'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onCapabilityControl).toHaveBeenCalledWith(expect.objectContaining({ capabilityKey: 'email.send', capabilityVersion: 1 }), true, 'Incidente no provedor de e-mail')
    expect(crmRow?.textContent).toContain('Ativa')
    act(() => root.unmount())
  })

  it('hides policy mutation controls from an owner without policy permission', async () => {
    const root = await render({ ...controls, canManagePolicy: false })
    expect(document.body.textContent).not.toContain('Controles por capacidade')
    expect(document.body.textContent).toContain('Orçamento da missão')
    act(() => root.unmount())
  })
})

const controls: Controls = {
  budget: { currency: 'BRL', envelopeVersion: 2, actualCostBrl: '70', reservedCostBrl: '26', consumedCostBrl: '96', remainingCostBrl: '4', maximumCostBrl: '100', consumedPercent: '96', alertThresholds: [50, 80, 95], exhausted: false },
  readiness: { ready: false, availableChannels: ['human_task'], checks: [
    { status: 'block', code: 'email', message: 'Conectar e-mail', fixHref: '/omnichannel/settings' },
    { status: 'block', code: 'contract', message: 'Contrato sem acesso' },
  ] },
  capabilities: [{ capabilityKey: 'email.send', capabilityVersion: 1, disabled: false }, { capabilityKey: 'crm.pipeline.draft', capabilityVersion: 1, disabled: false }],
  canManagePolicy: true,
}

async function render(value: Controls, onCapabilityControl = vi.fn()) {
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  await act(async () => { root.render(<MemoryRouter><MissionOperationalControls controls={value} onCapabilityControl={onCapabilityControl} /></MemoryRouter>) })
  return root
}
