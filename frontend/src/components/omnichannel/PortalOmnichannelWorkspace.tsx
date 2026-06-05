import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GitBranch, RefreshCw, RotateCcw, Send, UserCheck, UserRoundPlus, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OmnichannelAdminTabs } from './OmnichannelAdminTabs'
import { omnichannelService } from '@/services/omnichannelService'
import type {
  OmnichannelConversationFilters,
  OmnichannelMessageView,
  PortalOmnichannelConversationSummary,
} from '@/services/omnichannelService'
import type { OmnichannelChannel, ResponseMode } from '@/types/omnichannel'

type SummaryItem = { id: string; name: string }

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
  canConfigure?: boolean
  onSendReply?: (conversationId: string, body: string) => void
  onAssign?: (conversationId: string) => void
  onReassign?: (conversationId: string) => void
  onResolve?: (conversationId: string) => void
  onReopen?: (conversationId: string) => void
  onHandoff?: (conversationId: string) => void
  onModeChange?: (conversationId: string, mode: ResponseMode) => void
  onSimulateEvent?: (event: Record<string, unknown>) => void
}

const channels: OmnichannelChannel[] = ['whatsapp', 'instagram', 'email', 'webchat']

export function PortalOmnichannelWorkspace({
  organizationId,
  conversations: controlledConversations,
  messagesByConversation = {},
  metrics: controlledMetrics,
  queues = [],
  users = [],
  canConfigure = false,
  onSendReply,
  onAssign,
  onReassign,
  onResolve,
  onReopen,
  onHandoff,
  onModeChange,
  onSimulateEvent,
}: PortalOmnichannelWorkspaceProps) {
  const [filters, setFilters] = useState<OmnichannelConversationFilters>({})
  const [loadedConversations, setLoadedConversations] = useState<PortalOmnichannelConversationSummary[]>([])
  const [loadedMessages, setLoadedMessages] = useState<Record<string, OmnichannelMessageView[]>>({})
  const [loadedMetrics, setLoadedMetrics] = useState<PortalMetrics>()
  const [selectedId, setSelectedId] = useState<string>()
  const [simulatorChannel, setSimulatorChannel] = useState<OmnichannelChannel>('webchat')
  const replyRef = useRef<HTMLTextAreaElement>(null)

  const conversations = controlledConversations || loadedConversations
  const metrics = controlledMetrics || loadedMetrics || {
    totalConversations: conversations.length,
    openConversations: conversations.filter(item => item.status !== 'resolved' && item.status !== 'archived').length,
    resolvedConversations: conversations.filter(item => item.status === 'resolved').length,
    slaOnTimeRate: 0,
    handoffCount: conversations.filter(item => item.status === 'waiting_human' || item.tags.includes('handoff')).length,
    byChannel: conversations.reduce<Record<string, number>>((acc, conversation) => {
      acc[conversation.channel] = (acc[conversation.channel] || 0) + 1
      return acc
    }, {}),
  }
  const selectedConversation = conversations.find(conversation => conversation.id === selectedId) || conversations[0]
  const selectedConversationId = selectedConversation?.id
  const messages = selectedConversationId ? (messagesByConversation[selectedConversationId] || loadedMessages[selectedConversationId] || []) : []

  const filteredConversations = useMemo(() => conversations.filter(conversation => {
    if (filters.channel && conversation.channel !== filters.channel) return false
    if (filters.status && conversation.status !== filters.status) return false
    if (filters.queueId && conversation.queue?.id !== filters.queueId) return false
    if (filters.assignedUserId && conversation.assignedUser?.id !== filters.assignedUserId) return false
    return true
  }), [conversations, filters])

  const loadPortal = useCallback(async () => {
    if (controlledConversations) return
    try {
      const [nextConversations, nextMetrics] = await Promise.all([
        omnichannelService.getPortalInbox({ organizationId }),
        omnichannelService.getPortalMetrics(organizationId),
      ])
      setLoadedConversations(nextConversations)
      setLoadedMetrics({
        totalConversations: nextMetrics.totalConversations,
        openConversations: nextMetrics.openConversations,
        resolvedConversations: nextMetrics.resolvedConversations,
        slaOnTimeRate: 0,
        handoffCount: nextConversations.filter(item => item.status === 'waiting_human' || item.tags.includes('handoff')).length,
        byChannel: nextMetrics.byChannel,
      })
      setSelectedId(current => current || nextConversations[0]?.id)
    } catch (error) {
      console.error('Erro ao carregar portal omnichannel:', error)
      toast.error('Erro ao carregar omnichannel')
    }
  }, [controlledConversations, organizationId])

  useEffect(() => { loadPortal() }, [loadPortal])

  useEffect(() => {
    if (!selectedConversationId || messagesByConversation[selectedConversationId]) return
    omnichannelService.getMessages(selectedConversationId)
      .then(nextMessages => setLoadedMessages(current => ({ ...current, [selectedConversationId]: nextMessages })))
      .catch(error => {
        console.error('Erro ao carregar mensagens do portal:', error)
        toast.error('Erro ao carregar mensagens')
      })
  }, [messagesByConversation, selectedConversationId])

  const invokeOrToast = async (success: string, action: () => Promise<unknown>) => {
    try {
      await action()
      toast.success(success)
      loadPortal()
    } catch (error) {
      console.error(success, error)
      toast.error('Operacao nao concluida')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Central Omnichannel IA</h1>
          <p className="text-sm text-gray-600">Atendimento contratado, filas e handoff operacional.</p>
        </div>
        <Link
          to="/portal/omnichannel/channels"
          className="inline-flex h-9 items-center rounded-md bg-yux-600 px-3 text-sm font-medium text-white hover:bg-yux-700"
        >
          Conectar canais
        </Link>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Volume" value={String(metrics.totalConversations)} />
        <Metric label="SLA" value={`${Math.round((metrics.slaOnTimeRate || 0) * 100)}%`} />
        <Metric label="Handoffs" value={String(metrics.handoffCount || 0)} />
        <Metric label="Canais" value={Object.entries(metrics.byChannel).map(([channel, total]) => `${channel} ${total}`).join(' | ') || 'sem dados'} />
      </section>

      <div className="grid min-h-[620px] overflow-hidden rounded-md border bg-white lg:grid-cols-[300px_1fr]">
        <aside className="border-r">
          <div className="grid grid-cols-2 gap-2 border-b p-3 text-xs">
            <label className="space-y-1">
              <span>Canal</span>
              <select className="h-8 w-full rounded-md border px-2" value={filters.channel || ''} onChange={event => setFilters({ ...filters, channel: event.target.value as never })}>
                <option value="">Todos</option>
                {channels.map(channel => <option key={channel} value={channel}>{channel}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span>Status</span>
              <select className="h-8 w-full rounded-md border px-2" value={filters.status || ''} onChange={event => setFilters({ ...filters, status: event.target.value as never })}>
                <option value="">Todos</option>
                <option value="open">open</option>
                <option value="waiting_human">waiting_human</option>
                <option value="assigned">assigned</option>
                <option value="resolved">resolved</option>
              </select>
            </label>
            <label className="space-y-1">
              <span>Fila</span>
              <select className="h-8 w-full rounded-md border px-2" value={filters.queueId || ''} onChange={event => setFilters({ ...filters, queueId: event.target.value })}>
                <option value="">Todas</option>
                {queues.map(queue => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span>Responsavel</span>
              <select className="h-8 w-full rounded-md border px-2" value={filters.assignedUserId || ''} onChange={event => setFilters({ ...filters, assignedUserId: event.target.value })}>
                <option value="">Todos</option>
                {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
          </div>
          <div className="max-h-[540px] overflow-y-auto">
            {filteredConversations.map(conversation => (
              <button
                key={conversation.id}
                type="button"
                className={`block w-full border-b px-3 py-3 text-left hover:bg-gray-50 ${selectedConversation?.id === conversation.id ? 'bg-yux-50' : ''}`}
                onClick={() => setSelectedId(conversation.id)}
              >
                <span className="text-sm font-medium text-gray-900">{conversation.contact?.displayName || conversation.subject}</span>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">{conversation.summary}</p>
                <div className="mt-2 flex gap-1"><Badge variant="secondary">{conversation.channel}</Badge><Badge variant="outline">{conversation.status}</Badge></div>
              </button>
            ))}
          </div>
        </aside>

        <main className="grid min-w-0 grid-rows-[1fr_auto_auto]">
          <section className="grid min-h-0 lg:grid-cols-[1fr_280px]">
            <div className="min-h-0 overflow-y-auto p-4">
              <h2 className="text-lg font-semibold text-gray-900">{selectedConversation?.contact?.displayName || 'Conversa'}</h2>
              <p className="mb-4 text-sm text-gray-600">{selectedConversation?.summary}</p>
              <div className="space-y-3">
                {messages.map(message => (
                  <article key={message.id} className={`max-w-[78%] rounded-md border p-3 text-sm ${message.direction === 'outbound' ? 'ml-auto bg-yux-50' : 'bg-gray-50'}`}>
                    <div className="mb-1 text-xs text-gray-500">{message.authorType} - {message.deliveryStatus}</div>
                    <p>{message.body}</p>
                    {message.attachments.map(attachment => <p key={attachment.id} className="mt-1 rounded border bg-white px-2 py-1 text-xs">{attachment.filename}</p>)}
                  </article>
                ))}
              </div>
            </div>
            <aside className="space-y-3 border-l bg-gray-50 p-4 text-sm">
              <h2 className="font-semibold text-gray-900">Operacao</h2>
              <p>Classificacao {selectedConversation?.classification || 'n/a'}</p>
              <p>Fila {selectedConversation?.queue?.name || 'sem fila'}</p>
              <p>Responsavel {selectedConversation?.assignedUser?.name || 'sem responsavel'}</p>
              <p>Modo {selectedConversation?.responseMode || 'assisted'}</p>
              <p>SLA {selectedConversation?.slaDeadlineAt ? new Date(selectedConversation.slaDeadlineAt).toLocaleString('pt-BR') : 'n/a'}</p>
            </aside>
          </section>

          {selectedConversation && (
            <section className="border-t p-3">
              <div className="mb-2 flex flex-wrap gap-1">
                <Button type="button" size="icon" variant="outline" title="Atribuir no portal" onClick={() => (onAssign || (conversationId => invokeOrToast('Conversa atribuida', () => omnichannelService.assignConversation({ conversationId }))))(selectedConversation.id)}><UserCheck className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="outline" title="Reatribuir no portal" onClick={() => (onReassign || (conversationId => invokeOrToast('Conversa reatribuida', () => omnichannelService.reassignConversation({ conversationId }))))(selectedConversation.id)}><UserRoundPlus className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="outline" title="Handoff para YUX" onClick={() => (onHandoff || (conversationId => invokeOrToast('Handoff solicitado', () => omnichannelService.handoffConversation({ conversationId, trigger: 'portal_manual' }))))(selectedConversation.id)}><GitBranch className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="outline" title="Resolver no portal" onClick={() => (onResolve || (conversationId => invokeOrToast('Conversa resolvida', () => omnichannelService.resolveConversation(conversationId))))(selectedConversation.id)}><XCircle className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="outline" title="Reabrir no portal" onClick={() => (onReopen || (conversationId => invokeOrToast('Conversa reaberta', () => omnichannelService.reopenConversation(conversationId))))(selectedConversation.id)}><RotateCcw className="h-4 w-4" /></Button>
                {canConfigure && <Button type="button" size="sm" variant="outline" title="Modo manual no portal" onClick={() => (onModeChange || ((conversationId, mode) => invokeOrToast('Modo atualizado', () => omnichannelService.handoffConversation({ conversationId, trigger: `portal_mode:${mode}`, outcome: { mode } }))))(selectedConversation.id, 'manual')}>Manual</Button>}
              </div>
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <textarea ref={replyRef} name="portal-reply" className="min-h-[68px] rounded-md border px-3 py-2 text-sm" />
                <Button
                  type="button"
                  title="Responder conversa"
                  onClick={() => {
                    const body = replyRef.current?.value.trim() || ''
                    if (body) (onSendReply || ((conversationId, text) => invokeOrToast('Resposta enviada', () => omnichannelService.sendHumanReply({ conversationId, body: text }))))(selectedConversation.id, body)
                  }}
                >
                  <Send className="mr-2 h-4 w-4" />Responder
                </Button>
              </div>
            </section>
          )}

          {canConfigure && (
            <section className="border-t p-3">
              <div className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
                <select className="h-9 rounded-md border px-2" value={simulatorChannel} onChange={event => setSimulatorChannel(event.target.value as OmnichannelChannel)}>
                  {channels.map(channel => <option key={channel} value={channel}>{channel}</option>)}
                </select>
                <input className="h-9 rounded-md border px-2" defaultValue="Evento simulado pelo portal" />
                <Button type="button" title="Simular evento no portal" onClick={() => (onSimulateEvent || (event => invokeOrToast('Evento simulado', () => omnichannelService.simulateChannelEvent(event))))({ organizationId, channel: simulatorChannel, eventType: 'message.created' })}>
                  <RefreshCw className="mr-2 h-4 w-4" />Simular
                </Button>
              </div>
            </section>
          )}
        </main>
      </div>
      {canConfigure && <OmnichannelAdminTabs organizationId={organizationId} profile="portal" />}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{label} {value}</p>
    </div>
  )
}
