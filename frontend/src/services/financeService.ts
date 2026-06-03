import { supabase } from '@/lib/supabase'
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

export class FinanceService {
  async getInvoices(filters: InvoiceFilters = {}) {
    const activeFilters = buildInvoiceFilters(filters)
    let query = supabase
      .from('invoices')
      .select('*, billing_items(*), clients(company_name), contracts(name, billing_cycle)')
      .order('due_date', { ascending: true })

    if (activeFilters.organizationId) query = query.eq('organization_id', activeFilters.organizationId)
    if (activeFilters.clientId) query = query.eq('client_id', activeFilters.clientId)
    if (activeFilters.contractId) query = query.eq('contract_id', activeFilters.contractId)
    if (activeFilters.status) query = query.eq('status', activeFilters.status)
    if (activeFilters.dueFrom) query = query.gte('due_date', activeFilters.dueFrom)
    if (activeFilters.dueTo) query = query.lte('due_date', activeFilters.dueTo)

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapInvoiceRow)
  }

  async getPortalInvoices(contractId: string): Promise<PortalFinanceInvoice[]> {
    const invoices = await this.getInvoices({ contractId })
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
    const { data, error } = await supabase
      .from('invoices')
      .insert({
        organization_id: input.organizationId,
        client_id: input.clientId,
        contract_id: input.contractId,
        invoice_number: input.invoiceNumber,
        issue_date: input.issueDate,
        due_date: input.dueDate,
        period_start: input.periodStart || null,
        period_end: input.periodEnd || null,
        notes: input.notes || null,
        internal_notes: input.internalNotes || null,
      })
      .select('*, billing_items(*), clients(company_name), contracts(name, billing_cycle)')
      .single()

    if (error) throw error
    return mapInvoiceRow(data)
  }

  async updateInvoiceStatus(invoiceId: string, status: InvoiceStatus, paidAmount?: number) {
    const payload: Record<string, unknown> = {
      status,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
    }

    if (paidAmount !== undefined) payload.paid_amount = paidAmount

    const { data, error } = await supabase
      .from('invoices')
      .update(payload)
      .eq('id', invoiceId)
      .select('*, billing_items(*), clients(company_name), contracts(name, billing_cycle)')
      .single()

    if (error) throw error
    return mapInvoiceRow(data)
  }

  async addBillingItem(input: {
    invoiceId: string
    description: string
    quantity: number
    unitAmount: number
    kind: BillingItemKind
  }) {
    const { data, error } = await supabase
      .from('billing_items')
      .insert({
        invoice_id: input.invoiceId,
        description: input.description,
        quantity: input.quantity,
        unit_amount: input.unitAmount,
        kind: input.kind,
      })
      .select()
      .single()

    if (error) throw error
    return mapBillingItemRow(data)
  }
}

export const financeService = new FinanceService()
