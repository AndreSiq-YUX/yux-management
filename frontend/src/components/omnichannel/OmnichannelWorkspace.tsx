import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ChannelSimulator } from './ChannelSimulator'
import { ConversationComposer } from './ConversationComposer'
import { ConversationDetails } from './ConversationDetails'
import { ConversationList } from './ConversationList'
import { OmnichannelAdminTabs } from './OmnichannelAdminTabs'
import { omnichannelService } from '@/services/omnichannelService'
import { aiAssistantService } from '@/services/aiAssistantService'
import { StrategyContextPanel } from '@/components/strategy-engine/StrategyContextPanel'
import type { AiAssistantSettings } from '@/types/aiAssistant'
import type {
  OmnichannelAiRunView,
  OmnichannelConversationFilters,
  OmnichannelConversationSummary,
  OmnichannelMessageView,
} from '@/services/omnichannelService'
import type { ResponseMode } from '@/types/omnichannel'

type SummaryItem = { id: string; name: string }

export interface OmnichannelWorkspaceProps {
  organizationId: string
  conversations?: OmnichannelConversationSummary[]
  messagesByConversation?: Record<string, OmnichannelMessageView[]>
  aiRunsByConversation?: Record<string, OmnichannelAiRunView[]>
  queues?: SummaryItem[]
  teams?: SummaryItem[]
  users?: SummaryItem[]
  onSendReply?: (conversationId: string, body: string) => void
  onApproveSuggestion?: (messageId: string) => void
  onAssign?: (conversationId: string) => void
  onReassign?: (conversationId: string) => void
  onHandoff?: (conversationId: string) => void
  onResolve?: (conversationId: string) => void
  onReopen?: (conversationId: string) => void
  onRetry?: (messageId: string) => void
  onModeChange?: (conversationId: string, mode: ResponseMode) => void
  onSimulateEvent?: (event: Record<string, unknown>) => void
}

export function OmnichannelWorkspace({
  organizationId,
  conversations: controlledConversations,
  messagesByConversation = {},
  aiRunsByConversation = {},
  queues: controlledQueues,
  teams: controlledTeams,
  users = [],
  onSendReply,
  onApproveSuggestion,
  onAssign,
  onReassign,
  onHandoff,
  onResolve,
  onReopen,
  onRetry,
  onModeChange,
  onSimulateEvent,
}: OmnichannelWorkspaceProps) {
  const [filters, setFilters] = useState<OmnichannelConversationFilters>({ organizationId })
  const [loadedConversations, setLoadedConversations] = useState<OmnichannelConversationSummary[]>([])
  const [loadedMessages, setLoadedMessages] = useState<Record<string, OmnichannelMessageView[]>>({})
  const [loadedAiRuns, setLoadedAiRuns] = useState<Record<string, OmnichannelAiRunView[]>>({})
  const [queues, setQueues] = useState<SummaryItem[]>(controlledQueues || [])
  const [teams, setTeams] = useState<SummaryItem[]>(controlledTeams || [])
  const [selectedId, setSelectedId] = useState<string>()
  const [loading, setLoading] = useState(!controlledConversations)
  const [assistant, setAssistant] = useState<AiAssistantSettings | null>(null)

  const hasPersistedOrganization = useMemo(() => {
    return Boolean(organizationId && organizationId !== 'local-yux' && organizationId.includes('-'))
  }, [organizationId])

  const conversations = controlledConversations || loadedConversations
  const selectedConversation = conversations.find(conversation => conversation.id === selectedId) || conversations[0]
  const selectedConversationId = selectedConversation?.id
  const messages = selectedConversationId ? (messagesByConversation[selectedConversationId] || loadedMessages[selectedConversationId] || []) : []
  const aiRuns = selectedConversationId ? (aiRunsByConversation[selectedConversationId] || loadedAiRuns[selectedConversationId] || []) : []
  const suggestionMessage = messages.find(message => message.authorType === 'ai' && message.deliveryStatus === 'queued')
  const failedMessage = messages.find(message => message.direction === 'outbound' && message.deliveryStatus === 'failed') || suggestionMessage

  const providerHealthSummary = useMemo(() => {
    const states = conversations
      .filter(conversation => conversation.channel === 'whatsapp')
      .map(conversation => conversation.connection?.health?.state)
      .filter(Boolean)
    if (!states.length) return 'WhatsApp sem conexões ativas'
    if (states.includes('blocked')) return 'WhatsApp requer ação'
    if (states.includes('warning')) return 'WhatsApp requer revisão'
    return 'WhatsApp conectado'
  }, [conversations])

  const list = useMemo(() => conversations.filter(conversation => {
    if (filters.channel && conversation.channel !== filters.channel) return false
    if (filters.status && conversation.status !== filters.status) return false
    if (filters.queueId && conversation.queueId !== filters.queueId) return false
    if (filters.teamId && conversation.teamId !== filters.teamId) return false
    if (filters.assignedUserId && conversation.assignedUserId !== filters.assignedUserId) return false
    if (filters.tag && !conversation.tags.includes(filters.tag)) return false
    if (filters.handoff && !conversation.tags.includes('handoff') && conversation.status !== 'waiting_human') return false
    return true
  }), [conversations, filters])

  const loadInbox = useCallback(async () => {
    if (controlledConversations) return
    if (!hasPersistedOrganization) {
      setLoadedConversations([])
      setQueues([])
      setTeams([])
      setSelectedId(undefined)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const nextConversations = await omnichannelService.getInternalInbox({ organizationId }) || []
      setLoadedConversations(nextConversations)
      setSelectedId(current => current || nextConversations[0]?.id)
      const [nextQueues, nextTeams] = await Promise.all([
        omnichannelService.getQueues(organizationId),
        omnichannelService.getTeams(organizationId),
      ])
      setQueues(nextQueues.map(item => ({ id: item.id, name: item.name })))
      setTeams(nextTeams.map(item => ({ id: item.id, name: item.name })))
    } catch (error) {
      console.error('Erro ao carregar omnichannel:', error)
      toast.error('Erro ao carregar omnichannel')
    } finally {
      setLoading(false)
    }
  }, [controlledConversations, hasPersistedOrganization, organizationId])

  // Load active AI assistant configuration
  const loadAssistant = useCallback(async () => {
    if (!hasPersistedOrganization) return
    try {
      const active = await aiAssistantService.getActiveAssistant(organizationId)
      setAssistant(active)
    } catch (e) {
      console.error('Erro ao carregar assistente de IA:', e)
    }
  }, [hasPersistedOrganization, organizationId])

  useEffect(() => { loadInbox() }, [loadInbox])
  useEffect(() => { loadAssistant() }, [loadAssistant])

  useEffect(() => {
    if (!selectedConversationId || messagesByConversation[selectedConversationId]) return
    omnichannelService.getMessages(selectedConversationId)
      .then(nextMessages => setLoadedMessages(current => ({ ...current, [selectedConversationId]: nextMessages })))
      .catch(error => {
        console.error('Erro ao carregar mensagens omnichannel:', error)
        toast.error('Erro ao carregar mensagens')
      })
  }, [messagesByConversation, selectedConversationId])

  useEffect(() => {
    setFilters(current => ({ ...current, organizationId }))
  }, [organizationId])

  const invokeOrToast = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action()
      toast.success(label)
      loadInbox()
    } catch (error) {
      console.error(label, error)
      toast.error('Operação não concluída')
    }
  }

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Central Omnichannel IA</h1>
          <p className="text-sm text-gray-600">Atendimento operacional, handoff e supervisão de IA.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md border bg-white px-3 py-2 text-gray-700">{providerHealthSummary}</span>
          {loading && <span className="text-gray-500">Carregando...</span>}
        </div>
      </div>

      {!hasPersistedOrganization && (
        <section className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nao foi possivel carregar uma organizacao real para o Omnichannel. Verifique a sessao do usuario e o acesso a organizations antes de consultar conversas, filas e equipes.
        </section>
      )}

      <StrategyContextPanel
        organizationId={organizationId}
        moduleKey="omnichannel"
        recordType="conversation"
        recordTitle={selectedConversation?.contact?.displayName || selectedConversation?.channel}
        contextSummary="Use a IA de conversa para qualificar, revisar resposta, detectar risco de handoff e aplicar a doutrina por canal, intencao e estagio comercial."
      />

      {/* Main chat layout */}
      <div className="grid min-h-[680px] overflow-hidden rounded-xl border bg-white lg:grid-cols-[340px_1fr]">
        <ConversationList
          conversations={list}
          filters={filters}
          selectedId={selectedConversation?.id}
          queues={queues}
          teams={teams}
          users={users}
          onFilterChange={setFilters}
          onSelect={setSelectedId}
        />
        <main className="grid min-w-0 grid-rows-[1fr_auto_auto]">
          <ConversationDetails
            conversation={selectedConversation}
            messages={messages}
            aiRuns={aiRuns}
            onModeChange={onModeChange || ((conversationId, mode) => invokeOrToast('Modo atualizado', () => omnichannelService.handoffConversation({ conversationId, trigger: `mode:${mode}`, outcome: { mode } })))}
            onHandoff={onHandoff || (conversationId => invokeOrToast('Handoff registrado', () => omnichannelService.handoffConversation({ conversationId, trigger: 'manual' })))}
            onResolve={onResolve || (conversationId => invokeOrToast('Conversa resolvida', () => omnichannelService.resolveConversation(conversationId)))}
            onReopen={onReopen || (conversationId => invokeOrToast('Conversa reaberta', () => omnichannelService.reopenConversation(conversationId)))}
            onAssign={onAssign || (conversationId => invokeOrToast('Conversa atribuída', () => omnichannelService.assignConversation({ conversationId })))}
            onApproveSuggestion={onApproveSuggestion || (messageId => invokeOrToast('Sugestão aprovada', () => omnichannelService.approveAssistedSuggestion(messageId)))}
          />
          {selectedConversation && (
            <ConversationComposer
              conversationId={selectedConversation.id}
              suggestionMessageId={suggestionMessage?.id}
              failedMessageId={failedMessage?.id}
              onSendReply={onSendReply || ((conversationId, body) => invokeOrToast('Resposta enviada', () => omnichannelService.sendHumanReply({ conversationId, body })))}
              onApproveSuggestion={onApproveSuggestion || (messageId => invokeOrToast('Sugestão aprovada', () => omnichannelService.approveAssistedSuggestion(messageId)))}
              onAssign={onAssign || (conversationId => invokeOrToast('Conversa atribuída', () => omnichannelService.assignConversation({ conversationId })))}
              onReassign={onReassign || (conversationId => invokeOrToast('Conversa reatribuída', () => omnichannelService.reassignConversation({ conversationId })))}
              onHandoff={onHandoff || (conversationId => invokeOrToast('Handoff registrado', () => omnichannelService.handoffConversation({ conversationId, trigger: 'manual' })))}
              onResolve={onResolve || (conversationId => invokeOrToast('Conversa resolvida', () => omnichannelService.resolveConversation(conversationId)))}
              onReopen={onReopen || (conversationId => invokeOrToast('Conversa reaberta', () => omnichannelService.reopenConversation(conversationId)))}
              onRetry={onRetry || (messageId => invokeOrToast('Retry enviado', () => omnichannelService.retryOutboundMessage(messageId)))}
              onModeChange={onModeChange || ((conversationId, mode) => invokeOrToast('Modo atualizado', () => omnichannelService.handoffConversation({ conversationId, trigger: `mode:${mode}`, outcome: { mode } })))}
            />
          )}
          {hasPersistedOrganization && (
            <ChannelSimulator
              organizationId={organizationId}
              onSimulateEvent={onSimulateEvent || (event => invokeOrToast('Evento simulado', () => omnichannelService.simulateChannelEvent(event)))}
            />
          )}
        </main>
      </div>

      {/* Settings Panel Tabs */}
      {hasPersistedOrganization && (
        <OmnichannelAdminTabs
          organizationId={organizationId}
          profile="internal"
          teams={teams.map(t => ({ id: t.id, name: t.name, availabilityMode: 'business_hours', isActive: true, members: [] }))}
          queues={queues.map(q => ({ id: q.id, name: q.name, strategy: 'round_robin', isActive: true }))}
          assistant={assistant}
          onSaveAssistant={loadAssistant}
        />
      )}
    </div>
  )
}
