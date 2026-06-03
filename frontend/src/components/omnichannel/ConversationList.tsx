import { Badge } from '@/components/ui/badge'
import type { OmnichannelConversationFilters, OmnichannelConversationSummary } from '@/services/omnichannelService'

interface ConversationListProps {
  conversations: OmnichannelConversationSummary[]
  filters: OmnichannelConversationFilters
  selectedId?: string
  queues: Array<{ id: string; name: string }>
  teams: Array<{ id: string; name: string }>
  users: Array<{ id: string; name: string }>
  onFilterChange: (filters: OmnichannelConversationFilters) => void
  onSelect: (conversationId: string) => void
}

const channels = ['whatsapp', 'instagram', 'email', 'webchat'] as const
const statuses = ['open', 'waiting_ai', 'waiting_human', 'assigned', 'resolved', 'archived'] as const
const healthVariant = {
  healthy: 'default',
  warning: 'secondary',
  blocked: 'destructive',
  inactive: 'outline',
} as const

export function ConversationList({
  conversations,
  filters,
  selectedId,
  queues,
  teams,
  users,
  onFilterChange,
  onSelect,
}: ConversationListProps) {
  const update = (patch: Partial<OmnichannelConversationFilters>) => onFilterChange({ ...filters, ...patch })

  return (
    <aside className="flex min-h-[680px] flex-col border-r bg-white">
      <div className="border-b p-3">
        <h2 className="text-sm font-semibold text-gray-900">Inbox omnichannel</h2>
        <p className="text-xs text-gray-500">{conversations.length} conversas filtradas</p>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b p-3 text-xs">
        <label className="space-y-1">
          <span>Organizacao</span>
          <input
            className="h-8 w-full rounded-md border px-2"
            value={filters.organizationId || ''}
            onChange={event => update({ organizationId: event.target.value })}
          />
        </label>
        <label className="space-y-1">
          <span>Canal</span>
          <select className="h-8 w-full rounded-md border px-2" value={filters.channel || ''} onChange={event => update({ channel: event.target.value as never })}>
            <option value="">Todos</option>
            {channels.map(channel => <option key={channel} value={channel}>{channel}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span>Fila</span>
          <select className="h-8 w-full rounded-md border px-2" value={filters.queueId || ''} onChange={event => update({ queueId: event.target.value })}>
            <option value="">Todas</option>
            {queues.map(queue => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span>Equipe</span>
          <select className="h-8 w-full rounded-md border px-2" value={filters.teamId || ''} onChange={event => update({ teamId: event.target.value })}>
            <option value="">Todas</option>
            {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span>Responsavel</span>
          <select className="h-8 w-full rounded-md border px-2" value={filters.assignedUserId || ''} onChange={event => update({ assignedUserId: event.target.value })}>
            <option value="">Todos</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span>Status</span>
          <select className="h-8 w-full rounded-md border px-2" value={filters.status || ''} onChange={event => update({ status: event.target.value as never })}>
            <option value="">Todos</option>
            {statuses.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span>SLA</span>
          <select className="h-8 w-full rounded-md border px-2" value={filters.sla || ''} onChange={event => update({ sla: event.target.value as never })}>
            <option value="">Todos</option>
            <option value="overdue">Vencido</option>
            <option value="due_soon">Proximo</option>
          </select>
        </label>
        <label className="space-y-1">
          <span>Tag</span>
          <input className="h-8 w-full rounded-md border px-2" value={filters.tag || ''} onChange={event => update({ tag: event.target.value })} />
        </label>
        <label className="col-span-2 flex items-center gap-2">
          <input type="checkbox" checked={Boolean(filters.handoff)} onChange={event => update({ handoff: event.target.checked ? true : null })} />
          <span>Handoff</span>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.map(conversation => (
          <button
            key={conversation.id}
            type="button"
            className={`block w-full border-b px-3 py-3 text-left hover:bg-gray-50 ${selectedId === conversation.id ? 'bg-yux-50' : ''}`}
            onClick={() => onSelect(conversation.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-gray-900">{conversation.contact?.displayName || conversation.subject || conversation.id}</span>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={conversation.channel === 'whatsapp' ? 'default' : 'secondary'}>{conversation.channel}</Badge>
                {conversation.connection?.health && (
                  <Badge variant={healthVariant[conversation.connection.health.state]}>{conversation.connection.health.label}</Badge>
                )}
              </div>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-gray-600">{conversation.summary || 'Sem resumo operacional.'}</p>
            <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-gray-500">
              <span>{conversation.status}</span>
              {conversation.queue?.name && <span>{conversation.queue.name}</span>}
              {conversation.assignedUser?.name && <span>{conversation.assignedUser.name}</span>}
              {(conversation.leadId || conversation.contact?.leadId) && <span>lead vinculado</span>}
            </div>
          </button>
        ))}
      </div>
    </aside>
  )
}
