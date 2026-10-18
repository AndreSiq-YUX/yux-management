import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { byText, click, flush, render } from '@/components/portal-ui/__tests__/render'
import { PortalFinancePage } from './PortalFinancePage'
import { financeService } from '@/services/financeService'
import { platformService } from '@/services/platformService'
import { supportService } from '@/services/supportService'
import { usePlatformStore } from '@/stores/platformStore'
import type { FinanceInvoice } from '@/types/finance'
import type { ContractDetails } from '@/types/platform'

const contract = {
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
} as ContractDetails

const dueDate = (() => {
  const date = new Date()
  date.setDate(date.getDate() + 4)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
})()

const invoice = {
  id: 'invoice-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  invoiceNumber: 'YUX-2026-0042',
  status: 'issued',
  issueDate: '2026-06-01',
  dueDate,
  currency: 'BRL',
  subtotal: 1500,
  adjustments: 0,
  totalAmount: 1500,
  paidAmount: 0,
  createdAt: '2026-06-01T12:00:00.000Z',
  updatedAt: '2026-06-01T12:00:00.000Z',
  items: [],
} as FinanceInvoice

beforeEach(() => {
  usePlatformStore.setState({ activeContract: contract, isLoading: false })
  vi.spyOn(financeService, 'getPortalInvoices').mockResolvedValue([invoice] as never)
  vi.spyOn(platformService, 'getOrganizations').mockResolvedValue([{ id: 'org-yux', slug: 'yux' }] as never)
  vi.spyOn(supportService, 'createTicket').mockResolvedValue({ id: 'ticket-1' } as never)
  vi.spyOn(supportService, 'addMessage').mockResolvedValue({} as never)
  vi.spyOn(toast, 'success').mockImplementation(() => '')
  vi.spyOn(toast, 'error').mockImplementation(() => '')
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('PortalFinancePage', () => {
  it('creates a billing support ticket when requesting a second copy', async () => {
    const { container, unmount } = await render(<PortalFinancePage />)
    await flush()
    await flush()

    expect(container.textContent).toContain('YUX-2026-0042')
    await click(byText(container, 'button', 'Solicitar segunda via'))
    await flush()

    expect(supportService.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-yux',
        clientId: 'client-1',
        contractId: 'contract-1',
        category: 'billing',
        subject: 'Segunda via da fatura nº YUX-2026-0042',
      }),
    )
    expect(supportService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'ticket-1', authorType: 'client', isInternal: false }),
    )
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('YUX-2026-0042'))
    await unmount()
  })

  it('does not report success when the ticket cannot be created', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(supportService, 'createTicket').mockRejectedValue(new Error('offline'))
    const { container, unmount } = await render(<PortalFinancePage />)
    await flush()
    await flush()

    await click(byText(container, 'button', 'Solicitar segunda via'))
    await flush()

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
    await unmount()
  })

  it('shows an error state with retry when invoices fail to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(financeService, 'getPortalInvoices').mockRejectedValueOnce(new Error('offline'))
    const { container, unmount } = await render(<PortalFinancePage />)
    await flush()
    await flush()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar o financeiro')
    await click(byText(container, 'button', 'Tentar novamente'))
    await flush()
    await flush()
    expect(container.textContent).toContain('YUX-2026-0042')
    await unmount()
  })
})
