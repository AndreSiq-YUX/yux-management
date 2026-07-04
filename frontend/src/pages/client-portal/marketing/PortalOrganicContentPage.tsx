import { Link } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
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
import { useEffect, useMemo, useState } from 'react'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { formatPortalDate, statusLabel } from '@/lib/client-portal/portalDisplay'
import type {
  MarketingCampaignCreativeSuggestion,
  MarketingChannel,
  MarketingContentStatus,
  MarketingContentType,
  PortalMarketingContentItem,
} from '@/types/marketingStudio'
import type { PortalCampaign } from '@/types/campaign'

type LibraryView = 'gallery' | 'table' | 'kanban' | 'calendar'
type AssetStatus = MarketingContentStatus | 'waiting_approval' | 'used_in_campaign'
type AssetKind = 'creative' | 'post' | 'ad' | 'copy' | 'brief' | 'video' | 'email' | 'landing'
type PreviewVariant = 'diagnosis' | 'dashboard' | 'growth' | 'portrait' | 'copy' | 'video' | 'brief' | 'email'

interface ContentAsset {
  id: string
  title: string
  kind: AssetKind
  kindLabel: string
  channel: string
  status: AssetStatus
  origin: string
  campaign: string
  owner: string
  updatedAt: string
  description: string
  tags: string[]
  preview: PreviewVariant
  cta?: string
  sourceLabel?: string
}

const typeTabs = ['Todos', 'Criativos', 'Posts', 'Ads', 'Copies', 'Briefs', 'Videos', 'Aprovacao pendente', 'Publicado']

const statusOrder: Array<{ key: AssetStatus; label: string }> = [
  { key: 'draft', label: 'Rascunho' },
  { key: 'in_review', label: 'Em revisao YUX' },
  { key: 'waiting_approval', label: 'Aguardando aprovacao' },
  { key: 'changes_requested', label: 'Ajustes solicitados' },
  { key: 'approved', label: 'Aprovado' },
  { key: 'scheduled', label: 'Agendado' },
  { key: 'published', label: 'Publicado' },
  { key: 'used_in_campaign', label: 'Usado em campanha' },
]

const fallbackAssets: ContentAsset[] = [
  {
    id: 'sample-diagnostico-whatsapp',
    title: 'Criativo Meta Ads - Diagnostico WhatsApp',
    kind: 'creative',
    kindLabel: 'Criativo Meta Ads',
    channel: 'Meta Ads',
    status: 'waiting_approval',
    origin: 'Estudio de Automacoes',
    campaign: 'Diagnostico WhatsApp 48h',
    owner: 'YUX Growth',
    updatedAt: '2026-07-04T10:30:00.000Z',
    description: 'Peca visual para oferta de diagnostico rapido com foco em resposta comercial pelo WhatsApp.',
    tags: ['whatsapp', 'lead', 'clinicas'],
    preview: 'diagnosis',
    cta: 'Solicitar diagnostico gratuito',
  },
  {
    id: 'sample-dashboard',
    title: 'Carrossel LinkedIn - Operacao previsivel',
    kind: 'creative',
    kindLabel: 'Carrossel LinkedIn',
    channel: 'LinkedIn',
    status: 'approved',
    origin: 'Brief da YUX',
    campaign: 'Conteudo institucional',
    owner: 'Marketing / Growth',
    updatedAt: '2026-07-03T15:00:00.000Z',
    description: 'Sequencia educativa para mostrar antes e depois de uma operacao comercial organizada.',
    tags: ['linkedin', 'carrossel', 'crm'],
    preview: 'dashboard',
    cta: 'Ver conteudo completo',
  },
  {
    id: 'sample-copy-lp',
    title: 'Copy Landing Page - Diagnostico comercial',
    kind: 'copy',
    kindLabel: 'Copy Landing Page',
    channel: 'Landing Page',
    status: 'in_review',
    origin: 'Redator Multicanal',
    campaign: 'Diagnostico WhatsApp 48h',
    owner: 'YUX Copy',
    updatedAt: '2026-07-03T12:00:00.000Z',
    description: 'Hero, proposta de valor, provas, objecoes e CTA para captura de diagnostico.',
    tags: ['landing-page', 'copy', 'conversao'],
    preview: 'copy',
  },
  {
    id: 'sample-post-instagram',
    title: 'Post Instagram - 3 sinais de perda de leads',
    kind: 'post',
    kindLabel: 'Post Instagram',
    channel: 'Instagram',
    status: 'scheduled',
    origin: 'Calendario Editorial',
    campaign: 'Educacao comercial',
    owner: 'Social Media',
    updatedAt: '2026-07-02T18:00:00.000Z',
    description: 'Post educativo com CTA para revisar o atendimento e entender gargalos.',
    tags: ['instagram', 'organico', 'leads'],
    preview: 'growth',
    cta: 'Salvar post',
  },
  {
    id: 'sample-video',
    title: 'Roteiro Reels - Resposta rapida no WhatsApp',
    kind: 'video',
    kindLabel: 'Roteiro Reels',
    channel: 'Instagram Reels',
    status: 'changes_requested',
    origin: 'Gerador de Criativos',
    campaign: 'Diagnostico WhatsApp 48h',
    owner: 'Conteudo YUX',
    updatedAt: '2026-07-02T09:00:00.000Z',
    description: 'Roteiro curto com gancho, demonstracao do problema e chamada para diagnostico.',
    tags: ['reels', 'roteiro', 'whatsapp'],
    preview: 'video',
  },
  {
    id: 'sample-email',
    title: 'Email - Convite para diagnostico',
    kind: 'email',
    kindLabel: 'Email',
    channel: 'Email',
    status: 'published',
    origin: 'Upload manual',
    campaign: 'Reativacao de leads',
    owner: 'CRM / Marketing',
    updatedAt: '2026-07-01T11:20:00.000Z',
    description: 'Email de nutricao para leads antigos com convite para diagnostico gratuito.',
    tags: ['email', 'reativacao', 'crm'],
    preview: 'email',
  },
  {
    id: 'sample-brief',
    title: 'Brief Designer - Kit de anuncios',
    kind: 'brief',
    kindLabel: 'Brief Designer',
    channel: 'Design',
    status: 'draft',
    origin: 'Estudio de Automacoes',
    campaign: 'Kit Meta Ads',
    owner: 'YUX Design',
    updatedAt: '2026-06-30T16:00:00.000Z',
    description: 'Brief com formatos, referencias, copy principal e variacoes para criacao visual.',
    tags: ['brief', 'design', 'ads'],
    preview: 'brief',
  },
  {
    id: 'sample-portrait',
    title: 'Criativo Persona - Gestor sem follow-up',
    kind: 'ad',
    kindLabel: 'Ads completa',
    channel: 'Meta Ads',
    status: 'used_in_campaign',
    origin: 'Reaproveitamento de ativo',
    campaign: 'Follow-up comercial',
    owner: 'Performance',
    updatedAt: '2026-06-29T14:00:00.000Z',
    description: 'Peca ja usada em campanha para explicar perda de oportunidades por falta de retorno.',
    tags: ['ads', 'follow-up', 'performance'],
    preview: 'portrait',
  },
]

export function PortalOrganicContentPage() {
  const portalPath = usePortalWorkspacePath()
  const {
    loading,
    error,
    contents,
    campaigns,
    creativeSuggestions,
  } = usePortalMarketingContext({ includeCampaigns: true, includeOperations: true })
  const [view, setView] = useState<LibraryView>('gallery')
  const [activeType, setActiveType] = useState('Todos')
  const [query, setQuery] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, AssetStatus>>({})

  const assets = useMemo(() => {
    const mapped = [
      ...contents.map(contentToAsset),
      ...creativeSuggestions.map(suggestionToAsset),
      ...campaigns.flatMap(campaignToAssets),
    ]

    const byId = new Map<string, ContentAsset>()
    mapped.forEach(asset => byId.set(asset.id, asset))

    fallbackAssets.forEach(asset => {
      if (byId.size < 12) byId.set(asset.id, asset)
    })

    return Array.from(byId.values()).map(asset => ({
      ...asset,
      status: statusOverrides[asset.id] || asset.status,
    }))
  }, [campaigns, contents, creativeSuggestions, statusOverrides])

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return assets.filter(asset => {
      const matchesQuery = !normalizedQuery || [
        asset.title,
        asset.kindLabel,
        asset.channel,
        asset.status,
        asset.origin,
        asset.campaign,
        asset.owner,
        ...asset.tags,
      ].join(' ').toLowerCase().includes(normalizedQuery)

      const matchesType = activeType === 'Todos'
        || (activeType === 'Criativos' && asset.kind === 'creative')
        || (activeType === 'Posts' && asset.kind === 'post')
        || (activeType === 'Ads' && asset.kind === 'ad')
        || (activeType === 'Copies' && asset.kind === 'copy')
        || (activeType === 'Briefs' && asset.kind === 'brief')
        || (activeType === 'Videos' && asset.kind === 'video')
        || (activeType === 'Aprovacao pendente' && ['waiting_approval', 'in_review'].includes(asset.status))
        || (activeType === 'Publicado' && asset.status === 'published')

      return matchesQuery && matchesType
    })
  }, [activeType, assets, query])

  const selectedAsset = filteredAssets.find(asset => asset.id === selectedAssetId) || filteredAssets[0] || assets[0]

  useEffect(() => {
    if (!selectedAssetId && filteredAssets[0]) {
      setSelectedAssetId(filteredAssets[0].id)
    }
    if (selectedAssetId && filteredAssets.length > 0 && !filteredAssets.some(asset => asset.id === selectedAssetId)) {
      setSelectedAssetId(filteredAssets[0].id)
    }
  }, [filteredAssets, selectedAssetId])

  const metrics = [
    { label: 'Total de ativos', value: assets.length, detail: 'Biblioteca do contrato' },
    { label: 'Aguardando aprovacao', value: assets.filter(asset => ['waiting_approval', 'in_review'].includes(asset.status)).length, detail: 'Precisam de decisao' },
    { label: 'Aprovados', value: assets.filter(asset => asset.status === 'approved').length, detail: 'Prontos para uso' },
    { label: 'Publicados', value: assets.filter(asset => asset.status === 'published').length, detail: 'Ja distribuidos' },
    { label: 'Usados em campanha', value: assets.filter(asset => asset.status === 'used_in_campaign').length, detail: 'Vinculados a ads' },
  ]

  const updateSelectedStatus = (status: AssetStatus) => {
    if (!selectedAsset) return
    setStatusOverrides(current => ({ ...current, [selectedAsset.id]: status }))
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[#141821]">Central de Conteudo</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Biblioteca operacional de criativos, copies, posts, aprovacoes e ativos de campanha.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus className="h-4 w-4" />
            Novo conteudo
          </button>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="h-4 w-4" />
            Importar
          </button>
          <Link to={portalPath('/marketing/studio')} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#2563EB] px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
            <Sparkles className="h-4 w-4" />
            Gerar com IA
          </Link>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        {metrics.map(metric => (
          <article key={metric.label} className="rounded-md border border-slate-300 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-[#141821]">{metric.value}</p>
            <p className="mt-1 text-xs text-slate-500">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-md border border-slate-300 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="h-11 w-full rounded-md border border-slate-300 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="Buscar por titulo, canal, campanha, origem ou tag..."
            />
          </div>
          <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-1">
            <ViewButton icon={Grid2X2} label="Galeria" active={view === 'gallery'} onClick={() => setView('gallery')} />
            <ViewButton icon={Table2} label="Tabela" active={view === 'table'} onClick={() => setView('table')} />
            <ViewButton icon={Columns} label="Kanban" active={view === 'kanban'} onClick={() => setView('kanban')} />
            <ViewButton icon={CalendarDays} label="Calendario" active={view === 'calendar'} onClick={() => setView('calendar')} />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-200 p-4">
          <div className="flex flex-wrap gap-2">
            {typeTabs.map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveType(tab)}
                className={`h-8 rounded-md border px-3 text-xs font-semibold transition ${
                  activeType === tab
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros
            </span>
            {['Canal: todos', 'Status: todos', 'Origem: todas', 'Campanha: todas', 'Tags: todas'].map(filter => (
              <button key={filter} type="button" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 hover:border-blue-300 hover:bg-blue-50">
                {filter}
              </button>
            ))}
          </div>
        </div>

      </section>

      {loading ? (
        <section className="rounded-md border border-slate-300 bg-white p-5 text-sm text-slate-600">Carregando Central de Conteudo...</section>
      ) : error ? (
        <section className="rounded-md border border-red-200 bg-white p-5 text-sm text-red-600">{error}</section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-4">
              {view === 'gallery' && (
                <GalleryView assets={filteredAssets} selectedId={selectedAsset?.id} onSelect={setSelectedAssetId} />
              )}
              {view === 'table' && (
                <TableView assets={filteredAssets} selectedId={selectedAsset?.id} onSelect={setSelectedAssetId} />
              )}
              {view === 'kanban' && (
                <KanbanView assets={filteredAssets} selectedId={selectedAsset?.id} onSelect={setSelectedAssetId} />
              )}
              {view === 'calendar' && (
                <CalendarView assets={filteredAssets} selectedId={selectedAsset?.id} onSelect={setSelectedAssetId} />
              )}
            </div>
            <AssetInspector asset={selectedAsset} onApprove={() => updateSelectedStatus('approved')} onRequestChanges={() => updateSelectedStatus('changes_requested')} />
        </section>
      )}
    </div>
  )
}

function GalleryView({ assets, selectedId, onSelect }: { assets: ContentAsset[]; selectedId?: string; onSelect: (id: string) => void }) {
  if (!assets.length) return <EmptyContentState />

  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {assets.map(asset => (
        <AssetCard key={asset.id} asset={asset} selected={asset.id === selectedId} onSelect={() => onSelect(asset.id)} />
      ))}
    </div>
  )
}

function TableView({ assets, selectedId, onSelect }: { assets: ContentAsset[]; selectedId?: string; onSelect: (id: string) => void }) {
  if (!assets.length) return <EmptyContentState />

  return (
    <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
      <div className="overflow-auto">
      <table className="min-w-[980px] w-full border-collapse text-sm">
        <thead className="bg-[#f4f4f4] text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          <tr>
            <th className="px-4 py-3">Ativo</th>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Canal</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Origem</th>
            <th className="px-4 py-3">Campanha</th>
            <th className="px-4 py-3">Atualizado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {assets.map(asset => (
            <tr key={asset.id} onClick={() => onSelect(asset.id)} className={`cursor-pointer hover:bg-blue-50/50 ${asset.id === selectedId ? 'bg-blue-50' : 'bg-white'}`}>
              <td className="px-4 py-3">
                <p className="font-semibold text-[#141821]">{asset.title}</p>
                <p className="mt-1 line-clamp-1 text-xs text-slate-500">{asset.description}</p>
              </td>
              <td className="px-4 py-3 text-slate-700">{asset.kindLabel}</td>
              <td className="px-4 py-3 text-slate-700">{asset.channel}</td>
              <td className="px-4 py-3"><StatusBadge status={asset.status} /></td>
              <td className="px-4 py-3 text-slate-700">{asset.origin}</td>
              <td className="px-4 py-3 text-slate-700">{asset.campaign}</td>
              <td className="px-4 py-3 text-slate-500">{formatPortalDate(asset.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}

function KanbanView({ assets, selectedId, onSelect }: { assets: ContentAsset[]; selectedId?: string; onSelect: (id: string) => void }) {
  if (!assets.length) return <EmptyContentState />

  const columns = statusOrder
    .map(status => ({ ...status, assets: assets.filter(asset => asset.status === status.key) }))
    .filter(column => column.assets.length > 0)

  return (
    <div className="grid min-h-[520px] auto-cols-[280px] grid-flow-col gap-3 overflow-auto">
      {columns.map(column => (
        <section key={column.key} className="rounded-md border border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">{column.label}</p>
            <span className="rounded-md bg-white px-2 py-0.5 text-xs text-slate-500">{column.assets.length}</span>
          </div>
          <div className="space-y-2 p-3">
            {column.assets.map(asset => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelect(asset.id)}
                className={`w-full rounded-md border bg-white p-3 text-left shadow-sm hover:border-blue-300 ${asset.id === selectedId ? 'border-blue-500 ring-4 ring-blue-100' : 'border-slate-200'}`}
              >
                <p className="text-sm font-semibold text-[#141821]">{asset.title}</p>
                <p className="mt-1 text-xs text-slate-500">{asset.kindLabel} / {asset.channel}</p>
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

function CalendarView({ assets, selectedId, onSelect }: { assets: ContentAsset[]; selectedId?: string; onSelect: (id: string) => void }) {
  if (!assets.length) return <EmptyContentState />

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {['Esta semana', 'Proximos 15 dias', 'Publicados recentes'].map((period, index) => (
        <section key={period} className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{period}</p>
          </div>
          <div className="space-y-2 p-3">
            {assets.slice(index * 3, index * 3 + 4).map(asset => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelect(asset.id)}
                className={`flex w-full items-start gap-3 rounded-md border p-3 text-left hover:border-blue-300 ${asset.id === selectedId ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
              >
                <Clock3 className="mt-0.5 h-4 w-4 text-slate-500" />
                <span>
                  <span className="block text-sm font-semibold text-[#141821]">{asset.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">{formatPortalDate(asset.updatedAt)} / {asset.channel}</span>
                </span>
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
      className={`group overflow-hidden rounded-md border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md ${
        selected ? 'border-blue-500 ring-4 ring-blue-100' : 'border-slate-200'
      }`}
    >
      <AssetPreview asset={asset} compact />
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={asset.kind} label={asset.kindLabel} />
          <StatusBadge status={asset.status} />
        </div>
        <div>
          <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-[#141821]">{asset.title}</h2>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{asset.description}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
          <MetaLine label="Canal" value={asset.channel} />
          <MetaLine label="Origem" value={asset.origin} />
          <MetaLine label="Campanha" value={asset.campaign} wide />
        </div>
      </div>
    </button>
  )
}

function AssetInspector({ asset, onApprove, onRequestChanges }: { asset?: ContentAsset; onApprove: () => void; onRequestChanges: () => void }) {
  if (!asset) {
    return (
      <aside className="self-start rounded-md border border-slate-300 bg-white p-5">
        <p className="text-sm text-slate-600">Selecione um ativo para ver detalhes.</p>
      </aside>
    )
  }

  return (
    <aside className="self-start rounded-md border border-slate-300 bg-white p-4 xl:sticky xl:top-4">
      <div className="overflow-hidden rounded-md border border-slate-300">
        <AssetPreview asset={asset} />
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <KindBadge kind={asset.kind} label={asset.kindLabel} />
            <StatusBadge status={asset.status} />
          </div>
          <h2 className="mt-3 text-lg font-semibold leading-snug text-[#141821]">{asset.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{asset.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <DetailBox label="Origem" value={asset.origin} />
          <DetailBox label="Canal" value={asset.channel} />
          <DetailBox label="Campanha" value={asset.campaign} />
          <DetailBox label="Responsavel" value={asset.owner} />
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tags</p>
          <div className="flex flex-wrap gap-2">
            {asset.tags.map(tag => <TagPill key={tag}>{tag}</TagPill>)}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Acoes</p>
          <div className="grid gap-2">
            <button type="button" onClick={onApprove} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Aprovar
            </button>
            <button type="button" onClick={onRequestChanges} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-700 hover:bg-amber-100">
              <MessageSquare className="h-4 w-4" />
              Pedir ajustes
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Copy className="h-4 w-4" />
              Gerar variacao
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100">
              <Send className="h-4 w-4" />
              Enviar para campanha
            </button>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Linha do tempo</p>
          <div className="mt-3 space-y-3">
            {[
              ['Gerado por IA', asset.origin],
              ['Revisado pela YUX', asset.owner],
              ['Aguardando cliente', statusText(asset.status)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-blue-600" />
                <p className="text-xs text-slate-600"><span className="font-semibold text-slate-900">{label}</span><br />{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

function AssetPreview({ asset, compact = false }: { asset: ContentAsset; compact?: boolean }) {
  const height = compact ? 'h-48' : 'h-64'
  const iconClass = 'h-5 w-5'
  const outerPadding = compact ? 'p-4' : 'p-5'
  const innerPadding = compact ? 'p-3.5' : 'p-4'
  const headlineClass = compact ? 'text-xl leading-tight' : 'text-2xl leading-tight'
  const metaClass = compact ? 'text-[11px] tracking-[0.16em]' : 'text-xs tracking-[0.2em]'
  const visualBlockClass = compact ? 'h-12' : 'h-14'

  if (asset.preview === 'copy') {
    return (
      <div className={`${height} bg-[#141821] ${outerPadding} text-white`}>
        <FileText className={iconClass} />
        <p className={`mt-5 ${metaClass} uppercase text-blue-200`}>Landing page</p>
        <p className={`mt-3 line-clamp-3 ${headlineClass} font-semibold`}>Diagnostico comercial em 48h</p>
        {!compact && <p className="mt-3 max-w-xs text-sm text-slate-300">Identifique gargalos, follow-ups perdidos e oportunidades de conversao.</p>}
      </div>
    )
  }

  if (asset.preview === 'video') {
    return (
      <div className={`${height} bg-slate-900 ${outerPadding} text-white`}>
        <div className={`flex h-full flex-col justify-between rounded-md border border-white/15 bg-slate-800 ${innerPadding}`}>
          <Video className={iconClass} />
          <div>
            <p className={`${metaClass} uppercase text-amber-200`}>Roteiro Reels</p>
            <p className={`mt-2 line-clamp-3 ${headlineClass} font-semibold`}>Seu WhatsApp demora a responder?</p>
          </div>
          <div className="h-2 rounded-full bg-white/20"><div className="h-2 w-2/3 rounded-full bg-amber-400" /></div>
        </div>
      </div>
    )
  }

  if (asset.preview === 'email') {
    return (
      <div className={`${height} bg-slate-100 ${outerPadding}`}>
        <div className={`h-full rounded-md border border-slate-300 bg-white ${innerPadding} shadow-sm`}>
          <Mail className="h-5 w-5 text-blue-600" />
          <p className={`mt-4 ${metaClass} font-semibold uppercase text-slate-500`}>Email</p>
          <p className="mt-2 line-clamp-3 text-lg font-semibold text-[#141821]">Convite para diagnostico gratuito</p>
          <div className="mt-4 space-y-2">
            <span className="block h-2 rounded bg-slate-200" />
            <span className="block h-2 w-4/5 rounded bg-slate-200" />
            <span className="block h-8 w-36 rounded bg-blue-600" />
          </div>
        </div>
      </div>
    )
  }

  if (asset.preview === 'brief') {
    return (
      <div className={`${height} bg-[#f4f4f4] ${outerPadding}`}>
        <div className={`h-full rounded-md border border-slate-300 bg-white ${innerPadding}`}>
          <Layers3 className="h-5 w-5 text-[#B449A6]" />
          <p className={`mt-4 ${metaClass} font-semibold uppercase text-slate-500`}>Brief designer</p>
          <p className="mt-2 text-lg font-semibold text-[#141821]">Kit de anuncios</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <span className="h-14 rounded bg-blue-100" />
            <span className="h-14 rounded bg-violet-100" />
            <span className="h-14 rounded bg-pink-100" />
          </div>
        </div>
      </div>
    )
  }

  const previewStyles = {
    diagnosis: 'from-slate-800 via-slate-700 to-emerald-100',
    dashboard: 'from-blue-50 via-white to-slate-200',
    growth: 'from-emerald-100 via-white to-blue-100',
    portrait: 'from-slate-950 via-slate-800 to-blue-700',
  }[asset.preview] || 'from-slate-100 via-white to-blue-100'

  return (
    <div className={`${height} bg-gradient-to-br ${previewStyles} ${outerPadding}`}>
      <div className={`flex h-full flex-col justify-between rounded-md border border-white/40 bg-white/70 ${innerPadding} shadow-sm backdrop-blur-sm`}>
        <div className="flex items-center justify-between">
          <span className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-blue-700">YUX</span>
          <BarChart3 className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <p className={`${metaClass} font-semibold uppercase text-slate-500`}>{asset.channel}</p>
          <p className={`mt-2 line-clamp-3 max-w-[240px] ${headlineClass} font-semibold text-[#141821]`}>{asset.title.replace(' - ', ': ')}</p>
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
      className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold ${active ? 'bg-[#141821] text-white' : 'text-slate-600 hover:bg-white'}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function KindBadge({ kind, label }: { kind: AssetKind; label: string }) {
  const Icon = kindIcon(kind)
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: AssetStatus }) {
  const className = {
    draft: 'border-slate-200 bg-slate-50 text-slate-600',
    in_review: 'border-blue-200 bg-blue-50 text-blue-700',
    waiting_approval: 'border-amber-200 bg-amber-50 text-amber-700',
    changes_requested: 'border-orange-200 bg-orange-50 text-orange-700',
    approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    scheduled: 'border-violet-200 bg-violet-50 text-violet-700',
    published: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    used_in_campaign: 'border-pink-200 bg-pink-50 text-pink-700',
    rejected: 'border-red-200 bg-red-50 text-red-700',
    archived: 'border-slate-200 bg-slate-100 text-slate-500',
  }[status] || 'border-slate-200 bg-slate-50 text-slate-600'

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${className}`}>
      {statusText(status)}
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

function DetailBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-800">{value}</p>
    </div>
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

function EmptyContentState() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
      <Layers3 className="h-10 w-10 text-slate-300" />
      <h2 className="mt-4 text-base font-semibold text-[#141821]">Nenhum ativo encontrado</h2>
      <p className="mt-2 max-w-md text-sm text-slate-500">Ajuste os filtros ou gere novos conteudos pelo Estudio de Automacoes.</p>
    </div>
  )
}

function contentToAsset(content: PortalMarketingContentItem): ContentAsset {
  const type = contentTypeInfo(content.contentType)
  return {
    id: `content-${content.id}`,
    title: content.title,
    kind: type.kind,
    kindLabel: type.label,
    channel: channelLabel(content.channel),
    status: content.status,
    origin: content.createdByAgentId ? 'Estudio de Automacoes' : 'Upload manual',
    campaign: content.campaignId || content.landingPageId || 'Sem campanha vinculada',
    owner: content.approvedBy || 'YUX Marketing',
    updatedAt: content.updatedAt,
    description: content.brief || content.body || 'Ativo do Marketing Studio pronto para revisao e organizacao.',
    tags: [type.label.toLowerCase(), channelLabel(content.channel).toLowerCase(), statusText(content.status).toLowerCase()],
    preview: type.preview,
    cta: content.cta,
  }
}

function suggestionToAsset(suggestion: MarketingCampaignCreativeSuggestion): ContentAsset {
  return {
    id: `suggestion-${suggestion.id}`,
    title: suggestion.title,
    kind: 'ad',
    kindLabel: 'Ads completa',
    channel: suggestion.provider === 'meta' ? 'Meta Ads' : 'Google Ads',
    status: suggestion.status === 'converted' ? 'used_in_campaign' : suggestion.status,
    origin: 'Gerador de Criativos',
    campaign: suggestion.campaignName,
    owner: 'Performance / Growth',
    updatedAt: suggestion.updatedAt,
    description: suggestion.angle || suggestion.targetAudience,
    tags: [suggestion.objective, suggestion.funnelStage, suggestion.provider],
    preview: 'diagnosis',
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
    owner: 'Performance',
    updatedAt: creative.updatedAt,
    description: creative.headline || creative.body || 'Criativo vinculado a campanha ativa.',
    tags: [creative.format, campaign.provider],
    preview: 'portrait',
  }))
}

function contentTypeInfo(type: MarketingContentType): { kind: AssetKind; label: string; preview: PreviewVariant } {
  const map: Record<MarketingContentType, { kind: AssetKind; label: string; preview: PreviewVariant }> = {
    social_post: { kind: 'post', label: 'Post', preview: 'growth' },
    blog_article: { kind: 'copy', label: 'Artigo', preview: 'copy' },
    newsletter: { kind: 'email', label: 'Newsletter', preview: 'email' },
    email: { kind: 'email', label: 'Email', preview: 'email' },
    ad_copy: { kind: 'ad', label: 'Copy Ads', preview: 'diagnosis' },
    video_script: { kind: 'video', label: 'Roteiro Video', preview: 'video' },
    carousel_text: { kind: 'creative', label: 'Carrossel', preview: 'dashboard' },
    creative_brief: { kind: 'brief', label: 'Brief', preview: 'brief' },
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

function channelLabel(channel?: MarketingChannel | string) {
  if (!channel) return 'Canal nao informado'
  const labels: Record<string, string> = {
    linkedin: 'LinkedIn',
    instagram: 'Instagram',
    blog: 'Blog',
    newsletter: 'Newsletter',
    email: 'Email',
    ad: 'Ads',
    video_script: 'Video',
    carousel: 'Carrossel',
    whatsapp_broadcast: 'WhatsApp',
  }

  return labels[channel] || statusLabel(channel)
}

function statusText(status: AssetStatus) {
  if (status === 'waiting_approval') return 'Aguardando aprovacao'
  if (status === 'used_in_campaign') return 'Usado em campanha'
  return statusLabel(status)
}
