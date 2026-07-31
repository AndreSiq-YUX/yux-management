import { useMemo, useState } from 'react'
import { MessageSquarePlus, Plus, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { sanitizeTicketForPortal } from '@/lib/support/supportRules'
import type { ContractDetails } from '@/types/platform'
import type { PortalSupportTicket, SupportMessageAuthorType, SupportTicket } from '@/types/support'

interface PortalSupportWorkspaceProps {
  contract: ContractDetails
  tickets: Array<SupportTicket | PortalSupportTicket>
  onCreateTicket: (input: {
    contractId: string
    clientId: string
    subject: string
    category: 'technical'
    priority: 'medium'
    body: string
  }) => void | Promise<void>
  onAddMessage: (input: {
    ticketId: string
    authorType: SupportMessageAuthorType
    body: string
    isInternal: boolean
  }) => void | Promise<void>
  onRefresh: () => void | Promise<void>
}

export function PortalSupportWorkspace({ contract, tickets, onCreateTicket, onAddMessage, onRefresh }: PortalSupportWorkspaceProps) {
  const safeTickets = useMemo(
    () => tickets.map(ticket => 'internalNotes' in ticket ? sanitizeTicketForPortal(ticket as SupportTicket) : ticket as PortalSupportTicket),
    [tickets],
  )
  const [selectedTicketId, setSelectedTicketId] = useState(safeTickets[0]?.id)
  const [subject, setSubject] = useState('Preciso de suporte')
  const [body, setBody] = useState('Descreva sua solicitacao para a equipe YUX.')
  const [reply, setReply] = useState('Tenho uma nova informacao sobre este chamado.')
  const selectedTicket = safeTickets.find(ticket => ticket.id === selectedTicketId) || safeTickets[0]

  function createTicket() {
    onCreateTicket({
      contractId: contract.id,
      clientId: contract.clientId,
      subject,
      category: 'technical',
      priority: 'medium',
      body,
    })
  }

  function addReply() {
    if (!selectedTicket) return
    onAddMessage({
      ticketId: selectedTicket.id,
      authorType: 'client',
      body: reply,
      isInternal: false,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suporte do contrato</h1>
          <p className="text-gray-600">{contract.name || contract.id}</p>
        </div>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Abrir chamado</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input value={subject} onChange={event => setSubject(event.target.value)} aria-label="Assunto do chamado" />
              <Textarea value={body} onChange={event => setBody(event.target.value)} aria-label="Mensagem inicial" />
              <Button title="Abrir chamado" onClick={createTicket}>
                <Plus className="mr-2 h-4 w-4" />
                Abrir chamado
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Meus chamados</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {safeTickets.length === 0 && <p className="text-sm text-gray-500">Nenhum chamado aberto para este contrato.</p>}
              {safeTickets.map(ticket => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`w-full rounded-md border p-3 text-left ${selectedTicket?.id === ticket.id ? 'border-yux-400 bg-yux-50' : 'bg-white hover:bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-gray-900">{ticket.subject}</span>
                    <Badge variant="outline">{ticket.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{ticket.category} - {ticket.priority}</p>
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
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Info label="Status" value={selectedTicket.status} />
                  <Info label="Prioridade" value={selectedTicket.priority} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Mensagens</h3>
                  {selectedTicket.messages.map(message => (
                    <div key={message.id} className="rounded-md border p-2 text-sm">
                      <p className="text-xs uppercase text-gray-500">{message.authorName || message.authorType}</p>
                      <p>{message.body}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2">
                  <Textarea value={reply} onChange={event => setReply(event.target.value)} aria-label="Resposta do cliente" />
                  <Button title="Enviar resposta" variant="outline" onClick={addReply}>
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                    Enviar resposta
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
