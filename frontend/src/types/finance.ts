export type InvoiceStatus = 'draft' | 'issued' | 'partial' | 'paid' | 'overdue' | 'cancelled'

export type BillingItemKind = 'setup' | 'recurring' | 'usage' | 'adjustment' | 'discount' | 'other'

export type InvoicePaymentState = 'open' | 'due_soon' | 'overdue' | 'partial_overdue' | 'paid' | 'cancelled'

export interface BillingItem {
  id: string
  invoiceId: string
  description: string
  quantity: number
  unitAmount: number
  totalAmount: number
  kind: BillingItemKind
  createdAt: string
  updatedAt: string
}

export interface FinanceInvoice {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  invoiceNumber: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  periodStart?: string
  periodEnd?: string
  currency: string
  subtotal: number
  adjustments: number
  totalAmount: number
  paidAmount: number
  paidAt?: string
  notes?: string
  internalNotes?: string
  clientName?: string
  contractName?: string
  billingCycle?: string
  createdAt: string
  updatedAt: string
  items: BillingItem[]
}

export interface FinanceSummary {
  totalIssued: number
  totalPaid: number
  totalOpen: number
  totalOverdue: number
  overdueCount: number
  nextDueDate?: string
}

export interface InvoiceFilters {
  organizationId?: string
  clientId?: string
  contractId?: string
  status?: InvoiceStatus
  dueFrom?: string
  dueTo?: string
}

export type PortalFinanceInvoice = Omit<FinanceInvoice, 'internalNotes'>
