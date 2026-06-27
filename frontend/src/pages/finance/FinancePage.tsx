import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { FinanceWorkspace } from '@/components/finance/FinanceWorkspace'
import { calculateFinanceSummary } from '@/lib/finance/financeRules'
import { financeService } from '@/services/financeService'
import { platformService } from '@/services/platformService'
import { backendDataService } from '@/services/backendDataService'
import type { FinanceInvoice } from '@/types/finance'
import type { ContractDetails, Organization } from '@/types/platform'
import type { Client } from '@/types/client'

export function FinancePage() {
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([])
  const [contracts, setContracts] = useState<ContractDetails[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  const summary = useMemo(() => calculateFinanceSummary(invoices), [invoices])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [loadedInvoices, loadedContracts, clientsResponse, loadedOrganizations] = await Promise.all([
        financeService.getInvoices(),
        platformService.getContracts(),
        backendDataService.getClients({ page: 1, limit: 500 }),
        platformService.getOrganizations(),
      ])
      setInvoices(loadedInvoices)
      setContracts(loadedContracts)
      setClients(((clientsResponse as any).clients || (clientsResponse as any).data || []) as Client[])
      setOrganizations(loadedOrganizations)
    } catch (error) {
      console.error('Erro ao carregar financeiro:', error)
      toast.error('Erro ao carregar financeiro')
      setInvoices([])
      setContracts([])
      setClients([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="text-sm text-gray-600">Carregando financeiro...</p>

  return (
    <FinanceWorkspace
      invoices={invoices}
      summary={summary}
      clients={clients.map(client => ({ id: client.id, name: client.companyName }))}
      contracts={contracts.map(contract => ({ id: contract.id, clientId: contract.clientId, name: contract.name || contract.id }))}
      defaultOrganizationId={organizations.find(organization => organization.slug === 'yux')?.id || organizations[0]?.id}
      onRefresh={load}
      onCreateInvoice={async input => {
        await financeService.createInvoice(input)
        toast.success('Fatura criada')
        load()
      }}
      onAddItem={async input => {
        await financeService.addBillingItem(input)
        toast.success('Item adicionado')
        load()
      }}
      onStatusChange={async (invoiceId, status, paidAmount) => {
        await financeService.updateInvoiceStatus(invoiceId, status, paidAmount)
        toast.success('Status atualizado')
        load()
      }}
    />
  )
}
