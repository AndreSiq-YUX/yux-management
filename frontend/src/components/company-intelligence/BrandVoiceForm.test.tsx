import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrandVoiceForm } from './BrandVoiceForm'
import type { CompanyBrandProfileInput } from '@/types/companyIntelligence'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => {
  document.body.innerHTML = ''
})

const emptyProfile: CompanyBrandProfileInput = {
  contractId: 'contract-1', toneOfVoice: '', persona: '', brandVoiceSummary: '',
  vocabularyDo: [], vocabularyDont: [], forbiddenTopics: [], priorityTopics: [],
  visualIdentity: { logoUrl: '', colors: [], typography: [], designStyle: '', imageryStyle: '', graphicElements: [] },
  visualGuidelines: '', complianceNotes: '', status: 'draft',
}

async function mount(profile: CompanyBrandProfileInput, onSave = vi.fn().mockResolvedValue(undefined)) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<BrandVoiceForm profile={profile} onSave={onSave} brandName="Empresa A" />)
    await flush()
  })
  return { container, root, onSave }
}

const saveButton = () => Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.includes('Salvar alterações'))

describe('BrandVoiceForm', () => {
  it('envia tom, vocabulário, assuntos proibidos, restrições e cores como perfil ativo', async () => {
    const { container, root, onSave } = await mount(emptyProfile)

    await change('#tone-of-voice', 'consultivo e direto')
    await change('#persona', 'gestores de PMEs')
    await change('#brand-summary', 'Clara, prática e sem promessas exageradas.')
    await change('#vocabulary-do', 'diagnóstico, próximo passo')
    await change('#vocabulary-dont', 'garantido, desconto automático')
    await change('#forbidden-topics', 'resultado garantido')
    await change('#priority-topics', 'crescimento, eficiência')
    await change('#compliance-notes', 'Não prometer prazo ou resultado sem aprovação.')
    await change('#logo-url', 'https://yux.com.br/logo.svg')
    await click(Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Adicionar cor'))!)
    await change('#brand-color-0', '#5519ff')
    await click(Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Adicionar cor'))!)
    await change('#brand-color-1', '#eef0ff')

    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flush()
    })

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      toneOfVoice: 'consultivo e direto',
      vocabularyDo: ['diagnóstico', 'próximo passo'],
      vocabularyDont: ['garantido', 'desconto automático'],
      forbiddenTopics: ['resultado garantido'],
      complianceNotes: 'Não prometer prazo ou resultado sem aprovação.',
      visualIdentity: expect.objectContaining({ logoUrl: 'https://yux.com.br/logo.svg', colors: ['#5519ff', '#eef0ff'] }),
      status: 'active',
    }))
    act(() => root.unmount())
  })

  it('mostra o cartão da marca com logo, amostras de cor com o código, fontes e mensagem de exemplo', async () => {
    const { container, root } = await mount({
      ...emptyProfile,
      toneOfVoice: 'Consultivo e direto',
      brandVoiceSummary: 'Clara e prática.',
      visualIdentity: { ...emptyProfile.visualIdentity, logoUrl: 'https://yux.com.br/logo.svg', colors: ['#5519ff', 'xyz'], typography: ['Sora'] },
    })
    const card = container.querySelector('[aria-label="Cartão da marca"]')!
    expect(card.querySelector('img')?.getAttribute('src')).toBe('https://yux.com.br/logo.svg')
    expect(card.textContent).toContain('#5519FF')
    expect(card.querySelectorAll('[data-testid="brand-swatch"]')).toHaveLength(1)
    expect(card.textContent).toContain('Cor inválida')
    expect(card.textContent).toContain('Sora')
    expect(card.textContent).toContain('Exemplo de mensagem')
    expect(card.textContent).toContain('Aqui é a Empresa A')
    act(() => root.unmount())
  })

  it('usa "O que usar e o que evitar", barra de salvar e bloqueia o salvamento com cor inválida', async () => {
    const { container, root, onSave } = await mount({ ...emptyProfile, visualIdentity: { ...emptyProfile.visualIdentity, colors: ['#5519ff'] } })
    expect(container.textContent).toContain('O que usar e o que evitar')
    expect(container.textContent).not.toContain('Guardrails')
    expect(container.textContent).not.toContain('Diretrizes carregadas')
    expect(saveButton()).toBeUndefined()

    await change('#brand-color-0', 'nada')
    expect(saveButton()).toBeDefined()
    expect(saveButton()!.disabled).toBe(true)
    expect(container.textContent).toContain('Use o formato #RRGGBB')
    expect(onSave).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('permite digitar vírgulas seguidas em listas', async () => {
    const { root } = await mount(emptyProfile)
    await change('#vocabulary-do', 'a, ')
    expect((document.body.querySelector('#vocabulary-do') as HTMLInputElement).value).toBe('a, ')
    act(() => root.unmount())
  })
})

async function click(element: Element) {
  await act(async () => { (element as HTMLElement).click(); await flush() })
}

async function change(selector: string, value: string) {
  const element = document.body.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null
  expect(element).not.toBeNull()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set
    setter?.call(element, value)
    element?.dispatchEvent(new Event('input', { bubbles: true }))
    element?.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
  })
}
