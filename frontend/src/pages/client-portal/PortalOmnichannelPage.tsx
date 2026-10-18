import { canAccessModule } from '@/lib/platform/accessControl'
import { getPlatformModule } from '@/lib/platform/moduleRegistry'
import { PortalOmnichannelWorkspace } from '@/components/omnichannel/PortalOmnichannelWorkspace'
import { useCanConfigureOmnichannel } from '@/components/omnichannel/useCanConfigureOmnichannel'
import { PageHeader } from '@/components/portal-ui'
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
  const canConfigure = useCanConfigureOmnichannel()
  const module = getPlatformModule('whatsapp_ai')

  if (isLoading) {
    return <p className="text-sm text-yx-fg-2">Carregando conversas...</p>
  }

  if (!activeContract) {
    return (
      <PageHeader
        eyebrow="Atendimento"
        title="Conversas"
        lead="Nenhum contrato ativo foi encontrado para este acesso."
      />
    )
  }

  if (!module || !canAccessModule(module, role, enabledModuleKeys)) {
    return (
      <PageHeader
        eyebrow="Atendimento"
        title="Conversas"
        lead="Este módulo não está disponível para o seu acesso."
      />
    )
  }

  return (
    <PortalOmnichannelWorkspace
      organizationId={organization?.id || activeContract.clientId}
      canConfigure={canConfigure}
    />
  )
}
