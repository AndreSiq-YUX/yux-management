import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { EmptyState, ErrorState, PageHeader, SkeletonCard, SkeletonKpiGrid } from '@/components/portal-ui'
import { Receipt } from 'lucide-react'
import { PortalFinanceWorkspace } from '@/components/finance/PortalFinanceWorkspace'
import { calculateFinanceSummary } from '@/lib/finance/financeRules'
import { createPortalTicket } from '@/lib/support/createPortalTicket'
import { formatShortDate } from '@/lib/client-portal/portalDisplay'
import { financeService } from '@/services/financeService'
import { usePlatformStore } from '@/stores/platformStore'
import type { FinanceInvoice, PortalFinanceInvoice } from '@/types/finance'

export function PortalFinancePage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const summary = useMemo(() => calculateFinanceSummary(invoices), [invoices])

  const load = useCallback(async () => {
    if (isPlatformLoading) {
      setLoading(true)
      return
    }

    if (!activeContract) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(false)
    try {
      setInvoices(await financeService.getPortalInvoices(activeContract.id) as FinanceInvoice[])
    } catch (cause) {
      console.error('Erro ao carregar financeiro do portal:', cause)
      toast.error('Erro ao carregar financeiro')
      setError(true)
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [activeContract, isPlatformLoading])

  useEffect(() => { void load() }, [load])

  const requestSecondCopy = useCallback(async (invoice: PortalFinanceInvoice) => {
    if (!activeContract) throw new Error('Nenhum contrato ativo')
    await createPortalTicket({
      clientId: activeContract.clientId,
      contractId: activeContract.id,
      category: 'billing',
      priority: 'medium',
      subject: `Segunda via da fatura nº ${invoice.invoiceNumber}`,
      body: `Olá! Preciso da segunda via da fatura nº ${invoice.invoiceNumber}, com vencimento em ${formatShortDate(invoice.dueDate)}.`,
    })
  }, [activeContract])

  if (loading) {
    return (
      <div className="w-full space-y-6" aria-busy="true">
        <PageHeader title="Financeiro" lead="Carregando suas faturas…" />
        <SkeletonKpiGrid count={4} />
        <SkeletonCard lines={4} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Financeiro" />
        <ErrorState title="Não foi possível carregar o financeiro." description="Verifique sua conexão e tente de novo." onRetry={() => void load()} />
      </div>
    )
  }

  if (!activeContract) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Financeiro" />
        <EmptyState
          icon={Receipt}
          title="Nenhum contrato ativo"
          description="Não encontramos um contrato ativo para a sua conta. Quando ele estiver ativo, suas faturas aparecem aqui."
        />
      </div>
    )
  }

  return (
    <PortalFinanceWorkspace
      contract={activeContract}
      invoices={invoices}
      summary={summary}
      onRequestSecondCopy={requestSecondCopy}
    />
  )
}
