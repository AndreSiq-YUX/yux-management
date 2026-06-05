import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MarketingStudioWorkspace } from './MarketingStudioWorkspace'
import type { MarketingContentItem, MarketingStudioSettings } from '@/types/marketingStudio'

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

describe('MarketingStudioWorkspace', () => {
  it('renders internal metrics, tabs, content, and internal operational details', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onRefresh = vi.fn()

    act(() => {
      root.render(<MarketingStudioWorkspace contents={contents} settings={settings} onRefresh={onRefresh} />)
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
    expect(html).toContain('managed_by_yux')
    expect(html).toContain('Custo interno R$ 12')

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Atualizar Marketing Studio"]')!.click()
    })
    expect(onRefresh).toHaveBeenCalled()

    act(() => root.unmount())
  })
})
