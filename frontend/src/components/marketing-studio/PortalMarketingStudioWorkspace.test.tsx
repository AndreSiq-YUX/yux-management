import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { PortalMarketingStudioWorkspace } from './PortalMarketingStudioWorkspace'
import type {
  MarketingCalendarItem,
  MarketingContentReview,
  MarketingKnowledgeDocument,
  MarketingKnowledgeMatch,
  MarketingProductService,
  MarketingStudioSettings,
  PortalMarketingBrandProfile,
  PortalMarketingContentItem,
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

const contents: PortalMarketingContentItem[] = [
  {
    id: 'content-1',
    organizationId: 'org-1',
    clientId: 'client-1',
    contractId: 'contract-1',
    title: 'Post para aprovacao',
    contentType: 'social_post',
    channel: 'linkedin',
    status: 'in_review',
    body: 'Texto',
    createdAt: '2026-06-05T12:00:00.000Z',
    updatedAt: '2026-06-05T12:00:00.000Z',
  },
]

const reviews: MarketingContentReview[] = [
  {
    id: 'review-1',
    contentItemId: 'content-1',
    status: 'pending',
    comments: 'Revise antes de aprovar',
    checklist: {},
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
    contentItemId: 'content-1',
    title: 'Post para aprovacao',
    channel: 'linkedin',
    status: 'planned',
    startsAt: '2026-06-10T12:00:00.000Z',
    metadata: {},
    createdAt: '2026-06-05T12:00:00.000Z',
    updatedAt: '2026-06-05T12:00:00.000Z',
  },
]

const brandProfile: PortalMarketingBrandProfile = {
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
  title: 'Guia',
  documentType: 'brand',
  status: 'published',
  metadata: {},
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}]

const knowledgeMatches: MarketingKnowledgeMatch[] = [{
  chunkId: 'chunk-1',
  documentId: 'doc-1',
  title: 'Guia',
  body: 'A marca fala com clareza.',
  rank: 1,
}]

describe('PortalMarketingStudioWorkspace', () => {
  it('renders client-safe marketing data without internal technical details', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onReviewDecision = vi.fn()

    act(() => {
      root.render(
        <PortalMarketingStudioWorkspace
          contents={contents}
          settings={settings}
          reviews={reviews}
          calendarItems={calendarItems}
          brandProfile={brandProfile}
          productsServices={productsServices}
          knowledgeDocuments={knowledgeDocuments}
          knowledgeMatches={knowledgeMatches}
          onReviewDecision={onReviewDecision}
        />
      )
    })

    const html = container.innerHTML
    expect(html).toContain('Marketing Studio')
    expect(html).toContain('Aguardando aprovacao 1')
    expect(html).toContain('Conteudos 1')
    expect(html).toContain('Creditos 120')
    expect(html).toContain('Post para aprovacao')
    expect(html).toContain('Calendario')
    expect(html).toContain('Aprovacoes')
    expect(html).toContain('Revise antes de aprovar')
    expect(html).toContain('Campanhas e criativos')
    expect(html).toContain('Relatorios')
    expect(html).toContain('Marca e conhecimento')
    expect(html).toContain('Marca consultiva e direta')
    expect(html).toContain('1 ofertas estruturadas')
    expect(html).toContain('1 documentos publicados')
    expect(html).toContain('A marca fala com clareza')
    expect(html).not.toContain('internalNotes')
    expect(html).not.toContain('complianceNotes')
    expect(html).not.toContain('Custo interno')
    expect(html).not.toContain('inputTokens')
    expect(html).not.toContain('protected_error')
    expect(html).not.toContain('raw model')

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Aprovar conteudo"]')!.click()
    })
    expect(onReviewDecision).toHaveBeenCalledWith({ contentItemId: 'content-1', status: 'approved' })

    act(() => root.unmount())
  })
})
