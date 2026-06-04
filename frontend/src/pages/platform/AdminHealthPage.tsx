import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Bot, Building2, FileWarning, Mail, ShieldAlert } from 'lucide-react'
import { AdminMetricCard } from '@/components/platform/admin/AdminMetricCard'
import { AdminStatusBadge } from '@/components/platform/admin/AdminStatusBadge'
import { isProviderFailing } from '@/lib/platform/adminRules'
import { adminPlatformService } from '@/services/adminPlatformService'
import type {
  PlatformAdminAuditEvent,
  PlatformLimitStatus,
  PlatformProviderConnection,
  PlatformUsageCounter,
} from '@/types/adminPlatform'

const attentionLimitStatuses: PlatformLimitStatus[] = ['near_limit', 'over_limit', 'blocked']

const limitStatusCopy: Record<PlatformLimitStatus, { label: string; className: string }> = {
  ok: {
    label: 'OK',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  near_limit: {
    label: 'Atencao',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  over_limit: {
    label: 'Excedido',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
  blocked: {
    label: 'Bloqueado',
    className: 'border-gray-300 bg-gray-100 text-gray-700',
  },
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem registro'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatUsage(counter: PlatformUsageCounter) {
  const used = new Intl.NumberFormat('pt-BR').format(counter.usedValue)
  const limit = counter.limitValue === null || counter.limitValue === undefined
    ? 'sem limite'
    : new Intl.NumberFormat('pt-BR').format(counter.limitValue)

  return `${used} / ${limit}`
}

function isAttentionUsage(counter: PlatformUsageCounter) {
  return attentionLimitStatuses.includes(counter.status)
}

function isProblemAuditEvent(event: PlatformAdminAuditEvent) {
  const searchable = [
    event.eventType,
    event.entityType,
    event.note || '',
  ].join(' ').toLowerCase()

  return [
    'fail',
    'falha',
    'error',
    'erro',
    'limit',
    'limite',
    'blocked',
    'bloque',
    'degraded',
    'degrad',
    'reauth',
    'stale',
    'exceeded',
    'exced',
  ].some(marker => searchable.includes(marker))
}

function getUniqueOrganizationCount(usageCounters: PlatformUsageCounter[], auditEvents: PlatformAdminAuditEvent[]) {
  const organizationIds = new Set<string>()

  usageCounters.filter(isAttentionUsage).forEach(counter => {
    organizationIds.add(counter.organizationId)
  })

  auditEvents.filter(isProblemAuditEvent).forEach(event => {
    if (event.organizationId) organizationIds.add(event.organizationId)
  })

  return organizationIds.size
}

function LimitStatusBadge({ status }: { status: PlatformLimitStatus }) {
  const copy = limitStatusCopy[status]

  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${copy.className}`}>
      {copy.label}
    </span>
  )
}

export function AdminHealthPage() {
  const [providers, setProviders] = useState<PlatformProviderConnection[]>([])
  const [usageCounters, setUsageCounters] = useState<PlatformUsageCounter[]>([])
  const [auditEvents, setAuditEvents] = useState<PlatformAdminAuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadHealth() {
      setLoading(true)
      setError(null)

      try {
        const [loadedProviders, loadedUsageCounters, loadedAuditEvents] = await Promise.all([
          adminPlatformService.getProviderConnections(),
          adminPlatformService.getUsageCounters(),
          adminPlatformService.getAuditEvents(50),
        ])

        if (active) {
          setProviders(loadedProviders)
          setUsageCounters(loadedUsageCounters)
          setAuditEvents(loadedAuditEvents)
        }
      } catch (error) {
        console.error('Error loading admin health:', error)
        if (active) setError('Nao foi possivel carregar saude e auditoria do YUX Hub.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadHealth()

    return () => {
      active = false
    }
  }, [])

  const failingProviders = useMemo(
    () => providers.filter(provider => isProviderFailing(provider.status)),
    [providers],
  )
  const attentionUsageCounters = useMemo(
    () => usageCounters.filter(isAttentionUsage),
    [usageCounters],
  )
  const impactedClientCount = useMemo(
    () => getUniqueOrganizationCount(usageCounters, auditEvents),
    [usageCounters, auditEvents],
  )
  const emailFailureCount = failingProviders.filter(provider => provider.providerType === 'email').length
  const aiFailureCount = failingProviders.filter(provider => provider.providerType === 'llm').length
  const blockedLimitCount = attentionUsageCounters.filter(counter => counter.status === 'blocked').length
  const recentProblemAuditCount = auditEvents.filter(isProblemAuditEvent).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Saude do Sistema</h1>
        <p className="text-gray-600">
          Monitoramento operacional de provedores, limites, auditoria recente e clientes impactados.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-600">Carregando saude operacional...</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetricCard
          label="Provedores com falha"
          value={loading ? '-' : failingProviders.length}
          detail="Degradados, falhando, stale ou reauth"
          icon={ShieldAlert}
        />
        <AdminMetricCard
          label="Limites em atencao"
          value={loading ? '-' : attentionUsageCounters.length}
          detail={`${blockedLimitCount} bloqueados`}
          icon={AlertTriangle}
        />
        <AdminMetricCard
          label="Eventos recentes"
          value={loading ? '-' : auditEvents.length}
          detail={`${recentProblemAuditCount} com indicador de problema`}
          icon={Activity}
        />
        <AdminMetricCard
          label="Clientes impactados"
          value={loading ? '-' : impactedClientCount}
          detail="Organizacoes unicas em usage/audit"
          icon={Building2}
        />
        <AdminMetricCard
          label="Email / IA"
          value={loading ? '-' : `${emailFailureCount}/${aiFailureCount}`}
          detail="Falhas em email e LLM"
          icon={Mail}
        />
      </div>

      {!loading && !error && (
        <>
          <section className="rounded-lg border bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Provedores com falha</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Conexoes globais que exigem acao antes de serem usadas como infraestrutura compartilhada.
                </p>
              </div>
              <Bot className="h-5 w-5 shrink-0 text-yux-700" aria-hidden="true" />
            </div>

            {failingProviders.length === 0 ? (
              <p className="mt-4 rounded-md border border-dashed bg-gray-50 p-4 text-sm text-gray-500">
                Nenhum provedor em falha, degradacao, stale ou reautenticacao.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-gray-500">
                      <th className="px-3 py-2">Provedor</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Ambiente</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Ultima checagem</th>
                      <th className="px-3 py-2">Erro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {failingProviders.map(provider => (
                      <tr key={provider.id}>
                        <td className="px-3 py-3 font-medium text-gray-900">{provider.displayName}</td>
                        <td className="px-3 py-3 text-gray-600">{provider.providerType}</td>
                        <td className="px-3 py-3 text-gray-600">{provider.environment}</td>
                        <td className="px-3 py-3"><AdminStatusBadge status={provider.status} /></td>
                        <td className="px-3 py-3 text-gray-600">{formatDate(provider.lastCheckedAt)}</td>
                        <td className="max-w-xs px-3 py-3 text-gray-600">
                          <span className="line-clamp-2">{provider.lastError || 'Sem mensagem de erro'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Limites excedidos ou em atencao</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Contadores com status near_limit, over_limit ou blocked.
                </p>
              </div>
              <FileWarning className="h-5 w-5 shrink-0 text-yux-700" aria-hidden="true" />
            </div>

            {attentionUsageCounters.length === 0 ? (
              <p className="mt-4 rounded-md border border-dashed bg-gray-50 p-4 text-sm text-gray-500">
                Nenhum contador de uso em atencao.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {attentionUsageCounters.map(counter => (
                  <article key={counter.id} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{counter.moduleKey}</h3>
                        <p className="text-xs text-gray-500">{counter.resourceKey}</p>
                      </div>
                      <LimitStatusBadge status={counter.status} />
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                      <p><span className="font-medium text-gray-800">Uso:</span> {formatUsage(counter)}</p>
                      <p><span className="font-medium text-gray-800">Periodo:</span> {formatDate(counter.periodEnd)}</p>
                      <p className="sm:col-span-2">
                        <span className="font-medium text-gray-800">Organizacao:</span> {counter.organizationId}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="rounded-lg border bg-white p-4">
              <h2 className="text-base font-semibold text-gray-900">Eventos de auditoria recentes</h2>
              <p className="mt-1 text-sm text-gray-600">
                Ultimos 50 eventos administrativos registrados para rastrear alteracoes e incidentes operacionais.
              </p>

              {auditEvents.length === 0 ? (
                <p className="mt-4 rounded-md border border-dashed bg-gray-50 p-4 text-sm text-gray-500">
                  Nenhum evento de auditoria registrado.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {auditEvents.slice(0, 10).map(event => (
                    <article key={event.id} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">{event.eventType}</h3>
                          <p className="text-xs text-gray-500">
                            {event.entityType}{event.entityId ? ` - ${event.entityId}` : ''}
                          </p>
                        </div>
                        <span className="text-xs text-gray-500">{formatDate(event.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-sm text-gray-600">{event.note || 'Sem observacao.'}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                        {event.actorRole && <span>Perfil: {event.actorRole}</span>}
                        {event.organizationId && <span>Org: {event.organizationId}</span>}
                        {event.contractId && <span>Contrato: {event.contractId}</span>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <aside className="rounded-lg border bg-white p-4">
              <h2 className="text-base font-semibold text-gray-900">Clientes impactados e indicadores</h2>
              <p className="mt-1 text-sm text-gray-600">
                Indicadores derivados de usage counters com problema e auditorias com marcadores operacionais.
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="rounded-md bg-gray-50 p-3">
                  <dt className="font-medium text-gray-500">Organizacoes unicas</dt>
                  <dd className="mt-1 text-xl font-semibold text-gray-900">{impactedClientCount}</dd>
                </div>
                <div className="rounded-md bg-gray-50 p-3">
                  <dt className="font-medium text-gray-500">Limites bloqueados</dt>
                  <dd className="mt-1 text-xl font-semibold text-gray-900">{blockedLimitCount}</dd>
                </div>
                <div className="rounded-md bg-gray-50 p-3">
                  <dt className="font-medium text-gray-500">Falhas de email</dt>
                  <dd className="mt-1 text-xl font-semibold text-gray-900">{emailFailureCount}</dd>
                </div>
                <div className="rounded-md bg-gray-50 p-3">
                  <dt className="font-medium text-gray-500">Falhas de IA</dt>
                  <dd className="mt-1 text-xl font-semibold text-gray-900">{aiFailureCount}</dd>
                </div>
              </dl>
            </aside>
          </section>
        </>
      )}
    </div>
  )
}
