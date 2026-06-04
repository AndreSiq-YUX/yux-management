import { useEffect, useMemo, useState } from 'react'
import { UsageLimitBar } from '@/components/platform/admin/UsageLimitBar'
import { adminPlatformService } from '@/services/adminPlatformService'
import type { ClientModuleLimit } from '@/types/adminPlatform'

interface ClientModuleLimitsPanelProps {
  organizationId: string
  contractId: string
  moduleKey: string
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem data'

  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

function sourceLabel(source: ClientModuleLimit['source']) {
  const labels: Record<ClientModuleLimit['source'], string> = {
    package: 'Pacote',
    contract: 'Contrato',
    manual_override: 'Ajuste manual',
  }

  return labels[source] || source
}

export function ClientModuleLimitsPanel({ organizationId, contractId, moduleKey }: ClientModuleLimitsPanelProps) {
  const [limits, setLimits] = useState<ClientModuleLimit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadLimits() {
      setLoading(true)
      setError(null)

      try {
        const data = await adminPlatformService.getClientModuleLimits(organizationId)
        if (!active) return
        setLimits(data)
      } catch (loadError) {
        if (!active) return
        console.error('Error loading client module limits:', loadError)
        setError('Nao foi possivel carregar os limites deste modulo.')
        setLimits([])
      } finally {
        if (active) setLoading(false)
      }
    }

    loadLimits()

    return () => {
      active = false
    }
  }, [organizationId])

  const visibleLimits = useMemo(() => {
    return limits.filter(limit => {
      if (limit.moduleKey !== moduleKey) return false
      return !limit.contractId || limit.contractId === contractId
    })
  }, [contractId, limits, moduleKey])

  return (
    <div className="border-t bg-gray-50 px-4 py-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Limites do modulo</h3>
        <p className="text-xs text-gray-500">{moduleKey}</p>
      </div>

      {loading && <p className="text-sm text-gray-500">Carregando limites...</p>}

      {!loading && error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && visibleLimits.length === 0 && (
        <p className="text-sm text-gray-500">Nenhum limite configurado para este modulo.</p>
      )}

      {!loading && !error && visibleLimits.length > 0 && (
        <div className="space-y-3">
          {visibleLimits.map(limit => (
            <div key={limit.id} className="rounded-md border bg-white px-3 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{limit.limitKey}</p>
                  <p className="text-xs text-gray-500">{sourceLabel(limit.source)}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm font-semibold text-gray-900">{limit.limitValue}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(limit.effectiveFrom)} - {limit.effectiveUntil ? formatDate(limit.effectiveUntil) : 'Sem fim'}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <UsageLimitBar used={0} limit={limit.limitValue} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
