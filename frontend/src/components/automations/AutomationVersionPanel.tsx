import { History, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { automationService } from '@/services/automationService'
import type { AutomationFlow } from '@/types/automation'

interface AutomationVersionPanelProps {
  flow?: AutomationFlow
  onRollback?: (versionId: string, versionNumber: number) => void
}

interface FlowVersion {
  id: string
  flow_id: string
  version_number: number
  status: string
  snapshot: Record<string, unknown>
  published_at: string | null
  created_at: string
}

export function AutomationVersionPanel({ flow, onRollback }: AutomationVersionPanelProps) {
  const [versions, setVersions] = useState<FlowVersion[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!flow) return
    setLoading(true)
    automationService
      .getFlowVersions(flow.id)
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoading(false))
  }, [flow])

  if (!flow) {
    return (
      <section className="rounded-md border bg-yx-surface p-4">
        <p className="text-sm text-yx-fg-3">Selecione um fluxo para ver o histórico de versões.</p>
      </section>
    )
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <section className="rounded-md border bg-yx-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-yx-fg-2" />
          <h2 className="text-base font-semibold text-yx-fg">Histórico de versões</h2>
        </div>
        <Badge variant="outline">{flow.publishedVersion || 0} publicadas</Badge>
      </div>

      {loading && <p className="text-xs text-yx-fg-3">Carregando versões...</p>}

      {!loading && versions.length === 0 && (
        <p className="text-xs text-yx-fg-3">Nenhuma versão salva. Publique o fluxo para criar a primeira versão.</p>
      )}

      {versions.length > 0 && (
        <div className="space-y-2">
          {versions.map(version => {
            const isActive = version.id === flow.activeVersionId
            return (
              <div
                key={version.id}
                className={`flex items-center justify-between rounded-md border p-3 ${isActive ? 'border-yx-line-strong bg-yx-blue-soft' : 'bg-yx-surface-2'}`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-yx-fg">v{version.version_number}</span>
                    <Badge variant={version.status === 'published' ? 'default' : 'secondary'} className="text-xs">
                      {version.status}
                    </Badge>
                    {isActive && <Badge variant="outline" className="text-xs">ativa</Badge>}
                  </div>
                  <p className="text-xs text-yx-fg-2">{formatDate(version.published_at || version.created_at)}</p>
                </div>
                {!isActive && ['published', 'archived'].includes(version.status) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!onRollback}
                    onClick={() => onRollback?.(version.id, version.version_number)}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Restaurar
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
