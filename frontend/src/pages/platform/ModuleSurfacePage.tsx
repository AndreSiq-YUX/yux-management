import { useLocation } from 'react-router-dom'
import { getPlatformModule } from '@/lib/platform/moduleRegistry'
import { usePlatformStore } from '@/stores/platformStore'

interface ModuleSurfacePageProps {
  moduleKey: string
}

export function ModuleSurfacePage({ moduleKey }: ModuleSurfacePageProps) {
  const location = useLocation()
  const { activeContract, enabledModuleKeys, isLoading } = usePlatformStore(state => ({
    activeContract: state.activeContract,
    enabledModuleKeys: state.enabledModuleKeys,
    isLoading: state.isLoading,
  }))
  const module = getPlatformModule(moduleKey)
  const isPortalPath = location.pathname.startsWith('/portal')
  const description = isPortalPath ? 'Area do portal do cliente.' : 'Superficie operacional do YUX OS.'
  const emptyState = isPortalPath
    ? 'Este modulo esta habilitado no contrato, mas ainda nao possui registros publicados.'
    : 'Sem registros operacionais neste modulo.'

  if (isPortalPath && isLoading) {
    return (
      <div>
        <p className="text-gray-600">Carregando modulo...</p>
      </div>
    )
  }

  if (isPortalPath && !activeContract) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">{module?.name || 'Modulo'}</h1>
        <p className="text-gray-600">Nenhum contrato ativo encontrado para este usuario.</p>
        <p className="text-sm text-gray-500">Entre em contato com a YUX para revisar o acesso ao portal.</p>
      </div>
    )
  }

  if (isPortalPath && !enabledModuleKeys.includes(moduleKey)) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">{module?.name || 'Modulo'}</h1>
        <p className="text-gray-600">Modulo nao habilitado neste contrato.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{module?.name || 'Modulo'}</h1>
        <p className="text-gray-600">{description}</p>
      </div>

      <div className="rounded-lg border bg-white p-6">
        <p className="text-sm text-gray-500">{emptyState}</p>
      </div>
    </div>
  )
}
