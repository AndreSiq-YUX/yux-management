import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { FinanceWorkspace } from './FinanceWorkspace'
import { PortalFinanceWorkspace } from './PortalFinanceWorkspace'
import type { FinanceInvoice, FinanceSummary } from '@/types/finance'
import type { ContractDetails } from '@/types/platform'

const summary: FinanceSummary = {
  totalIssued: 2500,
  totalPaid: 1000,
  totalOpen: 1500,
  totalOverdue: 500,
  overdueCount: 1,
  nextDueDate: '2026-06-10',
}

const invoice: FinanceInvoice = {
  id: 'invoice-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  clientName: 'Cliente YUX',
  contractName: 'Contrato principal',
  invoiceNumber: 'YUX-2026-0001',
  status: 'issued',
  issueDate: '2026-06-01',
  dueDate: '2026-06-10',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  currency: 'BRL',
  subtotal: 1500,
  adjustments: 0,
  totalAmount: 1500,
  paidAmount: 0,
  notes: 'Mensalidade',
  internalNotes: 'Cliente pediu boleto separado',
  createdAt: '2026-06-01T12:00:00.000Z',
  updatedAt: '2026-06-01T12:00:00.000Z',
  items: [{
    id: 'item-1',
    invoiceId: 'invoice-1',
    description: 'Operacao mensal',
    quantity: 1,
    unitAmount: 1500,
    totalAmount: 1500,
    kind: 'recurring',
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-01T12:00:00.000Z',
  }],
}

const contract: ContractDetails = {
  id: 'contract-1',
  clientId: 'client-1',
  packageId: 'package-1',
  name: 'Contrato principal',
  status: 'active',
  value: 1500,
  billingCycle: 'monthly',
  startsAt: '2026-06-01',
  createdAt: '2026-06-01T12:00:00.000Z',
  updatedAt: '2026-06-01T12:00:00.000Z',
  package: null,
  modules: [],
}

describe('FinanceWorkspace', () => {
  it('renders internal summary, invoice list, details, and controls', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const handlers = {
      onCreateInvoice: vi.fn(),
      onAddItem: vi.fn(),
      onStatusChange: vi.fn(),
      onRefresh: vi.fn(),
    }

    act(() => {
      root.render(
        <FinanceWorkspace
          invoices={[invoice]}
          summary={summary}
          clients={[{ id: 'client-1', name: 'Cliente YUX' }]}
          contracts={[{ id: 'contract-1', clientId: 'client-1', name: 'Contrato principal' }]}
          {...handlers}
        />,
      )
    })

    const html = container.innerHTML.replace(/&nbsp;/g, ' ')

    expect(html).toContain('Financeiro')
    expect(html).toContain('R$ 2.500,00')
    expect(html).toContain('YUX-2026-0001')
    expect(html).toContain('Cliente YUX')
    expect(html).toContain('Operacao mensal')
    expect(html).toContain('Cliente pediu boleto separado')

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Marcar como pago"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Cancelar fatura"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Adicionar item"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Criar fatura"]')!.click()
    })

    expect(handlers.onStatusChange).toHaveBeenCalledWith('invoice-1', 'paid', 1500)
    expect(handlers.onStatusChange).toHaveBeenCalledWith('invoice-1', 'cancelled')
    expect(handlers.onAddItem).toHaveBeenCalled()
    expect(handlers.onCreateInvoice).toHaveBeenCalled()

    act(() => root.unmount())
  })
})

describe('PortalFinanceWorkspace', () => {
  it('renders client-safe financial data without internal controls or notes', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(
        <PortalFinanceWorkspace
          contract={contract}
          invoices={[invoice]}
          summary={summary}
        />,
      )
    })

    const html = container.innerHTML.replace(/&nbsp;/g, ' ')

    expect(html).toContain('Financeiro do contrato')
    expect(html).toContain('Contrato principal')
    expect(html).toContain('YUX-2026-0001')
    expect(html).toContain('Operacao mensal')
    expect(html).not.toContain('Cliente pediu boleto separado')
    expect(html).not.toContain('Criar fatura')
    expect(container.querySelector('button[title="Marcar como pago"]')).toBeNull()

    act(() => root.unmount())
  })
})
