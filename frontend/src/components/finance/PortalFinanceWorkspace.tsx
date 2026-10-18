import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronUp, FileText, Loader2, Receipt } from 'lucide-react'
import {
  EmptyState,
  KpiCard,
  KpiGrid,
  PageHeader,
  PendingAction,
  ResponsiveTable,
  SectionCard,
  StatusChip,
  portalButtonClasses,
  type ResponsiveTableColumn,
  type StatusChipVariant,
} from '@/components/portal-ui'
import {
  billingCycleLabel,
  formatDueLabel,
  formatPortalCurrency,
  formatShortDate,
  statusLabel,
} from '@/lib/client-portal/portalDisplay'
import { getInvoicePaymentState, sanitizeInvoiceForPortal } from '@/lib/finance/financeRules'
import { cn } from '@/lib/utils'
import type { FinanceInvoice, FinanceSummary, InvoicePaymentState, PortalFinanceInvoice } from '@/types/finance'
import type { ContractDetails } from '@/types/platform'

interface PortalFinanceWorkspaceProps {
  contract: ContractDetails | null
  invoices: FinanceInvoice[]
  summary: FinanceSummary
  /** Abre um chamado de Suporte (categoria Financeiro) pedindo a segunda via da fatura. Deve lançar erro se falhar. */
  onRequestSecondCopy: (invoice: PortalFinanceInvoice) => Promise<void>
}

const stateVariant: Record<InvoicePaymentState, StatusChipVariant> = {
  paid: 'ok',
  overdue: 'crit',
  partial_overdue: 'crit',
  due_soon: 'warn',
  open: 'neutral',
  cancelled: 'neutral',
}

interface InvoiceRow {
  invoice: PortalFinanceInvoice
  state: InvoicePaymentState
  openAmount: number
  isOpen: boolean
}

function toRow(invoice: FinanceInvoice): InvoiceRow {
  const safe = sanitizeInvoiceForPortal(invoice)
  const state = getInvoicePaymentState(invoice)
  const openAmount = Math.max(safe.totalAmount - safe.paidAmount, 0)
  return { invoice: safe, state, openAmount, isOpen: state !== 'paid' && state !== 'cancelled' }
}

function InvoiceStatus({ state }: { state: InvoicePaymentState }) {
  return <StatusChip variant={stateVariant[state]}>{statusLabel(state)}</StatusChip>
}

export function PortalFinanceWorkspace({ contract, invoices, summary, onRequestSecondCopy }: PortalFinanceWorkspaceProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [requestingId, setRequestingId] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      invoices
        .map(toRow)
        .sort((a, b) => b.invoice.dueDate.localeCompare(a.invoice.dueDate)),
    [invoices],
  )
  const nextInvoice = useMemo(
    () => rows.filter(row => row.isOpen).sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate))[0],
    [rows],
  )
  const expanded = rows.find(row => row.invoice.id === expandedId)

  async function requestSecondCopy(invoice: PortalFinanceInvoice) {
    if (requestingId) return
    setRequestingId(invoice.id)
    try {
      await onRequestSecondCopy(invoice)
      toast.success(`Pedido enviado: segunda via da fatura nº ${invoice.invoiceNumber}. Acompanhe em Ajuda e suporte.`)
    } catch (cause) {
      console.error('Erro ao solicitar segunda via:', cause)
      toast.error('Não foi possível pedir a segunda via. Tente novamente.')
    } finally {
      setRequestingId(null)
    }
  }

  if (!contract) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Financeiro" />
        <EmptyState
          icon={Receipt}
          title="Nenhum contrato ativo"
          description="Não encontramos um contrato ativo para a sua conta. Quando ele estiver ativo, suas faturas aparecem aqui."
        />
      </div>
    )
  }

  const columns: ResponsiveTableColumn<InvoiceRow>[] = [
    {
      key: 'invoiceNumber',
      header: 'Fatura',
      render: row => (
        <div className="grid gap-1">
          <span className="font-semibold">Nº {row.invoice.invoiceNumber}</span>
          <button
            type="button"
            aria-expanded={expandedId === row.invoice.id}
            onClick={() => setExpandedId(current => (current === row.invoice.id ? null : row.invoice.id))}
            className="inline-flex min-h-10 w-fit items-center gap-1 rounded text-[12.5px] font-semibold text-yx-blue hover:text-yx-blue-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue sm:min-h-0"
          >
            {expandedId === row.invoice.id ? <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />}
            {expandedId === row.invoice.id ? 'Ocultar itens' : 'Ver itens'}
          </button>
        </div>
      ),
    },
    {
      key: 'dueDate',
      header: 'Vencimento',
      render: row => (
        <div className="grid">
          <span>{formatShortDate(row.invoice.dueDate)}</span>
          {row.isOpen ? <span className="text-xs text-yx-fg-3">{formatDueLabel(row.invoice.dueDate)}</span> : null}
        </div>
      ),
    },
    { key: 'totalAmount', header: 'Valor', className: 'text-right tabular-nums', render: row => formatPortalCurrency(row.invoice.totalAmount) },
    { key: 'paidAmount', header: 'Pago', className: 'text-right tabular-nums', render: row => formatPortalCurrency(row.invoice.paidAmount) },
    { key: 'status', header: 'Situação', render: row => <InvoiceStatus state={row.state} /> },
    {
      key: 'actions',
      header: 'Ações',
      mobileLabel: '',
      render: row =>
        row.isOpen ? (
          <InvoiceActions row={row} requesting={requestingId === row.invoice.id} disabled={requestingId !== null} onSecondCopy={requestSecondCopy} compact />
        ) : null,
    },
  ]

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Financeiro"
        lead="Faturas, vencimentos e o resumo do seu contrato."
        meta={contract.name ? <StatusChip>{contract.name}</StatusChip> : undefined}
      />

      <KpiGrid variant="card" count={4} aria-label="Resumo financeiro">
        <KpiCard label="Total emitido" value={formatPortalCurrency(summary.totalIssued)} />
        <KpiCard label="Pago" value={formatPortalCurrency(summary.totalPaid)} />
        <KpiCard label="Em aberto" value={formatPortalCurrency(summary.totalOpen)} />
        <KpiCard
          label="Vencido"
          value={formatPortalCurrency(summary.totalOverdue)}
          delta={summary.overdueCount > 0 ? { text: `${summary.overdueCount} ${summary.overdueCount === 1 ? 'fatura' : 'faturas'}`, tone: 'bad' } : undefined}
        />
      </KpiGrid>

      {nextInvoice ? (
        <section
          aria-labelledby="proxima-fatura-title"
          className={cn(
            'rounded-[10px] border bg-yx-surface p-[18px] shadow-[0_1px_2px_rgba(14,17,32,0.04),0_2px_8px_rgba(14,17,32,0.04)] dark:shadow-none',
            nextInvoice.state === 'overdue' || nextInvoice.state === 'partial_overdue' ? 'border-yx-crit-line' : 'border-yx-line',
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="proxima-fatura-title"
                className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3"
              >
                {nextInvoice.state === 'overdue' || nextInvoice.state === 'partial_overdue' ? 'Fatura vencida' : 'Próxima fatura'}
              </h2>
              <p className="mb-0 mt-2 font-display text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
                {formatPortalCurrency(nextInvoice.openAmount)}
              </p>
              <p className="mb-0 mt-2 text-[13.5px] text-yx-fg-2">
                Fatura nº {nextInvoice.invoice.invoiceNumber} · vencimento em {formatShortDate(nextInvoice.invoice.dueDate)} ·{' '}
                <strong className="font-semibold text-yx-fg">{formatDueLabel(nextInvoice.invoice.dueDate)}</strong>
              </p>
            </div>
            <InvoiceStatus state={nextInvoice.state} />
          </div>
          <div className="mt-4">
            <InvoiceActions
              row={nextInvoice}
              requesting={requestingId === nextInvoice.invoice.id}
              disabled={requestingId !== null}
              onSecondCopy={requestSecondCopy}
            />
          </div>
        </section>
      ) : rows.length > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-yx-ok-line bg-yx-ok-soft px-[18px] py-4">
          <div>
            <h2 className="m-0 font-display text-base font-semibold text-yx-fg">Tudo em dia</h2>
            <p className="m-0 mt-1 text-[13px] text-yx-fg-2">Você não tem nenhuma fatura em aberto.</p>
          </div>
          <StatusChip variant="ok">Sem pendências</StatusChip>
        </section>
      ) : null}

      <SectionCard id="faturas" title="Faturas" description="Todas as faturas publicadas para o seu contrato.">
        <ResponsiveTable
          caption="Faturas do contrato"
          columns={columns}
          rows={rows}
          getRowKey={row => row.invoice.id}
          empty={
            <EmptyState
              icon={FileText}
              title="Nenhuma fatura publicada ainda"
              description="Quando a YUX publicar a sua primeira fatura, ela aparece aqui com valor e vencimento."
            />
          }
        />
        {expanded ? (
          <div className="mt-4 rounded-lg border border-yx-line bg-yx-surface-2 p-3.5" aria-live="polite">
            <h3 className="m-0 font-display text-sm font-semibold">Itens da fatura nº {expanded.invoice.invoiceNumber}</h3>
            {expanded.invoice.notes ? <p className="mb-0 mt-1 text-[13px] text-yx-fg-2">{expanded.invoice.notes}</p> : null}
            {expanded.invoice.items.length > 0 ? (
              <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                {expanded.invoice.items.map(item => (
                  <li key={item.id} className="flex items-start justify-between gap-3 text-[13px]">
                    <span className="min-w-0">{item.description}</span>
                    <span className="shrink-0 font-mono tabular-nums">{formatPortalCurrency(item.totalAmount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-2 text-[13px] text-yx-fg-3">Esta fatura não tem itens detalhados.</p>
            )}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard id="contrato" title="Seu contrato" description="Resumo do que está contratado.">
        <dl className="m-0 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <ContractItem label="Contrato" value={contract.name || 'Contrato ativo'} />
          <ContractItem label="Ciclo de cobrança" value={billingCycleLabel(contract.billingCycle)} />
          <ContractItem label="Valor do contrato" value={contract.value === undefined ? 'Não informado' : formatPortalCurrency(contract.value)} />
          <ContractItem
            label="Vigência"
            value={`${formatShortDate(contract.startsAt)} até ${contract.endsAt ? formatShortDate(contract.endsAt) : 'sem data de término'}`}
          />
        </dl>
      </SectionCard>
    </div>
  )
}

function ContractItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{label}</dt>
      <dd className="m-0 mt-1 font-medium text-yx-fg">{value}</dd>
    </div>
  )
}

function InvoiceActions({
  row,
  requesting,
  disabled,
  onSecondCopy,
  compact = false,
}: {
  row: InvoiceRow
  requesting: boolean
  disabled: boolean
  onSecondCopy: (invoice: PortalFinanceInvoice) => void | Promise<void>
  compact?: boolean
}) {
  const size = compact ? 'sm' : 'default'
  return (
    <div className={cn('flex flex-wrap items-start gap-2', compact && 'justify-end')}>
      <PendingAction code="B1" variant="primary" size={size}>Pagar</PendingAction>
      <PendingAction code="B1" variant="outline" size={size}>Baixar boleto</PendingAction>
      <button
        type="button"
        disabled={disabled}
        aria-busy={requesting}
        onClick={() => void onSecondCopy(row.invoice)}
        className={portalButtonClasses('ghost')}
      >
        {requesting ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}
        Solicitar segunda via
      </button>
    </div>
  )
}
