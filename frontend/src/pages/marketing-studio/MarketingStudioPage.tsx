import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { MarketingStudioWorkspace } from '@/components/marketing-studio/MarketingStudioWorkspace'
import { statusAfterReviewDecision } from '@/lib/marketing-studio/marketingStudioRules'
import { marketingStudioService } from '@/services/marketingStudioService'
import { platformService } from '@/services/platformService'
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

export function MarketingStudioPage() {
  const [contents, setContents] = useState<MarketingContentItem[]>([])
  const [calendarItems, setCalendarItems] = useState<MarketingCalendarItem[]>([])
  const [reviews, setReviews] = useState<MarketingContentReview[]>([])
  const [versionsByContent, setVersionsByContent] = useState<Record<string, MarketingContentVersion[]>>({})
  const [brandProfile, setBrandProfile] = useState<MarketingBrandProfile | null>(null)
  const [productsServices, setProductsServices] = useState<MarketingProductService[]>([])
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<MarketingKnowledgeDocument[]>([])
  const [knowledgeChunks, setKnowledgeChunks] = useState<MarketingKnowledgeChunk[]>([])
  const [knowledgeMatches, setKnowledgeMatches] = useState<MarketingKnowledgeMatch[]>([])
  const [settings, setSettings] = useState<MarketingStudioSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const contracts = await platformService.getContracts()
      const defaultContract = contracts[0]
      const [loadedContents, loadedCalendar, loadedBrand, loadedProducts, loadedDocuments, loadedChunks] = await Promise.all([
        marketingStudioService.getContents(defaultContract ? { contractId: defaultContract.id } : undefined),
        defaultContract ? marketingStudioService.getCalendarItems({ contractId: defaultContract.id }) : Promise.resolve([]),
        defaultContract ? marketingStudioService.getBrandProfile(defaultContract.id) : Promise.resolve(null),
        defaultContract ? marketingStudioService.getProductsServices({ contractId: defaultContract.id }) : Promise.resolve([]),
        defaultContract ? marketingStudioService.getKnowledgeDocuments({ contractId: defaultContract.id }) : Promise.resolve([]),
        defaultContract ? marketingStudioService.getKnowledgeChunks({ contractId: defaultContract.id }) : Promise.resolve([]),
      ])
      const loadedReviews = defaultContract ? await marketingStudioService.getReviews({ contractId: defaultContract.id }) : []
      const versionPairs = await Promise.all(
        loadedContents.map(async content => [content.id, await marketingStudioService.getContentVersions(content.id)] as const)
      )
      setContents(loadedContents)
      setCalendarItems(loadedCalendar)
      setReviews(loadedReviews)
      setVersionsByContent(Object.fromEntries(versionPairs))
      setBrandProfile(loadedBrand)
      setProductsServices(loadedProducts)
      setKnowledgeDocuments(loadedDocuments)
      setKnowledgeChunks(loadedChunks)
      setKnowledgeMatches([])
      setSettings(defaultContract ? await marketingStudioService.getSettings(defaultContract.id) : null)
    } catch (error) {
      console.error('Erro ao carregar Marketing Studio:', error)
      toast.error('Erro ao carregar Marketing Studio')
      setContents([])
      setCalendarItems([])
      setReviews([])
      setVersionsByContent({})
      setBrandProfile(null)
      setProductsServices([])
      setKnowledgeDocuments([])
      setKnowledgeChunks([])
      setKnowledgeMatches([])
      setSettings(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="text-sm text-slate-600">Carregando Marketing Studio...</p>

  const handleSubmitForReview = async (contentId: string) => {
    try {
      await marketingStudioService.createReview({ contentItemId: contentId, comments: 'Revisao editorial solicitada.' })
      await marketingStudioService.updateContentStatus(contentId, 'in_review')
      toast.success('Conteudo enviado para revisao')
      load()
    } catch (error) {
      console.error('Erro ao enviar conteudo para revisao:', error)
      toast.error('Nao foi possivel enviar para revisao')
    }
  }

  const handleReviewDecision = async (reviewId: string, status: 'approved' | 'changes_requested' | 'rejected') => {
    try {
      const review = await marketingStudioService.updateReviewDecision(reviewId, { status })
      await marketingStudioService.updateContentStatus(review.contentItemId, statusAfterReviewDecision(status))
      toast.success('Revisao atualizada')
      load()
    } catch (error) {
      console.error('Erro ao atualizar revisao:', error)
      toast.error('Nao foi possivel atualizar a revisao')
    }
  }

  const handleScheduleContent = async (contentId: string) => {
    const content = contents.find(item => item.id === contentId)
    if (!content) return
    const startsAt = new Date(Date.now() + 86_400_000).toISOString()
    try {
      await marketingStudioService.createCalendarItem({
        organizationId: content.organizationId,
        clientId: content.clientId,
        contractId: content.contractId,
        contentItemId: content.id,
        title: content.title,
        channel: content.channel,
        startsAt,
        status: 'scheduled',
      })
      await marketingStudioService.updateContentStatus(content.id, 'scheduled')
      toast.success('Conteudo agendado')
      load()
    } catch (error) {
      console.error('Erro ao agendar conteudo:', error)
      toast.error('Nao foi possivel agendar')
    }
  }

  const handleSearchKnowledge = async (query: string) => {
    const contractId = settings?.contractId || contents[0]?.contractId
    if (!contractId) return
    try {
      setKnowledgeMatches(await marketingStudioService.searchKnowledge(contractId, query))
      toast.success('Busca na base concluida')
    } catch (error) {
      console.error('Erro ao buscar conhecimento:', error)
      toast.error('Nao foi possivel buscar na base')
    }
  }

  return (
    <MarketingStudioWorkspace
      contents={contents}
      settings={settings}
      onRefresh={load}
      calendarItems={calendarItems}
      reviews={reviews}
      versionsByContent={versionsByContent}
      brandProfile={brandProfile}
      productsServices={productsServices}
      knowledgeDocuments={knowledgeDocuments}
      knowledgeChunks={knowledgeChunks}
      knowledgeMatches={knowledgeMatches}
      onSubmitForReview={handleSubmitForReview}
      onApproveReview={reviewId => handleReviewDecision(reviewId, 'approved')}
      onRequestChanges={reviewId => handleReviewDecision(reviewId, 'changes_requested')}
      onRejectReview={reviewId => handleReviewDecision(reviewId, 'rejected')}
      onScheduleContent={handleScheduleContent}
      onSearchKnowledge={handleSearchKnowledge}
    />
  )
}
