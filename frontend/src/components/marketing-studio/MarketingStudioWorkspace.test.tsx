import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MarketingStudioWorkspace } from './MarketingStudioWorkspace'
import type {
  MarketingCalendarItem,
  MarketingBrandProfile,
  MarketingContentItem,
  MarketingContentReview,
  MarketingContentVersion,
  MarketingKnowledgeChunk,
  MarketingKnowledgeDocument,
  MarketingKnowledgeMatch,
  MarketingProductService,
  MarketingStudioSettings,
} from '@/types/marketingStudio'

const settings: MarketingStudioSettings = {
  id: 'settings-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  operationMode: 'managed_by_yux',
  monthlyCreditLimit: 500,
  currentCreditBalance: 120,
  approvalPolicy: {
    publishSocial: true,
    publishWordPress: true,
    paidCampaignDraft: true,
    premiumImage: true,
    regulatedContent: true,
  },
  allowedChannels: ['linkedin', 'instagram', 'blog'],
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}

const contents: MarketingContentItem[] = [
  {
    id: 'content-1',
    organizationId: 'org-1',
    clientId: 'client-1',
    contractId: 'contract-1',
    title: 'Post sobre funil',
    contentType: 'social_post',
    channel: 'linkedin',
    status: 'in_review',
    body: 'Texto',
    internalNotes: 'Custo interno R$ 12',
    createdAt: '2026-06-05T12:00:00.000Z',
    updatedAt: '2026-06-05T12:00:00.000Z',
  },
  {
    id: 'content-2',
    organizationId: 'org-1',
    clientId: 'client-1',
    contractId: 'contract-1',
    title: 'Artigo mensal',
    contentType: 'blog_article',
    channel: 'blog',
    status: 'scheduled',
    createdAt: '2026-06-05T12:00:00.000Z',
    updatedAt: '2026-06-05T12:00:00.000Z',
  },
]

const reviews: MarketingContentReview[] = [
  {
    id: 'review-1',
    contentItemId: 'content-1',
    status: 'pending',
    comments: 'Validar promessa comercial',
    checklist: { cta: true },
    createdAt: '2026-06-05T12:00:00.000Z',
    updatedAt: '2026-06-05T12:00:00.000Z',
  },
]

const calendarItems: MarketingCalendarItem[] = [
  {
    id: 'calendar-1',
    organizationId: 'org-1',
    clientId: 'client-1',
    contractId: 'contract-1',
    contentItemId: 'content-2',
    title: 'Artigo mensal',
    channel: 'blog',
    status: 'scheduled',
    startsAt: '2026-06-10T12:00:00.000Z',
    metadata: {},
    createdAt: '2026-06-05T12:00:00.000Z',
    updatedAt: '2026-06-05T12:00:00.000Z',
  },
]

const versionsByContent: Record<string, MarketingContentVersion[]> = {
  'content-1': [
    {
      id: 'version-1',
      contentItemId: 'content-1',
      versionNumber: 1,
      title: 'Post sobre funil',
      body: 'Texto',
      createdAt: '2026-06-05T12:00:00.000Z',
    },
  ],
}

const brandProfile: MarketingBrandProfile = {
  id: 'brand-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  toneOfVoice: 'consultivo',
  persona: 'especialista',
  brandVoiceSummary: 'Marca consultiva e direta para PMEs.',
  vocabularyDo: [],
  vocabularyDont: [],
  forbiddenTopics: [],
  priorityTopics: [],
  complianceNotes: 'Sem promessas garantidas',
  status: 'active',
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}

const productsServices: MarketingProductService[] = [{
  id: 'product-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  name: 'CRM YUX',
  description: 'CRM comercial',
  valueProposition: 'Organizar pipeline',
  proofPoints: [],
  objections: [],
  status: 'active',
  metadata: {},
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}]

const knowledgeDocuments: MarketingKnowledgeDocument[] = [{
  id: 'doc-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  title: 'Guia da marca',
  documentType: 'brand',
  status: 'published',
  metadata: {},
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}]

const knowledgeChunks: MarketingKnowledgeChunk[] = [{
  id: 'chunk-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  documentId: 'doc-1',
  chunkIndex: 0,
  title: 'Guia da marca',
  body: 'A marca fala com clareza.',
  tokenCount: 8,
  metadata: {},
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}]

const knowledgeMatches: MarketingKnowledgeMatch[] = [{
  chunkId: 'chunk-1',
  documentId: 'doc-1',
  title: 'Guia da marca',
  body: 'A marca fala com clareza.',
  rank: 1,
}]

describe('MarketingStudioWorkspace', () => {
  it('renders internal metrics, tabs, content, and internal operational details', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onRefresh = vi.fn()
    const onSubmitForReview = vi.fn()
    const onApproveReview = vi.fn()
    const onSearchKnowledge = vi.fn()

    act(() => {
      root.render(
        <MarketingStudioWorkspace
          contents={contents}
          settings={settings}
          onRefresh={onRefresh}
          reviews={reviews}
          calendarItems={calendarItems}
          versionsByContent={versionsByContent}
          brandProfile={brandProfile}
          productsServices={productsServices}
          knowledgeDocuments={knowledgeDocuments}
          knowledgeChunks={knowledgeChunks}
          knowledgeMatches={knowledgeMatches}
          onSubmitForReview={onSubmitForReview}
          onApproveReview={onApproveReview}
          onSearchKnowledge={onSearchKnowledge}
        />
      )
    })

    const html = container.innerHTML
    expect(html).toContain('Marketing Studio')
    expect(html).toContain('Conteudos 2')
    expect(html).toContain('Aprovacoes 1')
    expect(html).toContain('Agendados 1')
    expect(html).toContain('Creditos 120')
    expect(html).toContain('Visao geral')
    expect(html).toContain('Conteudo')
    expect(html).toContain('Calendario')
    expect(html).toContain('Aprovacoes')
    expect(html).toContain('Ideias')
    expect(html).toContain('Agentes')
    expect(html).toContain('Creditos')
    expect(html).toContain('Post sobre funil')
    expect(html).toContain('Conteudo organico')
    expect(html).toContain('Fila de aprovacao')
    expect(html).toContain('Calendario editorial')
    expect(html).toContain('Base de conhecimento e tom de voz')
    expect(html).toContain('Marca consultiva e direta')
    expect(html).toContain('CRM YUX')
    expect(html).toContain('1 documentos / 1 chunks')
    expect(html).toContain('Versoes 1')
    expect(html).toContain('Validar promessa comercial')
    expect(html).toContain('managed_by_yux')
    expect(html).toContain('Custo interno R$ 12')

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Atualizar Marketing Studio"]')!.click()
    })
    expect(onRefresh).toHaveBeenCalled()
    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Enviar para revisao"]')!.click()
    })
    expect(onSubmitForReview).toHaveBeenCalledWith('content-1')
    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Aprovar revisao"]')!.click()
    })
    expect(onApproveReview).toHaveBeenCalledWith('review-1')
    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Buscar conhecimento"]')!.click()
    })
    expect(onSearchKnowledge).toHaveBeenCalledWith('marca produto servico')

    act(() => root.unmount())
  })
})
