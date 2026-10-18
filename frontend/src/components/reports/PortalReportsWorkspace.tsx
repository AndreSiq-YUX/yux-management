import { useState, type ReactNode } from 'react'
import { BarChart3, Printer } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  BarList,
  EmptyState,
  FunnelBars,
  KpiCard,
  KpiGrid,
  PageHeader,
  PendingBadge,
  PeriodSelector,
  ResponsiveTable,
  SectionCard,
  StatusChip,
  portalButtonClasses,
  type PortalPeriod,
  type ResponsiveTableColumn,
  type StatusChipVariant,
} from '@/components/portal-ui'
import { sanitizePortalAttribution } from '@/lib/crm/attributionRules'
import { getPendingFeature } from '@/lib/client-portal/pendingFeatures'
import { formatCompactCurrency, formatPortalCurrency, formatPortalDateTime, statusLabel } from '@/lib/client-portal/portalDisplay'
import {
  buildExecutiveCampaignMetrics,
  buildReportAiInsight,
  sanitizeReportForPortal,
  summarizeExecutiveCampaignMetrics,
} from '@/lib/reports/reportRules'
import type { CrmMroiAlert, PortalLeadSourceRollup } from '@/types/crmAttribution'
import type {
  CampaignReportMetric,
  ExecutiveCampaignMetric,
  LandingPageReportMetric,
  OperationalReport,
  PortalOperationalReport,
} from '@/types/reports'

/**
 * O endpoint do portal ainda não recebe datas (B6): nenhuma opção do seletor fica marcada,
 * porque o relatório mostra todo o período disponível.
 */
const PERIOD_NOT_APPLIED = 'all' as unknown as PortalPeriod

/**
 * Folha de impressão ("Exportar PDF" = Salvar como PDF do navegador).
 * Menu lateral, cabeçalho do aplicativo e gaveta do celular se escondem sozinhos (`print:hidden` no
 * Sidebar e no Header; o layout zera o recuo com `print:pl-0`). Os controles do relatório usam
 * `print:hidden` aqui mesmo. Este CSS só ajusta quebras de página e preserva as cores dos gráficos.
 */
const PRINT_CSS = `
@page { margin: 14mm; }
@media print {
  [data-report-print] { break-inside: auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  [data-report-print] section { break-inside: avoid; box-shadow: none !important; }
}
`

const SOURCE_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  meta_ads: 'Anúncios Meta',
  google_ads: 'Anúncios Google',
  google: 'Google',
  whatsapp: 'WhatsApp',
  site: 'Site',
  website: 'Site',
  landing_page: 'Página de captura',
  organic: 'Orgânico',
  referral: 'Indicação',
  direct: 'Direto',
  email: 'E-mail',
  manual: 'Cadastro manual',
  other: 'Outras origens',
}

function sourceLabel(source: string) {
  const key = source.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key]
  const text = source.replace(/_/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Origem não informada'
}

const syncVariant = (status: ExecutiveCampaignMetric['syncStatus']): StatusChipVariant => {
  if (status === 'connected') return 'ok'
  if (status === 'failed') return 'crit'
  if (status === 'stale' || status === 'needs_reauth') return 'warn'
  return 'neutral'
}

const alertTone: Record<CrmMroiAlert['severity'], { label: string; variant: StatusChipVariant }> = {
  info: { label: 'Informação', variant: 'neutral' },
  warning: { label: 'Atenção', variant: 'warn' },
  critical: { label: 'Crítico', variant: 'crit' },
  success: { label: 'Oportunidade', variant: 'ok' },
}

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const integerFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

const tooltipStyle = {
  background: 'var(--yx-surface)',
  border: '1px solid var(--yx-line)',
  borderRadius: 8,
  color: 'var(--yx-fg)',
  fontSize: 12,
} as const

function truncate(value: string, max = 14) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function PortalReportsWorkspace({ report }: { report: OperationalReport | PortalOperationalReport }) {
  const [periodMessage, setPeriodMessage] = useState<string | null>(null)
  const safeReport = 'ownerActivity' in report ? sanitizeReportForPortal(report as OperationalReport) : report
  const executiveMetrics = safeReport.executiveCampaignMetrics || buildExecutiveCampaignMetrics(safeReport.campaignMetrics)
  const summary = safeReport.executiveCampaignSummary || summarizeExecutiveCampaignMetrics(executiveMetrics)
  const insight = safeReport.aiInsight || buildReportAiInsight(safeReport)
  const attribution = safeReport.crmAttribution ? sanitizePortalAttribution(safeReport.crmAttribution) : undefined
  const updatedLabel = `Dados atualizados em ${formatPortalDateTime(safeReport.generatedAt)}`

  const sources = [...safeReport.leadsBySource].sort((a, b) => b.leads - a.leads)
  const stages = safeReport.stageConversions
  const bottleneckIndex = findBottleneck(stages)
  const hasMedia = safeReport.campaignMetrics.length > 0

  return (
    <div data-report-print className="w-full space-y-6">
      <style>{PRINT_CSS}</style>

      <PageHeader
        title="Relatórios"
        lead="Resultados comerciais e de mídia da sua conta, em um só lugar."
        live={{ label: updatedLabel }}
        actions={
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <PeriodSelector
                  value={PERIOD_NOT_APPLIED}
                  onChange={() => setPeriodMessage(getPendingFeature('B6').clientMessage)}
                  caption="Mostrando todo o período disponível"
                />
                <PendingBadge code="B6" />
              </div>
              {periodMessage ? (
                <p role="status" className="max-w-xs text-xs leading-snug text-yx-fg-3">
                  {periodMessage}
                </p>
              ) : null}
            </div>
            <button type="button" onClick={() => window.print()} className={portalButtonClasses('primary')}>
              <Printer aria-hidden="true" />
              Exportar PDF
            </button>
          </div>
        }
      />

      <KpiGrid variant="card" count={6} aria-label="Indicadores do relatório">
        <KpiCard label="Investimento" value={formatCompactCurrency(summary.spend)} comparison="Total investido em mídia" />
        <KpiCard label="Leads" value={integerFormat.format(summary.leads)} comparison="Contatos vindos das campanhas" />
        <KpiCard
          label="Custo por lead (CPL)"
          value={summary.leads > 0 ? formatCompactCurrency(summary.cpl) : '—'}
          comparison="Quanto custa, em média, cada lead"
        />
        <KpiCard
          label="Retorno sobre marketing (MROI)"
          value={summary.spend > 0 ? `${numberFormat.format(summary.mroi)}x` : '—'}
          comparison="Quanto a receita superou o investimento"
        />
        <KpiCard
          label="Tempo de resposta"
          value={safeReport.responseTimeHours > 0 ? `${numberFormat.format(safeReport.responseTimeHours)} h` : '—'}
          comparison="Média até o primeiro retorno ao lead"
        />
        <KpiCard
          label="Propostas aprovadas"
          value={safeReport.proposalMetrics.sent > 0 ? `${numberFormat.format(safeReport.proposalMetrics.approvalRate)}%` : '—'}
          comparison={`${safeReport.proposalMetrics.approved} de ${safeReport.proposalMetrics.sent} enviadas`}
        />
      </KpiGrid>

      <SectionCard
        id="resultado-midia"
        title="Resultado de mídia"
        description={hasMedia ? updatedLabel : 'Resumo de investimento, leads, clientes e receita das campanhas.'}
        action={hasMedia ? <StatusChip variant={syncVariant(summary.syncStatus)}>{statusLabel(summary.syncStatus)}</StatusChip> : undefined}
        bodyClassName="px-0 pb-0"
      >
        {hasMedia ? (
          <>
            <KpiGrid count={6} aria-label="Resultado de mídia">
              <KpiCard label="Impressões" value={integerFormat.format(summary.impressions)} />
              <KpiCard label="Cliques" value={integerFormat.format(summary.clicks)} />
              <KpiCard label="Oportunidades" value={integerFormat.format(summary.opportunities)} />
              <KpiCard label="Propostas" value={integerFormat.format(summary.proposals)} />
              <KpiCard label="Clientes" value={integerFormat.format(summary.clients)} />
              <KpiCard label="Receita atribuída" value={formatCompactCurrency(summary.revenue)} />
            </KpiGrid>
            <div className="grid gap-3 px-[18px] py-4 text-[13px] leading-normal text-yx-fg-2">
              {summary.aiRecommendation ? <p className="m-0 rounded-lg bg-yx-surface-2 px-3 py-2.5">{summary.aiRecommendation}</p> : null}
              <p className="m-0 text-yx-fg-3">
                <strong className="font-semibold text-yx-fg-2">Custo por lead (CPL)</strong> é o investimento dividido pelo número de leads.{' '}
                <strong className="font-semibold text-yx-fg-2">Retorno sobre marketing (MROI)</strong> mostra quanto a receita atribuída superou o
                investimento: acima de 0x, a mídia já se pagou.
              </p>
            </div>
          </>
        ) : (
          <div className="px-[18px] pb-[18px]">
            <EmptyState
              icon={BarChart3}
              title="Nenhuma campanha com resultados ainda"
              description="Quando suas campanhas começarem a rodar, o investimento, os leads e o retorno aparecem aqui."
            />
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard id="leads-origem" title="Leads por origem" description="De onde vêm os contatos que chegam até você.">
          {sources.length > 0 ? (
            <BarList
              aria-label="Leads por origem"
              items={sources.map(item => ({
                label: sourceLabel(item.source),
                value: item.leads,
                display: `${integerFormat.format(item.leads)} ${item.leads === 1 ? 'lead' : 'leads'}`,
              }))}
            />
          ) : (
            <EmptyState title="Sem leads no período" description="Assim que os primeiros contatos chegarem, mostramos a origem de cada um." />
          )}
        </SectionCard>

        <SectionCard id="conversao-etapas" title="Conversão por etapa" description="Quantos leads avançam de uma etapa do funil para a seguinte.">
          {stages.length > 0 ? (
            <FunnelBars
              aria-label="Conversão por etapa do funil"
              header={{ left: 'Etapa', right: 'Leads' }}
              bottleneckIndex={bottleneckIndex}
              stages={stages.map(stage => ({
                label: stage.stage,
                value: stage.entered,
                display: integerFormat.format(stage.entered),
                conv: `${numberFormat.format(stage.conversionRate)}% avançaram (${stage.advanced} de ${stage.entered})`,
              }))}
            />
          ) : (
            <EmptyState title="Funil ainda sem dados" description="Cadastre leads e mova-os pelas etapas do funil para ver a conversão." />
          )}
        </SectionCard>
      </div>

      <SectionCard id="campanhas" title="Campanhas" description="Investimento e leads de cada campanha.">
        {hasMedia ? (
          <div className="grid gap-5">
            <CampaignChart campaigns={safeReport.campaignMetrics} />
            <ResponsiveTable
              caption="Resultados por campanha"
              columns={campaignColumns}
              rows={safeReport.campaignMetrics}
              getRowKey={row => row.campaignId}
            />
          </div>
        ) : (
          <EmptyState title="Nenhuma campanha para mostrar" description="Crie ou conecte uma campanha para acompanhar investimento e leads por aqui." />
        )}
      </SectionCard>

      <SectionCard id="paginas-captura" title="Páginas de captura" description="Quantos visitantes viram leads em cada página.">
        {safeReport.landingPageMetrics.length > 0 ? (
          <div className="grid gap-5">
            <BarList
              aria-label="Taxa de conversão por página de captura"
              items={safeReport.landingPageMetrics.map(page => ({
                label: page.name,
                value: page.conversionRate,
                display: `${numberFormat.format(page.conversionRate)}%`,
              }))}
            />
            <ResponsiveTable
              caption="Resultados por página de captura"
              columns={landingColumns}
              rows={safeReport.landingPageMetrics}
              getRowKey={row => row.landingPageId}
            />
          </div>
        ) : (
          <EmptyState title="Nenhuma página de captura com dados" description="Publique uma página de captura para acompanhar visitas, leads e conversão." />
        )}
      </SectionCard>

      <SectionCard id="propostas" title="Propostas" description="Propostas comerciais enviadas e aprovadas." bodyClassName="px-0 pb-0">
        {safeReport.proposalMetrics.sent > 0 ? (
          <KpiGrid count={3} aria-label="Propostas">
            <KpiCard label="Enviadas" value={integerFormat.format(safeReport.proposalMetrics.sent)} />
            <KpiCard label="Aprovadas" value={integerFormat.format(safeReport.proposalMetrics.approved)} />
            <KpiCard label="Taxa de aprovação" value={`${numberFormat.format(safeReport.proposalMetrics.approvalRate)}%`} />
          </KpiGrid>
        ) : (
          <div className="px-[18px] pb-[18px]">
            <EmptyState title="Nenhuma proposta enviada" description="As propostas enviadas e a taxa de aprovação aparecem aqui." />
          </div>
        )}
      </SectionCard>

      {attribution ? (
        <SectionCard
          id="origem-retorno"
          title="Origem e retorno dos leads"
          description={`Custo, receita e retorno por origem, de ${attribution.periodStart} a ${attribution.periodEnd}.`}
        >
          <div className="grid gap-5">
            {attribution.sources.length > 0 ? (
              <ResponsiveTable
                caption="Retorno por origem de lead"
                columns={attributionColumns}
                rows={attribution.sources}
                getRowKey={(row, index) => `${row.sourceId}-${index}`}
              />
            ) : (
              <EmptyState title="Nenhuma origem consolidada" description="Quando houver leads com origem identificada, o retorno de cada uma aparece aqui." />
            )}
            <AttributionAlerts alerts={attribution.alerts} />
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        id="resumo-periodo"
        title="Resumo do período"
        description="Leitura automática dos números acima."
        action={<StatusChip variant="yux">Gerado por IA</StatusChip>}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <InsightBlock title="Melhor oportunidade" value={insight.topOpportunity} />
          <InsightBlock title="O que mudou" value={insight.periodChange} />
          <InsightBlock
            title="Dados que faltam"
            value={insight.dataGaps.length ? insight.dataGaps.join(' ') : 'Nenhuma lacuna crítica nos dados.'}
          />
        </div>
        {insight.attributionCaveat ? (
          <p className="mt-3 rounded-lg border border-yx-warn-line bg-yx-warn-soft px-3 py-2.5 text-[13px] leading-snug text-yx-warn">
            {insight.attributionCaveat}
          </p>
        ) : null}
      </SectionCard>
    </div>
  )
}

function findBottleneck(stages: OperationalReport['stageConversions']): number | undefined {
  if (stages.length < 2) return undefined
  let index: number | undefined
  stages.forEach((stage, i) => {
    if (i === stages.length - 1 || stage.entered <= 0) return
    if (index === undefined || stage.conversionRate < stages[index].conversionRate) index = i
  })
  return index
}

function InsightBlock({ title, value }: { title: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-yx-line bg-yx-surface-2 p-3.5">
      <p className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{title}</p>
      <p className="mb-0 mt-1.5 text-[13.5px] leading-normal text-yx-fg-2">{value}</p>
    </div>
  )
}

function CampaignChart({ campaigns }: { campaigns: CampaignReportMetric[] }) {
  const data = campaigns.map(campaign => ({ name: campaign.name, spend: campaign.spend, leads: campaign.leads }))
  return (
    <figure
      data-testid="campaign-chart"
      role="img"
      aria-label="Gráfico de investimento e leads por campanha. Os mesmos números estão na tabela abaixo."
      className="m-0 h-[260px] w-full min-w-0"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--yx-line)" />
          <XAxis
            dataKey="name"
            tickFormatter={value => truncate(String(value))}
            tick={{ fill: 'var(--yx-fg-3)', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--yx-line)' }}
          />
          <YAxis
            yAxisId="spend"
            tickFormatter={value => formatCompactCurrency(Number(value))}
            tick={{ fill: 'var(--yx-fg-3)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <YAxis
            yAxisId="leads"
            orientation="right"
            allowDecimals={false}
            tick={{ fill: 'var(--yx-fg-3)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: 'var(--yx-surface-2)' }}
            formatter={(value, name) => (name === 'Investimento' ? formatPortalCurrency(Number(value)) : integerFormat.format(Number(value)))}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--yx-fg-2)' }} />
          <Bar yAxisId="spend" dataKey="spend" name="Investimento" fill="var(--yx-blue)" radius={[3, 3, 0, 0]} maxBarSize={48} />
          <Line
            yAxisId="leads"
            dataKey="leads"
            name="Leads"
            type="monotone"
            stroke="var(--yx-ok)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--yx-ok)', stroke: 'var(--yx-surface)' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  )
}

const numericCell = 'text-right tabular-nums'

const campaignColumns: ResponsiveTableColumn<CampaignReportMetric>[] = [
  { key: 'name', header: 'Campanha', mobileLabel: '', render: row => <span className="font-semibold">{row.name}</span> },
  { key: 'spend', header: 'Investimento', className: numericCell, render: row => formatPortalCurrency(row.spend) },
  { key: 'leads', header: 'Leads', className: numericCell, render: row => integerFormat.format(row.leads) },
  { key: 'cpl', header: 'CPL', className: numericCell, mobileLabel: 'Custo por lead (CPL)', render: row => (row.leads > 0 ? formatPortalCurrency(row.cpl) : '—') },
  {
    key: 'mroi',
    header: 'MROI',
    className: numericCell,
    mobileLabel: 'Retorno (MROI)',
    render: row => (row.spend > 0 ? `${numberFormat.format(row.mroi)}x` : '—'),
  },
]

const landingColumns: ResponsiveTableColumn<LandingPageReportMetric>[] = [
  { key: 'name', header: 'Página', mobileLabel: '', render: row => <span className="font-semibold">{row.name}</span> },
  { key: 'visits', header: 'Visitas', className: numericCell, render: row => integerFormat.format(row.visits) },
  { key: 'leads', header: 'Leads', className: numericCell, render: row => integerFormat.format(row.leads) },
  { key: 'conversionRate', header: 'Conversão', className: numericCell, render: row => `${numberFormat.format(row.conversionRate)}%` },
]

const attributionColumns: ResponsiveTableColumn<PortalLeadSourceRollup>[] = [
  { key: 'sourceName', header: 'Origem', mobileLabel: '', render: row => <span className="font-semibold">{row.sourceName}</span> },
  { key: 'leads', header: 'Leads', className: numericCell, render: row => integerFormat.format(row.leads) },
  { key: 'opportunities', header: 'Oportunidades', className: numericCell, render: row => integerFormat.format(row.opportunities) },
  { key: 'sales', header: 'Vendas', className: numericCell, render: row => integerFormat.format(row.sales) },
  { key: 'clientVisibleCost', header: 'Investimento', className: numericCell, render: row => formatPortalCurrency(row.clientVisibleCost) },
  { key: 'attributedRevenue', header: 'Receita', className: numericCell, render: row => formatPortalCurrency(row.attributedRevenue) },
  { key: 'cpl', header: 'CPL', className: numericCell, mobileLabel: 'Custo por lead (CPL)', render: row => formatPortalCurrency(row.cpl) },
  { key: 'conversionRate', header: 'Conversão', className: numericCell, render: row => `${numberFormat.format(row.conversionRate)}%` },
  { key: 'mroi', header: 'MROI', className: numericCell, mobileLabel: 'Retorno (MROI)', render: row => `${numberFormat.format(row.mroi)}x` },
]

function AttributionAlerts({ alerts }: { alerts: CrmMroiAlert[] }) {
  const open = alerts.filter(alert => alert.status === 'open')
  if (open.length === 0) return null
  return (
    <div className="grid gap-2">
      <h3 className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">Pontos de atenção</h3>
      <ul className="m-0 grid list-none gap-2 p-0">
        {open.map(alert => {
          const tone = alertTone[alert.severity]
          return (
            <li
              key={`${alert.sourceId || alert.campaignId}-${alert.title}-${alert.metricKey}`}
              className="flex flex-wrap items-start gap-2 rounded-lg border border-yx-line px-3 py-2.5 text-[13px]"
            >
              <StatusChip variant={tone.variant}>{tone.label}</StatusChip>
              <div className="min-w-0 flex-1">
                <p className="m-0 font-semibold text-yx-fg">{alert.title}</p>
                <p className="m-0 mt-0.5 text-yx-fg-2">{alert.description}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
