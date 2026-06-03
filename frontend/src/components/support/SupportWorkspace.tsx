import { useMemo, useState } from 'react'
import { CheckCircle2, Clock3, MessageSquarePlus, Plus, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getTicketSlaState } from '@/lib/support/supportRules'
import type {
  SupportMessageAuthorType,
  SupportSummary,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@/types/support'

interface SupportWorkspaceProps {
  tickets: SupportTicket[]
  summary: SupportSummary
  clients: Array<{ id: string; name: string }>
  contracts: Array<{ id: string; clientId: string; name: string }>
  projects: Array<{ id: string; clientId: string; name: string }>
  defaultOrganizationId?: string
  onCreateTicket: (input: {
    organizationId: string
    clientId: string
    contractId: string
    projectId?: string
    subject: string
    category: SupportTicketCategory
    priority: SupportTicketPriority
    slaDueAt?: string
    internalNotes?: string
  }) => void | Promise<void>
  onAddMessage: (input: {
    ticketId: string
    authorType: SupportMessageAuthorType
    body: string
    isInternal: boolean
  }) => void | Promise<void>
  onUpdateTicket: (ticketId: string, input: {
    status?: SupportTicketStatus
    priority?: SupportTicketPriority
    internalNotes?: string
  }) => void | Promise<void>
  onRefresh: () => void | Promise<void>
}

const statusLabels: Record<SupportTicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em atendimento',
  waiting_client: 'Aguardando cliente',
  resolved: 'Resolvido',
  closed: 'Fechado',
}

const priorityLabels: Record<SupportTicketPriority, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

function addHours(hours: number) {
  const date = new Date()
  date.setHours(date.getHours() + hours)
  return date.toISOString()
}

export function SupportWorkspace({
  tickets,
  summary,
  clients,
  contracts,
  projects,
  defaultOrganizationId,
  onCreateTicket,
  onAddMessage,
  onUpdateTicket,
  onRefresh,
}: SupportWorkspaceProps) {
  const [selectedTicketId, setSelectedTicketId] = useState(tickets[0]?.id)
  const [subject, setSubject] = useState('Novo chamado de suporte')
  const [internalNotes, setInternalNotes] = useState('')
  const [reply, setReply] = useState('Estamos analisando sua solicitacao.')

  const selectedTicket = useMemo(
    () => tickets.find(ticket => ticket.id === selectedTicketId) || tickets[0],
    [tickets, selectedTicketId],
  )
  const firstContract = contracts[0]
  const firstClient = clients.find(client => client.id === firstContract?.clientId) || clients[0]
  const firstProject = projects.find(project => project.clientId === firstClient?.id)

  function createTicket() {
    if (!firstClient || !firstContract) return
    onCreateTicket({
      organizationId: defaultOrganizationId || selectedTicket?.organizationId || 'org-1',
      clientId: firstClient.id,
      contractId: firstContract.id,
      projectId: firstProject?.id,
      subject,
      category: 'technical',
      priority: 'medium',
      slaDueAt: addHours(24),
      internalNotes,
    })
  }

  function addReply() {
    if (!selectedTicket) return
    onAddMessage({
      ticketId: selectedTicket.id,
      authorType: 'internal',
      body: reply,
      isInternal: false,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suporte</h1>
          <p className="text-gray-600">Acompanhe chamados por contrato, prioridade e SLA.</p>
        </div>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Metric label="Abertos" value={String(summary.totalOpen)} />
        <Metric label="Urgentes" value={String(summary.urgentCount)} />
        <Metric label="Vencidos" value={String(summary.overdueCount)} />
        <Metric label="Aguardando cliente" value={String(summary.waitingClientCount)} />
        <Metric label="Resolvidos" value={String(summary.resolvedCount)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Novo chamado</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Input value={subject} onChange={event => setSubject(event.target.value)} aria-label="Assunto do chamado" />
              <Input value={firstClient?.name || 'Cliente'} aria-label="Cliente do chamado" readOnly />
              <Textarea value={internalNotes} onChange={event => setInternalNotes(event.target.value)} placeholder="Nota interna opcional" />
              <Button title="Criar chamado" onClick={createTicket}>
                <Plus className="mr-2 h-4 w-4" />
                Criar chamado
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Fila de chamados</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {tickets.length === 0 && <p className="text-sm text-gray-500">Nenhum chamado cadastrado.</p>}
              {tickets.map(ticket => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`w-full rounded-md border p-3 text-left ${selectedTicket?.id === ticket.id ? 'border-yux-400 bg-yux-50' : 'bg-white hover:bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-gray-900">{ticket.subject}</span>
                    <Badge variant="outline">{statusLabels[ticket.status]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{ticket.clientName || ticket.clientId} - {priorityLabels[ticket.priority]}</p>
                  <p className="text-xs text-gray-500">SLA {getTicketSlaState(ticket)}</p>
                </button>
              ))}
            </CardContent>
          </Card>
        </section>

        <aside>
          {selectedTicket ? (
            <Card>
              <CardHeader><CardTitle className="text-base">{selectedTicket.subject}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <p className="font-medium">{selectedTicket.clientName || selectedTicket.clientId}</p>
                  <p className="text-sm text-gray-500">{selectedTicket.contractName || selectedTicket.contractId}</p>
                  {selectedTicket.projectName && <p className="text-sm text-gray-500">{selectedTicket.projectName}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Info label="Status" value={statusLabels[selectedTicket.status]} />
                  <Info label="Prioridade" value={priorityLabels[selectedTicket.priority]} />
                  <Info label="Categoria" value={selectedTicket.category} />
                  <Info label="SLA" value={getTicketSlaState(selectedTicket)} />
                </div>
                {selectedTicket.internalNotes && <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">{selectedTicket.internalNotes}</p>}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Mensagens</h3>
                  {selectedTicket.messages.map(message => (
                    <div key={message.id} className={`rounded-md border p-2 text-sm ${message.isInternal ? 'bg-amber-50' : 'bg-white'}`}>
                      <p className="text-xs uppercase text-gray-500">{message.authorName || message.authorType}</p>
                      <p>{message.body}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2">
                  <Textarea value={reply} onChange={event => setReply(event.target.value)} aria-label="Resposta do chamado" />
                  <Button title="Responder chamado" variant="outline" onClick={addReply}>
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                    Responder
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button title="Colocar em atendimento" variant="outline" onClick={() => onUpdateTicket(selectedTicket.id, { status: 'in_progress' })}>
                    <Clock3 className="mr-2 h-4 w-4" />
                    Atender
                  </Button>
                  <Button title="Resolver chamado" onClick={() => onUpdateTicket(selectedTicket.id, { status: 'resolved' })}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Resolver
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="p-4 text-sm text-gray-500">Selecione um chamado.</CardContent></Card>
          )}
        </aside>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-gray-500">{label}</p>
        <p className="mt-1 font-semibold text-gray-900">{value}</p>
      </CardContent>
    </Card>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
