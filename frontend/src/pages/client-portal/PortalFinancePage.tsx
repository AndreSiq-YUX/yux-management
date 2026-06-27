import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalFinanceWorkspace } from '@/components/finance/PortalFinanceWorkspace'
import { calculateFinanceSummary } from '@/lib/finance/financeRules'
import { financeService } from '@/services/financeService'
import { usePlatformStore } from '@/stores/platformStore'
import type { FinanceInvoice } from '@/types/finance'

export function PortalFinancePage() {
  const { activeContract, isPlatformLoading } = usePlatformStore(state => ({
    activeContract: state.activeContract,
    isPlatformLoading: state.isLoading,
  }))
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const summary = useMemo(() => calculateFinanceSummary(invoices), [invoices])

  useEffect(() => {
    async function load() {
      if (isPlatformLoading) {
        setLoading(true)
        return
      }

      if (!activeContract) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        setInvoices(await financeService.getPortalInvoices(activeContract.id) as FinanceInvoice[])
      } catch (error) {
        console.error('Erro ao carregar financeiro do portal:', error)
        toast.error('Erro ao carregar financeiro')
        setInvoices([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [activeContract, isPlatformLoading])

  if (loading) return <p className="text-sm text-gray-600">Carregando financeiro...</p>

  return (
    <PortalFinanceWorkspace
      contract={activeContract}
      invoices={invoices}
      summary={summary}
    />
  )
}
