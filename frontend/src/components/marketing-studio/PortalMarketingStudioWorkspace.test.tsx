import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { PortalMarketingStudioWorkspace } from './PortalMarketingStudioWorkspace'
import type { MarketingStudioSettings, PortalMarketingContentItem } from '@/types/marketingStudio'

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

describe('PortalMarketingStudioWorkspace', () => {
  it('renders client-safe marketing data without internal technical details', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(<PortalMarketingStudioWorkspace contents={contents} settings={settings} />)
    })

    const html = container.innerHTML
    expect(html).toContain('Marketing Studio')
    expect(html).toContain('Aguardando aprovacao 1')
    expect(html).toContain('Conteudos 1')
    expect(html).toContain('Creditos 120')
    expect(html).toContain('Post para aprovacao')
    expect(html).toContain('Calendario')
    expect(html).toContain('Campanhas e criativos')
    expect(html).toContain('Relatorios')
    expect(html).not.toContain('internalNotes')
    expect(html).not.toContain('Custo interno')
    expect(html).not.toContain('inputTokens')
    expect(html).not.toContain('protected_error')
    expect(html).not.toContain('raw model')

    act(() => root.unmount())
  })
})
