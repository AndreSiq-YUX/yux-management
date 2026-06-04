import type { PlatformProviderStatus } from '@/types/adminPlatform'

const classByStatus: Record<PlatformProviderStatus, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  degraded: 'border-amber-200 bg-amber-50 text-amber-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  disabled: 'border-gray-200 bg-gray-100 text-gray-700',
  needs_reauth: 'border-orange-200 bg-orange-50 text-orange-700',
  stale: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  not_configured: 'border-gray-200 bg-gray-50 text-gray-600',
}

const labelByStatus: Record<PlatformProviderStatus, string> = {
  active: 'Ativo',
  degraded: 'Degradado',
  failed: 'Falha',
  disabled: 'Desabilitado',
  needs_reauth: 'Reautenticacao',
  stale: 'Desatualizado',
  not_configured: 'Nao configurado',
}

export function AdminStatusBadge({ status }: { status: PlatformProviderStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${classByStatus[status]}`}>
      {labelByStatus[status]}
    </span>
  )
}
