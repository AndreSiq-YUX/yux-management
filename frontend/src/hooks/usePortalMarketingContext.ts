import { useCallback, useEffect, useState } from 'react'
import {
  canGenerateCampaignWithBrandContext,
  listBrandReadinessGaps,
  sanitizeBrandProfileForPortal,
  summarizeBrandReadiness,
} from '@/lib/marketing-studio/marketingStudioRules'
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

export async function loadPortalMarketingContextData(
  contractId: string,
  options: PortalMarketingContextOptions = {},
): Promise<PortalMarketingContextState> {
  const [
    contents, settings, calendarItems, reviews, brandProfile, productsServices,
    knowledgeDocuments, knowledgeMatches, campaigns, creativeSuggestions,
    publishingConnections, agents, workflowRuns,
  ] = await Promise.all([
    marketingStudioService.getPortalContents(contractId),
    marketingStudioService.getSettings(contractId),
    marketingStudioService.getCalendarItems({ contractId }),
    fallback(marketingStudioService.getReviews({ contractId }), []),
    marketingStudioService.getBrandProfile(contractId),
    marketingStudioService.getProductsServices({ contractId }),
    marketingStudioService.getKnowledgeDocuments({ contractId }),
    fallback(marketingStudioService.searchKnowledge(contractId, '', 3), []),
    options.includeCampaigns ? fallback(campaignService.getPortalCampaigns(contractId), []) : Promise.resolve([]),
    options.includeOperations ? fallback(marketingStudioService.getCampaignCreativeSuggestions({ contractId }), []) : Promise.resolve([]),
    options.includeOperations ? fallback(marketingStudioService.getPublishingConnections({ contractId }), []) : Promise.resolve([]),
    options.includeOperations ? fallback(marketingStudioService.getAgents({ contractId }), []) : Promise.resolve([]),
    options.includeOperations ? fallback(marketingStudioService.getWorkflowRuns({ contractId }), []) : Promise.resolve([]),
  ])
  return {
    contents, settings, calendarItems, reviews,
    brandProfile: brandProfile ? sanitizeBrandProfileForPortal(brandProfile) : null,
    productsServices, knowledgeDocuments, knowledgeMatches, campaigns,
    creativeSuggestions, publishingConnections, agents, workflowRuns,
  }
}

export function usePortalMarketingContext(options: PortalMarketingContextOptions = {}) {
  const activeContract = usePlatformStore(state => state.activeContract)
  const organization = usePlatformStore(state => state.organization)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const includeCampaigns = Boolean(options.includeCampaigns)
  const includeOperations = Boolean(options.includeOperations)
  const [state, setState] = useState<PortalMarketingContextState>(emptyState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (isPlatformLoading) {
      setLoading(true)
      return
    }

    if (!activeContract) {
      setState(emptyState)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      setState(await loadPortalMarketingContextData(activeContract.id, { includeCampaigns, includeOperations }))
    } catch (loadError) {
      console.error('Erro ao carregar contexto de marketing do portal:', loadError)
      setState(emptyState)
      setError('Nao foi possivel carregar os dados desta area.')
    } finally {
      setLoading(false)
    }
  }, [activeContract, includeCampaigns, includeOperations, isPlatformLoading])

  useEffect(() => {
    load()
  }, [load])

  const brandReadinessProfile = state.brandProfile || (state.settings ? {
    toneOfVoice: state.settings.toneOfVoice || '',
    persona: state.settings.persona || '',
    brandVoiceSummary: state.settings.toneOfVoice || '',
    forbiddenTopics: state.settings.forbiddenTopics || [],
    priorityTopics: state.settings.priorityTopics || [],
    visualIdentity: {},
    visualGuidelines: state.settings.visualPreferences,
    status: 'active' as const,
  } : null)

  return {
    activeContract,
    organization,
    loading,
    error,
    reload: load,
    brandReadiness: summarizeBrandReadiness(brandReadinessProfile, state.knowledgeDocuments, state.productsServices),
    brandReadinessGaps: listBrandReadinessGaps(brandReadinessProfile, state.knowledgeDocuments, state.productsServices),
    canGenerateWithBrandContext: canGenerateCampaignWithBrandContext(brandReadinessProfile, state.knowledgeDocuments, state.productsServices),
    ...state,
  }
}
