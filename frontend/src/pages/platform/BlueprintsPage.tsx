import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { BlueprintApplyPanel } from '@/components/platform/BlueprintApplyPanel'
import { platformService } from '@/services/platformService'
import { supabaseService } from '@/services/supabaseService'
import type { Client } from '@/types/client'
import type { Blueprint, ContractDetails, Organization } from '@/types/platform'

export function BlueprintsPage() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  const [contracts, setContracts] = useState<ContractDetails[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedContracts, setSelectedContracts] = useState<Record<string, string>>({})
  const [applyingBlueprintId, setApplyingBlueprintId] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const [nextBlueprints, nextContracts, clientsResponse, nextOrganizations] = await Promise.all([
          platformService.getBlueprints(),
          platformService.getContracts(),
          supabaseService.getClients({ page: 1, limit: 500 }),
          platformService.getOrganizations(),
        ])
        const nextClients = ((clientsResponse as any).clients || (clientsResponse as any).data || []) as Client[]
        setBlueprints(nextBlueprints)
        setContracts(nextContracts)
        setClients(nextClients)
        setOrganizations(nextOrganizations)
      } catch (error) {
        console.error('Error loading blueprints:', error)
        setBlueprints([])
        setContracts([])
        setClients([])
        setOrganizations([])
        setError('Modelos setoriais ainda nao carregados do Supabase.')
      } finally {
        setLoading(false)
      }
  }

  useEffect(() => {
    load()
  }, [])

  const applyBlueprint = async (blueprint: Blueprint) => {
    const contractId = selectedContracts[blueprint.id]
    const contract = contracts.find(item => item.id === contractId)
    if (!contract) return

    const client = clients.find(clientItem => clientItem.id === contract.clientId)
    let organization = organizations.find(item => item.clientId === contract.clientId)

    if (!client) {
      toast.error('Cliente do contrato nao foi carregado.')
      return
    }

    try {
      setApplyingBlueprintId(blueprint.id)
      if (!organization) {
        organization = await platformService.createClientOrganization({
          clientId: contract.clientId,
          name: client.companyName,
        })
      }

      await platformService.applyBlueprintToContract({
        blueprintId: blueprint.id,
        contractId,
        organizationId: organization.id,
      })
      toast.success('Modelo setorial aplicado ao contrato')
      await load()
    } catch (error) {
      console.error('Error applying blueprint:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao aplicar modelo setorial')
    } finally {
      setApplyingBlueprintId(undefined)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Carregando modelos setoriais...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase text-yux-700">Administracao da Plataforma</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Modelos Setoriais</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Blueprints configuram como um pacote vendido sera implantado por setor: funis, campos,
          templates, automacoes, relatorios e modulos recomendados. O pacote define o que foi vendido;
          o modelo setorial define como o cliente sera configurado.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {blueprints.length === 0 ? (
        <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">
          Nenhum modelo setorial carregado.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {blueprints.map(blueprint => (
            <BlueprintApplyPanel
              key={blueprint.id}
              blueprint={blueprint}
              contracts={contracts}
              selectedContractId={selectedContracts[blueprint.id]}
              applying={applyingBlueprintId === blueprint.id}
              onContractChange={contractId => setSelectedContracts(current => ({ ...current, [blueprint.id]: contractId }))}
              onApply={() => applyBlueprint(blueprint)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
