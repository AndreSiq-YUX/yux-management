import type {
  FinanceInvoice,
  FinanceSummary,
  InvoicePaymentState,
  PortalFinanceInvoice,
} from '@/types/finance'

function dateOnly(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value.slice(0, 10)
}

function daysBetween(from: Date, toDateOnly: string) {
  const fromDate = new Date(`${dateOnly(from)}T00:00:00.000Z`)
  const toDate = new Date(`${toDateOnly}T00:00:00.000Z`)
  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000)
}

function isPayable(invoice: FinanceInvoice) {
  return invoice.status !== 'cancelled' && invoice.status !== 'paid' && invoice.paidAmount < invoice.totalAmount
}

export function getInvoicePaymentState(invoice: FinanceInvoice, now = new Date()): InvoicePaymentState {
  if (invoice.status === 'cancelled') return 'cancelled'
  if (invoice.status === 'paid' || invoice.paidAmount >= invoice.totalAmount) return 'paid'

  const daysToDue = daysBetween(now, invoice.dueDate)

  if (daysToDue < 0) {
    return invoice.paidAmount > 0 ? 'partial_overdue' : 'overdue'
  }

  if (daysToDue <= 7) return 'due_soon'
  return 'open'
}

export function getNextInvoiceDueDate(invoices: FinanceInvoice[]) {
  return invoices
    .filter(isPayable)
    .map(invoice => invoice.dueDate.slice(0, 10))
    .sort()[0]
}

export function calculateFinanceSummary(invoices: FinanceInvoice[], now = new Date()): FinanceSummary {
  return invoices.reduce<FinanceSummary>((summary, invoice) => {
    if (invoice.status === 'cancelled') return summary

    const openAmount = Math.max(invoice.totalAmount - invoice.paidAmount, 0)
    const state = getInvoicePaymentState(invoice, now)

    summary.totalIssued += invoice.totalAmount
    summary.totalPaid += invoice.paidAmount
    summary.totalOpen += openAmount

    if (state === 'overdue' || state === 'partial_overdue') {
      summary.totalOverdue += openAmount
      summary.overdueCount += 1
    }

    const nextDueDate = getNextInvoiceDueDate([invoice])
    if (nextDueDate && (!summary.nextDueDate || nextDueDate < summary.nextDueDate)) {
      summary.nextDueDate = nextDueDate
    }

    return summary
  }, {
    totalIssued: 0,
    totalPaid: 0,
    totalOpen: 0,
    totalOverdue: 0,
    overdueCount: 0,
  })
}

export function sanitizeInvoiceForPortal(invoice: FinanceInvoice): PortalFinanceInvoice {
  const { internalNotes: _internalNotes, ...portalInvoice } = invoice
  return portalInvoice
}
