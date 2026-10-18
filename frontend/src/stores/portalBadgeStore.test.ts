import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePortalBadgeStore } from './portalBadgeStore'

const mocks = vi.hoisted(() => ({
  approvals: vi.fn(),
  invoices: vi.fn(),
}))

vi.mock('@/services/projectDeliveryService', () => ({ projectDeliveryService: { approvals: mocks.approvals } }))
vi.mock('@/services/financeService', () => ({ financeService: { getPortalInvoices: mocks.invoices } }))

const day = (offset: number) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

const invoice = (id: string, dueOffset: number, extra: Record<string, unknown> = {}) => ({
  id,
  invoiceNumber: `N-${id}`,
  status: 'issued',
  dueDate: day(dueOffset),
  totalAmount: 100,
  paidAmount: 0,
  ...extra,
})

describe('portalBadgeStore', () => {
  beforeEach(() => {
    mocks.approvals.mockReset()
    mocks.invoices.mockReset()
    usePortalBadgeStore.setState({ pendingApprovals: 0, dueInvoices: [], loadedFor: undefined })
  })

  it('counts pending approvals and invoices due within 7 days or overdue', async () => {
    mocks.approvals.mockResolvedValue({ approvals: [{ status: 'pending' }, { status: 'approved' }, { status: 'pending' }] })
    mocks.invoices.mockResolvedValue([
      invoice('late', -3),
      invoice('soon', 5),
      invoice('far', 20),
      invoice('paid', -1, { status: 'paid' }),
      invoice('draft', 1, { status: 'draft' }),
    ])

    await usePortalBadgeStore.getState().refresh('org-1', 'contract-1', ['projects', 'finance'])

    const state = usePortalBadgeStore.getState()
    expect(state.pendingApprovals).toBe(2)
    expect(state.dueInvoices.map(item => item.id)).toEqual(['late', 'soon'])
    expect(state.dueInvoices[0]).toMatchObject({ label: 'Fatura N-late' })
    expect(state.loadedFor).toBe('org-1')
    expect(mocks.approvals).toHaveBeenCalledWith('org-1')
    expect(mocks.invoices).toHaveBeenCalledWith('contract-1')
  })

  it('only calls the services of contracted modules', async () => {
    await usePortalBadgeStore.getState().refresh('org-1', 'contract-1', [])
    await usePortalBadgeStore.getState().refresh('org-1', null, ['projects', 'finance'])

    expect(mocks.invoices).not.toHaveBeenCalled()
    expect(mocks.approvals).toHaveBeenCalledTimes(1)
  })

  it('keeps zeros silently when a request fails', async () => {
    mocks.approvals.mockRejectedValue(new Error('offline'))
    mocks.invoices.mockRejectedValue(new Error('offline'))

    await expect(usePortalBadgeStore.getState().refresh('org-1', 'contract-1', ['projects', 'finance'])).resolves.toBeUndefined()

    expect(usePortalBadgeStore.getState().pendingApprovals).toBe(0)
    expect(usePortalBadgeStore.getState().dueInvoices).toEqual([])
  })

  it('ignores a stale answer after the organization changes', async () => {
    let release: (value: unknown) => void = () => undefined
    mocks.approvals.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    mocks.approvals.mockResolvedValueOnce({ approvals: [{ status: 'pending' }] })

    const first = usePortalBadgeStore.getState().refresh('org-old', null, ['projects'])
    await usePortalBadgeStore.getState().refresh('org-new', null, ['projects'])
    release({ approvals: [{ status: 'pending' }, { status: 'pending' }, { status: 'pending' }] })
    await first

    expect(usePortalBadgeStore.getState().pendingApprovals).toBe(1)
    expect(usePortalBadgeStore.getState().loadedFor).toBe('org-new')
  })
})
