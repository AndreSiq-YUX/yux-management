import { Calendar, User } from 'lucide-react'
import type { AutomationFlow } from '@/types/automation'

interface AutomationAuditTrailProps {
  flow: AutomationFlow
}

export function AutomationAuditTrail({ flow }: AutomationAuditTrailProps) {
  if (!flow) return null

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <section className="rounded-md border bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-slate-600" />
        <h2 className="text-base font-semibold text-slate-950">Histórico</h2>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex items-start gap-2">
          <User className="mt-0.5 h-3 w-3 text-slate-500 shrink-0" />
          <div>
            <p className="text-slate-700">
              <span className="font-semibold">Criado em</span>{' '}
              <span className="text-slate-600">{formatDate(flow.createdAt)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Calendar className="mt-0.5 h-3 w-3 text-slate-500 shrink-0" />
          <div>
            <p className="text-slate-700">
              <span className="font-semibold">Última atualização</span>{' '}
              <span className="text-slate-600">{formatDate(flow.updatedAt)}</span>
            </p>
          </div>
        </div>

        {flow.publishedVersion && flow.publishedVersion > 0 && (
          <div className="flex items-start gap-2">
            <User className="mt-0.5 h-3 w-3 text-slate-500 shrink-0" />
            <div>
              <p className="text-slate-700">
                <span className="font-semibold">Versão publicada</span>{' '}
                <span className="text-slate-600">v{flow.publishedVersion}</span>
              </p>
              {flow.activeVersionId && (
                <p className="mt-1 text-slate-600">
                  <span className="font-semibold">ID da versão ativa:</span>{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{flow.activeVersionId.slice(0, 8)}</code>
                </p>
              )}
            </div>
          </div>
        )}

        {flow.sectorTemplateKey && (
          <div className="flex items-start gap-2">
            <User className="mt-0.5 h-3 w-3 text-slate-500 shrink-0" />
            <div>
              <p className="text-slate-700">
                <span className="font-semibold">Template setorial</span>{' '}
                <span className="text-slate-600">{flow.sectorTemplateKey}</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
