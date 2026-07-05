import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  Filter,
  Gauge,
  LineChart,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PortalCampaign } from '@/types/campaign'
import type { ContractDetails } from '@/types/platform'

type CampaignTab = 'all' | 'active' | 'approval' | 'issues' | 'opportunities' | 'drafts'
type CampaignRowLevel = 'campaign' | 'adset' | 'ad' | 'creative'
type CampaignHealth = 'healthy' | 'learning' | 'attention' | 'critical' | 'paused'
type CampaignChannel = 'Meta Ads' | 'Google Ads'

interface PortalCampaignsWorkspaceProps {
  contract: ContractDetails
  campaigns: PortalCampaign[]
  onRequestChange: (campaignId?: string) => void
}

interface CampaignTableRow {
  id: string
  parentId?: string
  level: CampaignRowLevel
  name: string
  subtitle: string
  channel: CampaignChannel
  status: string
  objective: string
  budget: string
  spend: number
  impressions: number
  clicks: number
  leads: number
  cpl: number
  revenue: number
  mroi: number
  health: CampaignHealth
  sync: string
  owner: string
  tracking: 'ok' | 'warning' | 'critical'
  recommendation: {
    title: string
    description: string
    impact: 'Alto' | 'Medio' | 'Baixo'
    confidence: 'Alta' | 'Media' | 'Baixa'
  }
}

interface PulseMetric {
  label: string
  value: string
  detail: string
  icon: LucideIcon
  tone: 'blue' | 'emerald' | 'amber' | 'red' | 'slate'
}

const tabs: Array<{ key: CampaignTab; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'active', label: 'Ativas' },
  { key: 'approval', label: 'Em aprovacao' },
  { key: 'issues', label: 'Com problemas' },
  { key: 'opportunities', label: 'Oportunidades' },
  { key: 'drafts', label: 'Rascunhos' },
]

const demoRows: CampaignTableRow[] = [
  {
    id: 'diagnostico-whatsapp',
    level: 'campaign',
    name: 'Diagnostico WhatsApp 48h',
    subtitle: 'Oferta de diagnostico rapido para clinicas',
    channel: 'Meta Ads',
    status: 'Ativa',
    objective: 'Geracao de leads',
    budget: 'R$ 250/dia',
    spend: 5420,
    impressions: 184200,
    clicks: 5342,
    leads: 48,
    cpl: 113,
    revenue: 18900,
    mroi: 2.5,
    health: 'attention',
    sync: 'Agora',
    owner: 'YUX Growth',
    tracking: 'warning',
    recommendation: {
      title: 'Criar variacao do criativo vencedor',
      description: 'CTR 31% acima da media, mas a frequencia esta subindo. Teste nova abordagem antes de escalar.',
      impact: 'Alto',
      confidence: 'Media',
    },
  },
  {
    id: 'diagnostico-adset-clinicas',
    parentId: 'diagnostico-whatsapp',
    level: 'adset',
    name: 'Publico clinicas particulares',
    subtitle: 'Lookalike + interesses de gestao de clinicas',
    channel: 'Meta Ads',
    status: 'Ativo',
    objective: 'Lead ads',
    budget: 'R$ 150/dia',
    spend: 3240,
    impressions: 109400,
    clicks: 3278,
    leads: 31,
    cpl: 105,
    revenue: 12300,
    mroi: 2.8,
    health: 'learning',
    sync: '12 min',
    owner: 'YUX Growth',
    tracking: 'ok',
    recommendation: {
      title: 'Manter aprendizado por mais 24h',
      description: 'O conjunto ainda esta estabilizando, mas o CPL esta abaixo da media da campanha.',
      impact: 'Medio',
      confidence: 'Media',
    },
  },
  {
    id: 'diagnostico-ad-dor-v3',
    parentId: 'diagnostico-adset-clinicas',
    level: 'ad',
    name: 'Criativo dor operacional v3',
    subtitle: 'Imagem estatica 4:5 com CTA para diagnostico',
    channel: 'Meta Ads',
    status: 'Ativo',
    objective: 'Criativo principal',
    budget: '-',
    spend: 1890,
    impressions: 52600,
    clicks: 1713,
    leads: 22,
    cpl: 86,
    revenue: 9200,
    mroi: 3.9,
    health: 'healthy',
    sync: '12 min',
    owner: 'YUX Creative',
    tracking: 'ok',
    recommendation: {
      title: 'Duplicar abordagem para novo teste',
      description: 'Criativo com melhor CPL e maior volume. Gerar variacao reduz risco de saturacao.',
      impact: 'Alto',
      confidence: 'Alta',
    },
  },
  {
    id: 'relatorio-bi',
    level: 'campaign',
    name: 'Relatorio BI para gestores',
    subtitle: 'Captura de demanda para relatorios executivos',
    channel: 'Google Ads',
    status: 'Em aprendizado',
    objective: 'Search - leads',
    budget: 'R$ 180/dia',
    spend: 3120,
    impressions: 46400,
    clicks: 1280,
    leads: 26,
    cpl: 120,
    revenue: 14700,
    mroi: 3.7,
    health: 'learning',
    sync: '18 min',
    owner: 'YUX Growth',
    tracking: 'ok',
    recommendation: {
      title: 'Adicionar extensoes de prova',
      description: 'A campanha tem bom volume, mas pode ganhar qualidade com prova social e sitelinks.',
      impact: 'Medio',
      confidence: 'Media',
    },
  },
  {
    id: 'remarketing-proposta',
    level: 'campaign',
    name: 'Remarketing proposta comercial',
    subtitle: 'Retorno para leads que visualizaram proposta',
    channel: 'Meta Ads',
    status: 'Com erro',
    objective: 'Remarketing',
    budget: 'R$ 90/dia',
    spend: 820,
    impressions: 31800,
    clicks: 502,
    leads: 4,
    cpl: 205,
    revenue: 0,
    mroi: -1,
    health: 'critical',
    sync: '2h',
    owner: 'Operacao / CS',
    tracking: 'critical',
    recommendation: {
      title: 'Corrigir tracking antes de escalar',
      description: 'A campanha esta ativa, mas o evento de conversao nao foi confirmado nas ultimas 24h.',
      impact: 'Alto',
      confidence: 'Alta',
    },
  },
  {
    id: 'institucional-growth',
    level: 'campaign',
    name: 'Institucional Growth',
    subtitle: 'Reconhecimento para mercado regional',
    channel: 'Google Ads',
    status: 'Pausada',
    objective: 'Awareness',
    budget: 'R$ 120/dia',
    spend: 940,
    impressions: 76200,
    clicks: 610,
    leads: 3,
    cpl: 313,
    revenue: 0,
    mroi: -1,
    health: 'paused',
    sync: 'Ontem',
    owner: 'Cliente',
    tracking: 'warning',
    recommendation: {
      title: 'Revisar objetivo antes de reativar',
      description: 'A campanha gerou alcance, mas pouco impacto comercial. Reativar apenas com nova oferta.',
      impact: 'Medio',
      confidence: 'Media',
    },
  },
]

export function PortalCampaignsWorkspace({ contract, campaigns, onRequestChange }: PortalCampaignsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<CampaignTab>('all')
  const [dateRange, setDateRange] = useState('7 dias')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>()

  const rows = useMemo(() => buildRows(campaigns), [campaigns])
  const filteredRows = useMemo(() => filterRows(rows, activeTab, query), [activeTab, query, rows])
  const selectedRow = rows.find(row => row.id === selectedId) || filteredRows[0] || rows[0]
  const summary = useMemo(() => buildSummary(rows), [rows])

  const pulseMetrics: PulseMetric[] = [
    { label: 'Campanhas ativas', value: String(summary.active), detail: `${summary.learning} em aprendizado`, icon: Megaphone, tone: 'blue' },
    { label: 'Investimento', value: formatCurrency(summary.spend), detail: dateRange, icon: TrendingUp, tone: 'slate' },
    { label: 'Leads', value: String(summary.leads), detail: `CPL medio ${formatCurrency(summary.cpl)}`, icon: Target, tone: 'emerald' },
    { label: 'MROI', value: `${summary.mroi.toFixed(1)}x`, detail: '+14% vs periodo anterior', icon: LineChart, tone: 'blue' },
    { label: 'Atencao', value: String(summary.attention), detail: `${summary.critical} criticos`, icon: AlertTriangle, tone: summary.critical > 0 ? 'red' : 'amber' },
  ]

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] space-y-5 bg-[#f4f4f4] px-4 py-5 text-[#141821] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-300 pb-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold leading-tight text-slate-950">Campanhas e Anuncios</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Gestao de campanhas pagas, criativos, orcamento, tracking e resultados comerciais.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <MetaChip icon={Megaphone} label={`Contrato: ${contract.name || 'Growth Comercial'}`} />
            <span className="text-slate-400">+</span>
            <MetaChip icon={ShieldCheck} label="Meta e Google conectados" />
            <MetaChip icon={Clock3} label="Atualizado agora" />
            <MetaChip icon={AlertTriangle} label={`${summary.attention} itens exigem atencao`} tone={summary.attention > 0 ? 'amber' : 'slate'} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white text-sm shadow-sm">
            {['Hoje', '7 dias', '30 dias'].map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={dateRange === option}
                onClick={() => setDateRange(option)}
                className={`h-10 px-4 ${dateRange === option ? 'bg-slate-950 font-semibold text-white' : 'font-normal text-slate-700 hover:bg-slate-50'}`}
              >
                {option}
              </button>
            ))}
          </div>
          <Button title="Atualizar dados" variant="outline" className="h-10 border-slate-300 bg-white">
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar dados
          </Button>
          <Button title="Nova campanha" className="h-10 bg-[#2563EB] hover:bg-blue-700" onClick={() => onRequestChange()}>
            <Plus className="mr-2 h-4 w-4" />
            Nova campanha
          </Button>
        </div>
      </header>

      <section className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <div className="flex items-center justify-between border-b border-slate-300 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">Pulso de Midia</p>
          <Gauge className="h-4 w-4 text-slate-500" />
        </div>
        <div className="grid md:grid-cols-5">
          {pulseMetrics.map((metric, index) => (
            <PulseStat key={metric.label} metric={metric} withDivider={index > 0} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 overflow-hidden rounded-md border border-slate-300 bg-white">
          <div className="space-y-4 border-b border-slate-300 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex max-w-full gap-2 overflow-x-auto">
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`h-9 shrink-0 rounded-sm border px-3 text-xs font-semibold ${
                      activeTab === tab.key
                        ? 'border-[#2563EB] bg-[#2563EB] text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {['Canal', 'Status', 'Objetivo', 'Saude', 'Responsavel'].map(filter => (
                  <button
                    key={filter}
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-sm border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Buscar campanha, anuncio, criativo ou tag..."
                className="h-11 w-full rounded-md border border-slate-300 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white"
              />
            </div>
          </div>

          <CampaignTable rows={filteredRows} selectedId={selectedRow?.id} onSelect={setSelectedId} />
        </section>

        <CampaignInspector row={selectedRow} />
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <ActionCard tone="red" icon={AlertTriangle} title="Erros de publicacao" value={String(summary.critical)} description="Itens bloqueando tracking, sync ou publicacao." />
        <ActionCard tone="blue" icon={Sparkles} title="Recomendacoes abertas" value={String(Math.max(3, summary.attention + 1))} description="Acoes sugeridas pela inteligencia YUX." />
        <ActionCard tone="amber" icon={Activity} title="Campanhas sem tracking" value={String(summary.trackingIssues)} description="Revisar pixel, UTM ou vinculacao com CRM." />
      </section>
    </div>
  )
}

function CampaignTable({ rows, selectedId, onSelect }: { rows: CampaignTableRow[]; selectedId?: string; onSelect: (id: string) => void }) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-16 text-center">
        <Megaphone className="h-8 w-8 text-slate-400" />
        <h2 className="mt-4 text-lg font-semibold text-slate-950">Nenhuma campanha encontrada</h2>
        <p className="mt-2 max-w-md text-sm text-slate-500">Ajuste filtros ou crie uma nova campanha para iniciar o acompanhamento operacional.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
        <thead className="bg-[#f4f4f4] text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="w-[330px] px-4 py-3">Nome</th>
            <th className="px-3 py-3">Canal</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3 text-right">Orcamento</th>
            <th className="px-3 py-3 text-right">Gasto</th>
            <th className="px-3 py-3 text-right">CTR</th>
            <th className="px-3 py-3 text-right">Leads</th>
            <th className="px-3 py-3 text-right">CPL</th>
            <th className="px-3 py-3 text-right">Receita</th>
            <th className="px-3 py-3 text-right">MROI</th>
            <th className="px-3 py-3">Saude</th>
            <th className="px-3 py-3">Sync</th>
            <th className="px-4 py-3 text-right">Acoes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map(row => (
            <tr
              key={row.id}
              onClick={() => onSelect(row.id)}
              className={`cursor-pointer transition hover:bg-blue-50/50 ${selectedId === row.id ? 'bg-blue-50' : 'bg-white'} ${row.level === 'campaign' ? 'font-medium' : ''}`}
            >
              <td className="px-4 py-3">
                <div className={`flex items-start gap-2 ${indentClass(row.level)}`}>
                  {row.level === 'campaign' ? <ChevronDown className="mt-0.5 h-4 w-4 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 text-slate-300" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${healthDotClass(row.health)}`} />
                      <p className="truncate text-slate-950">{row.name}</p>
                    </div>
                    <p className="mt-1 truncate text-xs font-normal text-slate-500">{row.subtitle}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3"><ChannelBadge channel={row.channel} /></td>
              <td className="px-3 py-3"><StatusBadge status={row.status} health={row.health} /></td>
              <td className="px-3 py-3 text-right text-slate-700">{row.budget}</td>
              <td className="px-3 py-3 text-right text-slate-700">{formatCurrency(row.spend)}</td>
              <td className="px-3 py-3 text-right text-slate-700">{calculateCtr(row)}%</td>
              <td className="px-3 py-3 text-right text-slate-950">{row.leads}</td>
              <td className="px-3 py-3 text-right text-slate-700">{formatCurrency(row.cpl)}</td>
              <td className="px-3 py-3 text-right text-slate-700">{formatCurrency(row.revenue)}</td>
              <td className={`px-3 py-3 text-right ${row.mroi >= 1 ? 'text-emerald-700' : 'text-amber-700'}`}>{row.mroi.toFixed(1)}x</td>
              <td className="px-3 py-3"><HealthBadge health={row.health} /></td>
              <td className="px-3 py-3 text-xs text-slate-500">{row.sync}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <IconAction label="Ver detalhes" icon={Eye} />
                  <IconAction label="Duplicar" icon={Copy} />
                  <IconAction label={row.health === 'paused' ? 'Ativar' : 'Pausar'} icon={row.health === 'paused' ? Play : Pause} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CampaignInspector({ row }: { row?: CampaignTableRow }) {
  if (!row) {
    return (
      <aside className="rounded-md border border-slate-300 bg-white p-5">
        <p className="text-sm text-slate-500">Selecione uma campanha para ver detalhes.</p>
      </aside>
    )
  }

  const checklist = [
    { label: 'Conta de anuncios conectada', status: 'ok' },
    { label: 'Criativos aprovados', status: row.health === 'critical' ? 'warning' : 'ok' },
    { label: 'Pixel confirmado', status: row.tracking === 'ok' ? 'ok' : row.tracking },
    { label: 'UTM e CRM vinculados', status: row.tracking === 'critical' ? 'critical' : 'ok' },
    { label: 'Budget aprovado', status: row.status === 'Em aprovacao' ? 'warning' : 'ok' },
  ] as const

  return (
    <aside className="rounded-md border border-slate-300 border-l-2 border-l-[#2563EB] bg-white shadow-sm">
      <div className="border-b border-slate-300 bg-slate-50 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Prontidao e recomendacoes</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">{row.name}</h2>
        <p className="mt-1 text-sm text-slate-600">{row.subtitle}</p>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-2">
          <InspectorMetric label="Canal" value={row.channel} />
          <InspectorMetric label="Status" value={row.status} />
          <InspectorMetric label="Gasto" value={formatCurrency(row.spend)} />
          <InspectorMetric label="Leads" value={String(row.leads)} />
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Checklist de publicacao</p>
          <div className="mt-3 space-y-2">
            {checklist.map(item => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-700">{item.label}</span>
                {item.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                {item.status === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                {item.status === 'critical' && <AlertTriangle className="h-4 w-4 text-red-600" />}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-blue-200 bg-blue-50/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-950">
            <Sparkles className="h-4 w-4 text-blue-700" />
            Ajuste recomendado
          </div>
          <h3 className="mt-3 font-semibold text-slate-950">{row.recommendation.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">{row.recommendation.description}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <InspectorMetric label="Impacto" value={row.recommendation.impact} compact />
            <InspectorMetric label="Confianca" value={row.recommendation.confidence} compact />
            <InspectorMetric label="Dono" value={row.owner} compact />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button title="Criar variacao" size="sm" className="bg-[#2563EB] hover:bg-blue-700">Criar variacao</Button>
            <Button title="Ver detalhes" size="sm" variant="outline" className="border-slate-300 bg-white">Ver detalhes</Button>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Historico recente</p>
          <div className="mt-3 space-y-3 border-l border-slate-200 pl-4">
            {['Orcamento atualizado', 'Criativo aprovado', `Sync ${row.channel}`].map((event, index) => (
              <div key={event} className="relative text-sm">
                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-blue-600" />
                <p className="font-medium text-slate-900">{event}</p>
                <p className="text-xs text-slate-500">{index === 0 ? 'Hoje, 10:42' : index === 1 ? 'Ontem, 16:10' : 'Ultima verificacao'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

function PulseStat({ metric, withDivider }: { metric: PulseMetric; withDivider: boolean }) {
  const Icon = metric.icon
  return (
    <div className={`flex min-h-[116px] items-center gap-4 px-5 py-5 ${withDivider ? 'border-t border-slate-200 md:border-l md:border-t-0' : ''}`}>
      <Icon className={`h-6 w-6 shrink-0 ${pulseIconClass(metric.tone)}`} />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{metric.label}</p>
        <p className="mt-2 text-3xl font-semibold leading-none text-slate-950">{metric.value}</p>
        <p className={`mt-2 text-sm ${metric.tone === 'red' ? 'text-red-700' : metric.tone === 'emerald' ? 'text-emerald-700' : 'text-slate-600'}`}>{metric.detail}</p>
      </div>
    </div>
  )
}

function MetaChip({ icon: Icon, label, tone = 'slate' }: { icon: LucideIcon; label: string; tone?: 'slate' | 'amber' }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-sm border px-3 py-2 ${tone === 'amber' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-300 bg-white text-slate-700'}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

function ActionCard({ icon: Icon, title, value, description, tone }: { icon: LucideIcon; title: string; value: string; description: string; tone: 'red' | 'blue' | 'amber' }) {
  return (
    <article className={`rounded-md border bg-white p-4 ${tone === 'red' ? 'border-l-2 border-l-red-600' : tone === 'blue' ? 'border-l-2 border-l-blue-600' : 'border-l-2 border-l-amber-500'} border-slate-300`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <Icon className={`h-5 w-5 ${tone === 'red' ? 'text-red-600' : tone === 'blue' ? 'text-blue-600' : 'text-amber-500'}`} />
      </div>
    </article>
  )
}

function InspectorMetric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-sm border border-slate-200 bg-white ${compact ? 'p-2' : 'p-3'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`${compact ? 'mt-1 text-xs' : 'mt-2 text-sm'} font-semibold text-slate-950`}>{value}</p>
    </div>
  )
}

function ChannelBadge({ channel }: { channel: CampaignChannel }) {
  return (
    <span className={`inline-flex rounded-sm border px-2 py-1 text-xs font-semibold ${channel === 'Meta Ads' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
      {channel}
    </span>
  )
}

function StatusBadge({ status, health }: { status: string; health: CampaignHealth }) {
  return (
    <span className={`inline-flex rounded-sm border px-2 py-1 text-xs font-semibold ${statusClass(health)}`}>
      {status}
    </span>
  )
}

function HealthBadge({ health }: { health: CampaignHealth }) {
  const label = {
    healthy: 'Saudavel',
    learning: 'Aprendizado',
    attention: 'Atencao',
    critical: 'Critico',
    paused: 'Pausada',
  }[health]

  return <span className={`inline-flex rounded-sm border px-2 py-1 text-xs font-semibold ${statusClass(health)}`}>{label}</span>
}

function IconAction({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={event => event.stopPropagation()}
      className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

function buildRows(campaigns: PortalCampaign[]): CampaignTableRow[] {
  if (campaigns.length === 0) return demoRows

  return campaigns.flatMap(campaign => {
    const campaignRow = mapCampaignToRow(campaign)
    const creativeRows = (campaign.creatives || []).slice(0, 2).map((creative, index): CampaignTableRow => ({
      ...campaignRow,
      id: creative.id,
      parentId: campaign.id,
      level: index === 0 ? 'ad' : 'creative',
      name: creative.headline || creative.name,
      subtitle: creative.body || `${creative.format} vinculado a campanha`,
      budget: '-',
      spend: Math.round(campaign.spend / Math.max(1, campaign.creatives?.length || 1)),
      leads: Math.round(campaign.leads / Math.max(1, campaign.creatives?.length || 1)),
      revenue: Math.round(campaign.attributedRevenue / Math.max(1, campaign.creatives?.length || 1)),
      recommendation: {
        title: 'Revisar variacao criativa',
        description: 'Acompanhe CTR, CPL e frequencia antes de escalar esta variacao.',
        impact: 'Medio',
        confidence: 'Media',
      },
    }))

    return creativeRows.length > 0 ? [campaignRow, ...creativeRows] : [campaignRow]
  })
}

function mapCampaignToRow(campaign: PortalCampaign): CampaignTableRow {
  const health = mapHealth(campaign)
  const revenue = Number(campaign.attributedRevenue || 0)
  return {
    id: campaign.id,
    level: 'campaign',
    name: campaign.name,
    subtitle: campaign.landingPageId ? `Landing page vinculada: ${campaign.landingPageId}` : formatObjective(campaign.objective),
    channel: campaign.provider === 'meta' ? 'Meta Ads' : 'Google Ads',
    status: formatLifecycleStatus(campaign.lifecycleStatus),
    objective: formatObjective(campaign.objective),
    budget: `${formatCurrency(campaign.dailyBudget)}/dia`,
    spend: Number(campaign.spend || 0),
    impressions: Number(campaign.impressions || 0),
    clicks: Number(campaign.clicks || 0),
    leads: Number(campaign.leads || 0),
    cpl: Number(campaign.cpl || 0),
    revenue,
    mroi: Number(campaign.mroi || (campaign.spend > 0 ? (revenue - campaign.spend) / campaign.spend : 0)),
    health,
    sync: campaign.updatedAt ? 'Recente' : '-',
    owner: 'YUX Growth',
    tracking: health === 'critical' ? 'critical' : health === 'attention' ? 'warning' : 'ok',
    recommendation: {
      title: campaign.recommendations?.[0]?.title || defaultRecommendation(health).title,
      description: campaign.recommendations?.[0]?.description || defaultRecommendation(health).description,
      impact: health === 'critical' || health === 'attention' ? 'Alto' : 'Medio',
      confidence: 'Media',
    },
  }
}

function filterRows(rows: CampaignTableRow[], activeTab: CampaignTab, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  return rows.filter(row => {
    const matchesTab = activeTab === 'all'
      || (activeTab === 'active' && ['Ativa', 'Ativo'].includes(row.status))
      || (activeTab === 'approval' && row.status === 'Em aprovacao')
      || (activeTab === 'issues' && ['critical', 'attention'].includes(row.health))
      || (activeTab === 'opportunities' && row.recommendation.impact === 'Alto')
      || (activeTab === 'drafts' && ['Rascunho', 'Aprovada'].includes(row.status))

    const matchesQuery = !normalizedQuery
      || `${row.name} ${row.subtitle} ${row.channel} ${row.status} ${row.owner}`.toLowerCase().includes(normalizedQuery)

    return matchesTab && matchesQuery
  })
}

function buildSummary(rows: CampaignTableRow[]) {
  const campaignRows = rows.filter(row => row.level === 'campaign')
  const spend = campaignRows.reduce((sum, row) => sum + row.spend, 0)
  const leads = campaignRows.reduce((sum, row) => sum + row.leads, 0)
  const revenue = campaignRows.reduce((sum, row) => sum + row.revenue, 0)
  const active = campaignRows.filter(row => ['Ativa', 'Ativo'].includes(row.status)).length
  const learning = campaignRows.filter(row => row.health === 'learning').length
  const critical = campaignRows.filter(row => row.health === 'critical').length
  const attention = campaignRows.filter(row => ['critical', 'attention'].includes(row.health)).length
  const trackingIssues = campaignRows.filter(row => row.tracking !== 'ok').length

  return {
    active,
    learning,
    spend,
    leads,
    cpl: leads > 0 ? spend / leads : 0,
    mroi: spend > 0 ? (revenue - spend) / spend : 0,
    attention,
    critical,
    trackingIssues,
  }
}

function mapHealth(campaign: PortalCampaign): CampaignHealth {
  if (campaign.lifecycleStatus === 'failed') return 'critical'
  if (campaign.lifecycleStatus === 'paused' || campaign.lifecycleStatus === 'archived') return 'paused'
  if (['draft', 'pending_approval', 'approved', 'syncing'].includes(campaign.lifecycleStatus)) return 'attention'
  if (campaign.leads === 0 && campaign.spend > 0) return 'critical'
  if (campaign.lifecycleStatus === 'active' && campaign.spend < 1000) return 'learning'
  return 'healthy'
}

function defaultRecommendation(health: CampaignHealth) {
  if (health === 'critical') return {
    title: 'Corrigir bloqueio antes de escalar',
    description: 'Existe risco de gasto sem atribuicao, falha de tracking ou problema de provider.',
  }
  if (health === 'attention') return {
    title: 'Concluir pendencias de aprovacao',
    description: 'Revise criativos, budget e configuracao antes de publicar ou aumentar investimento.',
  }
  if (health === 'learning') return {
    title: 'Aguardar estabilizacao do aprendizado',
    description: 'A campanha ainda esta acumulando sinais. Evite ajustes bruscos nas proximas 24h.',
  }
  return {
    title: 'Criar nova variacao para teste',
    description: 'A campanha esta saudavel. Gere uma nova variacao para preservar performance.',
  }
}

function formatLifecycleStatus(status: PortalCampaign['lifecycleStatus']) {
  const labels: Record<PortalCampaign['lifecycleStatus'], string> = {
    draft: 'Rascunho',
    pending_approval: 'Em aprovacao',
    approved: 'Aprovada',
    syncing: 'Sincronizando',
    active: 'Ativa',
    paused: 'Pausada',
    archived: 'Arquivada',
    failed: 'Com erro',
  }
  return labels[status] || status
}

function formatObjective(objective: PortalCampaign['objective']) {
  const labels: Record<PortalCampaign['objective'], string> = {
    lead_generation: 'Geracao de leads',
    traffic: 'Trafego',
    conversions: 'Conversoes',
    awareness: 'Reconhecimento',
  }
  return labels[objective] || objective
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function calculateCtr(row: CampaignTableRow) {
  if (row.impressions <= 0) return '0.0'
  return ((row.clicks / row.impressions) * 100).toFixed(1)
}

function indentClass(level: CampaignRowLevel) {
  if (level === 'adset') return 'pl-5'
  if (level === 'ad') return 'pl-10'
  if (level === 'creative') return 'pl-14'
  return ''
}

function healthDotClass(health: CampaignHealth) {
  if (health === 'healthy') return 'bg-emerald-500'
  if (health === 'learning') return 'bg-blue-500'
  if (health === 'attention') return 'bg-amber-500'
  if (health === 'critical') return 'bg-red-600'
  return 'bg-slate-400'
}

function pulseIconClass(tone: PulseMetric['tone']) {
  if (tone === 'blue') return 'text-blue-600'
  if (tone === 'emerald') return 'text-emerald-600'
  if (tone === 'amber') return 'text-amber-500'
  if (tone === 'red') return 'text-red-600'
  return 'text-slate-500'
}

function statusClass(health: CampaignHealth) {
  if (health === 'healthy') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (health === 'learning') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (health === 'attention') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (health === 'critical') return 'border-red-200 bg-red-50 text-red-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}
