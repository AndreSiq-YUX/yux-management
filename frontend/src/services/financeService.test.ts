import { describe, expect, it } from 'vitest'
import {
  buildInvoiceFilters,
  mapBillingItemRow,
  mapInvoiceRow,
  mapInvoiceSummary,
} from './financeService'

describe('financeService mapping', () => {
  it('maps invoice rows, nested billing items, and numeric strings', () => {
    const invoice = mapInvoiceRow({
      id: 'invoice-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      invoice_number: 'YUX-2026-0001',
      status: 'issued',
      issue_date: '2026-06-01',
      due_date: '2026-06-10',
      period_start: '2026-06-01',
      period_end: '2026-06-30',
      currency: 'BRL',
      subtotal: '1000.50',
      adjustments: '50.25',
      total_amount: '1050.75',
      paid_amount: '250.25',
      paid_at: null,
      notes: 'Portal note',
      internal_notes: 'Internal note',
      created_at: '2026-06-01T12:00:00.000Z',
      updated_at: '2026-06-01T12:00:00.000Z',
      billing_items: [{
        id: 'item-1',
        invoice_id: 'invoice-1',
        description: 'Mensalidade',
        quantity: '2',
        unit_amount: '500.25',
        total_amount: '1000.50',
        kind: 'recurring',
        created_at: '2026-06-01T12:00:00.000Z',
        updated_at: '2026-06-01T12:00:00.000Z',
      }],
      clients: { company_name: 'Cliente YUX' },
      contracts: { name: 'Contrato principal', billing_cycle: 'monthly' },
    })

    expect(invoice.totalAmount).toBe(1050.75)
    expect(invoice.paidAmount).toBe(250.25)
    expect(invoice.clientName).toBe('Cliente YUX')
    expect(invoice.contractName).toBe('Contrato principal')
    expect(invoice.items[0].quantity).toBe(2)
  })

  it('maps billing item rows independently', () => {
    expect(mapBillingItemRow({
      id: 'item-1',
      invoice_id: 'invoice-1',
      description: 'Setup',
      quantity: '1',
      unit_amount: '700',
      total_amount: '700',
      kind: 'setup',
      created_at: '2026-06-01T12:00:00.000Z',
      updated_at: '2026-06-01T12:00:00.000Z',
    })).toMatchObject({
      invoiceId: 'invoice-1',
      unitAmount: 700,
      totalAmount: 700,
      kind: 'setup',
    })
  })

  it('builds filters without empty values', () => {
    expect(buildInvoiceFilters({
      organizationId: 'org-1',
      clientId: '',
      status: 'issued',
      dueFrom: undefined,
      dueTo: '2026-06-30',
    })).toEqual({
      organizationId: 'org-1',
      status: 'issued',
      dueTo: '2026-06-30',
    })
  })

  it('maps summary rows from RPC-like payloads', () => {
    expect(mapInvoiceSummary({
      total_issued: '2000',
      total_paid: '1500',
      total_open: '500',
      total_overdue: '250',
      overdue_count: '1',
      next_due_date: '2026-06-10',
    })).toEqual({
      totalIssued: 2000,
      totalPaid: 1500,
      totalOpen: 500,
      totalOverdue: 250,
      overdueCount: 1,
      nextDueDate: '2026-06-10',
    })
  })
})
