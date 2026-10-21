import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { ConnectedChannelsWorkspace } from '@/components/omnichannel/ConnectedChannelsWorkspace'
import { WhatsAppTestProvisionForm } from '@/components/omnichannel/WhatsAppTestProvisionForm'
import type { ConnectionOperationStatus } from '@/components/omnichannel/ConnectedChannelCard'
import {
  launchWhatsAppEmbeddedSignup,
  preloadWhatsAppEmbeddedSignupSdk,
  type WhatsAppEmbeddedSignupResult,
} from '@/lib/meta/whatsappEmbeddedSignup'
import { canAccessModule } from '@/lib/platform/accessControl'
import { getPlatformModule } from '@/lib/platform/moduleRegistry'
import { metaChannelService, type ConnectedChannelView, type StartMetaChannelConnectSession, type WhatsAppConnectionSettings } from '@/services/metaChannelService'
import { usePlatformStore } from '@/stores/platformStore'
import type { MetaChannel } from '@/types/omnichannel'

export function PortalConnectedChannelsPage() {
  const {
    enabledModuleKeys,
    isLoading,
    organization,
    role,
    workspaceContext,
  } = usePlatformStore(state => ({
    enabledModuleKeys: state.enabledModuleKeys,
    isLoading: state.isLoading,
    organization: state.organization,
    role: state.role,
    workspaceContext: state.workspaceContext,
  }))
  const module = getPlatformModule('whatsapp_ai')
  const organizationId = organization && workspaceContext?.moduleKeys.includes('whatsapp_ai')
    ? organization.id
    : undefined
  const [channels, setChannels] = useState<ConnectedChannelView[]>([])
  const [settingsOptions, setSettingsOptions] = useState({ assistants: [] as Array<{ id: string; name: string }>, teams: [] as Array<{ id: string; name: string }>, queues: [] as Array<{ id: string; name: string }> })
  const [savingSettingsConnectionId, setSavingSettingsConnectionId] = useState<string | null>(null)
  const [connectionOperations, setConnectionOperations] = useState<Record<string, ConnectionOperationStatus>>({})
  const [loadingChannels, setLoadingChannels] = useState(false)
  const [pendingWhatsAppSignup, setPendingWhatsAppSignup] = useState<
    (WhatsAppEmbeddedSignupResult & { organizationId: string; connectionId?: string; state: string }) | null
  >(null)
  const [registrationPin, setRegistrationPin] = useState('')
  const [requiresRegistrationPin, setRequiresRegistrationPin] = useState(false)
  const [completingWhatsAppSignup, setCompletingWhatsAppSignup] = useState(false)
  const preparedSignupRef = useRef<{
    organizationId: string
    connectionId: string | null
    promise: Promise<StartMetaChannelConnectSession>
  } | null>(null)

  const loadChannels = useCallback(async () => {
    if (isLoading || !organizationId) return
    setLoadingChannels(true)
    try {
      const settingsOptionsRequest = metaChannelService.listWhatsAppSettingsOptions(organizationId).catch(error => {
        console.error('Erro ao carregar opções das conexões WhatsApp:', error)
        toast.error('Não foi possível carregar as opções de agente/equipe/fila.')
        return { assistants: [], teams: [], queues: [] }
      })
      const [connectedChannels, options] = await Promise.all([
        metaChannelService.listConnectedChannels(organizationId),
        settingsOptionsRequest,
      ])
      setChannels(connectedChannels)
      setSettingsOptions(options)
    } catch (error) {
      console.error('Erro ao carregar canais conectados:', error)
      toast.error('Erro ao carregar canais')
    } finally {
      setLoadingChannels(false)
    }
  }, [isLoading, organizationId])

  useEffect(() => { loadChannels() }, [loadChannels])

  const prepareWhatsAppSignup = useCallback((channel: MetaChannel, connectionId?: string) => {
    if (channel !== 'whatsapp' || !organizationId) return
    const prepared = preparedSignupRef.current
    const targetConnectionId = connectionId || null
    if (prepared?.organizationId === organizationId && prepared.connectionId === targetConnectionId) return

    const promise = metaChannelService.startConnect({
      organizationId,
      channel: 'whatsapp',
      ...(targetConnectionId ? { connectionId: targetConnectionId } : {}),
    })
    preparedSignupRef.current = { organizationId, connectionId: targetConnectionId, promise }
    void promise.then(async session => {
      if (session.missingConfig.length || !session.appId || !session.graphVersion) return
      await preloadWhatsAppEmbeddedSignupSdk(session.appId, session.graphVersion)
    }).catch(() => undefined)
  }, [organizationId])

  if (isLoading) {
    return <p className="text-sm text-gray-600">Carregando canais...</p>
  }

  if (!organization || !workspaceContext) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Canais conectados</h1>
        <p className="text-gray-600">O contexto deste workspace não está disponível.</p>
      </div>
    )
  }

  if (!organizationId || !module || !canAccessModule(module, role, enabledModuleKeys)) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Canais conectados</h1>
        <p className="text-gray-600">Modulo nao disponivel para este acesso.</p>
      </div>
    )
  }

  const resolvedOrganizationId = organizationId

  async function handleConnect(channel: MetaChannel, connectionId?: string) {
    try {
      let session: StartMetaChannelConnectSession
      if (channel === 'whatsapp') {
        const prepared = preparedSignupRef.current
        const targetConnectionId = connectionId || null
        session = prepared?.organizationId === resolvedOrganizationId && prepared.connectionId === targetConnectionId
          ? await prepared.promise.catch(() => metaChannelService.startConnect({
            organizationId: resolvedOrganizationId,
            channel,
            ...(targetConnectionId ? { connectionId: targetConnectionId } : {}),
          }))
          : await metaChannelService.startConnect({
            organizationId: resolvedOrganizationId,
            channel,
            ...(targetConnectionId ? { connectionId: targetConnectionId } : {}),
          })
      } else {
        session = await metaChannelService.startConnect({ organizationId: resolvedOrganizationId, channel })
      }
      if (!session.authUrl) {
        if (channel !== 'whatsapp') {
          toast.error(`Configuracao Meta incompleta: ${session.missingConfig.join(', ')}`)
          return
        }
      }

      if (channel === 'whatsapp') {
        if (Date.parse(session.expiresAt) <= Date.now() + 30_000) {
          session = await metaChannelService.startConnect({
            organizationId: resolvedOrganizationId,
            channel,
            ...(connectionId ? { connectionId } : {}),
          })
        }
        if (session.missingConfig.length || !session.appId || !session.graphVersion || !session.embeddedSignupConfigId) {
          toast.error(`Configuracao Meta incompleta: ${session.missingConfig.join(', ') || 'META_GRAPH_VERSION'}`)
          return
        }
        const signup = await launchWhatsAppEmbeddedSignup({
          appId: session.appId,
          graphVersion: session.graphVersion,
          configId: session.embeddedSignupConfigId,
          expiresAt: session.expiresAt,
        })
        setPendingWhatsAppSignup({ organizationId: resolvedOrganizationId, connectionId, state: session.state, ...signup })
        setRegistrationPin('')
        setRequiresRegistrationPin(false)
        toast.success('Cadastro autorizado pela Meta. Vou verificar o registro do número.')
        return
      }

      toast.success('Abrindo autorizacao da Meta')
      if (!session.authUrl) return
      window.location.assign(session.authUrl)
      await loadChannels()
    } catch (error) {
      console.error('Erro ao iniciar conexao Meta:', error)
      toast.error('Conexao nao iniciada')
    }
  }

  async function completeWhatsAppSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pendingWhatsAppSignup || completingWhatsAppSignup) return
    setCompletingWhatsAppSignup(true)
    try {
      await metaChannelService.completeConnect({
        organizationId: pendingWhatsAppSignup.organizationId,
        channel: 'whatsapp',
        code: pendingWhatsAppSignup.code,
        state: pendingWhatsAppSignup.state,
        wabaId: pendingWhatsAppSignup.wabaId,
        phoneNumberIds: pendingWhatsAppSignup.phoneNumberIds,
        registrationPin,
      })
      setPendingWhatsAppSignup(null)
      setRegistrationPin('')
      setRequiresRegistrationPin(false)
      preparedSignupRef.current = null
      await loadChannels()
      toast.success('WhatsApp conectado à organização.')
    } catch (error) {
      console.error('Erro ao concluir conexão WhatsApp:', error)
      if (error instanceof Error && error.message === 'whatsapp_registration_pin_required') {
        setRequiresRegistrationPin(true)
        toast.error('A Meta exige o PIN de segurança para registrar este número.')
      } else {
        toast.error('Não foi possível concluir. Confira o PIN e tente novamente.')
      }
    } finally {
      setCompletingWhatsAppSignup(false)
    }
  }

  async function saveWhatsAppSettings(connectionId: string, settings: WhatsAppConnectionSettings) {
    if (savingSettingsConnectionId) return
    setSavingSettingsConnectionId(connectionId)
    try {
      await metaChannelService.updateWhatsAppSettings(resolvedOrganizationId, connectionId, settings)
      await loadChannels()
      toast.success('Configurações deste número salvas.')
    } catch (error) {
      console.error('Erro ao salvar configurações do número WhatsApp:', error)
      toast.error('Não foi possível salvar as configurações deste número.')
    } finally {
      setSavingSettingsConnectionId(null)
    }
  }

  async function runConnectionAction(
    connectionId: string,
    action: 'health' | 'disconnect',
    execute: () => Promise<unknown>,
  ) {
    setConnectionOperations(current => ({ ...current, [connectionId]: { pending: action, error: null } }))
    try {
      const result = await execute()
      await loadChannels()
      setConnectionOperations(current => ({ ...current, [connectionId]: { pending: null, error: null } }))
      if (action === 'health' && result && typeof result === 'object' && 'summary' in result && 'healthStatus' in result) {
        const summary = String(result.summary)
        if (result.healthStatus === 'connected') toast.success(summary)
        else {
          toast.error(summary)
          setConnectionOperations(current => ({ ...current, [connectionId]: { pending: null, error: summary } }))
        }
      } else toast.success(action === 'health' ? 'Verificação da credencial concluída.' : 'Canal desconectado.')
    } catch (error) {
      console.error(`Erro ao ${action === 'health' ? 'verificar' : 'desconectar'} conexão Meta:`, error)
      const message = action === 'health'
        ? 'Não foi possível verificar a credencial desta conexão. Tente novamente.'
        : 'Não foi possível desconectar este canal. Tente novamente.'
      setConnectionOperations(current => ({ ...current, [connectionId]: { pending: null, error: message } }))
      toast.error(message)
    }
  }

  return (
    <div className="space-y-4">
      {loadingChannels && <p className="text-sm text-gray-500">Atualizando canais...</p>}
      {workspaceContext.canConfigure && organization.kind === 'yux' && role?.scope === 'internal' ? <WhatsAppTestProvisionForm key={resolvedOrganizationId} organizationId={resolvedOrganizationId} onConnected={loadChannels} /> : null}
      <ConnectedChannelsWorkspace
        organizationId={resolvedOrganizationId}
        channels={channels}
        canConfigure={workspaceContext.canConfigure}
        settingsOptions={settingsOptions}
        connectionOperations={connectionOperations}
        savingSettingsConnectionId={savingSettingsConnectionId}
        onConnect={handleConnect}
        onPrepareConnect={prepareWhatsAppSignup}
        onDisconnect={connectionId => void runConnectionAction(connectionId, 'disconnect', () => metaChannelService.disconnect(connectionId))}
        onRefreshHealth={connectionId => void runConnectionAction(connectionId, 'health', () => metaChannelService.refreshHealth(connectionId))}
        onSaveSettings={saveWhatsAppSettings}
      />
      {pendingWhatsAppSignup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <form
            aria-labelledby="whatsapp-registration-pin-title"
            aria-modal="true"
            className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl"
            onSubmit={completeWhatsAppSignup}
            role="dialog"
          >
            <div>
              <h2 id="whatsapp-registration-pin-title" className="text-lg font-semibold text-gray-900">
                Proteja o número do WhatsApp
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                A Meta vai verificar se o número precisa de registro. Se pedir, informe o PIN de 6 dígitos de verificação em duas etapas; se já existir um PIN, use o atual. A YUX não salva esse PIN.
              </p>
            </div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="whatsapp-registration-pin">
              PIN de 6 dígitos{requiresRegistrationPin ? '' : ' (se solicitado pela Meta)'}
            </label>
            <input
              autoComplete="new-password"
              autoFocus
              className="w-full rounded-md border px-3 py-2 text-base tracking-widest"
              id="whatsapp-registration-pin"
              inputMode="numeric"
              maxLength={6}
              minLength={6}
              onChange={event => setRegistrationPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              pattern="[0-9]{6}"
              type="password"
              value={registrationPin}
            />
            <p className="text-xs text-gray-500">
              Guarde-o em local seguro: a Meta pode solicitá-lo novamente para administrar o número.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                disabled={completingWhatsAppSignup}
                onClick={() => {
                  setPendingWhatsAppSignup(null)
                  setRegistrationPin('')
                  setRequiresRegistrationPin(false)
                }}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-md bg-yux-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={completingWhatsAppSignup || (registrationPin.length > 0 && registrationPin.length !== 6) || (requiresRegistrationPin && registrationPin.length !== 6)}
                type="submit"
              >
                {completingWhatsAppSignup ? 'Registrando...' : 'Confirmar e conectar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
