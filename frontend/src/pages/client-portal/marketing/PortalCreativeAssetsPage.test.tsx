import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalCreativeAssetsPage } from './PortalCreativeAssetsPage'
import { marketingStudioService } from '@/services/marketingStudioService'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const marketingContext = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('@/hooks/usePortalMarketingContext', () => ({
  usePortalMarketingContext: () => marketingContext.value,
}))

const baseContext = () => ({
  loading: false,
  error: null,
  campaigns: [] as unknown[],
  creativeSuggestions: [] as unknown[],
  reload: vi.fn(),
})

let root: Root
let container: HTMLDivElement

const render = () => {
  act(() => root.render(
    <MemoryRouter>
      <PortalCreativeAssetsPage />
    </MemoryRouter>,
  ))
}

const kpiCards = () => Array.from(container.querySelectorAll('ul[aria-label="Indicadores"] > li'))

const buttonByText = (text: string) => (
  Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim().startsWith(text))
)

beforeEach(() => {
  marketingContext.value = baseContext()
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe('PortalCreativeAssetsPage', () => {
  it('sem dados reais não exibe concorrentes, coleções nem inspirações de exemplo', () => {
    render()

    const text = container.textContent || ''
    for (const fake of ['V4 Company', 'RD Station', 'HubSpot', 'Agencia Local Pro', 'Favoritos do cliente', 'Diagnostico gratuito', 'Follow-up em 5 minutos']) {
      expect(text).not.toContain(fake)
    }
    expect(text).toContain('Nenhum concorrente monitorado ainda')
    expect(text).toContain('A YUX vai conectar fontes de referência para acompanhar concorrentes.')
    expect(text).toContain('Nenhuma inspiração salva ainda')
  })

  it('indicadores sem fonte mostram traço e "Sem fonte conectada"', () => {
    render()

    const cards = kpiCards()
    const byLabel = (label: string) => cards.find(card => card.textContent?.includes(label))!
    for (const label of ['Concorrentes monitorados', 'Anúncios analisados']) {
      expect(byLabel(label).textContent).toContain('—')
      expect(byLabel(label).textContent).toContain('Sem fonte conectada')
    }
    expect(byLabel('Inspirações salvas').textContent).toContain('0')
  })

  it('conta apenas inspirações reais e marca aprovação como Pendente sem chamar serviço', () => {
    const decide = vi.spyOn(marketingStudioService, 'decideJourneyContentReview')
    marketingContext.value = {
      ...baseContext(),
      creativeSuggestions: [{
        id: 'sug-1', title: 'Anúncio de reativação', status: 'suggested', provider: 'meta', objective: 'lead_generation',
        campaignName: 'Reativação', angle: 'Volte a falar com quem sumiu', targetAudience: 'Leads antigos',
        funnelStage: 'consideration', updatedAt: '2026-10-02T10:00:00.000Z',
      }],
    }
    render()

    expect(container.textContent).toContain('Anúncio de reativação')
    const saved = kpiCards().find(card => card.textContent?.includes('Inspirações salvas'))!
    expect(saved.textContent).toContain('1')

    const approve = buttonByText('Aprovar')!
    const curation = buttonByText('Curadoria')!
    expect(approve.textContent).toContain('Pendente')
    expect(curation.textContent).toContain('Pendente')
    act(() => approve.click())
    expect(container.textContent).toContain('em implantação')
    expect(container.textContent).not.toContain('Referência aprovada')
    expect(decide).not.toHaveBeenCalled()
  })

  it('ações sem função ficam marcadas como Pendente (B20) e não fazem nada', () => {
    marketingContext.value = {
      ...baseContext(),
      creativeSuggestions: [{
        id: 'sug-1', title: 'Anúncio de reativação', status: 'suggested', provider: 'meta', objective: 'lead_generation',
        campaignName: 'Reativação', angle: 'Volte a falar com quem sumiu', targetAudience: 'Leads antigos',
        funnelStage: 'consideration', updatedAt: '2026-10-02T10:00:00.000Z',
      }],
    }
    render()

    for (const label of ['Adicionar concorrente', 'Importar inspiração', 'Pesquisar mercado', 'Gerar similar', 'Criar briefing', 'Vincular campanha']) {
      expect(buttonByText(label)!.textContent).toContain('Pendente')
    }
  })

  it('os filtros por chip são derivados dos dados reais', () => {
    render()
    expect(buttonByText('Instagram')).toBeUndefined()
    expect(buttonByText('Todos')).toBeDefined()

    marketingContext.value = {
      ...baseContext(),
      creativeSuggestions: [{
        id: 'sug-1', title: 'Anúncio de reativação', status: 'suggested', provider: 'meta', objective: 'lead_generation',
        campaignName: 'Reativação', angle: 'Volte a falar com quem sumiu', targetAudience: 'Leads antigos',
        funnelStage: 'consideration', updatedAt: '2026-10-02T10:00:00.000Z',
      }],
    }
    render()
    expect(buttonByText('Meta Ads')).toBeDefined()
  })
  it('no celular a lista vem primeiro e o detalhe abre em tela cheia com "Voltar"', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    })
    marketingContext.value = {
      ...baseContext(),
      creativeSuggestions: [{
        id: 'sug-1', title: 'Anúncio de reativação', status: 'suggested', provider: 'meta', objective: 'lead_generation',
        campaignName: 'Reativação', angle: 'Volte a falar com quem sumiu', targetAudience: 'Leads antigos',
        funnelStage: 'consideration', updatedAt: '2026-10-02T10:00:00.000Z',
      }],
    }
    try {
      render()
      expect(container.querySelector('aside[aria-label="Detalhes da inspiração"]')).toBeNull()
      expect(buttonByText('Voltar')).toBeUndefined()

      const card = Array.from(container.querySelectorAll('button')).find(button => button.getAttribute('aria-pressed') !== null && button.textContent?.includes('Anúncio de reativação'))!
      act(() => card.click())
      expect(container.querySelector('aside[aria-label="Detalhes da inspiração"]')).not.toBeNull()

      act(() => buttonByText('Voltar')!.click())
      expect(container.querySelector('aside[aria-label="Detalhes da inspiração"]')).toBeNull()
    } finally {
      // @ts-expect-error remove o mock para voltar ao padrão (computador)
      delete window.matchMedia
    }
  })

  it('usa o título do novo padrão e a Central aparece como link real', () => {
    marketingContext.value = {
      ...baseContext(),
      creativeSuggestions: [{
        id: 'sug-1', title: 'Anúncio de reativação', status: 'suggested', provider: 'meta', objective: 'lead_generation',
        campaignName: 'Reativação', angle: 'Volte a falar com quem sumiu', targetAudience: 'Leads antigos',
        funnelStage: 'consideration', updatedAt: '2026-10-02T10:00:00.000Z',
      }],
    }
    render()

    expect(container.querySelector('h1')!.textContent).toBe('Criativos e inspirações')
    expect(container.textContent).not.toContain('Pulso Executivo')
    const link = Array.from(container.querySelectorAll('a')).find(anchor => anchor.textContent?.includes('Enviar para Central'))!
    expect(link.getAttribute('href')).toBe('/portal/marketing/conteudo')
  })
})
