import { useEffect, useState } from 'react'
import { platformService } from '@/services/platformService'
import type { PackageDefinition } from '@/types/platform'

export function PackagesPage() {
  const [packages, setPackages] = useState<PackageDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      try {
        const loadedPackages = await platformService.getPackages()
        setPackages(loadedPackages)
      } catch (error) {
        console.error('Error loading platform packages:', error)
        setPackages([])
        setError('Nao foi possivel carregar os pacotes.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Carregando pacotes...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pacotes</h1>
        <p className="text-gray-600">Pacotes comerciais que ativam conjuntos de modulos.</p>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {packages.length === 0 && (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">
            Nenhum pacote carregado.
          </div>
        )}

        {packages.map(packageItem => (
          <div key={packageItem.id} className="rounded-lg border bg-white p-4">
            <h2 className="font-medium text-gray-900">{packageItem.name}</h2>
            <p className="mt-1 text-sm text-gray-600">{packageItem.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {packageItem.moduleKeys.map(moduleKey => (
                <span
                  key={moduleKey}
                  className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600"
                >
                  {moduleKey}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
