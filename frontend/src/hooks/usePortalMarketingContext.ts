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

export type PortalMarketingContextResource = keyof PortalMarketingContextState

interface PortalMarketingContextOptions {
  resources?: readonly PortalMarketingContextResource[]
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

const defaultResources: readonly PortalMarketingContextResource[] = [
  'contents',
  'calendarItems',
  'reviews',
  'brandProfile',
  'productsServices',
  'knowledgeDocuments',
  'knowledgeMatches',
  'settings',
]

export async function loadPortalMarketingContextData(
  contractId: string,
  options: PortalMarketingContextOptions = {},
): Promise<PortalMarketingContextState> {
  const resources = new Set(options.resources ?? defaultResources)
  if (options.includeCampaigns) resources.add('campaigns')
  if (options.includeOperations) {
    resources.add('creativeSuggestions')
    resources.add('publishingConnections')
    resources.add('agents')
    resources.add('workflowRuns')
  }
  const includes = (resource: PortalMarketingContextResource) => resources.has(resource)
  const [
    contents, settings, calendarItems, reviews, brandProfile, productsServices,
    knowledgeDocuments, knowledgeMatches, campaigns, creativeSuggestions,
    publishingConnections, agents, workflowRuns,
  ] = await Promise.all([
    includes('contents') ? marketingStudioService.getPortalContents(contractId) : Promise.resolve([]),
    includes('settings') ? marketingStudioService.getSettings(contractId) : Promise.resolve(null),
    includes('calendarItems') ? marketingStudioService.getCalendarItems({ contractId }) : Promise.resolve([]),
    includes('reviews') ? fallback(marketingStudioService.getReviews({ contractId }), []) : Promise.resolve([]),
    includes('brandProfile') ? marketingStudioService.getBrandProfile(contractId) : Promise.resolve(null),
    includes('productsServices') ? marketingStudioService.getProductsServices({ contractId }) : Promise.resolve([]),
    includes('knowledgeDocuments') ? marketingStudioService.getKnowledgeDocuments({ contractId }) : Promise.resolve([]),
    includes('knowledgeMatches') ? fallback(marketingStudioService.searchKnowledge(contractId, '', 3), []) : Promise.resolve([]),
    includes('campaigns') ? fallback(campaignService.getPortalCampaigns(contractId), []) : Promise.resolve([]),
    includes('creativeSuggestions') ? fallback(marketingStudioService.getCampaignCreativeSuggestions({ contractId }), []) : Promise.resolve([]),
    includes('publishingConnections') ? fallback(marketingStudioService.getPublishingConnections({ contractId }), []) : Promise.resolve([]),
    includes('agents') ? fallback(marketingStudioService.getAgents({ contractId }), []) : Promise.resolve([]),
    includes('workflowRuns') ? fallback(marketingStudioService.getWorkflowRuns({ contractId }), []) : Promise.resolve([]),
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
  const resourcesKey = [...new Set(options.resources ?? defaultResources)].sort().join(',')
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
      setState(await loadPortalMarketingContextData(activeContract.id, {
        includeCampaigns,
        includeOperations,
        resources: resourcesKey.split(',').filter(Boolean) as PortalMarketingContextResource[],
      }))
    } catch (loadError) {
      console.error('Erro ao carregar contexto de marketing do portal:', loadError)
      setState(emptyState)
      setError('Nao foi possivel carregar os dados desta area.')
    } finally {
      setLoading(false)
    }
  }, [activeContract, includeCampaigns, includeOperations, isPlatformLoading, resourcesKey])

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
