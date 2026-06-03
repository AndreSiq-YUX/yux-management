import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { BlueprintApplyPanel } from '@/components/platform/BlueprintApplyPanel'
import { platformService } from '@/services/platformService'
import { usePlatformStore } from '@/stores/platformStore'
import type { Blueprint, ContractDetails } from '@/types/platform'

export function BlueprintsPage() {
  const organization = usePlatformStore(state => state.organization)
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  const [contracts, setContracts] = useState<ContractDetails[]>([])
  const [selectedContracts, setSelectedContracts] = useState<Record<string, string>>({})
  const [applyingBlueprintId, setApplyingBlueprintId] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const [nextBlueprints, nextContracts] = await Promise.all([
          platformService.getBlueprints(),
          platformService.getContracts(),
        ])
        setBlueprints(nextBlueprints)
        setContracts(nextContracts)
      } catch (error) {
        console.error('Error loading blueprints:', error)
        setBlueprints([])
        setContracts([])
        setError('Blueprints ainda nao carregados do Supabase.')
      } finally {
        setLoading(false)
      }
  }

  useEffect(() => {
    load()
  }, [])

  const applyBlueprint = async (blueprint: Blueprint) => {
    const contractId = selectedContracts[blueprint.id]
    const organizationId = organization?.id
    if (!contractId || !organizationId) return

    try {
      setApplyingBlueprintId(blueprint.id)
      await platformService.applyBlueprintToContract({
        blueprintId: blueprint.id,
        contractId,
        organizationId,
      })
      toast.success('Blueprint aplicado ao contrato')
      await load()
    } catch (error) {
      console.error('Error applying blueprint:', error)
      toast.error('Erro ao aplicar blueprint')
    } finally {
      setApplyingBlueprintId(undefined)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Carregando blueprints...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Blueprints</h1>
        <p className="text-gray-600">Modelos setoriais para pacotes, funis, modulos e automacoes.</p>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {blueprints.length === 0 ? (
        <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">
          Nenhum blueprint carregado.
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
