import { useEffect, useState } from 'react'
import { ProviderConnectionPanel } from '@/components/platform/admin/ProviderConnectionPanel'
import { adminPlatformService } from '@/services/adminPlatformService'
import type { PlatformProviderConnection } from '@/types/adminPlatform'

export function AdminIntegrationsPage() {
  const [providers, setProviders] = useState<PlatformProviderConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadProviders() {
      setLoading(true)
      setError(null)

      try {
        const result = await adminPlatformService.getProviderConnections()
        if (active) setProviders(result)
      } catch (error) {
        console.error('Error loading platform provider connections:', error)
        if (active) setError('Nao foi possivel carregar as integracoes globais.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadProviders()

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integracoes globais</h1>
        <p className="text-gray-600">
          Monitoramento operacional dos provedores compartilhados do YUX Hub.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-600">Carregando integracoes globais...</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && providers.length === 0 && (
        <div className="rounded-lg border border-dashed bg-white p-6 text-sm text-gray-500">
          Nenhum provedor global configurado.
        </div>
      )}

      {!loading && !error && providers.length > 0 && (
        <ProviderConnectionPanel providers={providers} />
      )}
    </div>
  )
}
