import { AdminStatusBadge } from '@/components/platform/admin/AdminStatusBadge'
import { maskSecretReference } from '@/lib/platform/adminRules'
import type { PlatformProviderConnection } from '@/types/adminPlatform'

function formatDateTime(value?: string | null) {
  if (!value) return 'Nunca verificado'

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function ProviderConnectionPanel({ providers }: { providers: PlatformProviderConnection[] }) {
  return (
    <section className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-900">Provedores globais</h2>
      </div>
      <div className="divide-y">
        {providers.map(provider => (
          <div key={provider.id} className="px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-gray-900">{provider.displayName}</p>
                  {provider.isDefault && (
                    <span className="rounded-full bg-yux-50 px-2 py-0.5 text-xs font-medium text-yux-700">
                      Padrao
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {provider.providerType} / {provider.environment}
                </p>
                <dl className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase text-gray-400">Referencia segura</dt>
                    <dd className="mt-1 font-mono text-xs text-gray-700">
                      {maskSecretReference(provider.secretReference)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase text-gray-400">Ultima checagem</dt>
                    <dd className="mt-1">{formatDateTime(provider.lastCheckedAt)}</dd>
                  </div>
                </dl>
              </div>
              <AdminStatusBadge status={provider.status} />
            </div>

            {provider.lastError && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {provider.lastError}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
