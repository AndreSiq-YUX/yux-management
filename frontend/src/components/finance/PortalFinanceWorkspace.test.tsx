import { afterEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { byText, click, render } from '@/components/portal-ui/__tests__/render'
import { PortalFinanceWorkspace } from './PortalFinanceWorkspace'
import { calculateFinanceSummary } from '@/lib/finance/financeRules'
import type { FinanceInvoice } from '@/types/finance'
import type { ContractDetails } from '@/types/platform'

const isoDay = (offsetDays: number) => {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const makeInvoice = (overrides: Partial<FinanceInvoice>): FinanceInvoice => ({
  id: 'invoice-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  clientName: 'Cliente YUX',
  contractName: 'Contrato principal',
  invoiceNumber: 'YUX-2026-0001',
  status: 'issued',
  issueDate: isoDay(-20),
  dueDate: isoDay(3),
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
    description: 'Operação mensal',
    quantity: 1,
    unitAmount: 1500,
    totalAmount: 1500,
    kind: 'recurring',
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-01T12:00:00.000Z',
  }],
  ...overrides,
})

const contract: ContractDetails = {
  id: 'contract-1',
  clientId: 'client-1',
  packageId: 'package-1',
  name: 'Contrato principal',
  status: 'active',
  value: 1500,
  billingCycle: 'monthly',
  startsAt: '2026-06-01',
  endsAt: '2027-05-31',
  createdAt: '2026-06-01T12:00:00.000Z',
  updatedAt: '2026-06-01T12:00:00.000Z',
  package: null,
  modules: [],
}

const invoices = [
  makeInvoice({}),
  makeInvoice({ id: 'invoice-0', invoiceNumber: 'YUX-2026-0000', status: 'paid', dueDate: isoDay(-27), paidAmount: 1500, items: [] }),
  makeInvoice({ id: 'invoice-late', invoiceNumber: 'YUX-2026-0099', dueDate: isoDay(-5), items: [] }),
]

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const HIGHLIGHT = 'section[aria-labelledby="proxima-fatura-title"]'

const mount = (onRequestSecondCopy = vi.fn().mockResolvedValue(undefined), list = invoices) =>
  render(
    <PortalFinanceWorkspace
      contract={contract}
      invoices={list}
      summary={calculateFinanceSummary(list)}
      onRequestSecondCopy={onRequestSecondCopy}
    />,
  )

describe('PortalFinanceWorkspace', () => {
  it('shows summary KPIs, the contract and client-safe invoices without internal notes', async () => {
    const { container, unmount } = await mount()
    const text = (container.textContent ?? '').replace(/\u00a0/g, ' ')

    expect(container.querySelector('h1')?.textContent).toBe('Financeiro')
    for (const label of ['Total emitido', 'Pago', 'Em aberto', 'Vencido']) expect(text).toContain(label)
    expect(text).toContain('R$ 4.500,00')
    expect(text).toContain('Mensal')
    expect(text).toContain('Seu contrato')
    expect(text).toContain('R$ 1.500,00')
    expect(text).toContain('Nº YUX-2026-0001')
    expect(text).not.toContain('Cliente pediu boleto separado')
    expect(text).not.toContain('Financeiro do contrato')
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    await unmount()
  })

  it('highlights the oldest open invoice with due label and status tone', async () => {
    const { container, unmount } = await mount()
    const highlight = container.querySelector(HIGHLIGHT)!

    expect(highlight.textContent).toContain('Fatura vencida')
    expect(highlight.textContent).toContain('YUX-2026-0099')
    expect(highlight.textContent).toContain('venceu há 5 dias')
    expect(highlight.querySelector('[data-variant="crit"]')?.textContent).toBe('Vencido')
    await unmount()
  })

  it('uses status tones by payment state and shows each invoice status once in the list', async () => {
    const { container, unmount } = await mount()
    const table = container.querySelector('[data-testid="responsive-table-desktop"]')!
    const chips = Array.from(table.querySelectorAll('[data-variant]')).map(chip => [chip.getAttribute('data-variant'), chip.textContent])

    expect(chips).toEqual(expect.arrayContaining([['ok', 'Pago'], ['crit', 'Vencido'], ['warn', 'Vence em breve']]))
    expect(chips).toHaveLength(3)
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3)
    await unmount()
  })

  it('keeps Pagar and Baixar boleto visible as pending (B1) without simulating success', async () => {
    const toastSuccess = vi.spyOn(toast, 'success').mockImplementation(() => '')
    const { container, unmount } = await mount()
    const highlight = container.querySelector(HIGHLIGHT)!

    const pay = Array.from(highlight.querySelectorAll('button')).find(button => button.textContent?.startsWith('Pagar'))!
    const boleto = Array.from(highlight.querySelectorAll('button')).find(button => button.textContent?.startsWith('Baixar boleto'))!
    expect(pay.textContent).toContain('Pendente')
    expect(boleto.textContent).toContain('Pendente')

    await click(pay)
    expect(highlight.querySelector('[role="status"]')?.textContent).toContain('em implantação')
    expect(toastSuccess).not.toHaveBeenCalled()
    await unmount()
  })

  it('requests a second copy through the callback and confirms with a toast', async () => {
    const toastSuccess = vi.spyOn(toast, 'success').mockImplementation(() => '')
    const onRequestSecondCopy = vi.fn().mockResolvedValue(undefined)
    const { container, unmount } = await mount(onRequestSecondCopy)

    await click(byText(container.querySelector(HIGHLIGHT)!, 'button', 'Solicitar segunda via'))

    expect(onRequestSecondCopy).toHaveBeenCalledTimes(1)
    expect(onRequestSecondCopy.mock.calls[0][0]).toMatchObject({ invoiceNumber: 'YUX-2026-0099' })
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('YUX-2026-0099'))
    await unmount()
  })

  it('shows an error toast and no success when the second copy request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const toastSuccess = vi.spyOn(toast, 'success').mockImplementation(() => '')
    const toastError = vi.spyOn(toast, 'error').mockImplementation(() => '')
    const { container, unmount } = await mount(vi.fn().mockRejectedValue(new Error('falhou')))

    await click(byText(container.querySelector(HIGHLIGHT)!, 'button', 'Solicitar segunda via'))

    expect(toastError).toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    await unmount()
  })

  it('expands invoice items on demand', async () => {
    const { container, unmount } = await mount()
    expect(container.textContent).not.toContain('Itens da fatura nº')

    await click(container.querySelector('[data-testid="responsive-table-desktop"] button[aria-expanded]'))
    expect(container.textContent).toContain('Itens da fatura nº')
    await unmount()
  })

  it('shows an honest empty state when there are no invoices', async () => {
    const { container, unmount } = await mount(undefined, [])
    expect(container.textContent).toContain('Nenhuma fatura publicada ainda')
    expect(container.querySelector(HIGHLIGHT)).toBeNull()
    await unmount()
  })

  it('shows "Tudo em dia" when every invoice is paid', async () => {
    const { container, unmount } = await mount(undefined, [invoices[1]])
    expect(container.textContent).toContain('Tudo em dia')
    await unmount()
  })
})
