import { apiRequest } from '@/lib/apiClient'
import { calculateFinanceSummary, sanitizeInvoiceForPortal } from '@/lib/finance/financeRules'
import type {
  BillingItem,
  BillingItemKind,
  FinanceInvoice,
  FinanceSummary,
  InvoiceFilters,
  InvoiceStatus,
  PortalFinanceInvoice,
} from '@/types/finance'

const numberValue = (value: number | string | null | undefined) => Number(value || 0)

export function mapBillingItemRow(row: any): BillingItem {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    description: row.description,
    quantity: numberValue(row.quantity),
    unitAmount: numberValue(row.unit_amount),
    totalAmount: numberValue(row.total_amount),
    kind: row.kind as BillingItemKind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapInvoiceRow(row: any): FinanceInvoice {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    invoiceNumber: row.invoice_number,
    status: row.status as InvoiceStatus,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    periodStart: row.period_start || undefined,
    periodEnd: row.period_end || undefined,
    currency: row.currency || 'BRL',
    subtotal: numberValue(row.subtotal),
    adjustments: numberValue(row.adjustments),
    totalAmount: numberValue(row.total_amount),
    paidAmount: numberValue(row.paid_amount),
    paidAt: row.paid_at || undefined,
    notes: row.notes || undefined,
    internalNotes: row.internal_notes || undefined,
    clientName: row.clients?.company_name,
    contractName: row.contracts?.name,
    billingCycle: row.contracts?.billing_cycle,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: Array.isArray(row.billing_items) ? row.billing_items.map(mapBillingItemRow) : [],
  }
}

export function buildInvoiceFilters(filters: InvoiceFilters): InvoiceFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ) as InvoiceFilters
}

export function mapInvoiceSummary(row: any): FinanceSummary {
  return {
    totalIssued: numberValue(row.total_issued),
    totalPaid: numberValue(row.total_paid),
    totalOpen: numberValue(row.total_open),
    totalOverdue: numberValue(row.total_overdue),
    overdueCount: numberValue(row.overdue_count),
    nextDueDate: row.next_due_date || undefined,
  }
}

function buildQuery(filters: InvoiceFilters) {
  const search = new URLSearchParams()
  Object.entries(buildInvoiceFilters(filters)).forEach(([key, value]) => {
    search.set(key, String(value))
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

export class FinanceService {
  async getInvoices(filters: InvoiceFilters = {}) {
    const data = await apiRequest<any[]>(`/finance/invoices${buildQuery(filters)}`)
    return (data || []).map(mapInvoiceRow)
  }

  async getPortalInvoices(contractId: string): Promise<PortalFinanceInvoice[]> {
    const data = await apiRequest<any[]>(`/finance/portal/invoices?contractId=${encodeURIComponent(contractId)}`)
    const invoices = (data || []).map(mapInvoiceRow)
    return invoices.map(sanitizeInvoiceForPortal)
  }

  async getSummary(filters: InvoiceFilters = {}) {
    return calculateFinanceSummary(await this.getInvoices(filters))
  }

  async createInvoice(input: {
    organizationId: string
    clientId: string
    contractId: string
    invoiceNumber: string
    issueDate: string
    dueDate: string
    periodStart?: string
    periodEnd?: string
    notes?: string
    internalNotes?: string
  }) {
    const data = await apiRequest<any>('/finance/invoices', {
      method: 'POST',
      body: input,
    })
    return mapInvoiceRow(data)
  }

  async updateInvoiceStatus(invoiceId: string, status: InvoiceStatus, paidAmount?: number) {
    const data = await apiRequest<any>(`/finance/invoices/${invoiceId}/status`, {
      method: 'PATCH',
      body: { status, paidAmount },
    })
    return mapInvoiceRow(data)
  }

  async addBillingItem(input: {
    invoiceId: string
    description: string
    quantity: number
    unitAmount: number
    kind: BillingItemKind
  }) {
    const data = await apiRequest<any>('/finance/billing-items', {
      method: 'POST',
      body: input,
    })
    return mapBillingItemRow(data)
  }
}

export const financeService = new FinanceService()
