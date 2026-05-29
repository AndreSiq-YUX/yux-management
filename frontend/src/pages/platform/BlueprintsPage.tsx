import { useEffect, useState } from 'react'
import { platformService } from '@/services/platformService'
import type { Blueprint } from '@/types/platform'

export function BlueprintsPage() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      try {
        setBlueprints(await platformService.getBlueprints())
      } catch (error) {
        console.error('Error loading blueprints:', error)
        setBlueprints([])
        setError('Blueprints ainda nao carregados do Supabase.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {blueprints.map(blueprint => (
            <div key={blueprint.id} className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-gray-900">{blueprint.name}</h2>
                <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{blueprint.sector}</span>
              </div>
              <p className="mt-2 text-sm text-gray-600">{blueprint.description}</p>
              <p className="mt-3 text-xs text-gray-500">Modulos: {blueprint.moduleKeys.join(', ')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
