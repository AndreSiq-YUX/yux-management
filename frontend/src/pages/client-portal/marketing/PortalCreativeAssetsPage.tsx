import {
  BarChart3,
  Bookmark,
  Building2,
  FileImage,
  Grid2X2,
  Image,
  Megaphone,
  Search,
  Send,
  Sparkles,
  Tag,
  Target,
  Upload,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortalPage } from '@/components/client-portal/PortalPage'
import {
  EmptyState,
  ErrorState,
  MasterDetail,
  PendingAction,
  SectionCard,
  SkeletonCard,
  StatusChip,
  portalButtonClasses,
  portalFocusRing,
  type StatusChipVariant,
} from '@/components/portal-ui'
import { useMediaQuery } from '@/components/marketing-studio/useMediaQuery'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { formatPortalDate, statusLabel } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'
import type { MarketingCampaignCreativeSuggestion } from '@/types/marketingStudio'
import type { CampaignCreative, PortalCampaign } from '@/types/campaign'

type LibraryView = 'gallery' | 'competitors' | 'collections' | 'radar'
type InspirationStatus = 'saved' | 'analyzed' | 'needs_curation' | 'approved_reference' | 'blocked'
type InspirationVariant = 'ad' | 'video'

interface InspirationItem {
  id: string
  title: string
  sourceName: string
  channel: string
  format: string
  objective: string
  status: InspirationStatus
  updatedAt: string
  hook: string
  offer: string
  funnel: string
  whySave: string
  description: string
  tags: string[]
  variant: InspirationVariant
}

const NO_SOURCE_DETAIL = 'Sem fonte conectada'
const DESKTOP_QUERY = '(min-width: 1024px)'

const cardClasses = 'rounded-[10px] border border-yx-line bg-yx-surface'

export function PortalCreativeAssetsPage() {
  const portalPath = usePortalWorkspacePath()
  const {
    loading,
    error,
    campaigns,
    creativeSuggestions,
    reload,
  } = usePortalMarketingContext({ resources: ['campaigns', 'creativeSuggestions'] })
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true)
  const [view, setView] = useState<LibraryView>('gallery')
  const [activeFilter, setActiveFilter] = useState('Todos')
  const [query, setQuery] = useState('')
  const [selectedInspirationId, setSelectedInspirationId] = useState<string | null>(null)

  const inspirationItems = useMemo(() => {
    const mappedItems = [
      ...creativeSuggestions.map(suggestionToInspiration),
      ...campaigns.flatMap(campaignToInspirations),
    ]

    const byId = new Map<string, InspirationItem>()
    mappedItems.forEach(item => byId.set(item.id, item))
    return Array.from(byId.values())
  }, [campaigns, creativeSuggestions])

  const filterTabs = useMemo(() => {
    const labels = new Set<string>()
    inspirationItems.forEach(item => { labels.add(item.channel); labels.add(item.objective) })
    return ['Todos', ...Array.from(labels).sort((a, b) => a.localeCompare(b, 'pt-BR'))]
  }, [inspirationItems])

  const effectiveFilter = filterTabs.includes(activeFilter) ? activeFilter : 'Todos'

  const filteredInspirations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return inspirationItems.filter(item => {
      const queryText = [
        item.title,
        item.sourceName,
        item.channel,
        item.format,
        item.objective,
        item.hook,
        item.offer,
        item.funnel,
        item.description,
        ...item.tags,
      ].join(' ').toLowerCase()

      const matchesQuery = !normalizedQuery || queryText.includes(normalizedQuery)
      const matchesFilter = effectiveFilter === 'Todos'
        || item.channel === effectiveFilter
        || item.objective === effectiveFilter

      return matchesQuery && matchesFilter
    })
  }, [effectiveFilter, inspirationItems, query])

  // No computador o primeiro item já aparece no painel; no celular o detalhe só abre depois do toque.
  const selectedInspiration = filteredInspirations.find(item => item.id === selectedInspirationId)
    ?? (isDesktop ? filteredInspirations[0] : undefined)

  const metrics = [
    { label: 'Concorrentes monitorados', value: '—', detail: NO_SOURCE_DETAIL },
    { label: 'Inspirações salvas', value: String(inspirationItems.length), detail: 'Biblioteca do contrato' },
    { label: 'Anúncios analisados', value: '—', detail: NO_SOURCE_DETAIL },
    { label: 'Oportunidades criativas', value: String(inspirationItems.filter(item => ['Captura', 'Oferta direta', 'Dor comercial'].includes(item.objective)).length), detail: 'Com potencial de uso' },
    { label: 'Referências aprovadas', value: String(inspirationItems.filter(item => item.status === 'approved_reference').length), detail: 'Prontas para orientar campanhas' },
    { label: 'Aguardando curadoria', value: String(inspirationItems.filter(item => item.status === 'needs_curation').length), detail: 'Revisar e classificar' },
  ]

  return (
    <PortalPage
      eyebrow="Marketing"
      title="Criativos e inspirações"
      description="Reúna referências, concorrentes e anúncios salvos para orientar novas campanhas. Para aprovar o que a equipe produziu, use a Central de conteúdo."
      primaryAction={
        <>
          <PendingAction code="B20">
            <Building2 className="h-4 w-4" />
            Adicionar concorrente
          </PendingAction>
          <PendingAction code="B20">
            <Upload className="h-4 w-4" />
            Importar inspiração
          </PendingAction>
          <PendingAction code="B20">
            <Search className="h-4 w-4" />
            Pesquisar mercado
          </PendingAction>
        </>
      }
      metrics={loading || error ? [] : metrics}
      related={[
        { label: 'Central de conteúdo', href: '/portal/marketing/conteudo' },
        { label: 'Marketing Studio', href: '/portal/marketing/studio' },
        { label: 'Campanhas', href: '/portal/marketing/campanhas' },
      ]}
    >
      <section aria-label="Buscar e filtrar inspirações" className={cardClasses}>
        <div className="flex flex-col gap-3 border-b border-yx-line p-3.5 sm:p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yx-fg-3" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              aria-label="Buscar inspirações"
              className={cn(
                'min-h-11 w-full rounded-lg border border-yx-line-strong bg-yx-surface-2 pl-9 pr-3 text-sm text-yx-fg placeholder:text-yx-fg-3 focus:bg-yx-surface',
                portalFocusRing,
              )}
              placeholder="Buscar por concorrente, formato, oferta, canal ou tag..."
            />
          </div>
          <div role="group" aria-label="Forma de exibição" className="inline-flex max-w-full overflow-x-auto rounded-lg border border-yx-line-strong bg-yx-surface-2 p-0.5">
            <ViewButton icon={Grid2X2} label="Galeria" active={view === 'gallery'} onClick={() => setView('gallery')} />
            <ViewButton icon={Building2} label="Concorrentes" active={view === 'competitors'} onClick={() => setView('competitors')} />
            <ViewButton icon={Bookmark} label="Coleções" active={view === 'collections'} onClick={() => setView('collections')} />
            <ViewButton icon={BarChart3} label="Radar de anúncios" active={view === 'radar'} onClick={() => setView('radar')} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 p-3.5 sm:p-4">
          {filterTabs.map(tab => (
            <button
              key={tab}
              type="button"
              aria-pressed={effectiveFilter === tab}
              onClick={() => setActiveFilter(tab)}
              className={cn(
                'min-h-10 rounded-full border px-3.5 text-xs font-semibold transition-colors sm:min-h-8',
                portalFocusRing,
                effectiveFilter === tab
                  ? 'border-yx-blue bg-yx-blue text-white'
                  : 'border-yx-line-strong bg-yx-surface text-yx-fg-2 hover:border-yx-blue hover:text-yx-blue',
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <SkeletonCard lines={6} />
      ) : error ? (
        <ErrorState title="Não foi possível carregar os criativos." description={error} onRetry={() => void reload?.()} />
      ) : (
        <MasterDetail
          className="lg:grid-cols-[minmax(0,1fr)_370px] lg:gap-4"
          onBack={() => setSelectedInspirationId(null)}
          backLabel="Voltar"
          list={
            <div className="min-w-0 space-y-4">
              <CompetitorRail />
              {view === 'gallery' && (
                <GalleryView
                  inspirations={filteredInspirations}
                  hasAnyInspiration={inspirationItems.length > 0}
                  selectedId={isDesktop ? selectedInspiration?.id : undefined}
                  onSelect={setSelectedInspirationId}
                />
              )}
              {view === 'competitors' && <NoCompetitorsState />}
              {view === 'collections' && (
                <EmptyState
                  icon={Bookmark}
                  title="Nenhuma coleção ainda"
                  description="As coleções aparecem aqui quando houver referências organizadas."
                />
              )}
              {view === 'radar' && <NoCompetitorsState />}
            </div>
          }
          detail={selectedInspiration ? (
            <InspirationInspector
              inspiration={selectedInspiration}
              centralHref={portalPath('/portal/marketing/conteudo')}
            />
          ) : null}
          emptyDetail={
            <aside className={cn(cardClasses, 'p-5')}>
              <p className="text-sm text-yx-fg-2">Selecione uma inspiração para analisar.</p>
            </aside>
          }
        />
      )}
    </PortalPage>
  )
}

function CompetitorRail() {
  return (
    <SectionCard title="Concorrentes" description="Fontes para monitorar e salvar referências.">
      <p className="text-sm font-semibold text-yx-fg">Nenhum concorrente monitorado ainda</p>
      <p className="mt-1 text-xs leading-relaxed text-yx-fg-3">A YUX vai conectar fontes de referência para acompanhar concorrentes.</p>
    </SectionCard>
  )
}

function NoCompetitorsState() {
  return (
    <EmptyState
      icon={Building2}
      title="Nenhum concorrente monitorado ainda"
      description="A YUX vai conectar fontes de referência para acompanhar concorrentes."
    />
  )
}

function GalleryView({
  inspirations,
  hasAnyInspiration,
  selectedId,
  onSelect,
}: {
  inspirations: InspirationItem[]
  hasAnyInspiration: boolean
  selectedId?: string
  onSelect: (id: string) => void
}) {
  if (!inspirations.length) {
    return hasAnyInspiration ? (
      <EmptyState
        icon={Image}
        title="Nenhuma inspiração encontrada"
        description="Ajuste os filtros ou busque por outro termo."
      />
    ) : (
      <EmptyState
        icon={Image}
        title="Nenhuma inspiração salva ainda"
        description="As sugestões criativas e os criativos das suas campanhas aparecem aqui como referência."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-1 min-[1280px]:grid-cols-2 min-[1760px]:grid-cols-3">
      {inspirations.map(item => (
        <InspirationCard
          key={item.id}
          inspiration={item}
          selected={item.id === selectedId}
          onSelect={() => onSelect(item.id)}
        />
      ))}
    </div>
  )
}

function InspirationInspector({
  inspiration,
  centralHref,
}: {
  inspiration: InspirationItem
  centralHref: string
}) {
  return (
    <aside aria-label="Detalhes da inspiração" className={cn(cardClasses, 'p-4 lg:sticky lg:top-4')}>
      <div className="overflow-hidden rounded-lg border border-yx-line">
        <CreativePreview inspiration={inspiration} />
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3">Análise da inspiração</p>
          <h2 className="mt-2 font-display text-lg font-semibold leading-snug text-yx-fg">{inspiration.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-yx-fg-2">{inspiration.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <DetailBox label="Gancho" value={inspiration.hook} wide />
          <DetailBox label="Oferta" value={inspiration.offer} />
          <DetailBox label="Funil" value={inspiration.funnel} />
          <DetailBox label="Canal" value={inspiration.channel} />
          <DetailBox label="Formato" value={inspiration.format} />
        </div>

        <div className="rounded-lg border border-yx-line bg-yx-blue-soft p-3">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-blue">Por que salvar</p>
          <p className="mt-2 text-sm leading-relaxed text-yx-fg">{inspiration.whySave}</p>
        </div>

        <div>
          <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3">Tags</p>
          <div className="flex flex-wrap gap-2">
            {inspiration.tags.map(tag => <TagPill key={tag}>{tag}</TagPill>)}
          </div>
        </div>

        <div>
          <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3">Ações</p>
          <div className="grid gap-2">
            <PendingAction code="B20">
              <Sparkles className="h-4 w-4" />
              Gerar similar
            </PendingAction>
            <PendingAction code="B20">
              <FileImage className="h-4 w-4" />
              Criar briefing
            </PendingAction>
            <Link to={centralHref} className={portalButtonClasses('ghost', 'w-full')}>
              <Send aria-hidden="true" />
              Enviar para Central
            </Link>
            <PendingAction code="B20">
              <Target className="h-4 w-4" />
              Vincular campanha
            </PendingAction>
            <div className="flex flex-wrap gap-2">
              <PendingAction code="B3" size="sm">Aprovar</PendingAction>
              <PendingAction code="B3" size="sm">Curadoria</PendingAction>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3">Fonte</p>
          <p className="mt-3 text-sm font-medium text-yx-fg">{inspiration.sourceName}</p>
          <p className="mt-2 text-xs text-yx-fg-3">Atualizado em {formatPortalDate(inspiration.updatedAt)}</p>
        </div>
      </div>
    </aside>
  )
}

function CreativePreview({ inspiration }: { inspiration: InspirationItem }) {
  const Icon = inspiration.variant === 'video' ? Video : Megaphone

  return (
    <div className="flex h-52 flex-col justify-between bg-yx-surface-2 p-4">
      <div className="flex items-center justify-between">
        <StatusChip>{inspiration.channel}</StatusChip>
        <Icon className="h-5 w-5 text-yx-blue" aria-hidden="true" />
      </div>
      <p className="line-clamp-4 max-w-[240px] font-display text-xl font-semibold leading-tight text-yx-fg">{inspiration.hook}</p>
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3">{inspiration.format}</span>
    </div>
  )
}

function suggestionToInspiration(suggestion: MarketingCampaignCreativeSuggestion): InspirationItem {
  return {
    id: `suggestion-${suggestion.id}`,
    title: suggestion.title,
    sourceName: 'Gerador de Criativos',
    channel: suggestion.provider === 'meta' ? 'Meta Ads' : 'Google Ads',
    format: 'Anúncio completo',
    objective: statusLabel(suggestion.objective),
    status: suggestion.status === 'approved' ? 'approved_reference' : suggestion.status === 'changes_requested' ? 'needs_curation' : 'analyzed',
    updatedAt: suggestion.updatedAt,
    hook: suggestion.angle || suggestion.title,
    offer: suggestion.cta || 'Oferta em validação',
    funnel: statusLabel(suggestion.funnelStage),
    whySave: 'Sugestão gerada pelo Marketing Studio com contexto de campanha, útil para reaproveitamento.',
    description: suggestion.targetAudience || suggestion.angle || 'Sugestão de criativo pronta para curadoria.',
    tags: [suggestion.provider === 'meta' ? 'Meta Ads' : 'Google Ads', statusLabel(suggestion.objective), statusLabel(suggestion.funnelStage)],
    variant: 'ad',
  }
}

function campaignToInspirations(campaign: PortalCampaign): InspirationItem[] {
  return (campaign.creatives || []).map(creative => creativeToInspiration(creative, campaign))
}

function creativeToInspiration(creative: CampaignCreative, campaign: PortalCampaign): InspirationItem {
  return {
    id: `campaign-creative-${creative.id}`,
    title: creative.name,
    sourceName: campaign.name,
    channel: campaign.provider === 'meta' ? 'Meta Ads' : 'Google Ads',
    format: statusLabel(creative.format),
    objective: statusLabel(campaign.objective),
    status: campaign.lifecycleStatus === 'active' ? 'approved_reference' : 'saved',
    updatedAt: creative.updatedAt,
    hook: creative.headline || campaign.name,
    offer: campaign.utmCampaign || 'Oferta da campanha',
    funnel: 'Campanha',
    whySave: 'Criativo vinculado a uma campanha, útil como referência para novas variações.',
    description: creative.body || creative.headline || 'Criativo de campanha salvo na biblioteca.',
    tags: [statusLabel(creative.format), campaign.provider === 'meta' ? 'Meta Ads' : 'Google Ads', statusLabel(campaign.objective)],
    variant: creative.format === 'video' ? 'video' : 'ad',
  }
}

function InspirationCard({
  inspiration,
  selected,
  onSelect,
}: {
  inspiration: InspirationItem
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'overflow-hidden rounded-[10px] border bg-yx-surface text-left transition-colors hover:border-yx-blue',
        portalFocusRing,
        selected ? 'border-yx-blue ring-2 ring-yx-blue/30' : 'border-yx-line',
      )}
    >
      <CreativePreview inspiration={inspiration} />
      <div className="space-y-3 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip>{inspiration.channel}</StatusChip>
          <StatusChip variant={statusVariant(inspiration.status)}>{statusText(inspiration.status)}</StatusChip>
        </div>
        <div>
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-yx-fg">{inspiration.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-yx-fg-3">{inspiration.description}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-yx-line pt-3 text-xs">
          <MetaLine label="Origem" value={inspiration.sourceName} />
          <MetaLine label="Objetivo" value={inspiration.objective} />
          <MetaLine label="Formato" value={inspiration.format} wide />
        </div>
      </div>
    </button>
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

function MetaLine({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <p className={wide ? 'col-span-2' : undefined}>
      <span className="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{label}</span>
      <span className="mt-0.5 block truncate font-medium text-yx-fg-2">{value}</span>
    </p>
  )
}

function DetailBox({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-yx-line bg-yx-surface-2 p-3', wide && 'col-span-2')}>
      <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{label}</p>
      <p className="mt-1 text-xs font-semibold leading-relaxed text-yx-fg">{value}</p>
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

function statusText(status: InspirationStatus) {
  const labels: Record<InspirationStatus, string> = {
    saved: 'Salvo',
    analyzed: 'Analisado',
    needs_curation: 'Curadoria',
    approved_reference: 'Referência aprovada',
    blocked: 'Não usar',
  }

  return labels[status]
}

function statusVariant(status: InspirationStatus): StatusChipVariant {
  if (status === 'approved_reference') return 'ok'
  if (status === 'needs_curation') return 'warn'
  if (status === 'blocked') return 'crit'
  return 'neutral'
}
