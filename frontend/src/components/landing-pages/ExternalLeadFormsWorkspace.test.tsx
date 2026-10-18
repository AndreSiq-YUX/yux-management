import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { byText, click, render } from '@/components/portal-ui/__tests__/render'
import { ExternalLeadFormsWorkspace } from './ExternalLeadFormsWorkspace'
import type { LandingPageForm } from '@/types/landingPage'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast }
})

const ENDPOINT = 'https://app.example.com/api/public/lead-forms/abcdefghijklmnopqrstuvwxyz0123456789ABCD/submissions'

const mapping = (id: string, fieldName: string, crmFieldKey: string, required = false) => ({
  id,
  formId: 'form-1',
  fieldName,
  crmFieldKey,
  required,
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:00.000Z',
})

const form: LandingPageForm = {
  id: 'form-1',
  name: 'Formulário do site',
  submitLabel: 'Quero receber contato',
  successMessage: 'Recebemos seus dados.',
  metadata: { requiresConsent: true },
  isActive: true,
  allowedOrigins: ['https://cliente.example.com'],
  hasPublicToken: true,
  submissionCount: 1,
  lastSubmissionAt: '2026-07-30T12:00:00.000Z',
  publicEndpoint: ENDPOINT,
  mappings: [
    mapping('m1', 'nome', 'name', true),
    mapping('m2', 'email', 'email', true),
    mapping('m3', 'telefone', 'phone'),
    mapping('m4', 'cargo', 'cargo'),
    mapping('m5', 'fit_score', 'fit_score'),
  ],
  recentSubmissions: [
    {
      id: 'sub-1',
      name: 'Maria Silva',
      email: 'maria@example.com',
      status: 'processed',
      source: 'google',
      createdAt: '2026-07-30T12:00:00.000Z',
    },
  ],
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T12:00:00.000Z',
}

const makeHandlers = () => ({
  onCreate: vi.fn().mockResolvedValue(undefined),
  onRotate: vi.fn().mockResolvedValue(undefined),
  onToggle: vi.fn().mockResolvedValue(undefined),
  onUpdateOrigins: vi.fn().mockResolvedValue(undefined),
  onUpdateFields: vi.fn().mockResolvedValue(undefined),
})

const renderWorkspace = async (
  forms: LandingPageForm[],
  extra: Partial<React.ComponentProps<typeof ExternalLeadFormsWorkspace>> = {},
) => {
  const handlers = makeHandlers()
  const view = await render(
    <ExternalLeadFormsWorkspace contractName="Contrato principal" forms={forms} {...handlers} {...extra} />,
  )
  return { ...view, handlers }
}

const snippetText = () => document.body.querySelector('pre')?.textContent || ''

beforeEach(() => {
  vi.mocked(toast).mockClear()
  vi.mocked(toast.success).mockClear()
})

afterEach(() => {
  document.body.innerHTML = ''
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('ExternalLeadFormsWorkspace', () => {
  it('lets a client create the first form without a landing page', async () => {
    const { container, handlers, unmount } = await renderWorkspace([])

    expect(container.querySelector('h1')?.textContent).toBe('Formulários externos')
    expect(container.textContent).toContain('Nenhum formulário externo criado')
    expect(container.textContent).toContain('sem depender de uma landing page')

    await click(byText(container, 'button', 'Criar primeiro formulário'))
    expect(container.textContent).toContain('Novo formulário externo')
    await click(byText(container, 'button', 'Criar formulário'))

    expect(handlers.onCreate).toHaveBeenCalledWith({
      name: 'Formulário do site',
      allowedOrigins: [],
      consentCode: 'lead_capture',
      consentVersion: '1.0',
      privacyPolicyVersion: '1.0',
    })
    await unmount()
  })

  it('guides the client through the three steps', async () => {
    const { container, unmount } = await renderWorkspace([form])
    const steps = Array.from(container.querySelectorAll('ol[aria-label="Passos"] li')).map(item =>
      item.textContent?.replace(/\s+/g, ' ').trim(),
    )
    expect(steps).toEqual(['1. Criar o formulário', '2. Instalar no seu site', '3. Testar o envio'])
    expect(container.querySelector('#passo-1')).not.toBeNull()
    expect(container.querySelector('#passo-2')).not.toBeNull()
    expect(container.querySelector('#passo-3')).not.toBeNull()
    await unmount()
  })

  it('builds an HTML snippet with the endpoint, the configured field names and the consent checkbox', async () => {
    const { unmount } = await renderWorkspace([form])
    const code = snippetText()

    expect(code).toContain(`<form action="${ENDPOINT}" method="POST"`)
    for (const name of ['nome', 'email', 'telefone', 'cargo']) expect(code).toContain(`name="${name}"`)
    expect(code).toContain('type="email"')
    expect(code).toContain('type="tel"')
    expect(code).toContain('name="consent_lgpd"')
    expect(code).toContain('Quero receber contato')
    // Campos de uso interno não viram campo visível no site.
    expect(code).not.toContain('fit_score')
    // A chave já está no endereço; não existe campo de chave no corpo.
    expect(code).not.toMatch(/name="(token|key|chave)"/)
    await unmount()
  })

  it('copies the code and confirms with a toast, with a select fallback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { unmount } = await renderWorkspace([form])

    await click(byText(document.body, 'button', 'Copiar código'))
    expect(writeText).toHaveBeenCalledWith(snippetText())
    expect(toast.success).toHaveBeenCalledWith('Código copiado')
    await unmount()

    // Sem API de área de transferência: seleciona o texto e avisa.
    Reflect.deleteProperty(navigator, 'clipboard')
    const original = document.execCommand
    document.execCommand = vi.fn(() => false)
    const again = await renderWorkspace([form])
    await click(byText(document.body, 'button', 'Copiar código'))
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Selecionamos o código'))
    expect(window.getSelection()?.toString()).toContain('<form')
    document.execCommand = original
    await again.unmount()
  })

  it('does not offer a broken snippet when the full endpoint is not available', async () => {
    const { handlers, unmount } = await renderWorkspace([{ ...form, publicEndpoint: undefined }])

    expect(snippetText()).toContain('COLE_AQUI_O_ENDERECO_DE_ENVIO')
    expect(document.body.querySelector('[role="note"] [aria-label^="Pendente: Consultar o endereço de envio já gerado"]')).not.toBeNull()
    expect((byText(document.body, 'button', 'Copiar código') as HTMLButtonElement).disabled).toBe(true)

    await click(byText(document.body, 'button', 'Gerar novo endereço'))
    expect(handlers.onRotate).not.toHaveBeenCalled()
    const dialogButton = Array.from(document.body.querySelectorAll('button'))
      .filter(button => button.textContent?.trim() === 'Gerar novo endereço')
      .pop()!
    await click(dialogButton)
    expect(handlers.onRotate).toHaveBeenCalledWith('form-1')
    await unmount()
  })

  it('keeps the technical controls only inside the Avançado tab', async () => {
    const { container, unmount } = await renderWorkspace([form])
    const before = (container.textContent || '').toLowerCase()
    for (const term of ['endpoint', 'token', 'chave', 'origens permitidas', 'mapeamento']) expect(before).not.toContain(term)

    await click(byText(container, 'button', 'Avançado (webhook)'))
    const after = container.textContent || ''
    expect(after).toContain('Endereço de envio')
    expect(after).toContain('abcdefghijklmnopqrstuvwxyz0123456789ABCD')
    expect(after).toContain('Origens permitidas')
    expect(after).toContain('https://cliente.example.com')
    expect(after).toContain('nome → name *')
    expect(after).toContain('curl -X POST')
    await unmount()
  })

  it('shows platform instructions in the WordPress / Elementor and Webflow tabs', async () => {
    const { container, unmount } = await renderWorkspace([form])

    await click(byText(container, 'button', 'WordPress / Elementor'))
    expect(container.textContent).toContain('widget')
    expect(snippetText()).toContain(ENDPOINT)

    await click(byText(container, 'button', 'Webflow'))
    expect(container.textContent).toContain('Embed')
    expect(snippetText()).toContain(ENDPOINT)
    await unmount()
  })

  it('explains how to test with the real form and lists recent leads with a refresh button', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const { container, unmount } = await renderWorkspace([form], { onRefresh })

    const step3 = container.querySelector('#passo-3')!
    expect(step3.textContent).toContain('Leads recebidos recentemente')
    expect(step3.textContent).toContain('Maria Silva')
    expect(step3.textContent).toContain('maria@example.com')
    expect(step3.textContent).toContain('lead de verdade')

    // "Enviar teste" fica visível como pendente (B22) e não simula envio.
    const sendTest = byText(step3 as HTMLElement, 'button', 'Enviar testePendente') as HTMLButtonElement
    expect(sendTest.getAttribute('aria-disabled')).toBe('true')
    expect(step3.querySelector('[aria-label^="Pendente: Envio de teste do formulário externo"]')).not.toBeNull()
    await click(sendTest)
    expect(step3.querySelector('[role="status"]')?.textContent).toContain('em implantação')

    await click(byText(step3 as HTMLElement, 'button', 'Atualizar'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    await act(async () => undefined)
    await unmount()
  })

  it('shows an empty list while no lead arrived', async () => {
    const { container, unmount } = await renderWorkspace([{ ...form, submissionCount: 0, recentSubmissions: [] }])
    expect(container.querySelector('#passo-3')?.textContent).toContain('Nenhum lead recebido ainda')
    await unmount()
  })
})
