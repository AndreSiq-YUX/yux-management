import { create } from 'zustand'
import { getInvoicePaymentState } from '@/lib/finance/financeRules'
import { financeService } from '@/services/financeService'
import { projectDeliveryService } from '@/services/projectDeliveryService'

export interface DueInvoiceBadge {
  id: string
  /** Texto curto para listas ("Fatura 2026-014"). */
  label: string
  dueDate: string
}

interface PortalBadgeState {
  /** Aprovações de projeto aguardando decisão do cliente. */
  pendingApprovals: number
  /** Faturas vencidas ou que vencem em até 7 dias. */
  dueInvoices: DueInvoiceBadge[]
  /** Organização para a qual os contadores foram pedidos por último. */
  loadedFor?: string
  refresh: (
    organizationId: string,
    contractId: string | null | undefined,
    enabledModuleKeys: string[],
  ) => Promise<void>
}

let latestRequest = 0

async function countPendingApprovals(organizationId: string) {
  try {
    const response = await projectDeliveryService.approvals(organizationId)
    return (response.approvals || []).filter(approval => approval.status === 'pending').length
  } catch {
    return 0
  }
}

async function loadDueInvoices(contractId: string): Promise<DueInvoiceBadge[]> {
  try {
    const invoices = await financeService.getPortalInvoices(contractId)
    return invoices
      .filter(invoice => invoice.status !== 'draft')
      .filter(invoice => {
        const state = getInvoicePaymentState(invoice)
        return state === 'overdue' || state === 'partial_overdue' || state === 'due_soon'
      })
      .map(invoice => ({
        id: invoice.id,
        label: invoice.invoiceNumber ? `Fatura ${invoice.invoiceNumber}` : 'Fatura',
        dueDate: invoice.dueDate,
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  } catch {
    return []
  }
}

/**
 * Contadores leves do menu e do sino. Faz no máximo duas chamadas (aprovações e faturas),
 * só dos módulos contratados, e deixa tudo em zero se alguma falhar: o contador é um
 * atalho, nunca deve atrapalhar a navegação nem exibir erro.
 */
export const usePortalBadgeStore = create<PortalBadgeState>((set) => ({
  pendingApprovals: 0,
  dueInvoices: [],
  loadedFor: undefined,

  refresh: async (organizationId, contractId, enabledModuleKeys) => {
    const requestId = ++latestRequest
    const wantsApprovals = enabledModuleKeys.includes('projects')
    const wantsInvoices = Boolean(contractId) && enabledModuleKeys.includes('finance')

    set({ pendingApprovals: 0, dueInvoices: [], loadedFor: organizationId })

    const [approvals, invoices] = await Promise.all([
      wantsApprovals ? countPendingApprovals(organizationId) : 0,
      wantsInvoices ? loadDueInvoices(contractId as string) : [],
    ])

    // Uma troca de organização durante a espera invalida a resposta antiga.
    if (requestId !== latestRequest) return
    set({ pendingApprovals: approvals, dueInvoices: invoices, loadedFor: organizationId })
  },
}))
