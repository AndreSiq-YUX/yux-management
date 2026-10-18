import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { ContractDetails } from '@/types/platform'
import { MetaCampaignBuilder } from './MetaCampaignBuilder'

vi.mock('@/services/campaignService', () => ({
  campaignService: { getProviderConnections: vi.fn().mockResolvedValue([]) },
}))

const contract: ContractDetails = {
  id: 'contract-1',
  clientId: 'client-1',
  packageId: 'package-1',
  name: 'Contrato principal',
  status: 'active',
  startsAt: '2026-06-01',
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
  package: null,
  modules: [],
}

const setValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const render = async (props: Partial<React.ComponentProps<typeof MetaCampaignBuilder>> = {}) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const handlers = { onBack: vi.fn(), onSaveDraft: vi.fn().mockResolvedValue(undefined), onSubmitForApproval: vi.fn().mockResolvedValue(undefined) }
  await act(async () => {
    root.render(<MetaCampaignBuilder contract={contract} organizationId="org-1" {...handlers} {...props} />)
  })
  return {
    container,
    handlers,
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

const field = (container: HTMLElement, placeholder: string) =>
  container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!

describe('MetaCampaignBuilder', () => {
  it('has no fabricated content and starts with an empty form', async () => {
    const { container, unmount } = await render()
    const text = container.textContent || ''

    for (const fake of ['Empresa ABC', 'Pixel verificado', 'Atualizado agora', 'IA YUX', '18k-42k', 'R$ 68-96', 'Dor + prova social', 'Diagnóstico WhatsApp 48h', 'Captação WhatsApp']) {
      expect(text).not.toContain(fake)
    }
    expect(text).toContain('Conta de anúncios: verificar na publicação')
    expect(text).toContain('Estimativa disponível após a revisão da YUX')

    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input'))
    expect(inputs.length).toBeGreaterThan(0)
    expect(inputs.every(input => input.value === '')).toBe(true)
    expect(field(container, 'Ex.: Diagnóstico gratuito em 48h')).not.toBeNull()

    await unmount()
  })

  it('renders the ad preview from typed values and uses neutral placeholders when empty', async () => {
    const { container, unmount } = await render()
    expect(container.textContent).toContain('Título do anúncio')
    expect(container.textContent).toContain('O texto do anúncio aparece aqui.')

    await act(async () => {
      setValue(field(container, 'Ex.: Quanto o atendimento lento custa para você?'), 'Meu título')
      setValue(field(container, 'Ex.: Receba um diagnóstico rápido com plano de ação.'), 'Meu texto')
      setValue(field(container, 'Ex.: Solicitar diagnóstico'), 'Fale agora')
    })
    const text = container.textContent || ''
    expect(text).toContain('Meu título')
    expect(text).toContain('Meu texto')
    expect(text).toContain('Fale agora')
    expect(text).not.toContain('O texto do anúncio aparece aqui.')

    await unmount()
  })

  it('keeps save and submit disabled until name and daily budget exist, then sends the typed data', async () => {
    const { container, handlers, unmount } = await render()
    const save = container.querySelector<HTMLButtonElement>('button[title="Salvar rascunho"]')!
    const submit = container.querySelector<HTMLButtonElement>('button[title="Enviar para aprovação"]')!
    expect(save.disabled).toBe(true)
    expect(submit.disabled).toBe(true)

    await act(async () => {
      setValue(field(container, 'Ex.: Captação de leads - Julho'), 'Minha campanha')
      setValue(field(container, 'Ex.: 80'), '120')
    })
    expect(save.disabled).toBe(false)

    await act(async () => save.click())
    expect(handlers.onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      contractId: 'contract-1',
      name: 'Minha campanha',
      dailyBudget: 120,
      provider: 'meta',
    }))

    await act(async () => submit.click())
    expect(handlers.onSubmitForApproval).toHaveBeenCalledTimes(1)

    await unmount()
  })

  it('marks the ad headline, text and CTA as not saved yet (B21) while keeping them in the preview', async () => {
    const { container, unmount } = await render()
    expect(container.querySelector('[aria-label^="Pendente: Salvar título, texto e chamada do anúncio"]')).not.toBeNull()
    expect(container.textContent).toContain('O salvamento dos textos do anúncio no rascunho está em implantação.')
    await unmount()
  })

  it('does not send the ad texts in the draft and names the review button honestly', async () => {
    const { container, handlers, unmount } = await render()
    expect(container.textContent).not.toContain('Publicar campanha')
    const review = container.querySelector<HTMLButtonElement>('button[title="Revisar antes de enviar"]')!
    expect(review.textContent).toContain('Revisar antes de enviar')

    await act(async () => {
      setValue(field(container, 'Ex.: Captação de leads - Julho'), 'Minha campanha')
      setValue(field(container, 'Ex.: 80'), '120')
      setValue(field(container, 'Ex.: Quanto o atendimento lento custa para você?'), 'Meu título')
    })
    await act(async () => container.querySelector<HTMLButtonElement>('button[title="Salvar rascunho"]')!.click())
    const payload = handlers.onSaveDraft.mock.calls[0][0]
    expect(JSON.stringify(payload)).not.toContain('Meu título')

    await act(async () => review.click())
    expect(handlers.onSaveDraft).toHaveBeenCalledTimes(1)
    expect(handlers.onSubmitForApproval).not.toHaveBeenCalled()
    await unmount()
  })
})
