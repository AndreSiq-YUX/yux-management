import { useMemo, useState } from 'react'
import { CheckCircle2, Plus, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getInvoicePaymentState } from '@/lib/finance/financeRules'
import type { BillingItemKind, FinanceInvoice, FinanceSummary, InvoiceStatus } from '@/types/finance'

interface FinanceWorkspaceProps {
  invoices: FinanceInvoice[]
  summary: FinanceSummary
  clients: Array<{ id: string; name: string }>
  contracts: Array<{ id: string; clientId: string; name: string }>
  defaultOrganizationId?: string
  onCreateInvoice: (input: {
    organizationId: string
    clientId: string
    contractId: string
    invoiceNumber: string
    issueDate: string
    dueDate: string
    notes?: string
    internalNotes?: string
  }) => void | Promise<void>
  onAddItem: (input: {
    invoiceId: string
    description: string
    quantity: number
    unitAmount: number
    kind: BillingItemKind
  }) => void | Promise<void>
  onStatusChange: (invoiceId: string, status: InvoiceStatus, paidAmount?: number) => void | Promise<void>
  onRefresh: () => void | Promise<void>
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function FinanceWorkspace({
  invoices,
  summary,
  clients,
  contracts,
  defaultOrganizationId,
  onCreateInvoice,
  onAddItem,
  onStatusChange,
  onRefresh,
}: FinanceWorkspaceProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(invoices[0]?.id)
  const selectedInvoice = useMemo(
    () => invoices.find(invoice => invoice.id === selectedInvoiceId) || invoices[0],
    [invoices, selectedInvoiceId],
  )
  const firstContract = contracts[0]
  const firstClient = clients.find(client => client.id === firstContract?.clientId) || clients[0]
  const [invoiceNumber, setInvoiceNumber] = useState(`YUX-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, '0')}`)
  const [dueDate, setDueDate] = useState(addDays(10))
  const [notes, setNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [itemDescription, setItemDescription] = useState('Mensalidade')
  const [itemAmount, setItemAmount] = useState('0')

  function createInvoice() {
    if (!firstClient || !firstContract) return
    onCreateInvoice({
      organizationId: defaultOrganizationId || selectedInvoice?.organizationId || 'org-1',
      clientId: firstClient.id,
      contractId: firstContract.id,
      invoiceNumber,
      issueDate: todayDate(),
      dueDate,
      notes,
      internalNotes,
    })
  }

  function addItem() {
    if (!selectedInvoice) return
    onAddItem({
      invoiceId: selectedInvoice.id,
      description: itemDescription,
      quantity: 1,
      unitAmount: Number(itemAmount || 0),
      kind: 'recurring',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-gray-600">Controle faturas, itens de cobranca e status de pagamento.</p>
        </div>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Metric label="Emitido" value={money.format(summary.totalIssued)} />
        <Metric label="Recebido" value={money.format(summary.totalPaid)} />
        <Metric label="Aberto" value={money.format(summary.totalOpen)} />
        <Metric label="Vencido" value={money.format(summary.totalOverdue)} />
        <Metric label="Proximo vencimento" value={summary.nextDueDate || '-'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Nova fatura</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Input value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} aria-label="Numero da fatura" />
              <Input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} aria-label="Vencimento" />
              <Textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Observacao para o cliente" />
              <Textarea value={internalNotes} onChange={event => setInternalNotes(event.target.value)} placeholder="Observacao interna" />
              <Button title="Criar fatura" onClick={createInvoice}>
                <Plus className="mr-2 h-4 w-4" />
                Criar fatura
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Faturas</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {invoices.length === 0 && <p className="text-sm text-gray-500">Nenhuma fatura cadastrada.</p>}
              {invoices.map(invoice => (
                <button
                  key={invoice.id}
                  type="button"
                  onClick={() => setSelectedInvoiceId(invoice.id)}
                  className={`w-full rounded-md border p-3 text-left ${selectedInvoice?.id === invoice.id ? 'border-yux-400 bg-yux-50' : 'bg-white hover:bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-gray-900">{invoice.invoiceNumber}</span>
                    <span className="rounded bg-gray-100 px-2 py-1 text-xs">{getInvoicePaymentState(invoice)}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{invoice.clientName || invoice.clientId} - {money.format(invoice.totalAmount)}</p>
                  <p className="text-xs text-gray-500">Vence em {invoice.dueDate}</p>
                </button>
              ))}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          {selectedInvoice ? (
            <Card>
              <CardHeader><CardTitle className="text-base">{selectedInvoice.invoiceNumber}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-medium">{selectedInvoice.clientName || selectedInvoice.clientId}</p>
                  <p className="text-sm text-gray-500">{selectedInvoice.contractName || selectedInvoice.contractId}</p>
                  <p className="text-sm text-gray-500">Vencimento {selectedInvoice.dueDate}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Info label="Total" value={money.format(selectedInvoice.totalAmount)} />
                  <Info label="Pago" value={money.format(selectedInvoice.paidAmount)} />
                  <Info label="Status" value={selectedInvoice.status} />
                  <Info label="Estado" value={getInvoicePaymentState(selectedInvoice)} />
                </div>
                {selectedInvoice.notes && <p className="text-sm text-gray-600">{selectedInvoice.notes}</p>}
                {selectedInvoice.internalNotes && <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">{selectedInvoice.internalNotes}</p>}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Itens</h3>
                  {selectedInvoice.items.map(item => (
                    <div key={item.id} className="flex justify-between gap-3 rounded-md border p-2 text-sm">
                      <span>{item.description}</span>
                      <span>{money.format(item.totalAmount)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2">
                  <Input value={itemDescription} onChange={event => setItemDescription(event.target.value)} aria-label="Descricao do item" />
                  <Input type="number" min="0" value={itemAmount} onChange={event => setItemAmount(event.target.value)} aria-label="Valor do item" />
                  <Button title="Adicionar item" variant="outline" onClick={addItem}>Adicionar item</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button title="Marcar como pago" onClick={() => onStatusChange(selectedInvoice.id, 'paid', selectedInvoice.totalAmount)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Marcar como pago
                  </Button>
                  <Button title="Cancelar fatura" variant="outline" onClick={() => onStatusChange(selectedInvoice.id, 'cancelled')}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="p-4 text-sm text-gray-500">Selecione uma fatura.</CardContent></Card>
          )}
        </aside>
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
