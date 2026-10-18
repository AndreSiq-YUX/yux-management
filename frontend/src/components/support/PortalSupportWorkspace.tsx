import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Loader2, LifeBuoy, MessageSquare, Plus, RefreshCw, Send } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  EmptyState,
  MasterDetail,
  PageHeader,
  SectionCard,
  StatusChip,
  portalButtonClasses,
  type StatusChipVariant,
} from '@/components/portal-ui'
import {
  formatPortalDateTime,
  formatRelativeTime,
  statusLabel,
  ticketCategoryLabel,
  ticketPriorityLabel,
} from '@/lib/client-portal/portalDisplay'
import { sanitizeTicketForPortal } from '@/lib/support/supportRules'
import { cn } from '@/lib/utils'
import type {
  PortalSupportMessage,
  PortalSupportTicket,
  SupportMessageAuthorType,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@/types/support'
import type { ContractDetails } from '@/types/platform'

export interface PortalCreateTicketInput {
  contractId: string
  clientId: string
  subject: string
  category: SupportTicketCategory
  priority: SupportTicketPriority
  body: string
}

interface PortalSupportWorkspaceProps {
  contract: ContractDetails
  tickets: Array<SupportTicket | PortalSupportTicket>
  /** Deve lançar erro se o chamado não puder ser aberto (o formulário mantém o texto). */
  onCreateTicket: (input: PortalCreateTicketInput) => void | Promise<void>
  /** Deve lançar erro se a resposta não puder ser enviada (a caixa de resposta mantém o texto). */
  onAddMessage: (input: {
    ticketId: string
    authorType: SupportMessageAuthorType
    body: string
    isInternal: boolean
  }) => void | Promise<void>
  onRefresh: () => void | Promise<void>
  /** Nome do usuário logado: mensagens dele aparecem como "Você". */
  currentUserName?: string
}

const CATEGORIES: SupportTicketCategory[] = ['technical', 'billing', 'content', 'access', 'request', 'other']
const PRIORITIES: SupportTicketPriority[] = ['low', 'medium', 'high', 'urgent']

const MIN_SUBJECT_LENGTH = 5
const MIN_MESSAGE_LENGTH = 10

const statusVariant: Record<SupportTicketStatus, StatusChipVariant> = {
  open: 'neutral',
  in_progress: 'neutral',
  waiting_client: 'warn',
  resolved: 'ok',
  closed: 'ok',
}

const fieldClasses =
  'h-10 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-3 text-[13.5px] text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue disabled:cursor-not-allowed disabled:opacity-60'

interface FormErrors {
  subject?: string
  category?: string
  body?: string
}

function validateTicketForm(values: { subject: string; category: string; body: string }): FormErrors {
  const errors: FormErrors = {}
  if (values.subject.trim().length < MIN_SUBJECT_LENGTH) errors.subject = `O assunto precisa ter pelo menos ${MIN_SUBJECT_LENGTH} caracteres.`
  if (!values.category) errors.category = 'Escolha uma categoria.'
  if (values.body.trim().length < MIN_MESSAGE_LENGTH) errors.body = `Descreva com pelo menos ${MIN_MESSAGE_LENGTH} caracteres para a equipe entender o que você precisa.`
  return errors
}

export function PortalSupportWorkspace({ contract, tickets, onCreateTicket, onAddMessage, onRefresh, currentUserName }: PortalSupportWorkspaceProps) {
  const safeTickets = useMemo(
    () => tickets.map(ticket => ('internalNotes' in ticket ? sanitizeTicketForPortal(ticket as SupportTicket) : (ticket as PortalSupportTicket))),
    [tickets],
  )
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const selectedTicket = safeTickets.find(ticket => ticket.id === selectedTicketId) ?? null
  const formRef = useRef<HTMLDivElement>(null)

  async function refresh() {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  function openForm() {
    setFormOpen(true)
    setSelectedTicketId(null)
    window.requestAnimationFrame?.(() => formRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }))
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Ajuda e suporte"
        lead="Abra um chamado ou acompanhe a conversa com a equipe YUX."
        meta={contract.name ? <StatusChip>{contract.name}</StatusChip> : undefined}
        actions={
          <>
            <button type="button" onClick={() => void refresh()} disabled={refreshing} className={portalButtonClasses('ghost')}>
              <RefreshCw aria-hidden="true" className={cn(refreshing && 'animate-spin motion-reduce:animate-none')} />
              Atualizar
            </button>
            <button type="button" onClick={openForm} aria-expanded={formOpen} className={portalButtonClasses('primary')}>
              <Plus aria-hidden="true" />
              Abrir chamado
            </button>
          </>
        }
      />

      {formOpen ? (
        <div ref={formRef}>
          <NewTicketForm
            contract={contract}
            onCreateTicket={onCreateTicket}
            onClose={() => setFormOpen(false)}
          />
        </div>
      ) : null}

      <MasterDetail
        listWidth={360}
        onBack={() => setSelectedTicketId(null)}
        backLabel="Voltar"
        list={
          <SectionCard id="meus-chamados" title="Meus chamados" description="Toque em um chamado para ver a conversa.">
            {safeTickets.length === 0 ? (
              <EmptyState
                icon={LifeBuoy}
                title="Nenhum chamado ainda"
                description="Precisa de ajuda? Abra um chamado e a equipe YUX responde por aqui."
                action={{ label: 'Abrir chamado', onClick: openForm }}
              />
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {safeTickets.map(ticket => (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      aria-current={selectedTicket?.id === ticket.id ? 'true' : undefined}
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className={cn(
                        'grid w-full gap-1.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue',
                        selectedTicket?.id === ticket.id ? 'border-yx-blue bg-yx-blue-soft' : 'border-yx-line bg-yx-surface hover:border-yx-blue',
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-[13.5px] font-semibold text-yx-fg">{ticket.subject}</span>
                        <StatusChip variant={statusVariant[ticket.status] ?? 'neutral'}>{statusLabel(ticket.status)}</StatusChip>
                      </span>
                      <span className="text-xs text-yx-fg-3">
                        {ticketCategoryLabel(ticket.category)} · Prioridade {ticketPriorityLabel(ticket.priority).toLowerCase()}
                        {ticket.lastMessageAt ? ` · ${formatRelativeTime(ticket.lastMessageAt)}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        }
        detail={selectedTicket ? <TicketThread key={selectedTicket.id} ticket={selectedTicket} onAddMessage={onAddMessage} currentUserName={currentUserName} /> : null}
        emptyDetail={
          <EmptyState
            icon={MessageSquare}
            title="Selecione um chamado"
            description="Escolha um chamado da lista para ver a conversa e responder."
          />
        }
      />
    </div>
  )
}

function NewTicketForm({
  contract,
  onCreateTicket,
  onClose,
}: {
  contract: ContractDetails
  onCreateTicket: PortalSupportWorkspaceProps['onCreateTicket']
  onClose: () => void
}) {
  const ids = { subject: useId(), category: useId(), priority: useId(), body: useId() }
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<SupportTicketCategory | ''>('')
  const [priority, setPriority] = useState<SupportTicketPriority>('medium')
  const [body, setBody] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [sending, setSending] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (sending) return
    const found = validateTicketForm({ subject, category, body })
    setErrors(found)
    if (Object.keys(found).length > 0 || !category) return

    setSending(true)
    setSubmitError(null)
    try {
      await onCreateTicket({
        contractId: contract.id,
        clientId: contract.clientId,
        subject: subject.trim(),
        category,
        priority,
        body: body.trim(),
      })
      setSubject('')
      setCategory('')
      setPriority('medium')
      setBody('')
      setErrors({})
      onClose()
    } catch {
      setSubmitError('Não foi possível abrir o chamado. O que você escreveu foi mantido: tente de novo.')
    } finally {
      setSending(false)
    }
  }

  return (
    <SectionCard id="novo-chamado" title="Novo chamado" description="Conte o que você precisa. A equipe YUX responde por aqui.">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <div className="grid gap-1.5">
          <label htmlFor={ids.subject} className="text-[13px] font-semibold text-yx-fg">Assunto</label>
          <Input
            id={ids.subject}
            value={subject}
            onChange={event => setSubject(event.target.value)}
            placeholder="Ex.: Não consigo ver o relatório do mês"
            aria-invalid={Boolean(errors.subject)}
            aria-describedby={errors.subject ? `${ids.subject}-error` : undefined}
            disabled={sending}
            maxLength={140}
          />
          {errors.subject ? <FieldError id={`${ids.subject}-error`}>{errors.subject}</FieldError> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor={ids.category} className="text-[13px] font-semibold text-yx-fg">Categoria</label>
            <select
              id={ids.category}
              value={category}
              onChange={event => setCategory(event.target.value as SupportTicketCategory | '')}
              aria-invalid={Boolean(errors.category)}
              aria-describedby={errors.category ? `${ids.category}-error` : undefined}
              disabled={sending}
              className={fieldClasses}
            >
              <option value="">Escolha uma categoria</option>
              {CATEGORIES.map(item => (
                <option key={item} value={item}>{ticketCategoryLabel(item)}</option>
              ))}
            </select>
            {errors.category ? <FieldError id={`${ids.category}-error`}>{errors.category}</FieldError> : null}
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.priority} className="text-[13px] font-semibold text-yx-fg">Prioridade</label>
            <select
              id={ids.priority}
              value={priority}
              onChange={event => setPriority(event.target.value as SupportTicketPriority)}
              disabled={sending}
              className={fieldClasses}
            >
              {PRIORITIES.map(item => (
                <option key={item} value={item}>{ticketPriorityLabel(item)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor={ids.body} className="text-[13px] font-semibold text-yx-fg">Mensagem</label>
          <Textarea
            id={ids.body}
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="Conte o que aconteceu ou o que você precisa. Quanto mais detalhes, mais rápido conseguimos ajudar."
            rows={5}
            aria-invalid={Boolean(errors.body)}
            aria-describedby={errors.body ? `${ids.body}-error` : undefined}
            disabled={sending}
          />
          {errors.body ? <FieldError id={`${ids.body}-error`}>{errors.body}</FieldError> : null}
        </div>

        {submitError ? (
          <p role="alert" className="m-0 rounded-lg border border-yx-crit-line bg-yx-crit-soft px-3 py-2 text-[13px] text-yx-crit">
            {submitError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={sending} className={portalButtonClasses('ghost')}>
            Cancelar
          </button>
          <button type="submit" disabled={sending} aria-busy={sending} className={portalButtonClasses('primary')}>
            {sending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Send aria-hidden="true" />}
            {sending ? 'Enviando…' : 'Enviar chamado'}
          </button>
        </div>
      </form>
    </SectionCard>
  )
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} role="alert" className="m-0 text-xs text-yx-crit">
      {children}
    </p>
  )
}

function authorOf(message: PortalSupportMessage, currentUserName?: string): { name: string; mine: boolean } {
  if (message.authorType === 'client') {
    const sameUser = !message.authorName || (currentUserName && message.authorName.trim().toLowerCase() === currentUserName.trim().toLowerCase())
    return { name: sameUser ? 'Você' : (message.authorName as string), mine: Boolean(sameUser) }
  }
  if (message.authorType === 'system') return { name: 'Sistema', mine: false }
  return { name: message.authorName || 'Equipe YUX', mine: false }
}

function TicketThread({
  ticket,
  onAddMessage,
  currentUserName,
}: {
  ticket: PortalSupportTicket
  onAddMessage: PortalSupportWorkspaceProps['onAddMessage']
  currentUserName?: string
}) {
  const replyId = useId()
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closed = ticket.status === 'closed'
  const awaitingTeam = ticket.status !== 'resolved' && ticket.status !== 'closed'

  async function send(event: FormEvent) {
    event.preventDefault()
    if (sending || !reply.trim()) return
    setSending(true)
    setError(null)
    try {
      await onAddMessage({ ticketId: ticket.id, authorType: 'client', body: reply.trim(), isInternal: false })
      setReply('')
    } catch {
      setError('Não foi possível enviar a resposta. Seu texto foi mantido: tente de novo.')
    } finally {
      setSending(false)
    }
  }

  return (
    <SectionCard
      id="conversa-chamado"
      title={ticket.subject}
      description={`${ticketCategoryLabel(ticket.category)} · Prioridade ${ticketPriorityLabel(ticket.priority).toLowerCase()}`}
      action={<StatusChip variant={statusVariant[ticket.status] ?? 'neutral'}>{statusLabel(ticket.status)}</StatusChip>}
    >
      <div className="grid gap-4">
        {ticket.slaDueAt && awaitingTeam ? (
          <p className="m-0 rounded-lg bg-yx-surface-2 px-3 py-2 text-[13px] text-yx-fg-2">
            Prazo de resposta previsto: <strong className="font-semibold text-yx-fg">{formatPortalDateTime(ticket.slaDueAt)}</strong>
          </p>
        ) : null}

        <ol aria-label="Mensagens do chamado" className="m-0 grid list-none gap-3 p-0">
          {ticket.messages.length === 0 ? (
            <li className="text-[13px] text-yx-fg-3">Este chamado ainda não tem mensagens.</li>
          ) : (
            ticket.messages.map(message => {
              const author = authorOf(message, currentUserName)
              return (
                <li key={message.id} className={cn('flex', author.mine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[88%] rounded-[12px] border px-3.5 py-2.5 sm:max-w-[78%]',
                      author.mine ? 'border-transparent bg-yx-blue-soft' : 'border-yx-line bg-yx-surface-2',
                    )}
                  >
                    <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-xs">
                      <span className="font-semibold text-yx-fg">{author.name}</span>
                      <time dateTime={message.createdAt} title={formatRelativeTime(message.createdAt)} className="font-mono text-[11px] text-yx-fg-3">
                        {formatPortalDateTime(message.createdAt)}
                      </time>
                    </p>
                    <p className="mb-0 mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-normal text-yx-fg">{message.body}</p>
                  </div>
                </li>
              )
            })
          )}
        </ol>

        {closed ? (
          <p className="m-0 rounded-lg border border-yx-line px-3 py-2.5 text-[13px] text-yx-fg-2">
            Este chamado foi encerrado. Se precisar de mais ajuda, abra um novo chamado.
          </p>
        ) : (
          <form onSubmit={send} className="grid gap-2">
            <label htmlFor={replyId} className="text-[13px] font-semibold text-yx-fg">Sua resposta</label>
            <Textarea
              id={replyId}
              value={reply}
              onChange={event => setReply(event.target.value)}
              placeholder="Escreva sua resposta para a equipe…"
              rows={3}
              disabled={sending}
            />
            {error ? (
              <p role="alert" className="m-0 rounded-lg border border-yx-crit-line bg-yx-crit-soft px-3 py-2 text-[13px] text-yx-crit">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end">
              <button type="submit" disabled={sending || !reply.trim()} aria-busy={sending} className={portalButtonClasses('primary')}>
                {sending ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Send aria-hidden="true" />}
                {sending ? 'Enviando…' : 'Enviar resposta'}
              </button>
            </div>
          </form>
        )}
      </div>
    </SectionCard>
  )
}
