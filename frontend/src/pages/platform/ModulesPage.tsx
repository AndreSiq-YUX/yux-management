import { useEffect, useState } from 'react'
import { PLATFORM_MODULES } from '@/lib/platform/moduleRegistry'
import { platformService } from '@/services/platformService'
import type { PackageDefinition, PlatformModule } from '@/types/platform'

export function ModulesPage() {
  const [modules, setModules] = useState<PlatformModule[]>(PLATFORM_MODULES)
  const [packages, setPackages] = useState<PackageDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [loadedModules, loadedPackages] = await Promise.all([
          platformService.getModules(),
          platformService.getPackages(),
        ])
        setModules(loadedModules.length ? loadedModules : PLATFORM_MODULES)
        setPackages(loadedPackages)
      } catch (error) {
        console.error('Error loading platform modules:', error)
        setModules(PLATFORM_MODULES)
        setPackages([])
        setError('Dados do Supabase indisponiveis; exibindo registro local de modulos.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Carregando modulos...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Modulos e Pacotes</h1>
        <p className="text-gray-600">Controle a base modular do YUX OS.</p>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Modulos</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modules.map(module => (
            <div key={module.key} className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-gray-900">{module.name}</h3>
                <span className="text-xs text-gray-500">{module.base ? 'Base' : 'Opcional'}</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">{module.key}</p>
              <p className="mt-2 text-sm text-gray-600">
                Interno: {module.internalRoute || '-'} | Portal: {module.portalRoute || '-'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Pacotes</h2>
        <div className="space-y-3">
          {packages.length === 0 && (
            <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">
              Nenhum pacote carregado.
            </div>
          )}

          {packages.map(packageItem => (
            <div key={packageItem.id} className="rounded-lg border bg-white p-4">
              <h3 className="font-medium text-gray-900">{packageItem.name}</h3>
              <p className="text-sm text-gray-600">{packageItem.description}</p>
              <p className="mt-2 text-xs text-gray-500">Modulos: {packageItem.moduleKeys.join(', ')}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
