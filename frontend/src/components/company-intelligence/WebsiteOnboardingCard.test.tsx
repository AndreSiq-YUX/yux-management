import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { companyIntelligenceService } from '@/services/companyIntelligenceService'
import { WebsiteOnboardingCard } from './WebsiteOnboardingCard'

vi.mock('@/services/companyIntelligenceService', () => ({
  companyIntelligenceService: {
    startWebsiteOnboarding: vi.fn(),
    getWebsiteOnboarding: vi.fn(),
    applyWebsiteSuggestions: vi.fn(),
  },
}))

const suggestion = {
  id: '00000000-0000-4000-8000-000000000010',
  suggestionKind: 'profile' as const,
  fieldPath: 'description',
  suggestedValue: 'Descrição sugerida',
  evidenceExcerpt: 'Trecho oficial da empresa.',
  sourceUrl: 'https://yux.com.br/',
  confidence: 0.95,
  selected: false,
  status: 'suggested' as const,
}

const partialResult = {
  run: {
    id: '00000000-0000-4000-8000-000000000020',
    runKind: 'website_onboarding' as const,
    status: 'failed' as const,
    stage: 'failed',
    progress: 100,
    metrics: {},
    outputPayload: { pageUrls: ['https://yux.com.br/'] },
    errorMessage: 'knowledge_file_already_exists',
  },
  suggestions: [suggestion],
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('WebsiteOnboardingCard', () => {
  it('keeps partial suggestions editable and applies the edited value', async () => {
    vi.mocked(companyIntelligenceService.startWebsiteOnboarding).mockResolvedValue(partialResult)
    vi.mocked(companyIntelligenceService.applyWebsiteSuggestions).mockResolvedValue({
      ...partialResult,
      run: { ...partialResult.run, status: 'applied', stage: 'completed' },
      suggestions: [{ ...suggestion, status: 'applied' }],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<WebsiteOnboardingCard organizationId="00000000-0000-4000-8000-000000000001" initialUrl="https://yux.com.br" onApplied={vi.fn()} />)
    })
    await changeInput(container.querySelector('#website-onboarding-max-pages') as HTMLInputElement, '45')
    await clickButton(container, 'Analisar site')

    expect(companyIntelligenceService.startWebsiteOnboarding).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001', 'https://yux.com.br', undefined, 45,
    )

    expect(container.textContent).toContain('Aplicar selecionadas (1)')
    const editor = container.querySelector('[aria-label="Editar Descrição"]') as HTMLTextAreaElement
    await change(editor, 'Descrição revisada pelo usuário')
    await clickButton(container, 'Aplicar selecionadas (1)')

    expect(companyIntelligenceService.applyWebsiteSuggestions).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      partialResult.run.id,
      [suggestion.id],
      [{ id: suggestion.id, suggestedValue: 'Descrição revisada pelo usuário' }],
    )
    act(() => root.unmount())
  })

  it('mostra rótulo visível para o limite de páginas', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<WebsiteOnboardingCard organizationId="org" onApplied={vi.fn()} />) })
    const label = container.querySelector('label[for="website-onboarding-max-pages"]')
    expect(label?.textContent).toBe('Limite de páginas')
    act(() => root.unmount())
  })

  it('fica recolhido quando o perfil já tem dados e abre ao expandir', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<WebsiteOnboardingCard organizationId="org" defaultOpen={false} onApplied={vi.fn()} />) })
    expect(container.querySelector('#website-onboarding-max-pages')).toBeNull()
    const toggle = container.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { toggle.click() })
    expect(container.querySelector('#website-onboarding-max-pages')).not.toBeNull()
    act(() => root.unmount())
  })

  it('nunca pede ao cliente para editar JSON: objetos viram campos simples ou texto legível', async () => {
    const structured = {
      ...partialResult,
      run: { ...partialResult.run, status: 'ready_for_review' as const },
      suggestions: [
        { ...suggestion, id: '00000000-0000-4000-8000-000000000011', fieldPath: 'address', suggestedValue: { street: 'Rua A', city: 'São Paulo' } },
        { ...suggestion, id: '00000000-0000-4000-8000-000000000012', fieldPath: 'businessHours', suggestedValue: { monday: { open: '09:00', close: '18:00' } } },
      ],
    }
    vi.mocked(companyIntelligenceService.startWebsiteOnboarding).mockResolvedValue(structured)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<WebsiteOnboardingCard organizationId="org" initialUrl="https://yux.com.br" onApplied={vi.fn()} />) })
    await clickButton(container, 'Analisar site')

    expect(container.querySelector('#edit-00000000-0000-4000-8000-000000000011-street')).not.toBeNull()
    expect(container.textContent).toContain('Segunda: 09:00 às 18:00')
    expect(container.textContent).not.toMatch(/JSON/i)
    expect(container.textContent).not.toContain('"monday"')
    expect(container.querySelector('textarea')).toBeNull()
    act(() => root.unmount())
  })
})

async function clickButton(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent?.includes(text))
  expect(button).toBeDefined()
  await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve() })
}

async function change(element: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function changeInput(element: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
