import { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit, Plus, RefreshCw } from 'lucide-react'
import { ContractFormModal } from '@/components/platform/ContractFormModal'
import { ContractModulesPanel } from '@/components/platform/ContractModulesPanel'
import { platformService } from '@/services/platformService'
import { supabaseService } from '@/services/supabaseService'
import type { Client } from '@/types/client'
import type { ContractDetails, PackageDefinition } from '@/types/platform'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function ContractsPage() {
  const [contracts, setContracts] = useState<ContractDetails[]>([])
  const [packages, setPackages] = useState<PackageDefinition[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingContract, setEditingContract] = useState<ContractDetails | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selectedContract = useMemo(() => {
    return contracts.find(contract => contract.id === selectedId) || null
  }, [contracts, selectedId])

  const clientNameById = useMemo(() => {
    return new Map(clients.map(client => [client.id, client.companyName]))
  }, [clients])

  const load = useCallback(async (preferredId?: string) => {
    setLoading(true)
    setError(null)

    try {
      const [loadedContracts, loadedPackages, clientsResponse] = await Promise.all([
        platformService.getContracts(),
        platformService.getPackages(),
        supabaseService.getClients({ page: 1, limit: 500 }),
      ])

      const loadedClients = ((clientsResponse as any).clients || (clientsResponse as any).data || []) as Client[]
      setContracts(loadedContracts)
      setPackages(loadedPackages)
      setClients(loadedClients)

      const nextSelectedId =
        preferredId && loadedContracts.some(contract => contract.id === preferredId)
          ? preferredId
          : loadedContracts[0]?.id || null
      setSelectedId(nextSelectedId)
    } catch (error) {
      console.error('Error loading contracts:', error)
      setError('Contratos ainda nao carregados do Supabase.')
      setContracts([])
      setPackages([])
      setClients([])
      setSelectedId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function handleNewContract() {
    setEditingContract(null)
    setModalOpen(true)
  }

  function handleEdit(contract: ContractDetails) {
    setEditingContract(contract)
    setModalOpen(true)
  }

  function handleSaved(contract: ContractDetails) {
    setSelectedId(contract.id)
    load(contract.id)
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Carregando contratos...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contratos</h1>
          <p className="text-gray-600">Administre contratos e modulos habilitados por cliente.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => load(selectedId || undefined)}
            className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleNewContract}
            className="inline-flex items-center rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white hover:bg-yux-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo contrato
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-lg border bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Contrato</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Valor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {contracts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                      Nenhum contrato carregado.
                    </td>
                  </tr>
                )}

                {contracts.map(contract => (
                  <tr
                    key={contract.id}
                    onClick={() => setSelectedId(contract.id)}
                    className={`cursor-pointer hover:bg-gray-50 ${
                      selectedId === contract.id ? 'bg-yux-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{contract.name || 'Sem nome'}</div>
                      <div className="text-xs text-gray-500">
                        {clientNameById.get(contract.clientId) || contract.clientId}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                        {contract.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {contract.value !== undefined ? currencyFormatter.format(contract.value) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation()
                          handleEdit(contract)
                        }}
                        className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <ContractModulesPanel
          contract={selectedContract}
          onChange={() => selectedContract && load(selectedContract.id)}
        />
      </div>

      <ContractFormModal
        open={modalOpen}
        contract={editingContract}
        clients={clients}
        packages={packages}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}
