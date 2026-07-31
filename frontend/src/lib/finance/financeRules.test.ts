import { describe, expect, it } from 'vitest'
import type { FinanceInvoice } from '@/types/finance'
import {
  calculateFinanceSummary,
  getInvoicePaymentState,
  getNextInvoiceDueDate,
  sanitizeInvoiceForPortal,
} from './financeRules'

const baseInvoice: FinanceInvoice = {
  id: 'invoice-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  invoiceNumber: 'YUX-2026-0001',
  status: 'issued',
  issueDate: '2026-06-01',
  dueDate: '2026-06-10',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  currency: 'BRL',
  subtotal: 1000,
  adjustments: 100,
  totalAmount: 1100,
  paidAmount: 0,
  notes: 'Mensalidade operacional',
  internalNotes: 'Cobranca revisada pelo financeiro',
  createdAt: '2026-06-01T12:00:00.000Z',
  updatedAt: '2026-06-01T12:00:00.000Z',
  items: [
    {
      id: 'item-1',
      invoiceId: 'invoice-1',
      description: 'Pacote mensal',
      quantity: 1,
      unitAmount: 1000,
      totalAmount: 1000,
      kind: 'recurring',
      createdAt: '2026-06-01T12:00:00.000Z',
      updatedAt: '2026-06-01T12:00:00.000Z',
    },
  ],
}

describe('financeRules', () => {
  it('classifies invoices by status, due date, and paid amount', () => {
    expect(getInvoicePaymentState({ ...baseInvoice, status: 'paid' }, new Date('2026-06-15'))).toBe('paid')
    expect(getInvoicePaymentState({ ...baseInvoice, paidAmount: 500 }, new Date('2026-06-15'))).toBe('partial_overdue')
    expect(getInvoicePaymentState(baseInvoice, new Date('2026-06-15'))).toBe('overdue')
    expect(getInvoicePaymentState(baseInvoice, new Date('2026-06-08'))).toBe('due_soon')
    expect(getInvoicePaymentState(baseInvoice, new Date('2026-06-02'))).toBe('open')
    expect(getInvoicePaymentState({ ...baseInvoice, status: 'cancelled' }, new Date('2026-06-15'))).toBe('cancelled')
  })

  it('summarizes receivables without counting cancelled invoices', () => {
    const summary = calculateFinanceSummary([
      baseInvoice,
      { ...baseInvoice, id: 'invoice-2', status: 'paid', totalAmount: 900, paidAmount: 900, dueDate: '2026-06-05' },
      { ...baseInvoice, id: 'invoice-3', status: 'cancelled', totalAmount: 400, paidAmount: 0 },
      { ...baseInvoice, id: 'invoice-4', status: 'issued', totalAmount: 300, paidAmount: 100, dueDate: '2026-06-07' },
    ], new Date('2026-06-12'))

    expect(summary.totalIssued).toBe(2300)
    expect(summary.totalPaid).toBe(1000)
    expect(summary.totalOpen).toBe(1300)
    expect(summary.totalOverdue).toBe(1300)
    expect(summary.overdueCount).toBe(2)
    expect(summary.nextDueDate).toBe('2026-06-07')
  })

  it('returns the next payable due date only for non-cancelled open invoices', () => {
    expect(getNextInvoiceDueDate([
      { ...baseInvoice, id: 'cancelled', status: 'cancelled', dueDate: '2026-06-01' },
      { ...baseInvoice, id: 'paid', status: 'paid', dueDate: '2026-06-02', paidAmount: 1100 },
      { ...baseInvoice, id: 'open', dueDate: '2026-06-12' },
    ])).toBe('2026-06-12')
  })

  it('removes internal notes from portal invoice payloads', () => {
    const portalInvoice = sanitizeInvoiceForPortal(baseInvoice)

    expect('internalNotes' in portalInvoice).toBe(false)
    expect(portalInvoice.notes).toBe('Mensalidade operacional')
    expect(portalInvoice.items).toHaveLength(1)
  })
})
