import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
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
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  EmptyState,
  KpiCard,
  KpiGrid,
  MasterDetail,
  PageHeader,
  PendingAction,
  PendingBadge,
  PeriodSelector,
  StatusChip,
  portalButtonClasses,
  type PortalPeriod,
  type StatusChipVariant,
} from '@/components/portal-ui'
import { getPendingFeature } from '@/lib/client-portal/pendingFeatures'
import { formatPortalDateTime, formatRelativeTime } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'
import type { PortalCampaign } from '@/types/campaign'
import type { ContractDetails } from '@/types/platform'

type CampaignTab = 'all' | 'active' | 'approval' | 'issues' | 'opportunities' | 'drafts'
type CampaignRowLevel = 'campaign' | 'ad'
type CampaignHealth = 'healthy' | 'learning' | 'attention' | 'critical' | 'paused'
type CampaignChannel = 'Meta Ads' | 'Google Ads'
type ChecklistStatus = 'ok' | 'warning' | 'critical'
type FilterKey = 'channel' | 'status' | 'objective' | 'health'
type FilterState = Record<FilterKey, string[]>

const FILTER_LABELS: Record<FilterKey, string> = {
  channel: 'Canal',
  status: 'Status',
  objective: 'Objetivo',
  health: 'Saúde',
}
const FILTER_KEYS = Object.keys(FILTER_LABELS) as FilterKey[]
const EMPTY_FILTERS: FilterState = { channel: [], status: [], objective: [], health: [] }

interface PortalCampaignsWorkspaceProps {
  contract: ContractDetails
  campaigns: PortalCampaign[]
  /** Abre o fluxo de nova campanha. */
  onNewCampaign: () => void
  /** Recarrega as campanhas da fonte. */
  onRefresh: () => void | Promise<void>
}

interface CampaignEvent {
  label: string
  date: string
}

interface ChecklistItem {
  label: string
  status: ChecklistStatus
}

interface RowRecommendation {
  title: string
  description: string
  impact?: 'Alto' | 'Médio' | 'Baixo'
  /** `campaign`: recomendação cadastrada para a campanha; `status`: orientação derivada do status real. */
  origin: 'campaign' | 'status'
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
  lifecycle: PortalCampaign['lifecycleStatus']
  budget: string
  /** Falso em criativos: a fonte não traz métricas por criativo. */
  hasMetrics: boolean
  spend: number
  impressions: number
  clicks: number
  leads: number
  cpl: number
  revenue: number
  mroi: number
  health: CampaignHealth
  updatedAt?: string
  missingUtm: boolean
  recommendationCount: number
  checklist: ChecklistItem[]
  recommendation?: RowRecommendation
  events: CampaignEvent[]
}

const tabs: Array<{ key: CampaignTab; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'active', label: 'Ativas' },
  { key: 'approval', label: 'Em aprovação' },
  { key: 'issues', label: 'Com problemas' },
  { key: 'opportunities', label: 'Oportunidades' },
  { key: 'drafts', label: 'Rascunhos' },
]

const cardClasses =
  'min-w-0 rounded-[10px] border border-yx-line bg-yx-surface text-yx-fg shadow-[0_1px_2px_rgba(14,17,32,0.04),0_2px_8px_rgba(14,17,32,0.04)] dark:shadow-none'
const eyebrowClasses = 'font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3'

export function PortalCampaignsWorkspace({ contract, campaigns, onNewCampaign, onRefresh }: PortalCampaignsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<CampaignTab>('all')
  const [period, setPeriod] = useState<PortalPeriod>('7d')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [refreshing, setRefreshing] = useState(false)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)

  const rows = useMemo(() => buildRows(campaigns), [campaigns])
  const filteredRows = useMemo(() => filterRows(rows, activeTab, query, filters), [activeTab, query, rows, filters])
  const filterOptions = useMemo(() => buildFilterOptions(rows), [rows])
  const pickedRow = selectedId ? rows.find(row => row.id === selectedId) : undefined
  const defaultRow = filteredRows[0] || rows[0]
  const highlightedRow = pickedRow || defaultRow
  const summary = useMemo(() => buildSummary(rows), [rows])
  const channels = useMemo(() => listChannels(campaigns), [campaigns])
  const lastUpdate = useMemo(() => latestTimestamp(campaigns.map(campaign => campaign.updatedAt)), [campaigns])

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Campanhas"
        lead="Acompanhe suas campanhas pagas, criativos, orçamento e resultados comerciais."
        meta={
          <>
            {contract.name ? <StatusChip icon={Megaphone}>{`Contrato: ${contract.name}`}</StatusChip> : null}
            {channels.length > 0 ? <StatusChip icon={Activity}>{`Canais: ${channels.join(' e ')}`}</StatusChip> : null}
            {lastUpdate ? <StatusChip icon={Clock3}>{`Dados atualizados ${formatRelativeTime(lastUpdate)}`}</StatusChip> : null}
            {rows.length > 0 ? (
              <StatusChip icon={AlertTriangle} variant={summary.attention > 0 ? 'warn' : 'neutral'}>
                {`${summary.attention} ${summary.attention === 1 ? 'item exige' : 'itens exigem'} atenção`}
              </StatusChip>
            ) : null}
          </>
        }
        actions={
          <>
            <div className="flex items-center gap-2">
              <PeriodSelector value={period} onChange={setPeriod} />
              <PendingBadge code="B10" />
            </div>
            <button
              type="button"
              title="Atualizar dados"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
              className={portalButtonClasses('ghost')}
            >
              <RefreshCw className={cn(refreshing && 'animate-spin motion-reduce:animate-none')} />
              {refreshing ? 'Atualizando...' : 'Atualizar dados'}
            </button>
            <button type="button" title="Nova campanha" onClick={onNewCampaign} className={portalButtonClasses('primary')}>
              <Plus />
              Nova campanha
            </button>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Nenhuma campanha ainda"
          description="Quando a YUX publicar ou você criar uma campanha, os resultados aparecem aqui."
          className="min-h-[280px] justify-center bg-yx-surface"
        />
      ) : (
        <>
          <section aria-label="Resumo das campanhas" className="space-y-2">
            <KpiGrid variant="card" count={6} aria-label="Indicadores das campanhas">
              <KpiCard label="Campanhas ativas" value={String(summary.active)} comparison={`${summary.learning} em aprendizado`} />
              <KpiCard label="Investimento" value={formatCurrency(summary.spend)} comparison="acumulado" />
              <KpiCard
                label="Leads"
                value={String(summary.leads)}
                comparison={summary.leads > 0 ? 'atribuídos às campanhas' : 'Sem leads atribuídos'}
              />
              <KpiCard
                label="Custo por lead"
                value={summary.leads > 0 ? formatCurrency(summary.cpl) : NO_VALUE}
                comparison={summary.leads > 0 ? 'média das campanhas' : 'Sem leads atribuídos'}
              />
              <KpiCard
                label="Retorno (MROI)"
                value={`${formatDecimal(summary.mroi)}x`}
                comparison={summary.bestMroi === null ? 'Sem investimento' : `melhor campanha: ${formatDecimal(summary.bestMroi)}x`}
              />
              <KpiCard
                label="Atenção"
                value={String(summary.attention)}
                comparison={`${summary.critical} ${summary.critical === 1 ? 'crítico' : 'críticos'}`}
              />
            </KpiGrid>
            <p className="text-xs leading-snug text-yx-fg-3">
              Custo por lead (CPL) = investimento ÷ leads. Retorno sobre marketing (MROI) = (receita atribuída − investimento) ÷ investimento.
            </p>
          </section>

          <MasterDetail
            listWidth={0}
            className="lg:grid-cols-[minmax(0,1fr)_340px]"
            backLabel="Voltar"
            onBack={() => setSelectedId(undefined)}
            list={
              <section aria-label="Lista de campanhas" className={cn(cardClasses, 'overflow-hidden')}>
                <div className="space-y-3 border-b border-yx-line p-4">
                  <div className="flex flex-col gap-3 min-[1700px]:flex-row min-[1700px]:items-center min-[1700px]:justify-between">
                    <div role="group" aria-label="Filtrar por situação" className="flex max-w-full gap-2 overflow-x-auto pb-1 min-[1700px]:pb-0">
                      {tabs.map(tab => (
                        <button
                          key={tab.key}
                          type="button"
                          aria-pressed={activeTab === tab.key}
                          onClick={() => setActiveTab(tab.key)}
                          className={cn(
                            'h-10 shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors sm:h-9',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue',
                            activeTab === tab.key
                              ? 'border-yx-blue bg-yx-blue text-white'
                              : 'border-yx-line-strong bg-yx-surface text-yx-fg-2 hover:border-yx-blue hover:text-yx-blue',
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <FilterBar options={filterOptions} filters={filters} onChange={setFilters} />
                  </div>
                  <div className="relative">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yx-fg-3" />
                    <input
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      placeholder="Buscar campanha, anúncio ou criativo..."
                      aria-label="Buscar campanha, anúncio ou criativo"
                      className="h-11 w-full rounded-lg border border-yx-line-strong bg-yx-surface-2 pl-10 pr-4 text-sm text-yx-fg outline-none transition placeholder:text-yx-fg-3 focus:border-yx-blue focus:bg-yx-surface focus-visible:ring-2 focus-visible:ring-yx-blue"
                    />
                  </div>
                  <ActiveFilterChips filters={filters} onChange={setFilters} />
                </div>

                <CampaignTable rows={filteredRows} selectedId={highlightedRow?.id} onSelect={setSelectedId} />
              </section>
            }
            detail={pickedRow ? <CampaignInspector row={pickedRow} /> : null}
            emptyDetail={<CampaignInspector row={defaultRow} />}
          />

          <KpiGrid variant="card" count={3} aria-label="Pontos de atenção">
            <KpiCard label="Campanhas com falha" value={String(summary.critical)} comparison="Falha de publicação ou gasto sem leads atribuídos." />
            <KpiCard label="Recomendações abertas" value={String(summary.recommendations)} comparison="Recomendações cadastradas nas campanhas." />
            <KpiCard label="Campanhas sem rastreamento (UTM)" value={String(summary.missingUtm)} comparison="Revisar UTM e vinculação com o CRM." />
          </KpiGrid>
        </>
      )}
    </div>
  )
}

function activateOnKey(event: KeyboardEvent, action: () => void) {
  if (event.target !== event.currentTarget) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    action()
  }
}

function CampaignTable({ rows, selectedId, onSelect }: { rows: CampaignTableRow[]; selectedId?: string; onSelect: (id: string) => void }) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
        <Megaphone aria-hidden="true" className="h-8 w-8 text-yx-fg-3" />
        <h2 className="mt-4 font-display text-base font-semibold text-yx-fg">Nenhuma campanha encontrada</h2>
        <p className="mt-2 max-w-md text-sm text-yx-fg-2">Ajuste os filtros ou crie uma nova campanha para iniciar o acompanhamento.</p>
      </div>
    )
  }

  return (
    <>
      {/* Tabela (a partir de 720px) */}
      <div data-testid="campaign-table" className="hidden overflow-x-auto min-[720px]:block">
        <table className="w-full min-w-[1080px] border-collapse text-left text-[13px]">
          <caption className="sr-only">Campanhas, anúncios e criativos</caption>
          <thead className="bg-yx-surface-2 font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">
            <tr>
              <th scope="col" className="w-[300px] px-4 py-3">Nome</th>
              <th scope="col" className="px-3 py-3">Canal</th>
              <th scope="col" className="px-3 py-3">Status</th>
              <th scope="col" className="px-3 py-3 text-right">Orçamento</th>
              <th scope="col" className="px-3 py-3 text-right">Gasto</th>
              <th scope="col" className="px-3 py-3 text-right">CTR</th>
              <th scope="col" className="px-3 py-3 text-right">Leads</th>
              <th scope="col" className="px-3 py-3 text-right">CPL</th>
              <th scope="col" className="px-3 py-3 text-right">Receita</th>
              <th scope="col" className="px-3 py-3 text-right">MROI</th>
              <th scope="col" className="px-3 py-3">Saúde</th>
              <th scope="col" className="px-3 py-3">Atualizado</th>
              <th scope="col" className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-yx-line">
            {rows.map(row => (
              <tr
                key={row.id}
                tabIndex={0}
                aria-selected={selectedId === row.id}
                onClick={() => onSelect(row.id)}
                onKeyDown={event => activateOnKey(event, () => onSelect(row.id))}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-yx-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yx-blue',
                  selectedId === row.id ? 'bg-yx-blue-soft' : 'bg-yx-surface',
                  row.level === 'campaign' && 'font-medium',
                )}
              >
                <td className="px-4 py-3">
                  <div className={cn('flex items-start gap-2', row.level === 'ad' && 'pl-8')}>
                    {row.level === 'campaign' ? (
                      <ChevronDown aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-yx-fg-3" />
                    ) : (
                      <ChevronRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-yx-fg-3" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-yx-fg">{row.name}</p>
                      <p className="mt-1 truncate text-xs font-normal text-yx-fg-3">{row.subtitle}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3"><StatusChip>{row.channel}</StatusChip></td>
                <td className="px-3 py-3"><StatusChip variant={healthVariant(row.health)}>{row.status}</StatusChip></td>
                <td className="px-3 py-3 text-right text-yx-fg-2">{row.budget}</td>
                <td className="px-3 py-3 text-right text-yx-fg-2">{row.hasMetrics ? formatCurrency(row.spend) : NO_VALUE}</td>
                <td className="px-3 py-3 text-right text-yx-fg-2">{formatCtr(row)}</td>
                <td className="px-3 py-3 text-right text-yx-fg">{row.hasMetrics ? row.leads : NO_VALUE}</td>
                <td className="px-3 py-3 text-right text-yx-fg-2">{row.hasMetrics && row.leads > 0 ? formatCurrency(row.cpl) : NO_VALUE}</td>
                <td className="px-3 py-3 text-right text-yx-fg-2">{row.hasMetrics ? formatCurrency(row.revenue) : NO_VALUE}</td>
                <td className={cn('px-3 py-3 text-right', row.hasMetrics && row.mroi >= 1 ? 'text-yx-ok' : 'text-yx-warn')}>
                  {row.hasMetrics ? `${formatDecimal(row.mroi)}x` : NO_VALUE}
                </td>
                <td className="px-3 py-3"><StatusChip variant={healthVariant(row.health)}>{healthLabel(row.health)}</StatusChip></td>
                <td className="px-3 py-3 text-xs text-yx-fg-3">{row.updatedAt ? formatRelativeTime(row.updatedAt) : NO_VALUE}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <IconAction label="Ver detalhes" icon={Eye} onClick={() => onSelect(row.id)} />
                    <PendingIconActions health={row.health} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cartões (abaixo de 720px) */}
      <ul data-testid="campaign-cards" className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2.5 p-3 min-[720px]:hidden">
        {rows.map(row => (
          <li key={row.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect(row.id)}
              aria-label={`Abrir detalhes de ${row.name}`}
              className={cn(
                'block w-full rounded-lg border bg-yx-surface p-3.5 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue',
                selectedId === row.id ? 'border-yx-blue' : 'border-yx-line hover:border-yx-blue',
                row.level === 'ad' && 'ml-4 w-[calc(100%-1rem)]',
              )}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-yx-fg">{row.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-yx-fg-3">{row.subtitle}</span>
                </span>
                <StatusChip variant={healthVariant(row.health)}>{row.status}</StatusChip>
              </span>
              <dl className="m-0 mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <CardStat label="Canal" value={row.channel} />
                <CardStat label="Orçamento" value={row.budget} />
                <CardStat label="Gasto" value={row.hasMetrics ? formatCurrency(row.spend) : NO_VALUE} />
                <CardStat label="Leads" value={row.hasMetrics ? String(row.leads) : NO_VALUE} />
                <CardStat label="CPL" value={row.hasMetrics && row.leads > 0 ? formatCurrency(row.cpl) : NO_VALUE} />
                <CardStat label="MROI" value={row.hasMetrics ? `${formatDecimal(row.mroi)}x` : NO_VALUE} />
              </dl>
              <span className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-yx-fg-3">
                <StatusChip variant={healthVariant(row.health)}>{healthLabel(row.health)}</StatusChip>
                <span>{row.updatedAt ? `Atualizado ${formatRelativeTime(row.updatedAt)}` : ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{label}</dt>
      <dd className="m-0 truncate font-medium text-yx-fg">{value}</dd>
    </div>
  )
}

function CampaignInspector({ row }: { row?: CampaignTableRow }) {
  if (!row) {
    return (
      <aside className={cn(cardClasses, 'p-5')}>
        <p className="text-sm text-yx-fg-3">Selecione uma campanha para ver detalhes.</p>
      </aside>
    )
  }

  return (
    <aside aria-label={`Detalhes de ${row.name}`} className={cn(cardClasses, 'border-l-2 border-l-yx-blue')}>
      <div className="border-b border-yx-line bg-yx-surface-2 px-5 py-4">
        <p className={eyebrowClasses}>Prontidão e recomendações</p>
        <h2 className="mt-2 font-display text-lg font-semibold leading-snug text-yx-fg">{row.name}</h2>
        <p className="mt-1 text-sm text-yx-fg-2">{row.subtitle}</p>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-2">
          <InspectorMetric label="Canal" value={row.channel} />
          <InspectorMetric label="Status" value={row.status} />
          <InspectorMetric label="Gasto" value={row.hasMetrics ? formatCurrency(row.spend) : NO_VALUE} />
          <InspectorMetric label="Leads" value={row.hasMetrics ? String(row.leads) : NO_VALUE} />
        </div>

        {row.checklist.length > 0 ? (
          <div>
            <p className={eyebrowClasses}>Checklist da campanha</p>
            <ul className="m-0 mt-3 grid list-none gap-2 p-0">
              {row.checklist.map(item => (
                <li key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-yx-line bg-yx-surface-2 px-3 py-2 text-sm">
                  <span className="text-yx-fg-2">{item.label}</span>
                  {item.status === 'ok' && <CheckCircle2 aria-label="Em ordem" className="h-4 w-4 shrink-0 text-yx-ok" />}
                  {item.status === 'warning' && <AlertTriangle aria-label="Requer atenção" className="h-4 w-4 shrink-0 text-yx-warn" />}
                  {item.status === 'critical' && <AlertTriangle aria-label="Crítico" className="h-4 w-4 shrink-0 text-yx-crit" />}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {row.recommendation ? (
          <div className="rounded-lg border border-yx-line-strong bg-yx-blue-soft p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-yx-blue-ink">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              {row.recommendation.origin === 'campaign' ? 'Recomendação da YUX' : 'Orientação conforme o status da campanha'}
            </div>
            <h3 className="mt-3 font-semibold text-yx-fg">{row.recommendation.title}</h3>
            {row.recommendation.description ? (
              <p className="mt-2 text-sm leading-6 text-yx-fg-2">{row.recommendation.description}</p>
            ) : null}
            {row.recommendation.impact ? (
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <InspectorMetric label="Impacto" value={row.recommendation.impact} compact />
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <p className={eyebrowClasses}>Ações</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PendingAction code="B13" size="sm" variant="primary">Criar variação</PendingAction>
            <PendingAction code="B13" size="sm" variant="outline">Ver detalhes</PendingAction>
            {row.level === 'campaign' ? <PendingAction code="B17" size="sm" variant="outline">Pedir revisão</PendingAction> : null}
            {row.level === 'campaign' ? <PendingAction code="B18" size="sm" variant="outline">Duplicar campanha</PendingAction> : null}
            {row.level === 'campaign' ? (
              <PendingAction code="B18" size="sm" variant="outline">{row.health === 'paused' ? 'Ativar campanha' : 'Pausar campanha'}</PendingAction>
            ) : null}
          </div>
        </div>

        <div>
          <p className={eyebrowClasses}>Histórico recente</p>
          {row.events.length > 0 ? (
            <div className="mt-3 space-y-3 border-l border-yx-line pl-4">
              {row.events.map(event => (
                <div key={`${event.label}-${event.date}`} className="relative text-sm">
                  <span aria-hidden="true" className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-yx-blue" />
                  <p className="font-medium text-yx-fg">{event.label}</p>
                  <p className="text-xs text-yx-fg-3">{formatPortalDateTime(event.date)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-yx-fg-3">Sem eventos registrados.</p>
          )}
        </div>
      </div>
    </aside>
  )
}

function InspectorMetric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-yx-line bg-yx-surface', compact ? 'p-2' : 'p-3')}>
      <p className={eyebrowClasses}>{label}</p>
      <p className={cn('font-semibold text-yx-fg', compact ? 'mt-1 text-xs' : 'mt-2 text-sm')}>{value}</p>
    </div>
  )
}

function healthVariant(health: CampaignHealth): StatusChipVariant {
  if (health === 'healthy') return 'ok'
  if (health === 'attention') return 'warn'
  if (health === 'critical') return 'crit'
  return 'neutral'
}

function healthLabel(health: CampaignHealth) {
  return {
    healthy: 'Saudável',
    learning: 'Aprendizado',
    attention: 'Atenção',
    critical: 'Crítico',
    paused: 'Pausada',
  }[health]
}

function IconAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={event => {
        event.stopPropagation()
        onClick?.()
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-yx-line-strong bg-yx-surface text-yx-fg-2 hover:border-yx-blue hover:text-yx-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue"
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )
}

function PendingIconActions({ health }: { health: CampaignHealth }) {
  const [open, setOpen] = useState(false)
  const messageId = useId()
  const feature = getPendingFeature('B18')
  const toggleLabel = health === 'paused' ? 'Ativar' : 'Pausar'
  const ToggleIcon = health === 'paused' ? Play : Pause

  return (
    <>
      {[{ label: 'Duplicar', Icon: Copy }, { label: toggleLabel, Icon: ToggleIcon }].map(({ label, Icon }) => (
        <button
          key={label}
          type="button"
          title={`${label}: pendente`}
          aria-label={`${label}: pendente`}
          aria-disabled="true"
          aria-describedby={open ? messageId : undefined}
          onClick={event => {
            event.stopPropagation()
            setOpen(current => !current)
          }}
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-dashed border-yx-warn-line bg-yx-surface text-yx-fg-3 opacity-80 hover:border-yx-warn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue"
        >
          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      ))}
      <PendingBadge code="B18" />
      {open ? (
        <span id={messageId} role="status" className="basis-full text-right text-[11px] font-normal leading-snug text-yx-fg-2">
          {feature.clientMessage}
        </span>
      ) : null}
    </>
  )
}

function FilterBar({ options, filters, onChange }: { options: Record<FilterKey, string[]>; filters: FilterState; onChange: (next: FilterState) => void }) {
  const [openKey, setOpenKey] = useState<FilterKey | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openKey) return
    const handlePointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpenKey(null)
    }
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpenKey(null)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openKey])

  const toggleValue = (key: FilterKey, value: string) => {
    const current = filters[key]
    onChange({ ...filters, [key]: current.includes(value) ? current.filter(item => item !== value) : [...current, value] })
  }

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-2">
      {FILTER_KEYS.map(key => {
        const values = options[key]
        const empty = values.length === 0
        const selected = filters[key].length
        const open = openKey === key
        return (
          <div key={key} className="relative">
            <button
              type="button"
              disabled={empty}
              aria-haspopup="true"
              aria-expanded={open}
              onClick={() => setOpenKey(open ? null : key)}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 sm:h-9',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue',
                selected > 0
                  ? 'border-yx-blue bg-yx-blue-soft text-yx-blue'
                  : 'border-yx-line-strong bg-yx-surface text-yx-fg-2 hover:border-yx-blue hover:text-yx-blue',
              )}
            >
              <Filter aria-hidden="true" className="h-3.5 w-3.5" />
              {FILTER_LABELS[key]}
              {empty ? (
                <span className="font-normal text-yx-fg-3">Sem dados</span>
              ) : selected > 0 ? (
                <span className="rounded-full bg-yx-blue px-1.5 text-[11px] text-white">{selected}</span>
              ) : null}
            </button>
            {open ? (
              <div
                role="group"
                aria-label={`Filtrar por ${FILTER_LABELS[key].toLowerCase()}`}
                className="absolute left-0 z-20 mt-1 min-w-[180px] max-w-[calc(100vw-48px)] rounded-lg border border-yx-line bg-yx-surface p-2 shadow-lg"
              >
                {values.map(value => (
                  <label key={value} className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-yx-fg hover:bg-yx-surface-2 sm:min-h-0">
                    <input type="checkbox" checked={filters[key].includes(value)} onChange={() => toggleValue(key, value)} />
                    {value}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function ActiveFilterChips({ filters, onChange }: { filters: FilterState; onChange: (next: FilterState) => void }) {
  const chips = FILTER_KEYS.flatMap(key => filters[key].map(value => ({ key, value })))
  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtros ativos">
      {chips.map(({ key, value }) => (
        <span
          key={`${key}-${value}`}
          className="inline-flex items-center gap-1 rounded-full border border-yx-line-strong bg-yx-blue-soft py-1 pl-3 pr-1 text-xs font-medium text-yx-blue-ink"
        >
          {FILTER_LABELS[key]}: {value}
          <button
            type="button"
            aria-label={`Remover filtro ${FILTER_LABELS[key]}: ${value}`}
            onClick={() => onChange({ ...filters, [key]: filters[key].filter(item => item !== value) })}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-yx-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue"
          >
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => onChange(EMPTY_FILTERS)}
        className="inline-flex min-h-10 items-center text-xs font-semibold text-yx-blue underline-offset-2 hover:underline sm:min-h-0"
      >
        Limpar filtros
      </button>
    </div>
  )
}

const NO_VALUE = '—'

function buildRows(campaigns: PortalCampaign[]): CampaignTableRow[] {
  return campaigns.flatMap(campaign => {
    const campaignRow = mapCampaignToRow(campaign)
    const creativeRows = (campaign.creatives || []).map((creative): CampaignTableRow => ({
      ...campaignRow,
      id: creative.id,
      parentId: campaign.id,
      level: 'ad',
      name: creative.headline || creative.name,
      subtitle: creative.body || `${formatCreativeFormat(creative.format)} vinculado à campanha`,
      budget: NO_VALUE,
      // A fonte não traz métricas por criativo: nada é estimado nem dividido.
      hasMetrics: false,
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0,
      cpl: 0,
      revenue: 0,
      mroi: 0,
      updatedAt: creative.updatedAt || campaignRow.updatedAt,
      recommendationCount: 0,
      recommendation: undefined,
      events: buildEvents([
        { label: 'Criativo cadastrado', date: creative.createdAt },
        { label: 'Criativo atualizado', date: creative.updatedAt, skipIf: creative.createdAt },
      ]),
    }))

    return creativeRows.length > 0 ? [campaignRow, ...creativeRows] : [campaignRow]
  })
}

function mapCampaignToRow(campaign: PortalCampaign): CampaignTableRow {
  const health = mapHealth(campaign)
  const spend = Number(campaign.spend || 0)
  const revenue = Number(campaign.attributedRevenue || 0)
  const objective = formatObjective(campaign.objective)
  return {
    id: campaign.id,
    level: 'campaign',
    name: campaign.name,
    subtitle: campaign.landingPageId ? `${objective} · landing page vinculada` : objective,
    channel: campaign.provider === 'meta' ? 'Meta Ads' : 'Google Ads',
    status: formatLifecycleStatus(campaign.lifecycleStatus),
    objective,
    lifecycle: campaign.lifecycleStatus,
    budget: campaign.dailyBudget > 0 ? `${formatCurrency(campaign.dailyBudget)}/dia` : NO_VALUE,
    hasMetrics: true,
    spend,
    impressions: Number(campaign.impressions || 0),
    clicks: Number(campaign.clicks || 0),
    leads: Number(campaign.leads || 0),
    cpl: Number(campaign.cpl || 0),
    revenue,
    mroi: Number(campaign.mroi || (spend > 0 ? (revenue - spend) / spend : 0)),
    health,
    updatedAt: campaign.updatedAt || undefined,
    missingUtm: !campaign.utmCampaign,
    recommendationCount: campaign.recommendations?.length || 0,
    checklist: buildChecklist(campaign),
    recommendation: buildRecommendation(campaign, health),
    events: buildEvents([
      { label: 'Campanha criada', date: campaign.createdAt },
      { label: 'Início programado', date: campaign.startsAt },
      { label: 'Término programado', date: campaign.endsAt },
      { label: 'Dados atualizados', date: campaign.updatedAt, skipIf: campaign.createdAt },
    ]),
  }
}

/** Só usa campos reais da campanha; nada é marcado como "ok" sem lastro. */
function buildChecklist(campaign: PortalCampaign): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { label: 'Publicação sem erro', status: campaign.lifecycleStatus === 'failed' ? 'critical' : 'ok' },
    { label: 'Aprovação concluída', status: ['draft', 'pending_approval'].includes(campaign.lifecycleStatus) ? 'warning' : 'ok' },
    { label: 'UTM configurada', status: campaign.utmCampaign ? 'ok' : 'warning' },
    { label: 'Landing page vinculada', status: campaign.landingPageId ? 'ok' : 'warning' },
    { label: 'Criativos cadastrados', status: campaign.creatives && campaign.creatives.length > 0 ? 'ok' : 'warning' },
  ]
  for (const alert of campaign.alerts || []) {
    items.push({ label: alert.title, status: alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'ok' })
  }
  return items
}

function buildRecommendation(campaign: PortalCampaign, health: CampaignHealth): RowRecommendation | undefined {
  const real = campaign.recommendations?.[0]
  if (real) {
    return {
      title: real.title,
      description: real.description,
      impact: real.priority === 'high' ? 'Alto' : real.priority === 'low' ? 'Baixo' : 'Médio',
      origin: 'campaign',
    }
  }
  // Orientações abaixo derivam do status real da campanha (não de texto fixo por linha).
  if (health === 'critical') {
    return {
      title: 'Corrigir o problema antes de escalar',
      description: 'A campanha apresenta falha ou gasto sem leads atribuídos. Revise antes de aumentar o investimento.',
      origin: 'status',
    }
  }
  if (health === 'attention') {
    return {
      title: 'Concluir as pendências de aprovação',
      description: 'Revise criativos, orçamento e configuração antes de publicar ou aumentar o investimento.',
      origin: 'status',
    }
  }
  return undefined
}

function buildEvents(candidates: Array<{ label: string; date?: string; skipIf?: string }>): CampaignEvent[] {
  return candidates
    .filter((item): item is { label: string; date: string; skipIf?: string } => Boolean(item.date) && !Number.isNaN(new Date(item.date as string).getTime()))
    .filter(item => item.skipIf === undefined || item.date !== item.skipIf)
    .map(item => ({ label: item.label, date: item.date }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function filterRows(rows: CampaignTableRow[], activeTab: CampaignTab, query: string, filters: FilterState) {
  const normalizedQuery = query.trim().toLowerCase()
  return rows.filter(row => {
    const matchesTab = activeTab === 'all'
      || (activeTab === 'active' && row.lifecycle === 'active')
      || (activeTab === 'approval' && row.lifecycle === 'pending_approval')
      || (activeTab === 'issues' && ['critical', 'attention'].includes(row.health))
      || (activeTab === 'opportunities' && row.recommendation?.origin === 'campaign')
      || (activeTab === 'drafts' && ['draft', 'approved'].includes(row.lifecycle))

    const matchesQuery = !normalizedQuery
      || `${row.name} ${row.subtitle} ${row.channel} ${row.status}`.toLowerCase().includes(normalizedQuery)

    const matchesFilters = FILTER_KEYS.every(key => filters[key].length === 0 || filters[key].includes(filterValue(row, key)))

    return matchesTab && matchesQuery && matchesFilters
  })
}

function filterValue(row: CampaignTableRow, key: FilterKey) {
  if (key === 'channel') return row.channel
  if (key === 'status') return row.status
  if (key === 'objective') return row.objective
  return healthLabel(row.health)
}

function buildFilterOptions(rows: CampaignTableRow[]): Record<FilterKey, string[]> {
  const options = {} as Record<FilterKey, string[]>
  for (const key of FILTER_KEYS) {
    options[key] = Array.from(new Set(rows.map(row => filterValue(row, key)).filter(value => value && value !== NO_VALUE))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }
  return options
}

function buildSummary(rows: CampaignTableRow[]) {
  const campaignRows = rows.filter(row => row.level === 'campaign')
  const spend = campaignRows.reduce((sum, row) => sum + row.spend, 0)
  const leads = campaignRows.reduce((sum, row) => sum + row.leads, 0)
  const revenue = campaignRows.reduce((sum, row) => sum + row.revenue, 0)
  const active = campaignRows.filter(row => row.lifecycle === 'active').length
  const learning = campaignRows.filter(row => row.health === 'learning').length
  const critical = campaignRows.filter(row => row.health === 'critical').length
  const attention = campaignRows.filter(row => ['critical', 'attention'].includes(row.health)).length
  const missingUtm = campaignRows.filter(row => row.missingUtm).length
  const recommendations = campaignRows.reduce((sum, row) => sum + row.recommendationCount, 0)
  const withSpend = campaignRows.filter(row => row.spend > 0)
  const bestMroi = withSpend.length > 0 ? Math.max(...withSpend.map(row => row.mroi)) : null

  return {
    active,
    learning,
    spend,
    leads,
    cpl: leads > 0 ? spend / leads : 0,
    mroi: spend > 0 ? (revenue - spend) / spend : 0,
    bestMroi,
    attention,
    critical,
    missingUtm,
    recommendations,
  }
}

function listChannels(campaigns: PortalCampaign[]): CampaignChannel[] {
  const providers = new Set(campaigns.map(campaign => campaign.provider))
  const channels: CampaignChannel[] = []
  if (providers.has('meta')) channels.push('Meta Ads')
  if (providers.has('google')) channels.push('Google Ads')
  return channels
}

function latestTimestamp(values: Array<string | undefined>): string | undefined {
  let best: { value: string; time: number } | undefined
  for (const value of values) {
    if (!value) continue
    const time = new Date(value).getTime()
    if (Number.isNaN(time)) continue
    if (!best || time > best.time) best = { value, time }
  }
  return best?.value
}

function mapHealth(campaign: PortalCampaign): CampaignHealth {
  if (campaign.lifecycleStatus === 'failed') return 'critical'
  if (campaign.lifecycleStatus === 'paused' || campaign.lifecycleStatus === 'archived') return 'paused'
  if (['draft', 'pending_approval', 'approved', 'syncing'].includes(campaign.lifecycleStatus)) return 'attention'
  if (campaign.leads === 0 && campaign.spend > 0) return 'critical'
  if (campaign.lifecycleStatus === 'active' && campaign.spend < 1000) return 'learning'
  return 'healthy'
}

function formatLifecycleStatus(status: PortalCampaign['lifecycleStatus']) {
  const labels: Record<PortalCampaign['lifecycleStatus'], string> = {
    draft: 'Rascunho',
    pending_approval: 'Em aprovação',
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
    lead_generation: 'Geração de leads',
    traffic: 'Tráfego',
    conversions: 'Conversões',
    awareness: 'Reconhecimento',
  }
  return labels[objective] || objective
}

function formatCreativeFormat(format: 'image' | 'video' | 'carousel' | 'text') {
  const labels = { image: 'Imagem', video: 'Vídeo', carousel: 'Carrossel', text: 'Texto' }
  return labels[format] || format
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function formatDecimal(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function formatCtr(row: CampaignTableRow) {
  if (!row.hasMetrics || row.impressions <= 0) return NO_VALUE
  return `${formatDecimal((row.clicks / row.impressions) * 100)}%`
}
