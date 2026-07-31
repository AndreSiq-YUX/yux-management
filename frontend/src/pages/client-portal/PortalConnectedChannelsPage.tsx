import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ConnectedChannelsWorkspace } from '@/components/omnichannel/ConnectedChannelsWorkspace'
import { canAccessModule } from '@/lib/platform/accessControl'
import { getPlatformModule } from '@/lib/platform/moduleRegistry'
import { metaChannelService, type ConnectedChannelView } from '@/services/metaChannelService'
import { usePlatformStore } from '@/stores/platformStore'
import type { MetaChannel } from '@/types/omnichannel'

export function PortalConnectedChannelsPage() {
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
  const organizationId = activeContract && organization?.kind === 'client'
    ? organization.id
    : undefined
  const [channels, setChannels] = useState<ConnectedChannelView[]>([])
  const [loadingChannels, setLoadingChannels] = useState(false)

  const loadChannels = useCallback(async () => {
    if (isLoading || !organizationId) return
    setLoadingChannels(true)
    try {
      setChannels(await metaChannelService.listConnectedChannels(organizationId))
    } catch (error) {
      console.error('Erro ao carregar canais conectados:', error)
      toast.error('Erro ao carregar canais')
    } finally {
      setLoadingChannels(false)
    }
  }, [isLoading, organizationId])

  useEffect(() => { loadChannels() }, [loadChannels])

  if (isLoading) {
    return <p className="text-sm text-gray-600">Carregando canais...</p>
  }

  if (!activeContract || !organizationId) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Canais conectados</h1>
        <p className="text-gray-600">Nenhum contrato ativo encontrado para este usuario.</p>
      </div>
    )
  }

  if (!module || !canAccessModule(module, role, enabledModuleKeys)) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Canais conectados</h1>
        <p className="text-gray-600">Modulo nao disponivel para este acesso.</p>
      </div>
    )
  }

  const resolvedOrganizationId = organizationId

  async function handleConnect(channel: MetaChannel) {
    try {
      const session = await metaChannelService.startConnect({ organizationId: resolvedOrganizationId, channel })
      if (!session.authUrl) {
        toast.error(`Configuracao Meta incompleta: ${session.missingConfig.join(', ')}`)
        return
      }
      toast.success('Abrindo autorizacao da Meta')
      window.location.assign(session.authUrl)
      await loadChannels()
    } catch (error) {
      console.error('Erro ao iniciar conexao Meta:', error)
      toast.error('Conexao nao iniciada')
    }
  }

  return (
    <div className="space-y-4">
      {loadingChannels && <p className="text-sm text-gray-500">Atualizando canais...</p>}
      <ConnectedChannelsWorkspace
        organizationId={resolvedOrganizationId}
        channels={channels}
        onConnect={handleConnect}
        onDisconnect={async connectionId => {
          await metaChannelService.disconnect(connectionId)
          await loadChannels()
          toast.success('Canal desconectado')
        }}
        onRefreshHealth={async connectionId => {
          await metaChannelService.refreshHealth(connectionId)
          await loadChannels()
          toast.success('Saude atualizada')
        }}
        onSendTest={async connectionId => {
          await metaChannelService.sendTest(connectionId)
          toast.success('Teste registrado')
        }}
      />
    </div>
  )
}
