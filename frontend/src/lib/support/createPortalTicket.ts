import { platformService } from '@/services/platformService'
import { supportService } from '@/services/supportService'
import type { SupportTicket, SupportTicketCategory, SupportTicketPriority } from '@/types/support'

export interface CreatePortalTicketInput {
  clientId: string
  contractId: string
  subject: string
  category: SupportTicketCategory
  priority: SupportTicketPriority
  body: string
}

/**
 * Abre um chamado em nome do cliente: cria o chamado na organização operacional da YUX
 * e registra a primeira mensagem. Lança erro se algum passo falhar, para que o formulário
 * possa manter o texto digitado.
 */
export async function createPortalTicket(input: CreatePortalTicketInput): Promise<SupportTicket> {
  const organizations = await platformService.getOrganizations()
  const organizationId = organizations.find(organization => organization.slug === 'yux')?.id || organizations[0]?.id
  if (!organizationId) throw new Error('Não encontramos a equipe de atendimento. Tente novamente em instantes.')

  const ticket = await supportService.createTicket({
    organizationId,
    clientId: input.clientId,
    contractId: input.contractId,
    subject: input.subject,
    category: input.category,
    priority: input.priority,
  })
  await supportService.addMessage({
    ticketId: ticket.id,
    authorType: 'client',
    body: input.body,
    isInternal: false,
  })
  return ticket
}
