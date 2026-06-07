import { useCallback, useEffect, useState } from 'react'
import { sanitizeBrandProfileForPortal } from '@/lib/marketing-studio/marketingStudioRules'
import { campaignService } from '@/services/campaignService'
import { marketingStudioService } from '@/services/marketingStudioService'
import { usePlatformStore } from '@/stores/platformStore'
import type { PortalCampaign } from '@/types/campaign'
import type {
  MarketingAgent,
  MarketingCalendarItem,
  MarketingCampaignCreativeSuggestion,
  MarketingContentReview,
  MarketingKnowledgeDocument,
  MarketingKnowledgeMatch,
  MarketingProductService,
  MarketingPublishingConnection,
  MarketingStudioSettings,
  MarketingWorkflowRun,
  PortalMarketingBrandProfile,
  PortalMarketingContentItem,
} from '@/types/marketingStudio'

interface PortalMarketingContextOptions {
  includeCampaigns?: boolean
  includeOperations?: boolean
}

interface PortalMarketingContextState {
  contents: PortalMarketingContentItem[]
  calendarItems: MarketingCalendarItem[]
  reviews: MarketingContentReview[]
  brandProfile: PortalMarketingBrandProfile | null
  productsServices: MarketingProductService[]
  knowledgeDocuments: MarketingKnowledgeDocument[]
  knowledgeMatches: MarketingKnowledgeMatch[]
  settings: MarketingStudioSettings | null
  campaigns: PortalCampaign[]
  creativeSuggestions: MarketingCampaignCreativeSuggestion[]
  publishingConnections: MarketingPublishingConnection[]
  agents: MarketingAgent[]
  workflowRuns: MarketingWorkflowRun[]
}

const emptyState: PortalMarketingContextState = {
  contents: [],
  calendarItems: [],
  reviews: [],
  brandProfile: null,
  productsServices: [],
  knowledgeDocuments: [],
  knowledgeMatches: [],
  settings: null,
  campaigns: [],
  creativeSuggestions: [],
  publishingConnections: [],
  agents: [],
  workflowRuns: [],
}

const fallback = async <T,>(promise: Promise<T>, value: T): Promise<T> => {
  try {
    return await promise
  } catch (error) {
    console.warn('Carga opcional do contexto de marketing falhou:', error)
    return value
  }
}

export function usePortalMarketingContext(options: PortalMarketingContextOptions = {}) {
  const activeContract = usePlatformStore(state => state.activeContract)
  const organization = usePlatformStore(state => state.organization)
  const includeCampaigns = Boolean(options.includeCampaigns)
  const includeOperations = Boolean(options.includeOperations)
  const [state, setState] = useState<PortalMarketingContextState>(emptyState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!activeContract) {
      setState(emptyState)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [
        contents,
        settings,
        calendarItems,
        reviews,
        brandProfile,
        productsServices,
        knowledgeDocuments,
        knowledgeMatches,
        campaigns,
        creativeSuggestions,
        publishingConnections,
        agents,
        workflowRuns,
      ] = await Promise.all([
        marketingStudioService.getPortalContents(activeContract.id),
        marketingStudioService.getSettings(activeContract.id),
        marketingStudioService.getCalendarItems({ contractId: activeContract.id }),
        marketingStudioService.getReviews({ contractId: activeContract.id }),
        marketingStudioService.getBrandProfile(activeContract.id),
        marketingStudioService.getProductsServices({ contractId: activeContract.id }),
        marketingStudioService.getKnowledgeDocuments({ contractId: activeContract.id }),
        fallback(marketingStudioService.searchKnowledge(activeContract.id, '', 3), []),
        includeCampaigns ? fallback(campaignService.getPortalCampaigns(activeContract.id), []) : Promise.resolve([]),
        includeOperations ? fallback(marketingStudioService.getCampaignCreativeSuggestions({ contractId: activeContract.id }), []) : Promise.resolve([]),
        includeOperations ? fallback(marketingStudioService.getPublishingConnections({ contractId: activeContract.id }), []) : Promise.resolve([]),
        includeOperations ? fallback(marketingStudioService.getAgents({ contractId: activeContract.id }), []) : Promise.resolve([]),
        includeOperations ? fallback(marketingStudioService.getWorkflowRuns({ contractId: activeContract.id }), []) : Promise.resolve([]),
      ])

      setState({
        contents,
        settings,
        calendarItems,
        reviews,
        brandProfile: brandProfile ? sanitizeBrandProfileForPortal(brandProfile) : null,
        productsServices,
        knowledgeDocuments,
        knowledgeMatches,
        campaigns,
        creativeSuggestions,
        publishingConnections,
        agents,
        workflowRuns,
      })
    } catch (loadError) {
      console.error('Erro ao carregar contexto de marketing do portal:', loadError)
      setState(emptyState)
      setError('Nao foi possivel carregar os dados desta area.')
    } finally {
      setLoading(false)
    }
  }, [activeContract, includeCampaigns, includeOperations])

  useEffect(() => {
    load()
  }, [load])

  return {
    activeContract,
    organization,
    loading,
    error,
    reload: load,
    ...state,
  }
}
