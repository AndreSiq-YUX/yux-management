import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { PortalConversationList } from './PortalConversationList'
import { PortalConversationDetails } from './PortalConversationDetails'
import { PortalConversationComposer } from './PortalConversationComposer'
import { KpiCard, KpiGrid, MasterDetail, PageHeader, PendingBadge, portalButtonClasses } from '@/components/portal-ui'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { channelLabel } from '@/lib/client-portal/portalDisplay'
import { usePlatformStore } from '@/stores/platformStore'
import { omnichannelService } from '@/services/omnichannelService'
import type {
  OmnichannelConversationFilters,
  OmnichannelMessageView,
  PortalOmnichannelConversationSummary,
} from '@/services/omnichannelService'
import type { ResponseMode } from '@/types/omnichannel'

type SummaryItem = { id: string; name: string }

const EMPTY_MESSAGES_BY_CONVERSATION: Record<string, OmnichannelMessageView[]> = {}

interface PortalMetrics {
  totalConversations: number
  openConversations: number
  resolvedConversations: number
  slaOnTimeRate?: number
  handoffCount?: number
  byChannel: Record<string, number>
  [key: string]: unknown
}

export interface PortalOmnichannelWorkspaceProps {
  organizationId: string
  conversations?: PortalOmnichannelConversationSummary[]
  messagesByConversation?: Record<string, OmnichannelMessageView[]>
  metrics?: PortalMetrics
  queues?: SummaryItem[]
  users?: SummaryItem[]
  /** Só habilita o simulador de eventos (equipe interna). A configuração do agente e das filas fica em Agente IA e Filas. */
  canConfigure?: boolean
  onSendReply?: (conversationId: string, body: string) => void
  onApproveSuggestion?: (messageId: string) => void
  onRetry?: (messageId: string) => void
  onAssign?: (conversationId: string) => void
  onReassign?: (conversationId: string) => void
  onResolve?: (conversationId: string) => void
  onReopen?: (conversationId: string) => void
  onHandoff?: (conversationId: string) => void
  onModeChange?: (conversationId: string, mode: ResponseMode) => void
  onSimulateEvent?: (event: Record<string, unknown>) => void
}

const isHandoffPending = (conversation: PortalOmnichannelConversationSummary) =>
  conversation.status === 'waiting_human' || conversation.tags.includes('handoff')

const isHandledByAi = (conversation: PortalOmnichannelConversationSummary) =>
  conversation.status === 'waiting_ai'
  || (conversation.status !== 'resolved'
    && conversation.status !== 'archived'
    && conversation.status !== 'waiting_human'
    && !conversation.assignedUser
    && conversation.responseMode === 'automatic')

export function PortalOmnichannelWorkspace({
  organizationId,
  conversations: controlledConversations,
  messagesByConversation = EMPTY_MESSAGES_BY_CONVERSATION,
  metrics: controlledMetrics,
  queues: controlledQueues = [],
  users = [],
  canConfigure = false,
  onSendReply,
  onApproveSuggestion,
  onRetry,
  onAssign,
  onReassign,
  onResolve,
  onReopen,
  onHandoff,
  onModeChange,
  onSimulateEvent,
}: PortalOmnichannelWorkspaceProps) {
  const portalPath = usePortalWorkspacePath()
  const role = usePlatformStore(state => state.role)
  const isInternalRole = role?.scope === 'internal'
  const [filters, setFilters] = useState<OmnichannelConversationFilters>({ organizationId })
  const [loadedConversations, setLoadedConversations] = useState<PortalOmnichannelConversationSummary[]>([])
  const [loadedMessages, setLoadedMessages] = useState<Record<string, OmnichannelMessageView[]>>({})
  const [loadedMetrics, setLoadedMetrics] = useState<PortalMetrics>()
  /** Conversa aberta de propósito. Sem ela, o celular mostra a lista e o desktop mostra a primeira conversa. */
  const [openId, setOpenId] = useState<string>()
  const [queues, setQueues] = useState<SummaryItem[]>(controlledQueues)
  const [teams, setTeams] = useState<SummaryItem[]>([])
  const [loading, setLoading] = useState(!controlledConversations)
  const messageLoadsInFlight = useRef(new Set<string>())
  const paneRef = useRef<HTMLElement>(null)

  const conversations = controlledConversations || loadedConversations

  const metrics: PortalMetrics = controlledMetrics || loadedMetrics || {
    totalConversations: conversations.length,
    openConversations: conversations.filter(item => item.status !== 'resolved' && item.status !== 'archived').length,
    resolvedConversations: conversations.filter(item => item.status === 'resolved').length,
    handoffCount: conversations.filter(isHandoffPending).length,
    byChannel: conversations.reduce<Record<string, number>>((acc, conversation) => {
      acc[conversation.channel] = (acc[conversation.channel] || 0) + 1
      return acc
    }, {}),
  }

  const list = useMemo(() => conversations.filter(conversation => {
    if (filters.channel && conversation.channel !== filters.channel) return false
    if (filters.status && conversation.status !== filters.status) return false
    if (filters.queueId && conversation.queue?.id !== filters.queueId) return false
    if (filters.teamId && conversation.team?.id !== filters.teamId) return false
    if (filters.assignedUserId && conversation.assignedUser?.id !== filters.assignedUserId) return false
    if (filters.tag && !conversation.tags.includes(filters.tag)) return false
    if (filters.handoff && !isHandoffPending(conversation)) return false
    return true
  }), [conversations, filters])

  const openConversation = openId ? conversations.find(conversation => conversation.id === openId) : undefined
  const activeConversation = openConversation || list[0]
  const activeConversationId = activeConversation?.id
  const messages = activeConversationId ? (messagesByConversation[activeConversationId] || loadedMessages[activeConversationId] || []) : []
  const suggestionMessage = messages.find(message => message.authorType === 'ai' && message.deliveryStatus === 'queued')
  const failedMessage = messages.find(message => message.direction === 'outbound' && message.deliveryStatus === 'failed')

  const loadPortal = useCallback(async () => {
    if (controlledConversations) return
    try {
      setLoading(true)
      const [nextConversations, nextMetrics] = await Promise.all([
        omnichannelService.getPortalInbox({ organizationId }),
        omnichannelService.getPortalMetrics(organizationId),
      ])
      setLoadedConversations(nextConversations)
      setLoadedMetrics({
        totalConversations: nextMetrics.totalConversations,
        openConversations: nextMetrics.openConversations,
        resolvedConversations: nextMetrics.resolvedConversations,
        handoffCount: nextConversations.filter(isHandoffPending).length,
        byChannel: nextMetrics.byChannel,
      })
    } catch (error) {
      console.error('Erro ao carregar conversas do portal:', error)
      toast.error('Não foi possível carregar as conversas.')
    } finally {
      setLoading(false)
    }
    // Filas e equipes só alimentam os filtros; falhar aqui não pode esconder as conversas.
    try {
      const [nextQueues, nextTeams] = await Promise.all([
        omnichannelService.getQueues(organizationId),
        omnichannelService.getTeams(organizationId),
      ])
      setQueues(nextQueues.map(item => ({ id: item.id, name: item.name })))
      setTeams(nextTeams.map(item => ({ id: item.id, name: item.name })))
    } catch (error) {
      console.error('Erro ao carregar filas e equipes do portal:', error)
    }
  }, [controlledConversations, organizationId])

  useEffect(() => { loadPortal() }, [loadPortal])

  useEffect(() => {
    if (
      !activeConversationId
      || messagesByConversation[activeConversationId]
      || loadedMessages[activeConversationId]
      || messageLoadsInFlight.current.has(activeConversationId)
    ) return
    messageLoadsInFlight.current.add(activeConversationId)
    omnichannelService.getMessages(activeConversationId)
      .then(nextMessages => setLoadedMessages(current => ({ ...current, [activeConversationId]: nextMessages })))
      .catch(error => {
        console.error('Erro ao carregar mensagens do portal:', error)
        toast.error('Não foi possível carregar as mensagens.')
      })
      .finally(() => messageLoadsInFlight.current.delete(activeConversationId))
  }, [loadedMessages, messagesByConversation, activeConversationId])

  // No celular a conversa abre em tela cheia: leva a página para o topo dela.
  useEffect(() => {
    if (!openId) return
    const narrow = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches
    if (narrow && typeof paneRef.current?.scrollIntoView === 'function') paneRef.current.scrollIntoView({ block: 'start' })
  }, [openId])

  useEffect(() => {
    setFilters(current => ({ ...current, organizationId }))
  }, [organizationId])

  const invokeOrToast = async (success: string, action: () => Promise<unknown>) => {
    try {
      await action()
      toast.success(success)
      loadPortal()
    } catch (error) {
      console.error(success, error)
      toast.error('Não foi possível concluir a ação. Tente novamente.')
    }
  }

  const handleModeChange = onModeChange
    || ((conversationId: string, mode: ResponseMode) => invokeOrToast('Quem responde foi atualizado', () => omnichannelService.handoffConversation({ conversationId, trigger: `portal_mode:${mode}`, outcome: { mode } })))
  const handleHandoff = onHandoff
    || ((conversationId: string) => invokeOrToast('Transferência para atendente solicitada', () => omnichannelService.handoffConversation({ conversationId, trigger: 'portal_manual' })))
  const handleResolve = onResolve
    || ((conversationId: string) => invokeOrToast('Conversa resolvida', () => omnichannelService.resolveConversation(conversationId)))
  const handleReopen = onReopen
    || ((conversationId: string) => invokeOrToast('Conversa reaberta', () => omnichannelService.reopenConversation(conversationId)))
  const handleAssign = onAssign
    || ((conversationId: string) => invokeOrToast('Você assumiu a conversa', () => omnichannelService.assignConversation({ conversationId })))
  const handleReassign = onReassign
    || ((conversationId: string) => invokeOrToast('Conversa reatribuída', () => omnichannelService.reassignConversation({ conversationId })))
  const handleSendReply = onSendReply
    || ((conversationId: string, body: string) => invokeOrToast('Resposta enviada', () => omnichannelService.sendHumanReply({ conversationId, body })))
  const handleApproveSuggestion = onApproveSuggestion
    || (onSendReply
      ? () => { if (activeConversationId) onSendReply(activeConversationId, suggestionMessage?.body || '') }
      : (messageId: string) => invokeOrToast('Sugestão aprovada e enviada', () => omnichannelService.approveAssistedSuggestion(messageId)))
  const handleRetry = onRetry
    || ((messageId: string) => invokeOrToast('Mensagem reenviada', () => omnichannelService.retryOutboundMessage(messageId)))

  const waitingCount = metrics.handoffCount ?? conversations.filter(isHandoffPending).length
  const aiCount = conversations.filter(isHandledByAi).length
  const channelEntries = Object.entries(metrics.byChannel || {})

  const conversationPane = activeConversation ? (
    <section
      ref={paneRef}
      aria-label="Conversa"
      className="flex h-[calc(100dvh-8.5rem)] min-h-[440px] flex-col overflow-hidden rounded-[10px] border border-yx-line bg-yx-surface lg:h-[680px]"
    >
      <PortalConversationDetails
        className="flex-1"
        conversation={activeConversation}
        messages={messages}
        onModeChange={handleModeChange}
        onHandoff={handleHandoff}
        onResolve={handleResolve}
        onReopen={handleReopen}
        onAssign={handleAssign}
        onReassign={handleReassign}
        onApproveSuggestion={handleApproveSuggestion}
      />
      <PortalConversationComposer
        conversationId={activeConversation.id}
        failedMessageId={failedMessage?.id}
        onSendReply={handleSendReply}
        onRetry={handleRetry}
      />
      {canConfigure && isInternalRole && onSimulateEvent ? (
        <div className="shrink-0 border-t border-yx-line bg-yx-surface-2 p-3">
          <button
            type="button"
            title="Simular evento no portal"
            className={portalButtonClasses('ghost')}
            onClick={() => onSimulateEvent({ organizationId, channel: 'webchat', eventType: 'message.created', payload: { source: 'portal_sandbox' } })}
          >
            Simular evento
          </button>
        </div>
      ) : null}
    </section>
  ) : null

  return (
    <div className="w-full space-y-6">
      <PageHeader
        className={openConversation ? 'max-lg:hidden' : undefined}
        eyebrow="Atendimento"
        title="Conversas"
        lead="Acompanhe as conversas com seus clientes e assuma quando a IA transferir."
        actions={
          <Link to={portalPath('/portal/atendimento/canais')} className={portalButtonClasses('primary')}>
            Conectar canais
          </Link>
        }
      />

      <div className={openConversation ? 'space-y-6 max-lg:hidden' : 'space-y-6'}>
      <KpiGrid variant="card" count={4} aria-label="Indicadores de atendimento">
        <KpiCard label="Aguardando atendente" value={String(waitingCount)} comparison="Conversas que a IA transferiu para você." />
        <KpiCard label="Em atendimento pela IA" value={String(aiCount)} comparison="Respondidas sem atendente." />
        <KpiCard label="Resolvidas" value={String(metrics.resolvedConversations)} comparison="Conversas encerradas." />
        <KpiCard label="Prazo de resposta" value="—" pending={<PendingBadge code="B5" />} />
      </KpiGrid>

      {channelEntries.length > 0 ? (
        <section aria-labelledby="conversas-por-canal" className="space-y-2.5">
          <h2 id="conversas-por-canal" className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3">
            Conversas por canal
          </h2>
          <KpiGrid variant="card" count={channelEntries.length} aria-label="Conversas por canal">
            {channelEntries.map(([channel, count]) => (
              <KpiCard key={channel} label={channelLabel(channel)} value={String(count)} />
            ))}
          </KpiGrid>
        </section>
      ) : null}
      </div>

      <MasterDetail
        listWidth={340}
        onBack={() => setOpenId(undefined)}
        backLabel="Voltar"
        list={
          <PortalConversationList
            conversations={list}
            filters={filters}
            selectedId={activeConversation?.id}
            queues={queues}
            teams={teams}
            users={users}
            loading={loading}
            onFilterChange={setFilters}
            onSelect={setOpenId}
          />
        }
        detail={openConversation ? conversationPane : null}
        emptyDetail={
          conversationPane ?? (
            <section aria-label="Conversa" className="overflow-hidden rounded-[10px] border border-yx-line bg-yx-surface lg:h-[680px]">
              <PortalConversationDetails className="h-full min-h-[320px]" messages={[]} />
            </section>
          )
        }
      />
    </div>
  )
}
