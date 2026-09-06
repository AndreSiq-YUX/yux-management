import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marketingStudioService } from '@/services/marketingStudioService'
import { loadPortalMarketingContextData } from './usePortalMarketingContext'

vi.mock('@/services/campaignService', () => ({ campaignService: { getPortalCampaigns: vi.fn() } }))
vi.mock('@/services/marketingStudioService', () => ({
  marketingStudioService: {
    getPortalContents: vi.fn(), getSettings: vi.fn(), getCalendarItems: vi.fn(), getReviews: vi.fn(),
    getBrandProfile: vi.fn(), getProductsServices: vi.fn(), getKnowledgeDocuments: vi.fn(), searchKnowledge: vi.fn(),
    getCampaignCreativeSuggestions: vi.fn(), getPublishingConnections: vi.fn(), getAgents: vi.fn(), getWorkflowRuns: vi.fn(),
  },
}))

describe('loadPortalMarketingContextData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(marketingStudioService.getPortalContents).mockResolvedValue([])
    vi.mocked(marketingStudioService.getSettings).mockResolvedValue(null)
    vi.mocked(marketingStudioService.getCalendarItems).mockResolvedValue([])
    vi.mocked(marketingStudioService.getBrandProfile).mockResolvedValue({ id: 'brand-1', contractId: 'contract-1', name: 'Marca A' } as any)
    vi.mocked(marketingStudioService.getProductsServices).mockResolvedValue([{ id: 'product-1', name: 'Produto A' }] as any)
    vi.mocked(marketingStudioService.getKnowledgeDocuments).mockResolvedValue([{ id: 'doc-1', title: 'Base A' }] as any)
    vi.mocked(marketingStudioService.searchKnowledge).mockResolvedValue([])
  })

  it('preserva dados essenciais quando a leitura opcional de revisões falha', async () => {
    vi.mocked(marketingStudioService.getReviews).mockRejectedValue(new Error('review endpoint unavailable'))
    const result = await loadPortalMarketingContextData('contract-1')
    expect(result.reviews).toEqual([])
    expect(result.brandProfile?.id).toBe('brand-1')
    expect(result.productsServices).toHaveLength(1)
    expect(result.knowledgeDocuments).toHaveLength(1)
  })

  it('carrega somente os recursos usados pela pagina', async () => {
    const result = await loadPortalMarketingContextData('contract-1', {
      resources: ['calendarItems', 'contents'],
    })

    expect(marketingStudioService.getPortalContents).toHaveBeenCalledWith('contract-1')
    expect(marketingStudioService.getCalendarItems).toHaveBeenCalledWith({ contractId: 'contract-1' })
    expect(marketingStudioService.getBrandProfile).not.toHaveBeenCalled()
    expect(marketingStudioService.getKnowledgeDocuments).not.toHaveBeenCalled()
    expect(result.brandProfile).toBeNull()
    expect(result.knowledgeDocuments).toEqual([])
  })
})
