import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalMarketingStudioWorkspace } from '@/components/marketing-studio/PortalMarketingStudioWorkspace'
import { statusAfterReviewDecision } from '@/lib/marketing-studio/marketingStudioRules'
import { sanitizeBrandProfileForPortal } from '@/lib/marketing-studio/marketingStudioRules'
import { marketingStudioService } from '@/services/marketingStudioService'
import { usePlatformStore } from '@/stores/platformStore'
import type {
  MarketingCalendarItem,
  MarketingContentReview,
  MarketingKnowledgeDocument,
  MarketingKnowledgeMatch,
  MarketingProductService,
  MarketingStudioSettings,
  PortalMarketingContentItem,
  PortalMarketingBrandProfile,
  PortalMarketingReviewDecision,
} from '@/types/marketingStudio'

export function PortalMarketingStudioPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const [contents, setContents] = useState<PortalMarketingContentItem[]>([])
  const [calendarItems, setCalendarItems] = useState<MarketingCalendarItem[]>([])
  const [reviews, setReviews] = useState<MarketingContentReview[]>([])
  const [brandProfile, setBrandProfile] = useState<PortalMarketingBrandProfile | null>(null)
  const [productsServices, setProductsServices] = useState<MarketingProductService[]>([])
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<MarketingKnowledgeDocument[]>([])
  const [knowledgeMatches, setKnowledgeMatches] = useState<MarketingKnowledgeMatch[]>([])
  const [settings, setSettings] = useState<MarketingStudioSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (isPlatformLoading) {
      setLoading(true)
      return
    }

    if (!activeContract) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [loadedContents, loadedSettings, loadedCalendar, loadedReviews, loadedBrand, loadedProducts, loadedDocuments, loadedMatches] = await Promise.all([
        marketingStudioService.getPortalContents(activeContract.id),
        marketingStudioService.getSettings(activeContract.id),
        marketingStudioService.getCalendarItems({ contractId: activeContract.id }),
        marketingStudioService.getReviews({ contractId: activeContract.id }),
        marketingStudioService.getBrandProfile(activeContract.id),
        marketingStudioService.getProductsServices({ contractId: activeContract.id }),
        marketingStudioService.getKnowledgeDocuments({ contractId: activeContract.id }),
        marketingStudioService.searchKnowledge(activeContract.id, '', 3),
      ])
      setContents(loadedContents)
      setSettings(loadedSettings)
      setCalendarItems(loadedCalendar)
      setReviews(loadedReviews)
      setBrandProfile(loadedBrand ? sanitizeBrandProfileForPortal(loadedBrand) : null)
      setProductsServices(loadedProducts.filter(product => product.status === 'active'))
      setKnowledgeDocuments(loadedDocuments.filter(document => document.status === 'published'))
      setKnowledgeMatches(loadedMatches)
    } catch (error) {
      console.error('Erro ao carregar Marketing Studio do portal:', error)
      toast.error('Erro ao carregar Marketing Studio')
      setContents([])
      setCalendarItems([])
      setReviews([])
      setBrandProfile(null)
      setProductsServices([])
      setKnowledgeDocuments([])
      setKnowledgeMatches([])
      setSettings(null)
    } finally {
      setLoading(false)
    }
  }, [activeContract, isPlatformLoading])

  useEffect(() => {
    load()
  }, [load])

  if (isPlatformLoading || loading) return <p className="text-sm text-slate-600">Carregando Marketing Studio...</p>

  if (!activeContract) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Marketing Studio</h1>
        <p className="mt-2 text-slate-600">Nenhum contrato ativo encontrado para este usuario.</p>
      </div>
    )
  }

  const handleReviewDecision = async (decision: PortalMarketingReviewDecision) => {
    const review = reviews.find(item => item.contentItemId === decision.contentItemId && item.status === 'pending')
    try {
      if (review) {
        await marketingStudioService.updateReviewDecision(review.id, {
          status: decision.status,
          comments: decision.comments,
        })
      } else {
        await marketingStudioService.createReview({
          contentItemId: decision.contentItemId,
          status: decision.status,
          comments: decision.comments,
          decidedAt: new Date().toISOString(),
        })
      }
      await marketingStudioService.updateContentStatus(decision.contentItemId, statusAfterReviewDecision(decision.status))
      toast.success('Decisao registrada')
      load()
    } catch (error) {
      console.error('Erro ao registrar decisao do Marketing Studio:', error)
      toast.error('Nao foi possivel registrar a decisao')
    }
  }

  return (
    <PortalMarketingStudioWorkspace
      contents={contents}
      settings={settings}
      calendarItems={calendarItems}
      reviews={reviews}
      brandProfile={brandProfile}
      productsServices={productsServices}
      knowledgeDocuments={knowledgeDocuments}
      knowledgeMatches={knowledgeMatches}
      onReviewDecision={handleReviewDecision}
    />
  )
}
