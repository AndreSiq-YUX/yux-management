import { canAccessModule } from '@/lib/platform/accessControl'
import { getPlatformModule } from '@/lib/platform/moduleRegistry'
import { PortalOmnichannelWorkspace } from '@/components/omnichannel/PortalOmnichannelWorkspace'
import { usePlatformStore } from '@/stores/platformStore'

export function PortalOmnichannelPage() {
  const {
    activeContract,
    enabledModuleKeys,
    isLoading,
    organization,
    role,
  } = usePlatformStore(state => ({
    activeContract: state.activeContract,
    enabledModuleKeys: state.enabledModuleKeys,
    isLoading: state.isLoading,
    organization: state.organization,
    role: state.role,
  }))
  const module = getPlatformModule('whatsapp_ai')

  if (isLoading) {
    return <p className="text-sm text-gray-600">Carregando conversas...</p>
  }

  if (!activeContract) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Conversas e IA</h1>
        <p className="text-gray-600">Nenhum contrato ativo encontrado para este usuario.</p>
      </div>
    )
  }

  if (!module || !canAccessModule(module, role, enabledModuleKeys)) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Conversas e IA</h1>
        <p className="text-gray-600">Modulo nao disponivel para este acesso.</p>
      </div>
    )
  }

  return (
    <PortalOmnichannelWorkspace
      organizationId={organization?.id || activeContract.clientId}
      canConfigure={Boolean(role?.permissions.includes('omnichannel.configure') || role?.permissions.includes('platform.manage'))}
    />
  )
}
