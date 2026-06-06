import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalMarketingStudioWorkspace } from '@/components/marketing-studio/PortalMarketingStudioWorkspace'
import { statusAfterReviewDecision } from '@/lib/marketing-studio/marketingStudioRules'
import { marketingStudioService } from '@/services/marketingStudioService'
import { usePlatformStore } from '@/stores/platformStore'
import type {
  MarketingCalendarItem,
  MarketingContentReview,
  MarketingStudioSettings,
  PortalMarketingContentItem,
  PortalMarketingReviewDecision,
} from '@/types/marketingStudio'

export function PortalMarketingStudioPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const [contents, setContents] = useState<PortalMarketingContentItem[]>([])
  const [calendarItems, setCalendarItems] = useState<MarketingCalendarItem[]>([])
  const [reviews, setReviews] = useState<MarketingContentReview[]>([])
  const [settings, setSettings] = useState<MarketingStudioSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!activeContract) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [loadedContents, loadedSettings, loadedCalendar, loadedReviews] = await Promise.all([
        marketingStudioService.getPortalContents(activeContract.id),
        marketingStudioService.getSettings(activeContract.id),
        marketingStudioService.getCalendarItems({ contractId: activeContract.id }),
        marketingStudioService.getReviews({ contractId: activeContract.id }),
      ])
      setContents(loadedContents)
      setSettings(loadedSettings)
      setCalendarItems(loadedCalendar)
      setReviews(loadedReviews)
    } catch (error) {
      console.error('Erro ao carregar Marketing Studio do portal:', error)
      toast.error('Erro ao carregar Marketing Studio')
      setContents([])
      setCalendarItems([])
      setReviews([])
      setSettings(null)
    } finally {
      setLoading(false)
    }
  }, [activeContract])

  useEffect(() => {
    load()
  }, [load])

  if (!activeContract) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Marketing Studio</h1>
        <p className="mt-2 text-slate-600">Nenhum contrato ativo encontrado para este usuario.</p>
      </div>
    )
  }

  if (loading) return <p className="text-sm text-slate-600">Carregando Marketing Studio...</p>

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
      onReviewDecision={handleReviewDecision}
    />
  )
}
