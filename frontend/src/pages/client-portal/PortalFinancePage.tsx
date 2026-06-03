import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalFinanceWorkspace } from '@/components/finance/PortalFinanceWorkspace'
import { calculateFinanceSummary } from '@/lib/finance/financeRules'
import { financeService } from '@/services/financeService'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'
import type { FinanceInvoice } from '@/types/finance'

export function PortalFinancePage() {
  const { user } = useAuthStore()
  const { activeContract, initializeForUser } = usePlatformStore(state => ({
    activeContract: state.activeContract,
    initializeForUser: state.initializeForUser,
  }))
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const summary = useMemo(() => calculateFinanceSummary(invoices), [invoices])

  useEffect(() => {
    if (user?.id) initializeForUser(user.id)
  }, [initializeForUser, user?.id])

  useEffect(() => {
    async function load() {
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
  }, [activeContract])

  if (loading) return <p className="text-sm text-gray-600">Carregando financeiro...</p>

  return (
    <PortalFinanceWorkspace
      contract={activeContract}
      invoices={invoices}
      summary={summary}
    />
  )
}
