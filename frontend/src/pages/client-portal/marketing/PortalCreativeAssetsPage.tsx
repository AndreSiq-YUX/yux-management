import {
  ArrowRight,
  BarChart3,
  Bookmark,
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileImage,
  Globe2,
  Grid2X2,
  Image,
  Link as LinkIcon,
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
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { formatPortalDate, statusLabel } from '@/lib/client-portal/portalDisplay'
import type { MarketingCampaignCreativeSuggestion } from '@/types/marketingStudio'
import type { CampaignCreative, PortalCampaign } from '@/types/campaign'

type LibraryView = 'gallery' | 'competitors' | 'collections' | 'radar'
type InspirationStatus = 'saved' | 'analyzed' | 'needs_curation' | 'approved_reference' | 'blocked'
type InspirationVariant = 'clinic-ad' | 'report' | 'reels' | 'crm-before-after' | 'speed' | 'copy' | 'landing' | 'video'

interface CompetitorProfile {
  id: string
  name: string
  type: 'Direto' | 'Referencia' | 'Benchmark' | 'Aspiracional'
  status: 'Monitorado' | 'Referencia' | 'Benchmark'
  ads: number
  saved: number
  lastSync: string
  source: string
  description: string
  accent: 'blue' | 'violet' | 'magenta' | 'emerald'
}

interface InspirationItem {
  id: string
  title: string
  competitorId?: string
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
  sourceUrl?: string
}

interface CreativeCollection {
  id: string
  title: string
  count: number
  description: string
  tone: 'blue' | 'violet' | 'magenta' | 'emerald'
}

type MarketingPulseTone = 'blue' | 'violet' | 'slate' | 'emerald' | 'amber'

interface MarketingPulseMetric {
  label: string
  value: string | number
  detail: string
  icon: LucideIcon
  tone: MarketingPulseTone
}

const competitors: CompetitorProfile[] = [
  {
    id: 'v4-company',
    name: 'V4 Company',
    type: 'Direto',
    status: 'Monitorado',
    ads: 38,
    saved: 11,
    lastSync: '2026-07-04T09:20:00.000Z',
    source: 'Meta Ads Library',
    description: 'Ofertas agressivas para diagnostico, consultoria e performance comercial.',
    accent: 'magenta',
  },
  {
    id: 'rd-station',
    name: 'RD Station',
    type: 'Referencia',
    status: 'Referencia',
    ads: 24,
    saved: 8,
    lastSync: '2026-07-03T14:10:00.000Z',
    source: 'LinkedIn / Site',
    description: 'Conteudos de autoridade, pesquisas, relatorios e materiais ricos.',
    accent: 'blue',
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    type: 'Aspiracional',
    status: 'Benchmark',
    ads: 19,
    saved: 6,
    lastSync: '2026-07-03T11:40:00.000Z',
    source: 'Ads / Landing Pages',
    description: 'Execucao madura de inbound, CRM, automacao e prova de valor.',
    accent: 'violet',
  },
  {
    id: 'mkt-local',
    name: 'Agencia Local Pro',
    type: 'Benchmark',
    status: 'Monitorado',
    ads: 15,
    saved: 4,
    lastSync: '2026-07-02T16:30:00.000Z',
    source: 'Instagram',
    description: 'Criativos regionais com linguagem direta e promessas de resultado rapido.',
    accent: 'emerald',
  },
]

const fallbackInspirations: InspirationItem[] = [
  {
    id: 'clinic-diagnostic',
    competitorId: 'v4-company',
    title: 'Diagnostico gratuito para clinicas',
    sourceName: 'V4 Company',
    channel: 'Meta Ads',
    format: 'Imagem 4:5',
    objective: 'Captura',
    status: 'needs_curation',
    updatedAt: '2026-07-04T10:15:00.000Z',
    hook: 'Quanto dinheiro sua clinica perde por demora no WhatsApp?',
    offer: 'Diagnostico gratuito',
    funnel: 'Conversao',
    whySave: 'Boa combinacao entre dor clara, promessa objetiva e CTA simples.',
    description: 'Peca direta para captar negocios com dor operacional evidente.',
    tags: ['whatsapp', 'clinicas', 'meta-ads', 'alta intencao'],
    variant: 'clinic-ad',
    sourceUrl: 'https://facebook.com/ads/library',
  },
  {
    id: 'sales-report',
    competitorId: 'rd-station',
    title: 'Relatorio de vendas 2026',
    sourceName: 'RD Station',
    channel: 'LinkedIn',
    format: 'Documento',
    objective: 'Autoridade',
    status: 'saved',
    updatedAt: '2026-07-03T15:00:00.000Z',
    hook: 'O maior estudo de marketing e vendas do Brasil chegou.',
    offer: 'Download gratuito',
    funnel: 'Consideracao',
    whySave: 'Excelente uso de autoridade e material rico como isca de valor.',
    description: 'Referencia para campanhas de relatorio, benchmark e lead magnet.',
    tags: ['relatorio', 'autoridade', 'linkedin', 'lead-magnet'],
    variant: 'report',
  },
  {
    id: 'marketing-no-leads',
    competitorId: 'v4-company',
    title: 'Seu marketing nao gera oportunidades',
    sourceName: 'V4 Company',
    channel: 'Instagram Reels',
    format: 'Video curto',
    objective: 'Dor comercial',
    status: 'analyzed',
    updatedAt: '2026-07-03T13:00:00.000Z',
    hook: 'Seu marketing ate gera cliques, mas poucos leads.',
    offer: 'Diagnostico de funil',
    funnel: 'Consideracao',
    whySave: 'Gancho forte para empresas que ja investem, mas nao veem pipeline.',
    description: 'Roteiro curto com contraste entre vaidade e oportunidade real.',
    tags: ['reels', 'dor-comercial', 'funil', 'diagnostico'],
    variant: 'reels',
  },
  {
    id: 'crm-before-after',
    competitorId: 'hubspot',
    title: 'Antes e depois do CRM',
    sourceName: 'HubSpot',
    channel: 'Landing Page',
    format: 'Hero visual',
    objective: 'Prova social',
    status: 'approved_reference',
    updatedAt: '2026-07-02T17:30:00.000Z',
    hook: 'Transforme caos comercial em previsibilidade.',
    offer: 'Demo guiada',
    funnel: 'Conversao',
    whySave: 'Mostra transformacao visual sem depender de texto longo.',
    description: 'Boa referencia para paginas de antes/depois e narrativa operacional.',
    tags: ['crm', 'landing-page', 'prova visual', 'demo'],
    variant: 'crm-before-after',
  },
  {
    id: 'follow-up-speed',
    competitorId: 'mkt-local',
    title: 'Follow-up em 5 minutos',
    sourceName: 'Agencia Local Pro',
    channel: 'Meta Ads',
    format: 'Carrossel',
    objective: 'Velocidade',
    status: 'saved',
    updatedAt: '2026-07-02T10:45:00.000Z',
    hook: 'Quem responde primeiro vende mais.',
    offer: 'Revisao do atendimento',
    funnel: 'Captura',
    whySave: 'Boa promessa operacional, facil de adaptar para WhatsApp e CRM.',
    description: 'Criativo com relogio, mensagens e comparacao de resposta.',
    tags: ['follow-up', 'whatsapp', 'meta-ads', 'velocidade'],
    variant: 'speed',
  },
  {
    id: 'copy-angle',
    title: 'Copy para campanha de diagnostico',
    sourceName: 'YUX Automacoes',
    channel: 'Central de Conteudo',
    format: 'Copy Ads',
    objective: 'Oferta direta',
    status: 'analyzed',
    updatedAt: '2026-07-01T18:20:00.000Z',
    hook: 'A agenda esta cheia, mas o caixa nao acompanha?',
    offer: 'Mapa de oportunidades',
    funnel: 'Conversao',
    whySave: 'Angulo util para clinicas com demanda, mas baixa previsibilidade.',
    description: 'Referencia interna gerada por IA a partir de briefing aprovado.',
    tags: ['copy', 'diagnostico', 'clinicas', 'oferta'],
    variant: 'copy',
  },
]

const collections: CreativeCollection[] = [
  {
    id: 'client-favorites',
    title: 'Favoritos do cliente',
    count: 18,
    description: 'Referencias aprovadas ou marcadas como preferidas.',
    tone: 'blue',
  },
  {
    id: 'meta-ads',
    title: 'Referencias Meta Ads',
    count: 32,
    description: 'Criativos para campanhas de captacao e remarketing.',
    tone: 'violet',
  },
  {
    id: 'diagnostic-ideas',
    title: 'Ideias para diagnostico',
    count: 14,
    description: 'Ganchos, ofertas e provas para diagnosticos comerciais.',
    tone: 'emerald',
  },
  {
    id: 'visual-style',
    title: 'Estilo visual aprovado',
    count: 9,
    description: 'Direcoes visuais compatíveis com marca e tom de voz.',
    tone: 'magenta',
  },
]

const filterTabs = ['Todos', 'Meta Ads', 'Instagram', 'LinkedIn', 'Landing Pages', 'Videos', 'Ofertas', 'Prova social', 'Captura']

export function PortalCreativeAssetsPage() {
  const portalPath = usePortalWorkspacePath()
  const {
    loading,
    error,
    campaigns,
    creativeSuggestions,
  } = usePortalMarketingContext({ includeCampaigns: true, includeOperations: true })
  const [view, setView] = useState<LibraryView>('gallery')
  const [activeFilter, setActiveFilter] = useState('Todos')
  const [query, setQuery] = useState('')
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<string | null>(competitors[0]?.id || null)
  const [selectedInspirationId, setSelectedInspirationId] = useState<string | null>(fallbackInspirations[0]?.id || null)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, InspirationStatus>>({})

  const inspirationItems = useMemo(() => {
    const mappedItems = [
      ...creativeSuggestions.map(suggestionToInspiration),
      ...campaigns.flatMap(campaignToInspirations),
    ]

    const byId = new Map<string, InspirationItem>()
    mappedItems.forEach(item => byId.set(item.id, item))
    fallbackInspirations.forEach(item => {
      if (byId.size < 12) byId.set(item.id, item)
    })

    return Array.from(byId.values()).map(item => ({
      ...item,
      status: statusOverrides[item.id] || item.status,
    }))
  }, [campaigns, creativeSuggestions, statusOverrides])

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
      const matchesFilter = activeFilter === 'Todos'
        || item.channel === activeFilter
        || item.format === activeFilter
        || item.objective === activeFilter
        || item.tags.some(tag => tag.toLowerCase() === activeFilter.toLowerCase())
        || (activeFilter === 'Landing Pages' && item.channel === 'Landing Page')
        || (activeFilter === 'Videos' && item.format.toLowerCase().includes('video'))
        || (activeFilter === 'Ofertas' && ['Oferta direta', 'Captura'].includes(item.objective))
        || (activeFilter === 'Prova social' && item.objective === 'Prova social')
        || (activeFilter === 'Captura' && item.objective === 'Captura')

      return matchesQuery && matchesFilter
    })
  }, [activeFilter, inspirationItems, query])

  const selectedInspiration = filteredInspirations.find(item => item.id === selectedInspirationId)
    || inspirationItems.find(item => item.id === selectedInspirationId)
    || filteredInspirations[0]
    || inspirationItems[0]

  useEffect(() => {
    if (!selectedInspirationId && filteredInspirations[0]) {
      setSelectedInspirationId(filteredInspirations[0].id)
      return
    }

    if (selectedInspirationId && filteredInspirations.length > 0 && !filteredInspirations.some(item => item.id === selectedInspirationId)) {
      setSelectedInspirationId(filteredInspirations[0].id)
    }
  }, [filteredInspirations, selectedInspirationId])

  const metrics: MarketingPulseMetric[] = [
    { label: 'Concorrentes monitorados', value: competitors.length, detail: 'Fontes acompanhadas', icon: Building2, tone: 'blue' },
    { label: 'Inspiracoes salvas', value: inspirationItems.length, detail: 'Biblioteca do contrato', icon: Bookmark, tone: 'violet' },
    { label: 'Anuncios analisados', value: competitors.reduce((total, competitor) => total + competitor.ads, 0), detail: 'Radar e referencias', icon: BarChart3, tone: 'slate' },
    { label: 'Oportunidades criativas', value: inspirationItems.filter(item => ['Captura', 'Oferta direta', 'Dor comercial'].includes(item.objective)).length, detail: 'Com potencial de uso', icon: Sparkles, tone: 'emerald' },
    { label: 'Aguardando curadoria', value: inspirationItems.filter(item => item.status === 'needs_curation').length, detail: 'Revisar e classificar', icon: Clock3, tone: 'amber' },
  ]

  const updateSelectedStatus = (status: InspirationStatus) => {
    if (!selectedInspiration) return
    setStatusOverrides(current => ({ ...current, [selectedInspiration.id]: status }))
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] space-y-5 bg-[#f4f4f4] px-4 py-5 text-[#141821] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[#141821]">Biblioteca de Criativos e Inspiracoes</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Referencias, concorrentes e anuncios salvos para orientar novas campanhas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Building2 className="h-4 w-4" />
            Adicionar concorrente
          </button>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="h-4 w-4" />
            Importar inspiracao
          </button>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md bg-[#2563EB] px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
            <Search className="h-4 w-4" />
            Pesquisar mercado
          </button>
        </div>
      </header>

      <MarketingPulse metrics={metrics} />

      <section className="rounded-md border border-slate-300 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="h-11 w-full rounded-md border border-slate-300 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="Buscar por concorrente, formato, oferta, canal ou tag..."
            />
          </div>
          <div className="inline-flex max-w-full overflow-auto rounded-md border border-slate-300 bg-slate-50 p-1">
            <ViewButton icon={Grid2X2} label="Galeria" active={view === 'gallery'} onClick={() => setView('gallery')} />
            <ViewButton icon={Building2} label="Concorrentes" active={view === 'competitors'} onClick={() => setView('competitors')} />
            <ViewButton icon={Bookmark} label="Colecoes" active={view === 'collections'} onClick={() => setView('collections')} />
            <ViewButton icon={BarChart3} label="Radar de anuncios" active={view === 'radar'} onClick={() => setView('radar')} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4">
          {filterTabs.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveFilter(tab)}
              className={`h-8 rounded-md border px-3 text-xs font-semibold transition ${
                activeFilter === tab
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

      </section>

      {loading ? (
        <section className="rounded-md border border-slate-300 bg-white p-5 text-sm text-slate-600">Carregando Biblioteca de Criativos e Inspiracoes...</section>
      ) : error ? (
        <section className="rounded-md border border-red-200 bg-white p-5 text-sm text-red-600">{error}</section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_370px]">
            <CompetitorRail
              competitors={competitors}
              selectedId={selectedCompetitorId}
              onSelect={setSelectedCompetitorId}
            />
            <main className="min-w-0 space-y-4">
              {view === 'gallery' && (
                <GalleryView
                  inspirations={filteredInspirations}
                  selectedId={selectedInspiration?.id}
                  onSelect={setSelectedInspirationId}
                />
              )}
              {view === 'competitors' && (
                <CompetitorsView
                  competitors={competitors}
                  selectedId={selectedCompetitorId}
                  inspirations={inspirationItems}
                  onSelect={setSelectedCompetitorId}
                />
              )}
              {view === 'collections' && (
                <CollectionsView collections={collections} inspirations={inspirationItems} />
              )}
              {view === 'radar' && (
                <RadarView inspirations={inspirationItems} competitors={competitors} />
              )}
              <QuickCollections collections={collections} />
            </main>
            <InspirationInspector
              inspiration={selectedInspiration}
              onApprove={() => updateSelectedStatus('approved_reference')}
              onRequestCuration={() => updateSelectedStatus('needs_curation')}
              centralHref={portalPath('/marketing/conteudo')}
            />
        </section>
      )}
    </div>
  )
}

function MarketingPulse({ metrics }: { metrics: MarketingPulseMetric[] }) {
  return (
    <section className="rounded-sm border border-slate-300 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">Pulso Executivo</p>
          <h2 className="sr-only">Indicadores principais da biblioteca de criativos e inspiracoes</h2>
        </div>
        <BarChart3 className="hidden h-5 w-5 text-slate-400 sm:block" />
      </div>
      <div className="grid divide-y divide-slate-200 md:grid-cols-5 md:divide-x md:divide-y-0">
        {metrics.map(metric => {
          const Icon = metric.icon
          return (
            <article key={metric.label} className="flex min-h-[108px] items-center gap-5 px-5 py-5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${marketingPulseIconClass(metric.tone)}`}>
                <Icon className="h-6 w-6 stroke-[2.2]" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{metric.label}</p>
                <p className="mt-2 text-[1.75rem] font-semibold leading-none tracking-[-0.01em] text-slate-950">{metric.value}</p>
                <p className={`mt-2 text-xs font-medium ${marketingPulseDetailClass(metric.tone)}`}>{metric.detail}</p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function CompetitorRail({
  competitors,
  selectedId,
  onSelect,
}: {
  competitors: CompetitorProfile[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <aside className="space-y-3 self-start rounded-md border border-slate-300 bg-white p-4 xl:sticky xl:top-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#141821]">Concorrentes</h2>
          <p className="mt-1 text-xs text-slate-500">Fontes para monitorar e salvar referencias.</p>
        </div>
      </div>
      <div className="grid gap-2">
        <button type="button" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100">
          <LinkIcon className="h-3.5 w-3.5" />
          Adicionar por URL
        </button>
        <button type="button" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <Globe2 className="h-3.5 w-3.5" />
          Buscar concorrentes
        </button>
      </div>
      <div className="space-y-2">
        {competitors.map(competitor => (
          <button
            key={competitor.id}
            type="button"
            onClick={() => onSelect(competitor.id)}
            className={`w-full rounded-md border bg-white p-3 text-left transition hover:border-blue-300 ${
              selectedId === competitor.id ? 'border-blue-500 ring-4 ring-blue-100' : 'border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${accentClass(competitor.accent, 'soft')}`}>
                <Building2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#141821]">{competitor.name}</span>
                <span className="mt-1 block text-xs text-slate-500">{competitor.type} / {competitor.status}</span>
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <MetricChip label="Ads" value={String(competitor.ads)} />
              <MetricChip label="Salvos" value={String(competitor.saved)} />
            </div>
            <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-500">{competitor.description}</p>
          </button>
        ))}
      </div>
    </aside>
  )
}

function GalleryView({
  inspirations,
  selectedId,
  onSelect,
}: {
  inspirations: InspirationItem[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  if (!inspirations.length) return <EmptyState />

  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
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

function CompetitorsView({
  competitors,
  selectedId,
  inspirations,
  onSelect,
}: {
  competitors: CompetitorProfile[]
  selectedId: string | null
  inspirations: InspirationItem[]
  onSelect: (id: string) => void
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {competitors.map(competitor => {
        const related = inspirations.filter(item => item.competitorId === competitor.id)
        return (
          <button
            key={competitor.id}
            type="button"
            onClick={() => onSelect(competitor.id)}
            className={`rounded-md border bg-white p-4 text-left hover:border-blue-300 ${
              selectedId === competitor.id ? 'border-blue-500 ring-4 ring-blue-100' : 'border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-[#141821]">{competitor.name}</p>
                <p className="mt-1 text-xs text-slate-500">{competitor.source} / atualizado em {formatPortalDate(competitor.lastSync)}</p>
              </div>
              <StatusBadge label={competitor.status} tone={competitor.accent} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{competitor.description}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <MetricChip label="Anuncios" value={String(competitor.ads)} />
              <MetricChip label="Salvos" value={String(competitor.saved)} />
              <MetricChip label="Ideias" value={String(related.length)} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

function CollectionsView({ collections, inspirations }: { collections: CreativeCollection[]; inspirations: InspirationItem[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {collections.map((collection, index) => (
        <article key={collection.id} className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-[#141821]">{collection.title}</p>
              <p className="mt-1 text-sm text-slate-600">{collection.description}</p>
            </div>
            <StatusBadge label={`${collection.count} itens`} tone={collection.tone} />
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {inspirations.slice(index, index + 4).map(item => (
              <div key={item.id} className="overflow-hidden rounded-md border border-slate-200">
                <CreativePreview inspiration={item} compact />
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

function RadarView({ inspirations, competitors }: { inspirations: InspirationItem[]; competitors: CompetitorProfile[] }) {
  const rows = [
    { label: 'Ofertas diretas em alta', value: inspirations.filter(item => ['Captura', 'Oferta direta'].includes(item.objective)).length, detail: 'Ganchos com CTA simples e promessa objetiva.' },
    { label: 'Concorrentes ativos esta semana', value: competitors.filter(item => item.ads > 15).length, detail: 'Fontes com volume relevante de anuncios.' },
    { label: 'Criativos com dor comercial', value: inspirations.filter(item => item.tags.includes('dor-comercial')).length, detail: 'Mensagens que atacam baixa conversao ou falta de retorno.' },
    { label: 'Referencias prontas para briefing', value: inspirations.filter(item => item.status === 'approved_reference').length, detail: 'Podem alimentar designer ou gerador de criativos.' },
  ]

  return (
    <div className="space-y-3">
      {rows.map(row => (
        <article key={row.label} className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white p-4">
          <div>
            <p className="font-semibold text-[#141821]">{row.label}</p>
            <p className="mt-1 text-sm text-slate-600">{row.detail}</p>
          </div>
          <span className="text-3xl font-semibold text-blue-600">{row.value}</span>
        </article>
      ))}
    </div>
  )
}

function QuickCollections({ collections }: { collections: CreativeCollection[] }) {
  return (
    <section className="rounded-md border border-slate-300 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#141821]">Colecoes rapidas</h2>
        <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
          Ver todas
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {collections.map(collection => (
          <article key={collection.id} className="flex min-h-[76px] items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
            <div className="min-w-0">
              <p className="line-clamp-1 text-sm font-semibold text-[#141821]">{collection.title}</p>
              <p className="mt-1 text-xs text-slate-500">{collection.count} itens</p>
            </div>
            <div className="flex -space-x-2">
              {[0, 1, 2].map(index => (
                <span key={index} className={`h-9 w-11 rounded-md border-2 border-white shadow-sm ${accentClass(collection.tone, index === 0 ? 'solid' : 'muted')}`} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
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
      className={`overflow-hidden rounded-md border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md ${
        selected ? 'border-blue-500 ring-4 ring-blue-100' : 'border-slate-200'
      }`}
    >
      <CreativePreview inspiration={inspiration} />
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={inspiration.channel} tone="blue" />
          <StatusBadge label={statusText(inspiration.status)} tone={statusTone(inspiration.status)} />
        </div>
        <div>
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-[#141821]">{inspiration.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{inspiration.description}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
          <MetaLine label="Origem" value={inspiration.sourceName} />
          <MetaLine label="Objetivo" value={inspiration.objective} />
          <MetaLine label="Formato" value={inspiration.format} wide />
        </div>
      </div>
    </button>
  )
}

function InspirationInspector({
  inspiration,
  onApprove,
  onRequestCuration,
  centralHref,
}: {
  inspiration?: InspirationItem
  onApprove: () => void
  onRequestCuration: () => void
  centralHref: string
}) {
  if (!inspiration) {
    return (
      <aside className="self-start rounded-sm border border-slate-300 border-l-[#2563EB] bg-white p-5 shadow-sm xl:border-l-2">
        <p className="text-sm text-slate-600">Selecione uma inspiracao para analisar.</p>
      </aside>
    )
  }

  return (
    <aside className="self-start rounded-sm border border-slate-300 border-l-[#2563EB] bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:border-l-2">
      <div className="overflow-hidden rounded-md border border-slate-300">
        <CreativePreview inspiration={inspiration} />
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Analise da inspiracao</p>
          <h2 className="mt-2 text-lg font-semibold leading-snug text-[#141821]">{inspiration.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{inspiration.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <DetailBox label="Gancho" value={inspiration.hook} wide />
          <DetailBox label="Oferta" value={inspiration.offer} />
          <DetailBox label="Funil" value={inspiration.funnel} />
          <DetailBox label="Canal" value={inspiration.channel} />
          <DetailBox label="Formato" value={inspiration.format} />
        </div>

        <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Por que salvar</p>
          <p className="mt-2 text-sm leading-relaxed text-blue-950">{inspiration.whySave}</p>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tags</p>
          <div className="flex flex-wrap gap-2">
            {inspiration.tags.map(tag => <TagPill key={tag}>{tag}</TagPill>)}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Acoes</p>
          <div className="grid gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#2563EB] px-3 text-sm font-semibold text-white hover:bg-blue-700">
              <Sparkles className="h-4 w-4" />
              Gerar similar
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <FileImage className="h-4 w-4" />
              Criar brief
            </button>
            <Link to={centralHref} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100">
              <Send className="h-4 w-4" />
              Enviar para Central
            </Link>
            <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Target className="h-4 w-4" />
              Vincular campanha
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onApprove} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Aprovar
              </button>
              <button type="button" onClick={onRequestCuration} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                <Clock3 className="h-3.5 w-3.5" />
                Curadoria
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Fonte</p>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-[#141821]">{inspiration.sourceName}</span>
            <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
              Abrir origem
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Atualizado em {formatPortalDate(inspiration.updatedAt)}</p>
        </div>
      </div>
    </aside>
  )
}

function CreativePreview({ inspiration, compact = false }: { inspiration: InspirationItem; compact?: boolean }) {
  const height = compact ? 'h-24' : 'h-56'
  const outerPadding = compact ? 'p-2' : 'p-4'
  const innerPadding = compact ? 'p-2.5' : 'p-4'
  const headlineClass = compact ? 'text-sm leading-tight' : 'text-xl leading-tight'
  const metaClass = compact ? 'text-[9px] tracking-[0.12em]' : 'text-[11px] tracking-[0.18em]'
  const visualBlockClass = compact ? 'h-8' : 'h-10'

  if (inspiration.variant === 'report') {
    return (
      <div className={`${height} bg-[#10212d] ${outerPadding} text-white`}>
        <div className={`flex h-full flex-col justify-between rounded-md border border-white/10 bg-[#0b2b38] ${innerPadding}`}>
          <div className="flex items-center justify-between">
            <span className="rounded bg-cyan-300 px-2 py-1 text-[10px] font-bold text-[#10212d]">RELATORIO</span>
            <BarChart3 className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <p className={`${headlineClass} font-semibold`}>Vendas e marketing 2026</p>
            {!compact && <p className="mt-2 text-xs text-cyan-100">Benchmarks, tendencias e oportunidades.</p>}
          </div>
        </div>
      </div>
    )
  }

  if (inspiration.variant === 'reels' || inspiration.variant === 'video') {
    return (
      <div className={`${height} bg-slate-950 ${outerPadding} text-white`}>
        <div className={`flex h-full flex-col justify-between rounded-md border border-white/15 bg-gradient-to-br from-slate-900 to-slate-700 ${innerPadding}`}>
          <Video className="h-5 w-5 text-pink-300" />
          <div>
            <p className={`${metaClass} uppercase text-pink-200`}>Reels</p>
            <p className={`mt-2 ${headlineClass} font-semibold`}>Cliques nao pagam boleto.</p>
          </div>
          <div className="h-2 rounded-full bg-white/20">
            <div className="h-2 w-2/3 rounded-full bg-pink-400" />
          </div>
        </div>
      </div>
    )
  }

  if (inspiration.variant === 'copy') {
    return (
      <div className={`${height} bg-white ${outerPadding}`}>
        <div className={`h-full rounded-md border border-slate-300 bg-slate-50 ${innerPadding}`}>
          <Copy className="h-5 w-5 text-blue-600" />
          <p className={`mt-4 ${metaClass} font-semibold uppercase text-slate-500`}>Copy Ads</p>
          <p className={`mt-2 line-clamp-3 ${headlineClass} font-semibold text-[#141821]`}>A agenda esta cheia, mas o caixa nao acompanha?</p>
        </div>
      </div>
    )
  }

  const style = {
    'clinic-ad': 'from-slate-800 via-slate-700 to-emerald-100',
    'crm-before-after': 'from-blue-50 via-white to-slate-300',
    speed: 'from-amber-100 via-white to-blue-100',
    landing: 'from-indigo-100 via-white to-blue-100',
  }[inspiration.variant] || 'from-slate-100 via-white to-blue-100'

  return (
    <div className={`${height} bg-gradient-to-br ${style} ${outerPadding}`}>
      <div className={`flex h-full flex-col justify-between rounded-md border border-white/50 bg-white/75 ${innerPadding} shadow-sm backdrop-blur-sm`}>
        <div className="flex items-center justify-between">
          <span className="rounded-md bg-white px-2 py-1 text-[10px] font-bold text-blue-700">{inspiration.sourceName.slice(0, 3).toUpperCase()}</span>
          <Megaphone className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <p className={`${metaClass} font-semibold uppercase text-slate-500`}>{inspiration.channel}</p>
          <p className={`mt-2 line-clamp-4 max-w-[240px] ${headlineClass} font-semibold text-[#141821]`}>{inspiration.hook}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <span className={`${visualBlockClass} rounded-md bg-white/80 shadow-sm`} />
          <span className={`${visualBlockClass} rounded-md bg-blue-600/90 shadow-sm`} />
        </div>
      </div>
    </div>
  )
}

function ViewButton({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded px-2.5 text-xs font-semibold ${
        active ? 'bg-[#141821] text-white' : 'text-slate-600 hover:bg-white'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <span className="mt-0.5 block font-semibold text-[#141821]">{value}</span>
    </span>
  )
}

function MetaLine({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <p className={wide ? 'col-span-2' : undefined}>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <span className="mt-0.5 block truncate font-medium text-slate-700">{value}</span>
    </p>
  )
}

function DetailBox({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md border border-slate-200 bg-slate-50 p-3 ${wide ? 'col-span-2' : ''}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-800">{value}</p>
    </div>
  )
}

function StatusBadge({ label, tone }: { label: string; tone: 'blue' | 'violet' | 'magenta' | 'emerald' }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${accentClass(tone, 'soft')}`}>
      {label}
    </span>
  )
}

function TagPill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
      <Tag className="h-3 w-3" />
      {children}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
      <Image className="h-10 w-10 text-slate-300" />
      <h2 className="mt-4 text-base font-semibold text-[#141821]">Nenhuma inspiracao encontrada</h2>
      <p className="mt-2 max-w-md text-sm text-slate-500">Ajuste os filtros, importe uma referencia ou pesquise novos concorrentes.</p>
    </div>
  )
}

function suggestionToInspiration(suggestion: MarketingCampaignCreativeSuggestion): InspirationItem {
  return {
    id: `suggestion-${suggestion.id}`,
    title: suggestion.title,
    sourceName: 'Gerador de Criativos',
    channel: suggestion.provider === 'meta' ? 'Meta Ads' : 'Google Ads',
    format: 'Ads completa',
    objective: statusLabel(suggestion.objective),
    status: suggestion.status === 'approved' ? 'approved_reference' : suggestion.status === 'changes_requested' ? 'needs_curation' : 'analyzed',
    updatedAt: suggestion.updatedAt,
    hook: suggestion.angle || suggestion.title,
    offer: suggestion.cta || 'Oferta em validacao',
    funnel: statusLabel(suggestion.funnelStage),
    whySave: 'Sugestao gerada pelo Marketing Studio com contexto de campanha e qualidade para reaproveitamento.',
    description: suggestion.targetAudience || suggestion.angle || 'Sugestao de criativo pronta para curadoria.',
    tags: [suggestion.provider, suggestion.objective, suggestion.funnelStage],
    variant: 'clinic-ad',
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
    whySave: 'Criativo vinculado a campanha, util como referencia para novas variacoes.',
    description: creative.body || creative.headline || 'Criativo de campanha salvo na biblioteca.',
    tags: [creative.format, campaign.provider, campaign.objective],
    variant: creative.format === 'video' ? 'video' : 'crm-before-after',
  }
}

function statusText(status: InspirationStatus) {
  const labels: Record<InspirationStatus, string> = {
    saved: 'Salvo',
    analyzed: 'Analisado',
    needs_curation: 'Curadoria',
    approved_reference: 'Referencia aprovada',
    blocked: 'Nao usar',
  }

  return labels[status]
}

function statusTone(status: InspirationStatus): 'blue' | 'violet' | 'magenta' | 'emerald' {
  if (status === 'approved_reference') return 'emerald'
  if (status === 'needs_curation') return 'magenta'
  if (status === 'analyzed') return 'violet'
  return 'blue'
}

function marketingPulseIconClass(tone: MarketingPulseTone) {
  const map: Record<MarketingPulseTone, string> = {
    blue: 'text-[#2563EB]',
    violet: 'text-[#635BFF]',
    slate: 'text-slate-500',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
  }

  return map[tone]
}

function marketingPulseDetailClass(tone: MarketingPulseTone) {
  const map: Record<MarketingPulseTone, string> = {
    blue: 'text-slate-700',
    violet: 'text-[#635BFF]',
    slate: 'text-slate-600',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
  }

  return map[tone]
}

function accentClass(tone: 'blue' | 'violet' | 'magenta' | 'emerald', variant: 'soft' | 'solid' | 'muted') {
  const map = {
    blue: {
      soft: 'border-blue-200 bg-blue-50 text-blue-700',
      solid: 'bg-blue-600 text-white',
      muted: 'bg-blue-100 text-blue-700',
    },
    violet: {
      soft: 'border-violet-200 bg-violet-50 text-violet-700',
      solid: 'bg-violet-600 text-white',
      muted: 'bg-violet-100 text-violet-700',
    },
    magenta: {
      soft: 'border-pink-200 bg-pink-50 text-pink-700',
      solid: 'bg-pink-600 text-white',
      muted: 'bg-pink-100 text-pink-700',
    },
    emerald: {
      soft: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      solid: 'bg-emerald-600 text-white',
      muted: 'bg-emerald-100 text-emerald-700',
    },
  }

  return map[tone][variant]
}
