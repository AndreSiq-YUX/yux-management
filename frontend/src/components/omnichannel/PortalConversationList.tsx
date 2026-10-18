import { useMemo, useState } from 'react'
import { Bot, CheckCheck, Filter, MessageSquare, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { StatusChip, portalButtonClasses, portalFocusRing } from '@/components/portal-ui'
import { channelLabel, formatRelativeTime } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'
import { conversationStatusLabel, responseModeLabel } from './portalLabels'
import type { OmnichannelConversationFilters, PortalOmnichannelConversationSummary } from '@/services/omnichannelService'

interface PortalConversationListProps {
  conversations: PortalOmnichannelConversationSummary[]
  filters: OmnichannelConversationFilters
  selectedId?: string
  queues: Array<{ id: string; name: string }>
  teams: Array<{ id: string; name: string }>
  users: Array<{ id: string; name: string }>
  onFilterChange: (filters: OmnichannelConversationFilters) => void
  onSelect: (conversationId: string) => void
  loading?: boolean
}

type QuickTab = 'all' | 'open' | 'waiting' | 'resolved'

const quickTabs: Array<{ id: QuickTab; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'open', label: 'Abertas' },
  { id: 'waiting', label: 'Aguardando atendente' },
  { id: 'resolved', label: 'Resolvidas' },
]

const channels = ['whatsapp', 'instagram', 'email', 'webchat'] as const
const statuses = ['open', 'waiting_ai', 'waiting_human', 'assigned', 'resolved', 'archived'] as const

const fieldClasses =
  'h-10 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-2 text-[13px] text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue'

function initials(name?: string) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()
}

/** Lista de conversas do portal (tokens do portal, filtros em português). */
export function PortalConversationList({
  conversations,
  filters,
  selectedId,
  queues,
  teams,
  users,
  onFilterChange,
  onSelect,
  loading = false,
}: PortalConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<QuickTab>('all')

  const update = (patch: Partial<OmnichannelConversationFilters>) => onFilterChange({ ...filters, ...patch })

  const handleTabChange = (tab: QuickTab) => {
    setActiveTab(tab)
    const status = tab === 'open' ? 'open' : tab === 'waiting' ? 'waiting_human' : tab === 'resolved' ? 'resolved' : undefined
    update({ status, handoff: null })
  }

  const filteredList = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return conversations
    return conversations.filter(conversation =>
      [conversation.contact?.displayName, conversation.summary, conversation.subject, conversation.contact?.phone]
        .some(value => (value || '').toLowerCase().includes(query)),
    )
  }, [conversations, searchQuery])

  const activeFilterCount = [
    filters.channel,
    filters.queueId,
    filters.teamId,
    filters.assignedUserId,
    activeTab === 'all' ? filters.status : undefined,
    filters.tag,
    filters.handoff,
  ].filter(Boolean).length

  return (
    <aside
      aria-label="Lista de conversas"
      className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-yx-line bg-yx-surface lg:h-[680px]"
    >
      <div className="space-y-3 border-b border-yx-line p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-yx-fg">
            <MessageSquare aria-hidden="true" className="h-4 w-4 text-yx-blue" />
            Caixa de entrada
          </h2>
          <span className="rounded-full bg-yx-surface-2 px-2 py-0.5 font-mono text-[11.5px] font-medium text-yx-fg-2">
            {conversations.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar conversas</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-yx-fg-3" />
            <input
              type="search"
              placeholder="Buscar por nome ou assunto"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              className={cn(fieldClasses, 'pl-9')}
            />
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Filtrar conversas"
                className={cn(
                  'relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-yx-line-strong bg-yx-surface text-yx-fg-2 hover:border-yx-blue hover:text-yx-blue',
                  portalFocusRing,
                )}
              >
                <Filter aria-hidden="true" className="h-4 w-4" />
                {activeFilterCount > 0 ? (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-yx-blue px-1 font-mono text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(18rem,calc(100vw-2rem))] space-y-3 p-4 text-[13px]" align="end">
              <h3 className="border-b border-yx-line pb-2 font-display text-sm font-semibold text-yx-fg">Filtrar conversas</h3>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="font-medium text-yx-fg-2">Canal</span>
                  <select className={fieldClasses} value={filters.channel || ''} onChange={event => update({ channel: (event.target.value || undefined) as OmnichannelConversationFilters['channel'] })}>
                    <option value="">Todos</option>
                    {channels.map(channel => <option key={channel} value={channel}>{channelLabel(channel)}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="font-medium text-yx-fg-2">Fila</span>
                  <select className={fieldClasses} value={filters.queueId || ''} onChange={event => update({ queueId: event.target.value || undefined })}>
                    <option value="">Todas</option>
                    {queues.map(queue => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="font-medium text-yx-fg-2">Equipe</span>
                  <select className={fieldClasses} value={filters.teamId || ''} onChange={event => update({ teamId: event.target.value || undefined })}>
                    <option value="">Todas</option>
                    {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="font-medium text-yx-fg-2">Responsável</span>
                  <select className={fieldClasses} value={filters.assignedUserId || ''} onChange={event => update({ assignedUserId: event.target.value || undefined })}>
                    <option value="">Todos</option>
                    {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </label>
                {activeTab === 'all' ? (
                  <label className="col-span-2 space-y-1">
                    <span className="font-medium text-yx-fg-2">Situação</span>
                    <select className={fieldClasses} value={filters.status || ''} onChange={event => update({ status: (event.target.value || undefined) as OmnichannelConversationFilters['status'] })}>
                      <option value="">Todas as situações</option>
                      {statuses.map(status => <option key={status} value={status}>{conversationStatusLabel(status)}</option>)}
                    </select>
                  </label>
                ) : null}
                <label className="col-span-2 space-y-1">
                  <span className="font-medium text-yx-fg-2">Etiqueta</span>
                  <input className={fieldClasses} placeholder="Ex.: cliente-vip" value={filters.tag || ''} onChange={event => update({ tag: event.target.value || undefined })} />
                </label>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-yx-line pt-3">
                <label className="flex min-h-10 cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={Boolean(filters.handoff)} onChange={event => update({ handoff: event.target.checked ? true : null })} className="h-4 w-4 accent-[var(--yx-blue)]" />
                  <span>Transferidas para atendente</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    onFilterChange({ organizationId: filters.organizationId })
                    setActiveTab('all')
                  }}
                  className={portalButtonClasses('ghost', 'shrink-0')}
                >
                  Limpar
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div role="group" aria-label="Atalhos de situação" className="flex flex-wrap gap-1.5">
          {quickTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={activeTab === tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'min-h-10 rounded-full border px-3 text-[12.5px] font-semibold transition-colors sm:min-h-8',
                portalFocusRing,
                activeTab === tab.id
                  ? 'border-yx-blue bg-yx-blue text-white'
                  : 'border-yx-line-strong bg-yx-surface text-yx-fg-2 hover:border-yx-blue hover:text-yx-blue',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="m-0 min-h-0 flex-1 list-none divide-y divide-yx-line overflow-y-auto p-0">
        {filteredList.map(conversation => {
          const selected = selectedId === conversation.id
          const contactName = conversation.contact?.displayName || conversation.subject || 'Contato sem nome'
          const waiting = conversation.status === 'waiting_human' || conversation.tags.includes('handoff')
          const overdue = conversation.status === 'waiting_human'
            && Boolean(conversation.slaDeadlineAt)
            && new Date(conversation.slaDeadlineAt as string).getTime() < Date.now()
          const aiManaged = conversation.status !== 'resolved'
            && (conversation.responseMode === 'automatic' || conversation.responseMode === 'assisted')
          return (
            <li key={conversation.id}>
              <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  'flex w-full items-start gap-3 border-l-[3px] px-3 py-3.5 text-left transition-colors',
                  portalFocusRing,
                  selected ? 'border-l-yx-blue bg-yx-blue-soft' : 'border-l-transparent hover:bg-yx-surface-2',
                )}
              >
                <span
                  aria-hidden="true"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-yx-line-strong bg-yx-surface-2 font-display text-[13px] font-semibold text-yx-fg-2"
                >
                  {initials(contactName)}
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-yx-fg">{contactName}</span>
                    <span className="shrink-0 font-mono text-[11px] text-yx-fg-3">
                      {formatRelativeTime(conversation.lastMessageAt || conversation.createdAt)}
                    </span>
                  </span>
                  <span className="line-clamp-1 block text-[13px] text-yx-fg-2">
                    {conversation.summary || 'Sem mensagens nesta conversa.'}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <StatusChip>{channelLabel(conversation.channel)}</StatusChip>
                    {aiManaged ? <StatusChip variant="yux" icon={Bot}>{responseModeLabel(conversation.responseMode)}</StatusChip> : null}
                    {waiting ? <StatusChip variant="warn">Aguardando atendente</StatusChip> : null}
                    {overdue ? <StatusChip variant="crit">Prazo vencido</StatusChip> : null}
                    {conversation.status === 'resolved' ? <StatusChip variant="ok" icon={CheckCheck}>Resolvida</StatusChip> : null}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {filteredList.length === 0 ? (
          <li className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <MessageSquare aria-hidden="true" className="h-8 w-8 text-yx-fg-3" />
            <p className="text-sm font-semibold text-yx-fg">
              {loading ? 'Carregando conversas...' : conversations.length ? 'Nenhuma conversa com esses filtros' : 'Nenhuma conversa ainda'}
            </p>
            {!loading && !conversations.length ? (
              <p className="max-w-[34ch] text-[13px] text-yx-fg-2">
                Quando um cliente escrever em um canal conectado, a conversa aparece aqui.
              </p>
            ) : null}
          </li>
        ) : null}
      </ul>
    </aside>
  )
}
