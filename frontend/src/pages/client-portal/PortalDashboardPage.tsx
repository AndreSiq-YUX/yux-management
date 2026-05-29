import { Link } from 'react-router-dom'
import { buildNavigation } from '@/lib/platform/navigation'
import { usePlatformStore } from '@/stores/platformStore'

function formatDateOnly(value: string) {
  const [year, month, day] = value.split('T')[0].split('-')
  return [day, month, year].filter(Boolean).join('/')
}

export function PortalDashboardPage() {
  const {
    activeContract,
    enabledModuleKeys,
    isLoading,
    membership,
    organization,
    role,
  } = usePlatformStore(state => ({
    activeContract: state.activeContract,
    enabledModuleKeys: state.enabledModuleKeys,
    isLoading: state.isLoading,
    membership: state.membership,
    organization: state.organization,
    role: state.role,
  }))
  const items = buildNavigation({
    enabledModuleKeys,
    membership,
    mode: 'portal',
    organization,
    role,
  }).filter(item => item.moduleKey)

  if (isLoading) {
    return (
      <div>
        <p className="text-gray-600">Carregando portal...</p>
      </div>
    )
  }

  if (!activeContract) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Portal YUX</h1>
        <p className="text-gray-600">Nenhum contrato ativo encontrado para este usuario.</p>
        <p className="text-sm text-gray-500">Entre em contato com a YUX para revisar o acesso ao portal.</p>
      </div>
    )
  }

  const startsAt = formatDateOnly(activeContract.startsAt)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portal YUX</h1>
        <p className="text-gray-600">Acompanhamento de projetos, aprovacoes, suporte e modulos contratados.</p>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold text-gray-900">{activeContract.name || 'Contrato ativo'}</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-gray-500">Pacote</dt>
            <dd className="font-medium text-gray-900">{activeContract.package?.name || 'Sem pacote vinculado'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="font-medium text-gray-900">{activeContract.status}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Inicio</dt>
            <dd className="font-medium text-gray-900">{startsAt}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Modulos</dt>
            <dd className="font-medium text-gray-900">{items.length}</dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map(item => (
          <Link
            key={item.href}
            to={item.href}
            className="rounded-lg border bg-white p-4 transition-colors hover:border-yux-300 hover:bg-yux-50"
          >
            <h2 className="font-semibold text-gray-900">{item.label}</h2>
            <p className="mt-2 text-sm text-gray-600">Modulo habilitado no contrato ativo.</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
