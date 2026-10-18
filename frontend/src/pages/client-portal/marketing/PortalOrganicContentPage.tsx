import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Columns,
  Copy,
  FileText,
  Grid2X2,
  Image,
  Layers3,
  Mail,
  Megaphone,
  MessageSquare,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Tag,
  Upload,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo, useEffect, useRef, useState } from 'react'
import { PortalPage } from '@/components/client-portal/PortalPage'
import {
  EmptyState,
  ErrorState,
  MasterDetail,
  PendingAction,
  ResponsiveTable,
  SectionCard,
  SkeletonCard,
  StatusChip,
  portalButtonClasses,
  portalFocusRing,
  ShowMoreButton,
  useShowMore,
  type ResponsiveTableColumn,
  type StatusChipVariant,
} from '@/components/portal-ui'
import { EditorialAgenda } from '@/components/marketing-studio/EditorialAgenda'
import { channelLabel } from '@/components/marketing-studio/editorialCalendar'
import { useMediaQuery } from '@/components/marketing-studio/useMediaQuery'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { formatPortalDate, statusLabel } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'
import { marketingStudioService } from '@/services/marketingStudioService'
import { usePlatformStore } from '@/stores/platformStore'
import type {
  MarketingCalendarItem,
  MarketingCampaignCreativeSuggestion,
  MarketingContentReview,
  MarketingContentStatus,
  MarketingContentType,
  PortalMarketingContentItem,
} from '@/types/marketingStudio'
import type { PortalCampaign } from '@/types/campaign'

type LibraryView = 'gallery' | 'table' | 'kanban' | 'calendar'
type AssetStatus = MarketingContentStatus | 'waiting_approval' | 'used_in_campaign'
type AssetKind = 'creative' | 'post' | 'ad' | 'copy' | 'brief' | 'video' | 'email' | 'landing'
type AssetSource = 'content' | 'suggestion' | 'campaign'
type DecisionStatus = 'approved' | 'changes_requested'

const MIN_CHANGE_COMMENT_LENGTH = 5
const DESKTOP_QUERY = '(min-width: 1024px)'
/** Abaixo de 640px a galeria mostra 10 itens por vez, com "Mostrar mais". */
const PHONE_QUERY = '(max-width: 639px)'
const NO_CALENDAR_ITEMS: MarketingCalendarItem[] = []

interface AssetFilters {
  channel: string
  status: string
  origin: string
  campaign: string
}

const emptyFilters: AssetFilters = { channel: '', status: '', origin: '', campaign: '' }

interface ReviewTarget {
  contentId: string
  contentVersionId: string
}

interface ContentAsset {
  id: string
  title: string
  kind: AssetKind
  kindLabel: string
  channel: string
  status: AssetStatus
  origin: string
  campaign: string
  updatedAt: string
  description: string
  tags: string[]
  source: AssetSource
  /** Presente só quando existe uma revisão pendente que aceita a decisão do cliente. */
  review?: ReviewTarget
  cta?: string
}

const typeTabs = ['Todos', 'Criativos', 'Posts', 'Ads', 'Copies', 'Briefs', 'Vídeos', 'Aprovação pendente', 'Publicado']

const statusOrder: Array<{ key: AssetStatus; label: string }> = [
  { key: 'draft', label: 'Rascunho' },
  { key: 'in_review', label: 'Em revisão' },
  { key: 'waiting_approval', label: 'Aguardando aprovação' },
  { key: 'changes_requested', label: 'Ajustes solicitados' },
  { key: 'approved', label: 'Aprovado' },
  { key: 'scheduled', label: 'Agendado' },
  { key: 'published', label: 'Publicado' },
  { key: 'used_in_campaign', label: 'Usado em campanha' },
]

const toolbarCardClasses = 'rounded-[10px] border border-yx-line bg-yx-surface'
const fieldClasses = cn(
  'min-h-10 rounded-lg border border-yx-line-strong bg-yx-surface px-2.5 text-[13px] text-yx-fg sm:min-h-[34px]',
  portalFocusRing,
)

export function PortalOrganicContentPage() {
  const portalPath = usePortalWorkspacePath()
  const workspaceContext = usePlatformStore(state => state.workspaceContext)
  const {
    loading,
    error,
    contents,
    campaigns,
    creativeSuggestions,
    reviews,
    calendarItems = NO_CALENDAR_ITEMS,
    reload,
  } = usePortalMarketingContext({ resources: ['contents', 'campaigns', 'creativeSuggestions', 'reviews', 'calendarItems'] })
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true)
  const [view, setView] = useState<LibraryView>('gallery')
  const [activeType, setActiveType] = useState('Todos')
  const [query, setQuery] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [filters, setFilters] = useState<AssetFilters>(emptyFilters)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [changeComments, setChangeComments] = useState<Record<string, string>>({})
  const [commentErrors, setCommentErrors] = useState<Record<string, string>>({})
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const submitLock = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    if (!loading) setHasLoaded(true)
  }, [loading])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const canDecide = Boolean(
    workspaceContext?.contractId
    && workspaceContext.canConfigure
    && workspaceContext.role !== 'client_member',
  )

  const assets = useMemo(() => {
    const pendingReviews = pendingReviewByContent(reviews)
    const campaignNames = new Map(campaigns.map(campaign => [campaign.id, campaign.name]))
    const mapped = [
      ...contents.map(content => contentToAsset(content, pendingReviews.get(content.id), campaignNames)),
      ...creativeSuggestions.map(suggestionToAsset),
      ...campaigns.flatMap(campaignToAssets),
    ]

    const byId = new Map<string, ContentAsset>()
    mapped.forEach(asset => byId.set(asset.id, asset))
    return Array.from(byId.values())
  }, [campaigns, contents, creativeSuggestions, reviews])

  const filterOptions = useMemo(() => ({
    channel: uniqueOptions(assets.map(asset => asset.channel)),
    status: uniqueOptions(assets.map(asset => statusText(asset.status)), assets.map(asset => asset.status)),
    origin: uniqueOptions(assets.map(asset => asset.origin)),
    campaign: uniqueOptions(assets.map(asset => asset.campaign)),
  }), [assets])

  const hasActiveFilters = Object.values(filters).some(Boolean)
  const setFilter = (key: keyof AssetFilters, value: string) => setFilters(current => ({ ...current, [key]: value }))
  const clearFilters = () => setFilters(emptyFilters)

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return assets.filter(asset => {
      const matchesQuery = !normalizedQuery || [
        asset.title,
        asset.kindLabel,
        asset.channel,
        statusText(asset.status),
        asset.origin,
        asset.campaign,
        ...asset.tags,
      ].join(' ').toLowerCase().includes(normalizedQuery)

      const matchesType = activeType === 'Todos'
        || (activeType === 'Criativos' && asset.kind === 'creative')
        || (activeType === 'Posts' && asset.kind === 'post')
        || (activeType === 'Ads' && asset.kind === 'ad')
        || (activeType === 'Copies' && asset.kind === 'copy')
        || (activeType === 'Briefs' && asset.kind === 'brief')
        || (activeType === 'Vídeos' && asset.kind === 'video')
        || (activeType === 'Aprovação pendente' && ['waiting_approval', 'in_review'].includes(asset.status))
        || (activeType === 'Publicado' && asset.status === 'published')

      const matchesFilters = (!filters.channel || asset.channel === filters.channel)
        && (!filters.status || asset.status === filters.status)
        && (!filters.origin || asset.origin === filters.origin)
        && (!filters.campaign || asset.campaign === filters.campaign)

      return matchesQuery && matchesType && matchesFilters
    })
  }, [activeType, assets, filters, query])

  // No computador o primeiro item já aparece no painel de detalhes; no celular o detalhe só abre depois do toque.
  const selectedAsset = filteredAssets.find(asset => asset.id === selectedAssetId)
    ?? (isDesktop ? filteredAssets[0] : undefined)

  const countStatus = (...statuses: AssetStatus[]) => assets.filter(asset => statuses.includes(asset.status)).length
  const metrics = !error && hasLoaded && assets.length > 0
    ? [
        { label: 'Total de ativos', value: String(assets.length), detail: 'Biblioteca do contrato' },
        { label: 'Aguardando aprovação', value: String(countStatus('waiting_approval', 'in_review')), detail: 'Precisam da sua decisão' },
        { label: 'Ajustes solicitados', value: String(countStatus('changes_requested')), detail: 'Voltaram para a equipe' },
        { label: 'Aprovados', value: String(countStatus('approved')), detail: 'Prontos para uso' },
        { label: 'Publicados', value: String(countStatus('published')), detail: 'Já distribuídos' },
        { label: 'Usados em campanha', value: String(countStatus('used_in_campaign')), detail: 'Vinculados a anúncios' },
      ]
    : []

  const setComment = (assetId: string, value: string) => {
    setChangeComments(current => ({ ...current, [assetId]: value }))
    setCommentErrors(current => {
      if (!current[assetId]) return current
      const next = { ...current }
      delete next[assetId]
      return next
    })
  }

  const decide = async (asset: ContentAsset, status: DecisionStatus) => {
    if (submitLock.current) return
    if (!asset.review || !workspaceContext?.contractId || !canDecide) return

    const comments = (changeComments[asset.id] || '').trim()
    if (status === 'changes_requested' && comments.length < MIN_CHANGE_COMMENT_LENGTH) {
      setCommentErrors(current => ({
        ...current,
        [asset.id]: `Descreva o que precisa mudar (mínimo de ${MIN_CHANGE_COMMENT_LENGTH} caracteres).`,
      }))
      return
    }

    submitLock.current = true
    setSubmittingId(asset.id)
    try {
      await marketingStudioService.decideJourneyContentReview(asset.review.contentId, {
        organizationId: workspaceContext.organizationId,
        contractId: workspaceContext.contractId,
        contentVersionId: asset.review.contentVersionId,
        status,
        ...(comments ? { comments } : {}),
      })
      if (!mounted.current) return
      toast.success('Decisão registrada')
      setChangeComments(current => {
        const next = { ...current }
        delete next[asset.id]
        return next
      })
      await reload()
    } catch (decisionError) {
      console.error('Erro ao registrar decisão de conteúdo:', decisionError)
      if (mounted.current) toast.error('Não foi possível registrar sua decisão. Tente novamente.')
    } finally {
      submitLock.current = false
      if (mounted.current) setSubmittingId(null)
    }
  }

  const firstLoad = loading && !hasLoaded

  return (
    <PortalPage
      eyebrow="Marketing"
      title="Central de conteúdo"
      description="Revise e aprove o que foi produzido: criativos, copies, posts e anúncios. Para criar ou editar, use o Marketing Studio; para saber quando sai, veja o Calendário editorial."
      primaryAction={
        <>
          <Link to={portalPath('/portal/marketing/studio')} className={portalButtonClasses('ghost')}>
            <Plus aria-hidden="true" />
            Novo conteúdo
          </Link>
          <PendingAction code="B19">
            <Upload className="h-4 w-4" />
            Importar
          </PendingAction>
          <Link to={portalPath('/portal/marketing/studio')} className={portalButtonClasses('yux')}>
            <Sparkles aria-hidden="true" />
            Gerar com IA
          </Link>
        </>
      }
      metrics={metrics}
      related={[
        { label: 'Marketing Studio', href: '/portal/marketing/studio' },
        { label: 'Calendário editorial', href: '/portal/marketing/calendario' },
        { label: 'Criativos e inspirações', href: '/portal/marketing/criativos' },
      ]}
    >
      <section aria-label="Buscar e filtrar conteúdos" className={toolbarCardClasses}>
        <div className="flex flex-col gap-3 border-b border-yx-line p-3.5 sm:p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yx-fg-3" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              aria-label="Buscar conteúdos"
              className={cn(
                'min-h-11 w-full rounded-lg border border-yx-line-strong bg-yx-surface-2 pl-9 pr-3 text-sm text-yx-fg placeholder:text-yx-fg-3 focus:bg-yx-surface',
                portalFocusRing,
              )}
              placeholder="Buscar por título, canal, campanha, origem ou tag..."
            />
          </div>
          <div role="group" aria-label="Forma de exibição" className="inline-flex max-w-full overflow-x-auto rounded-lg border border-yx-line-strong bg-yx-surface-2 p-0.5">
            <ViewButton icon={Grid2X2} label="Galeria" active={view === 'gallery'} onClick={() => setView('gallery')} />
            <ViewButton icon={Table2} label="Tabela" active={view === 'table'} onClick={() => setView('table')} />
            <ViewButton icon={Columns} label="Kanban" active={view === 'kanban'} onClick={() => setView('kanban')} />
            <ViewButton icon={CalendarDays} label="Calendário" active={view === 'calendar'} onClick={() => setView('calendar')} />
          </div>
        </div>

        <div className="flex flex-col gap-3 p-3.5 sm:p-4">
          <div className="flex flex-wrap gap-2">
            {typeTabs.map(tab => (
              <button
                key={tab}
                type="button"
                aria-pressed={activeType === tab}
                onClick={() => setActiveType(tab)}
                className={cn(
                  'min-h-10 rounded-full border px-3.5 text-xs font-semibold transition-colors sm:min-h-8',
                  portalFocusRing,
                  activeType === tab
                    ? 'border-yx-blue bg-yx-blue text-white'
                    : 'border-yx-line-strong bg-yx-surface text-yx-fg-2 hover:border-yx-blue hover:text-yx-blue',
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-yx-fg-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">
              <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
              Filtros
            </span>
            <FilterSelect label="Canal" allLabel="Todos" value={filters.channel} options={filterOptions.channel} onChange={value => setFilter('channel', value)} />
            <FilterSelect label="Status" allLabel="Todos" value={filters.status} options={filterOptions.status} onChange={value => setFilter('status', value)} />
            <FilterSelect label="Origem" allLabel="Todas" value={filters.origin} options={filterOptions.origin} onChange={value => setFilter('origin', value)} />
            <FilterSelect label="Campanha" allLabel="Todas" value={filters.campaign} options={filterOptions.campaign} onChange={value => setFilter('campaign', value)} />
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className={portalButtonClasses('ghost')}>
                Limpar
              </button>
            )}
          </div>
        </div>
      </section>

      {loading && hasLoaded && (
        <p role="status" className="text-xs text-yx-fg-3">Atualizando...</p>
      )}

      {firstLoad ? (
        <SkeletonCard lines={6} />
      ) : error ? (
        <ErrorState title="Não foi possível carregar a Central de conteúdo." description={error} onRetry={() => void reload()} />
      ) : assets.length === 0 ? (
        <EmptyState
          icon={Layers3}
          title="Nenhum conteúdo para revisar"
          description="Os conteúdos produzidos no Marketing Studio aparecem aqui para você revisar e aprovar."
          action={{ label: 'Ir para o Marketing Studio', href: '/portal/marketing/studio' }}
        />
      ) : (
        <MasterDetail
          className="lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-4"
          onBack={() => setSelectedAssetId(null)}
          backLabel="Voltar"
          list={
            <div className="min-w-0">
              {view === 'gallery' && (
                <GalleryView assets={filteredAssets} selectedId={isDesktop ? selectedAsset?.id : undefined} onSelect={setSelectedAssetId} />
              )}
              {view === 'table' && (
                <TableView assets={filteredAssets} onSelect={setSelectedAssetId} />
              )}
              {view === 'kanban' && (
                <KanbanView assets={filteredAssets} selectedId={isDesktop ? selectedAsset?.id : undefined} onSelect={setSelectedAssetId} />
              )}
              {view === 'calendar' && (
                <SectionCard
                  title="Próximas publicações"
                  description="Só os próximos itens. O calendário completo mostra o mês e a semana."
                >
                  <EditorialAgenda entries={calendarItems} />
                </SectionCard>
              )}
            </div>
          }
          detail={selectedAsset ? (
            <AssetInspector
              asset={selectedAsset}
              canDecide={canDecide}
              submitting={submittingId === selectedAsset.id}
              busy={submittingId !== null}
              comment={changeComments[selectedAsset.id] || ''}
              commentError={commentErrors[selectedAsset.id]}
              onCommentChange={value => setComment(selectedAsset.id, value)}
              onApprove={() => void decide(selectedAsset, 'approved')}
              onRequestChanges={() => void decide(selectedAsset, 'changes_requested')}
            />
          ) : null}
          emptyDetail={
            <aside className={cn(toolbarCardClasses, 'p-5')}>
              <p className="text-sm text-yx-fg-2">Selecione um ativo para ver detalhes.</p>
            </aside>
          }
        />
      )}
    </PortalPage>
  )
}

function GalleryView({ assets, selectedId, onSelect }: { assets: ContentAsset[]; selectedId?: string; onSelect: (id: string) => void }) {
  const isPhone = useMediaQuery(PHONE_QUERY, false)
  const pager = useShowMore(assets, { enabled: isPhone, resetKey: assets })
  if (!assets.length) return <EmptyContentState />

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-1 min-[1280px]:grid-cols-2 min-[1760px]:grid-cols-3">
        {pager.visibleItems.map(asset => (
          <AssetCard key={asset.id} asset={asset} selected={asset.id === selectedId} onSelect={() => onSelect(asset.id)} />
        ))}
      </div>
      {pager.hasMore ? <ShowMoreButton shown={pager.shown} total={pager.total} onClick={pager.showMore} /> : null}
    </>
  )
}

function TableView({ assets, onSelect }: { assets: ContentAsset[]; onSelect: (id: string) => void }) {
  if (!assets.length) return <EmptyContentState />

  const columns: Array<ResponsiveTableColumn<ContentAsset>> = [
    {
      key: 'title',
      header: 'Ativo',
      mobileLabel: '',
      render: asset => (
        <div className="min-w-0">
          <p className="font-semibold text-yx-fg">{asset.title}</p>
          <p className="mt-1 line-clamp-1 text-xs text-yx-fg-3">{asset.description}</p>
        </div>
      ),
    },
    { key: 'kindLabel', header: 'Tipo' },
    { key: 'channel', header: 'Canal' },
    { key: 'status', header: 'Status', render: asset => <StatusBadge status={asset.status} /> },
    { key: 'origin', header: 'Origem' },
    { key: 'campaign', header: 'Campanha' },
    { key: 'updatedAt', header: 'Atualizado', render: asset => formatPortalDate(asset.updatedAt) },
  ]

  return (
    <div className={cn(toolbarCardClasses, 'overflow-hidden p-1.5 sm:p-2')}>
      <ResponsiveTable
        caption="Conteúdos da biblioteca"
        columns={columns}
        rows={assets}
        getRowKey={asset => asset.id}
        onRowClick={asset => onSelect(asset.id)}
      />
    </div>
  )
}

function KanbanView({ assets, selectedId, onSelect }: { assets: ContentAsset[]; selectedId?: string; onSelect: (id: string) => void }) {
  if (!assets.length) return <EmptyContentState />

  const columns = statusOrder
    .map(status => ({ ...status, assets: assets.filter(asset => asset.status === status.key) }))
    .filter(column => column.assets.length > 0)

  return (
    <div className="grid min-h-[320px] snap-x snap-mandatory auto-cols-[min(280px,85%)] grid-flow-col gap-3 overflow-x-auto pb-2">
      {columns.map(column => (
        <section key={column.key} aria-label={column.label} className="snap-start rounded-[10px] border border-yx-line bg-yx-surface-2">
          <div className="flex items-center justify-between border-b border-yx-line px-3 py-2">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{column.label}</p>
            <span className="rounded-full bg-yx-surface px-2 py-0.5 font-mono text-xs text-yx-fg-2">{column.assets.length}</span>
          </div>
          <div className="space-y-2 p-3">
            {column.assets.map(asset => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelect(asset.id)}
                aria-pressed={asset.id === selectedId}
                className={cn(
                  'w-full rounded-lg border bg-yx-surface p-3 text-left hover:border-yx-blue',
                  portalFocusRing,
                  asset.id === selectedId ? 'border-yx-blue ring-2 ring-yx-blue/30' : 'border-yx-line',
                )}
              >
                <p className="text-sm font-semibold text-yx-fg">{asset.title}</p>
                <p className="mt-1 text-xs text-yx-fg-3">{asset.kindLabel} / {asset.channel}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {asset.tags.slice(0, 2).map(tag => <TagPill key={tag}>{tag}</TagPill>)}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function AssetCard({ asset, selected, onSelect }: { asset: ContentAsset; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group overflow-hidden rounded-[10px] border bg-yx-surface text-left transition-colors hover:border-yx-blue',
        portalFocusRing,
        selected ? 'border-yx-blue ring-2 ring-yx-blue/30' : 'border-yx-line',
      )}
    >
      <AssetPreview asset={asset} compact />
      <div className="space-y-3 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={asset.kind} label={asset.kindLabel} />
          <StatusBadge status={asset.status} />
        </div>
        <div>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-yx-fg">{asset.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-yx-fg-3">{asset.description}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-yx-line pt-3 text-xs">
          <MetaLine label="Canal" value={asset.channel} />
          <MetaLine label="Origem" value={asset.origin} />
          <MetaLine label="Campanha" value={asset.campaign} wide />
        </div>
      </div>
    </button>
  )
}

interface AssetInspectorProps {
  asset: ContentAsset
  canDecide: boolean
  submitting: boolean
  busy: boolean
  comment: string
  commentError?: string
  onCommentChange: (value: string) => void
  onApprove: () => void
  onRequestChanges: () => void
}

function AssetInspector({
  asset,
  canDecide,
  submitting,
  busy,
  comment,
  commentError,
  onCommentChange,
  onApprove,
  onRequestChanges,
}: AssetInspectorProps) {
  const commentId = `asset-change-comment-${asset.id}`
  const errorId = `${commentId}-error`

  return (
    <aside aria-label="Detalhes do ativo" className={cn(toolbarCardClasses, 'p-4 lg:sticky lg:top-4')}>
      <div className="overflow-hidden rounded-lg border border-yx-line">
        <AssetPreview asset={asset} />
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <KindBadge kind={asset.kind} label={asset.kindLabel} />
            <StatusBadge status={asset.status} />
          </div>
          <h2 className="mt-3 font-display text-lg font-semibold leading-snug text-yx-fg">{asset.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-yx-fg-2">{asset.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <DetailBox label="Origem" value={asset.origin} />
          <DetailBox label="Canal" value={asset.channel} />
          <DetailBox label="Campanha" value={asset.campaign} />
          <DetailBox label="Atualizado em" value={formatPortalDate(asset.updatedAt)} />
        </div>

        {asset.tags.length > 0 && (
          <div>
            <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3">Tags</p>
            <div className="flex flex-wrap gap-2">
              {asset.tags.map(tag => <TagPill key={tag}>{tag}</TagPill>)}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3">Ações</p>
          <div className="grid gap-2">
            {asset.review && canDecide && (
              <div className="grid gap-2">
                <label htmlFor={commentId} className="text-xs font-semibold text-yx-fg-2">O que precisa mudar?</label>
                <textarea
                  id={commentId}
                  value={comment}
                  onChange={event => onCommentChange(event.target.value)}
                  disabled={busy}
                  rows={3}
                  aria-invalid={commentError ? true : undefined}
                  aria-describedby={commentError ? errorId : undefined}
                  className={cn(
                    'w-full rounded-lg border border-yx-line-strong bg-yx-surface p-2.5 text-sm text-yx-fg placeholder:text-yx-fg-3 disabled:opacity-60',
                    portalFocusRing,
                  )}
                  placeholder="Descreva os ajustes que você quer ver nesta versão."
                />
                {commentError && <p id={errorId} role="alert" className="text-xs font-medium text-yx-crit">{commentError}</p>}
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={busy}
                  className={portalButtonClasses('primary', 'w-full')}
                >
                  <CheckCircle2 aria-hidden="true" />
                  {submitting ? 'Registrando...' : 'Aprovar'}
                </button>
                <button
                  type="button"
                  onClick={onRequestChanges}
                  disabled={busy}
                  className={portalButtonClasses('ghost', 'w-full')}
                >
                  <MessageSquare aria-hidden="true" />
                  {submitting ? 'Registrando...' : 'Pedir ajustes'}
                </button>
              </div>
            )}
            {asset.review && !canDecide && (
              <p className="rounded-lg border border-yx-line bg-yx-surface-2 p-3 text-xs text-yx-fg-2">
                Seu perfil não permite registrar decisões nesta área. Peça a um administrador da conta.
              </p>
            )}
            {asset.source === 'content' && !asset.review && (
              <p className="rounded-lg border border-yx-line bg-yx-surface-2 p-3 text-xs text-yx-fg-2">
                Este conteúdo não tem uma revisão aguardando sua decisão.
              </p>
            )}
            {asset.source === 'suggestion' && (
              <div className="flex flex-wrap gap-2">
                <PendingAction code="B3">Aprovar</PendingAction>
                <PendingAction code="B3">Pedir ajustes</PendingAction>
              </div>
            )}
            {asset.source === 'campaign' && (
              <p className="rounded-lg border border-yx-line bg-yx-surface-2 p-3 text-xs text-yx-fg-2">
                As decisões desta campanha ficam em Campanhas.
              </p>
            )}
            <PendingAction code="B19">
              <Copy className="h-4 w-4" />
              Gerar variação
            </PendingAction>
            <PendingAction code="B19">
              <Send className="h-4 w-4" />
              Enviar para campanha
            </PendingAction>
          </div>
        </div>

        <div className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3">Linha do tempo</p>
          <div className="mt-3 space-y-3">
            {[
              ['Origem', asset.origin],
              ['Situação atual', statusText(asset.status)],
              ['Última atualização', formatPortalDate(asset.updatedAt)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full bg-yx-blue" />
                <p className="text-xs text-yx-fg-2"><span className="font-semibold text-yx-fg">{label}</span><br />{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

function AssetPreview({ asset, compact = false }: { asset: ContentAsset; compact?: boolean }) {
  const Icon = kindIcon(asset.kind)

  return (
    <div className={cn(compact ? 'h-16 flex-row sm:h-36 sm:flex-col' : 'h-48 flex-col', 'flex items-center justify-center gap-3 bg-yx-surface-2 p-4 text-center')}>
      <span className={cn('flex shrink-0 items-center justify-center rounded-full border border-yx-line bg-yx-surface text-yx-blue', compact ? 'h-10 w-10 sm:h-14 sm:w-14' : 'h-14 w-14')}>
        <Icon className={cn(compact ? 'h-5 w-5 sm:h-7 sm:w-7' : 'h-7 w-7')} aria-hidden="true" />
      </span>
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3">{asset.kindLabel}</span>
    </div>
  )
}

function ViewButton({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-semibold sm:min-h-8',
        portalFocusRing,
        active ? 'bg-yx-surface text-yx-blue shadow-sm' : 'text-yx-fg-2 hover:text-yx-fg',
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function KindBadge({ kind, label }: { kind: AssetKind; label: string }) {
  return <StatusChip icon={kindIcon(kind)}>{label}</StatusChip>
}

const statusVariants: Record<AssetStatus, StatusChipVariant> = {
  draft: 'neutral',
  in_review: 'warn',
  waiting_approval: 'warn',
  changes_requested: 'warn',
  approved: 'ok',
  scheduled: 'ok',
  published: 'ok',
  used_in_campaign: 'neutral',
  rejected: 'crit',
  archived: 'neutral',
}

function StatusBadge({ status }: { status: AssetStatus }) {
  return <StatusChip variant={statusVariants[status] ?? 'neutral'}>{statusText(status)}</StatusChip>
}

function MetaLine({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <p className={wide ? 'col-span-2' : undefined}>
      <span className="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{label}</span>
      <span className="mt-0.5 block truncate font-medium text-yx-fg-2">{value}</span>
    </p>
  )
}

function DetailBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">
      <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{label}</p>
      <p className="mt-1 text-xs font-semibold text-yx-fg">{value}</p>
    </div>
  )
}

function TagPill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-yx-line bg-yx-surface px-2 py-0.5 text-[11px] font-medium text-yx-fg-2">
      <Tag aria-hidden="true" className="h-3 w-3" />
      {children}
    </span>
  )
}

function uniqueOptions(labels: string[], values: string[] = labels) {
  const seen = new Map<string, string>()
  labels.forEach((label, index) => { if (!seen.has(values[index])) seen.set(values[index], label) })
  return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string
  allLabel: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      <span className="shrink-0 font-medium">{label}:</span>
      <select
        aria-label={label}
        value={value}
        onChange={event => onChange(event.target.value)}
        className={cn(fieldClasses, 'min-w-0 max-w-full flex-1 text-xs')}
      >
        <option value="">{allLabel}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function EmptyContentState() {
  return (
    <EmptyState
      icon={Layers3}
      title="Nenhum ativo encontrado"
      description="Ajuste os filtros ou busque por outro termo."
    />
  )
}

/** Revisão pendente mais recente de cada conteúdo (as revisões chegam da mais nova para a mais antiga). */
function pendingReviewByContent(reviews: MarketingContentReview[]) {
  const byContent = new Map<string, MarketingContentReview>()
  reviews.forEach(review => {
    if (review.status !== 'pending' || !review.contentVersionId) return
    const current = byContent.get(review.contentItemId)
    if (!current || review.createdAt > current.createdAt) byContent.set(review.contentItemId, review)
  })
  return byContent
}

function contentToAsset(
  content: PortalMarketingContentItem,
  pendingReview: MarketingContentReview | undefined,
  campaignNames: Map<string, string>,
): ContentAsset {
  const type = contentTypeInfo(content.contentType)
  const channel = channelLabel(content.channel)
  const reviewable = content.status === 'in_review' && pendingReview?.contentVersionId
  return {
    id: `content-${content.id}`,
    title: content.title,
    kind: type.kind,
    kindLabel: type.label,
    channel,
    status: content.status,
    origin: content.createdByAgentId ? 'Marketing Studio' : 'Equipe YUX',
    campaign: (content.campaignId && campaignNames.get(content.campaignId)) || 'Sem campanha vinculada',
    updatedAt: content.updatedAt,
    description: content.brief || content.body || 'Conteúdo do Marketing Studio para sua revisão.',
    tags: [type.label.toLowerCase(), channel.toLowerCase(), statusText(content.status).toLowerCase()],
    source: 'content',
    review: reviewable ? { contentId: content.id, contentVersionId: pendingReview!.contentVersionId! } : undefined,
    cta: content.cta,
  }
}

function suggestionToAsset(suggestion: MarketingCampaignCreativeSuggestion): ContentAsset {
  return {
    id: `suggestion-${suggestion.id}`,
    title: suggestion.title,
    kind: 'ad',
    kindLabel: 'Anúncio completo',
    channel: suggestion.provider === 'meta' ? 'Meta Ads' : 'Google Ads',
    status: suggestion.status === 'converted' ? 'used_in_campaign' : suggestion.status,
    origin: 'Gerador de Criativos',
    campaign: suggestion.campaignName,
    updatedAt: suggestion.updatedAt,
    description: suggestion.angle || suggestion.targetAudience,
    tags: [suggestion.objective, suggestion.funnelStage, suggestion.provider],
    source: 'suggestion',
    cta: suggestion.cta,
  }
}

function campaignToAssets(campaign: PortalCampaign): ContentAsset[] {
  return (campaign.creatives || []).map(creative => ({
    id: `campaign-creative-${creative.id}`,
    title: creative.name,
    kind: 'creative',
    kindLabel: 'Criativo de campanha',
    channel: campaign.provider === 'meta' ? 'Meta Ads' : 'Google Ads',
    status: campaign.lifecycleStatus === 'active' ? 'used_in_campaign' : 'approved',
    origin: 'Campanha',
    campaign: campaign.name,
    updatedAt: creative.updatedAt,
    description: creative.headline || creative.body || 'Criativo vinculado a uma campanha.',
    tags: [creative.format, campaign.provider],
    source: 'campaign',
  }))
}

function contentTypeInfo(type: MarketingContentType): { kind: AssetKind; label: string } {
  const map: Record<MarketingContentType, { kind: AssetKind; label: string }> = {
    social_post: { kind: 'post', label: 'Post' },
    blog_article: { kind: 'copy', label: 'Artigo' },
    newsletter: { kind: 'email', label: 'Newsletter' },
    email: { kind: 'email', label: 'E-mail' },
    ad_copy: { kind: 'ad', label: 'Texto de anúncio' },
    video_script: { kind: 'video', label: 'Roteiro de vídeo' },
    carousel_text: { kind: 'creative', label: 'Carrossel' },
    creative_brief: { kind: 'brief', label: 'Briefing' },
  }

  return map[type]
}

function kindIcon(kind: AssetKind) {
  const icons: Record<AssetKind, LucideIcon> = {
    creative: Image,
    post: FileText,
    ad: Megaphone,
    copy: FileText,
    brief: Layers3,
    video: Video,
    email: Mail,
    landing: BarChart3,
  }

  return icons[kind]
}

function statusText(status: AssetStatus) {
  if (status === 'waiting_approval') return 'Aguardando aprovação'
  if (status === 'used_in_campaign') return 'Usado em campanha'
  return statusLabel(status)
}
