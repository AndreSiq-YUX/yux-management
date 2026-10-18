import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { PortalOrganicContentPage } from './PortalOrganicContentPage'
import { usePlatformStore } from '@/stores/platformStore'
import { marketingStudioService } from '@/services/marketingStudioService'
import type { WorkspaceContextV1 } from '@/types/generated/workspace'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const marketingContext = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  reload: vi.fn(),
}))

vi.mock('@/hooks/usePortalMarketingContext', () => ({
  usePortalMarketingContext: () => marketingContext.value,
}))

const workspaceContext: WorkspaceContextV1 = {
  schemaVersion: 1,
  organizationId: '00000000-0000-4000-8000-000000000001',
  contractId: '00000000-0000-4000-8000-000000000002',
  kind: 'client',
  role: 'client_admin',
  moduleKeys: ['marketing_studio'],
  canConfigure: true,
  missionCreation: { mode: 'conversation', reasonCode: null },
}

const baseContext = () => ({
  loading: false,
  error: null,
  contents: [] as unknown[],
  campaigns: [] as unknown[],
  creativeSuggestions: [] as unknown[],
  reviews: [] as unknown[],
  reload: marketingContext.reload,
})

const realContent = (overrides: Record<string, unknown> = {}) => ({
  id: 'content-1',
  organizationId: workspaceContext.organizationId,
  clientId: 'client-1',
  contractId: workspaceContext.contractId,
  title: 'Post sobre atendimento rápido',
  contentType: 'social_post',
  channel: 'linkedin',
  status: 'in_review',
  brief: 'Explicar a importância de responder rápido.',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
  ...overrides,
})

const pendingReview = {
  id: 'review-1',
  contentItemId: 'content-1',
  contentVersionId: 'version-7',
  status: 'pending',
  checklist: {},
  createdAt: '2026-10-02T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
}

let root: Root
let container: HTMLDivElement
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

const render = () => {
  act(() => root.render(
    <MemoryRouter>
      <PortalOrganicContentPage />
    </MemoryRouter>,
  ))
}

const buttonByText = (text: string) => (
  Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim().startsWith(text))
)

const type = (textarea: HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  usePlatformStore.setState({ isLoading: false, error: null, workspaceContext })
  marketingContext.value = baseContext()
  marketingContext.reload.mockReset().mockResolvedValue(undefined)
  vi.spyOn(marketingStudioService, 'decideJourneyContentReview').mockResolvedValue({
    contentId: 'content-1',
    contentVersionId: 'version-7',
    status: 'approved',
  })
  vi.spyOn(toast, 'success').mockImplementation(() => '')
  vi.spyOn(toast, 'error').mockImplementation(() => '')
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe('PortalOrganicContentPage', () => {
  it('não exibe conteúdo de exemplo quando não há dados e orienta para o Marketing Studio', () => {
    render()

    const text = container.textContent || ''
    expect(text).toContain('Nenhum conteúdo para revisar')
    expect(text).toContain('Os conteúdos produzidos no Marketing Studio aparecem aqui para você revisar e aprovar.')
    expect(text).not.toContain('Estudio de Automacoes')
    expect(text).not.toContain('Diagnostico')
    expect(text).not.toContain('Roteiro Reels')
    expect(text).not.toContain('Kit de anuncios')
    expect(container.querySelector('a[href="/portal/marketing/studio"]')).not.toBeNull()
    expect(buttonByText('Aprovar')).toBeUndefined()
  })

  it('mostra só os conteúdos reais, sem completar a lista com exemplos', () => {
    marketingContext.value = { ...baseContext(), contents: [realContent()], reviews: [pendingReview] }
    render()

    expect(container.textContent).toContain('Post sobre atendimento rápido')
    expect(container.textContent).toContain('Total de ativos')
    expect(container.querySelectorAll('h3').length).toBeGreaterThan(0)
    expect(container.textContent).not.toContain('Diagnostico')
    expect(container.textContent).not.toContain('sample-')
  })

  it('aprova um conteúdo real pelo serviço, usando a versão da revisão pendente, e recarrega', async () => {
    marketingContext.value = { ...baseContext(), contents: [realContent()], reviews: [pendingReview] }
    render()

    act(() => buttonByText('Aprovar')!.click())
    await flush()

    expect(marketingStudioService.decideJourneyContentReview).toHaveBeenCalledTimes(1)
    expect(marketingStudioService.decideJourneyContentReview).toHaveBeenCalledWith('content-1', {
      organizationId: workspaceContext.organizationId,
      contractId: workspaceContext.contractId,
      contentVersionId: 'version-7',
      status: 'approved',
    })
    expect(toast.success).toHaveBeenCalledWith('Decisão registrada')
    expect(marketingContext.reload).toHaveBeenCalledTimes(1)
  })

  it('exige comentário para pedir ajustes e só então envia', async () => {
    marketingContext.value = { ...baseContext(), contents: [realContent()], reviews: [pendingReview] }
    render()

    act(() => buttonByText('Pedir ajustes')!.click())
    await flush()
    expect(marketingStudioService.decideJourneyContentReview).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Descreva o que precisa mudar')

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(container.textContent).toContain('O que precisa mudar?')
    type(textarea, 'abc')
    act(() => buttonByText('Pedir ajustes')!.click())
    await flush()
    expect(marketingStudioService.decideJourneyContentReview).not.toHaveBeenCalled()

    type(textarea, 'Trocar o título por algo mais direto')
    act(() => buttonByText('Pedir ajustes')!.click())
    await flush()

    expect(marketingStudioService.decideJourneyContentReview).toHaveBeenCalledWith('content-1', {
      organizationId: workspaceContext.organizationId,
      contractId: workspaceContext.contractId,
      contentVersionId: 'version-7',
      status: 'changes_requested',
      comments: 'Trocar o título por algo mais direto',
    })
    expect(marketingContext.reload).toHaveBeenCalledTimes(1)
  })

  it('trava o duplo envio e mantém o comentário quando o registro falha', async () => {
    let rejectDecision: (reason: unknown) => void = () => undefined
    vi.mocked(marketingStudioService.decideJourneyContentReview).mockReturnValue(
      new Promise((_resolve, reject) => { rejectDecision = reject }),
    )
    marketingContext.value = { ...baseContext(), contents: [realContent()], reviews: [pendingReview] }
    render()

    type(container.querySelector('textarea') as HTMLTextAreaElement, 'Ajustar a chamada final')
    act(() => buttonByText('Pedir ajustes')!.click())
    act(() => buttonByText('Registrando...')!.click())
    expect(marketingStudioService.decideJourneyContentReview).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Registrando...')

    await act(async () => { rejectDecision(new Error('falha')) })
    await flush()

    expect(toast.error).toHaveBeenCalledWith('Não foi possível registrar sua decisão. Tente novamente.')
    expect(toast.success).not.toHaveBeenCalled()
    expect(marketingContext.reload).not.toHaveBeenCalled()
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Ajustar a chamada final')
    expect(buttonByText('Aprovar')).toBeDefined()
  })

  it('não oferece decisão quando não há revisão pendente para o conteúdo', () => {
    marketingContext.value = { ...baseContext(), contents: [realContent()], reviews: [] }
    render()

    expect(buttonByText('Aprovar')).toBeUndefined()
    expect(container.textContent).toContain('Este conteúdo não tem uma revisão aguardando sua decisão.')
  })

  it('sugestões criativas mostram Aprovar como Pendente e não chamam serviço', () => {
    marketingContext.value = {
      ...baseContext(),
      creativeSuggestions: [{
        id: 'sug-1', title: 'Anúncio de reativação', status: 'suggested', provider: 'meta', objective: 'lead_generation',
        campaignName: 'Reativação', angle: 'Volte a falar com quem sumiu', targetAudience: 'Leads antigos',
        funnelStage: 'consideration', updatedAt: '2026-10-02T10:00:00.000Z',
      }],
    }
    render()

    const approve = buttonByText('Aprovar')!
    expect(approve.textContent).toContain('Pendente')
    act(() => approve.click())
    expect(container.textContent).toContain('em implantação')
    expect(marketingStudioService.decideJourneyContentReview).not.toHaveBeenCalled()
  })

  it('criativos derivados de campanha não têm botões de decisão e apontam para Campanhas', () => {
    marketingContext.value = {
      ...baseContext(),
      campaigns: [{
        id: 'camp-1', name: 'Campanha de outubro', provider: 'meta', lifecycleStatus: 'active',
        creatives: [{ id: 'cr-1', name: 'Criativo carrossel', format: 'image', updatedAt: '2026-10-02T10:00:00.000Z' }],
      }],
    }
    render()

    expect(buttonByText('Aprovar')).toBeUndefined()
    expect(buttonByText('Pedir ajustes')).toBeUndefined()
    expect(container.textContent).toContain('As decisões desta campanha ficam em Campanhas.')
  })

  it('Novo conteúdo é um link real e as demais ações sem função ficam marcadas como Pendente', () => {
    marketingContext.value = { ...baseContext(), contents: [realContent()], reviews: [pendingReview] }
    render()

    const novo = Array.from(container.querySelectorAll('a')).find(link => link.textContent?.includes('Novo conteúdo'))!
    expect(novo.getAttribute('href')).toBe('/portal/marketing/studio')
    for (const label of ['Importar', 'Gerar variação', 'Enviar para campanha']) {
      expect(buttonByText(label)!.textContent).toContain('Pendente')
    }
    act(() => buttonByText('Importar')!.click())
    expect(container.textContent).toContain('em implantação')
  })

  it('os filtros filtram os ativos carregados e Limpar restaura a lista', () => {
    marketingContext.value = {
      ...baseContext(),
      contents: [
        realContent(),
        realContent({ id: 'content-2', title: 'Newsletter de outubro', contentType: 'newsletter', channel: 'newsletter', status: 'draft' }),
      ],
      reviews: [pendingReview],
    }
    render()
    const titles = () => Array.from(container.querySelectorAll('h3')).map(h => h.textContent)
    expect(titles()).toContain('Newsletter de outubro')
    expect(buttonByText('Limpar')).toBeUndefined()

    const select = container.querySelector('select[aria-label="Canal"]') as HTMLSelectElement
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    act(() => {
      setter.call(select, 'Newsletter')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(titles()).toContain('Newsletter de outubro')
    expect(titles()).not.toContain('Post sobre atendimento rápido')

    act(() => buttonByText('Limpar')!.click())
    expect(titles()).toContain('Post sobre atendimento rápido')
    expect(buttonByText('Limpar')).toBeUndefined()
  })

  it('mantém o conteúdo visível enquanto recarrega, sem voltar ao estado de carregamento', () => {
    marketingContext.value = { ...baseContext(), contents: [realContent()], reviews: [pendingReview] }
    render()
    marketingContext.value = { ...baseContext(), contents: [realContent()], reviews: [pendingReview], loading: true }
    render()

    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(container.textContent).toContain('Post sobre atendimento rápido')
    expect(container.textContent).toContain('Atualizando...')
  })

  it('mostra o carregamento completo apenas na primeira carga', () => {
    marketingContext.value = { ...baseContext(), loading: true }
    render()
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(container.textContent).not.toContain('Nenhum conteúdo para revisar')
  })
  it('no celular a lista vem primeiro e o detalhe abre em tela cheia com botão "Voltar"', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    })
    marketingContext.value = { ...baseContext(), contents: [realContent()], reviews: [pendingReview] }
    render()

    expect(container.querySelector('aside[aria-label="Detalhes do ativo"]')).toBeNull()
    expect(buttonByText('Aprovar')).toBeUndefined()
    expect(buttonByText('Voltar')).toBeUndefined()

    const card = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Post sobre atendimento rápido'))!
    act(() => card.click())
    expect(buttonByText('Aprovar')).toBeDefined()
    expect(container.querySelector('aside[aria-label="Detalhes do ativo"]')).not.toBeNull()

    act(() => buttonByText('Voltar')!.click())
    expect(buttonByText('Aprovar')).toBeUndefined()
    expect(container.querySelector('aside[aria-label="Detalhes do ativo"]')).toBeNull()

    // @ts-expect-error remove o mock para voltar ao padrão (computador)
    delete window.matchMedia
  })

  it('a visão de calendário mostra só os próximos itens e leva ao calendário completo', () => {
    marketingContext.value = {
      ...baseContext(),
      contents: [realContent()],
      reviews: [pendingReview],
      calendarItems: [
        { id: 'cal-1', title: 'Post agendado para 2099', channel: 'linkedin', status: 'scheduled', startsAt: new Date(2099, 0, 5, 9, 0).toISOString() },
        { id: 'cal-2', title: 'Post antigo de 2001', channel: 'blog', status: 'published', startsAt: new Date(2001, 0, 5, 9, 0).toISOString() },
      ],
    }
    render()

    act(() => buttonByText('Calendário')!.click())
    expect(container.textContent).toContain('Próximas publicações')
    expect(container.textContent).toContain('Post agendado para 2099')
    expect(container.textContent).not.toContain('Post antigo de 2001')
    const link = Array.from(container.querySelectorAll('a')).find(anchor => anchor.textContent === 'Ver calendário completo')!
    expect(link.getAttribute('href')).toBe('/portal/marketing/calendario')
  })

  it('usa o título e os indicadores do novo padrão, sem termos internos', () => {
    marketingContext.value = { ...baseContext(), contents: [realContent()], reviews: [pendingReview] }
    render()

    expect(container.querySelector('h1')!.textContent).toBe('Central de conteúdo')
    expect(container.textContent).not.toContain('Pulso Executivo')
    for (const label of ['Total de ativos', 'Aguardando aprovação', 'Ajustes solicitados', 'Aprovados', 'Publicados', 'Usados em campanha']) {
      expect(container.textContent).toContain(label)
    }
  })
})
