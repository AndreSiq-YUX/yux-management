import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { statusLabel } from '@/lib/client-portal/portalDisplay'
import { getInvoicePaymentState, sanitizeInvoiceForPortal } from '@/lib/finance/financeRules'
import type { FinanceInvoice, FinanceSummary } from '@/types/finance'
import type { ContractDetails } from '@/types/platform'

interface PortalFinanceWorkspaceProps {
  contract: ContractDetails | null
  invoices: FinanceInvoice[]
  summary: FinanceSummary
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function PortalFinanceWorkspace({ contract, invoices, summary }: PortalFinanceWorkspaceProps) {
  const portalInvoices = invoices.map(sanitizeInvoiceForPortal)

  if (!contract) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
        <p className="mt-2 text-gray-600">Nenhum contrato ativo encontrado para este usuario.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Financeiro do contrato</h1>
        <p className="text-gray-600">{contract.name || 'Contrato ativo'} - {contract.billingCycle || 'ciclo nao informado'}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Total emitido" value={money.format(summary.totalIssued)} />
        <Metric label="Pago" value={money.format(summary.totalPaid)} />
        <Metric label="Em aberto" value={money.format(summary.totalOpen)} />
        <Metric label="Vencido" value={money.format(summary.totalOverdue)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {portalInvoices.length === 0 && <p className="text-sm text-gray-500">Nenhuma fatura publicada para este contrato.</p>}
        {portalInvoices.map(invoice => (
          <Card key={invoice.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span>{invoice.invoiceNumber}</span>
                <span className="rounded bg-gray-100 px-2 py-1 text-xs font-normal">{statusLabel(getInvoicePaymentState(invoice))}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info label="Vencimento" value={invoice.dueDate} />
                <Info label="Valor" value={money.format(invoice.totalAmount)} />
                <Info label="Pago" value={money.format(invoice.paidAmount)} />
                <Info label="Status" value={statusLabel(invoice.status)} />
              </div>
              {invoice.notes && <p className="text-sm text-gray-600">{invoice.notes}</p>}
              <div className="space-y-2">
                {invoice.items.map(item => (
                  <div key={item.id} className="flex justify-between gap-3 rounded-md border p-2 text-sm">
                    <span>{item.description}</span>
                    <span>{money.format(item.totalAmount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-gray-500">{label}</p>
        <p className="mt-1 font-semibold text-gray-900">{value}</p>
      </CardContent>
    </Card>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
