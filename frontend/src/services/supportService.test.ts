import { describe, expect, it, vi } from 'vitest'
import {
  buildCreateMessagePayload,
  buildCreateTicketPayload,
  buildSupportTicketFilters,
  buildUpdateTicketPayload,
  mapSupportMessageRow,
  mapSupportTicketRow,
} from './supportService'

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}))

describe('supportService mapping', () => {
  it('maps ticket rows, nested messages, and joined names', () => {
    const ticket = mapSupportTicketRow({
      id: 'ticket-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      project_id: 'project-1',
      subject: 'Acesso ao portal',
      category: 'access',
      priority: 'high',
      status: 'open',
      sla_due_at: '2026-06-04T12:00:00.000Z',
      last_message_at: '2026-06-03T12:00:00.000Z',
      resolved_at: null,
      closed_at: null,
      internal_notes: 'Validar permissao',
      created_at: '2026-06-03T10:00:00.000Z',
      updated_at: '2026-06-03T12:00:00.000Z',
      clients: { company_name: 'Cliente YUX' },
      contracts: { name: 'Contrato principal' },
      projects: { name: 'Portal' },
      support_messages: [{
        id: 'message-1',
        ticket_id: 'ticket-1',
        author_type: 'client',
        author_name: 'Ana',
        body: 'Nao consigo entrar.',
        is_internal: false,
        created_at: '2026-06-03T10:00:00.000Z',
        updated_at: '2026-06-03T10:00:00.000Z',
      }],
    })

    expect(ticket.subject).toBe('Acesso ao portal')
    expect(ticket.clientName).toBe('Cliente YUX')
    expect(ticket.projectName).toBe('Portal')
    expect(ticket.messages[0].authorName).toBe('Ana')
  })

  it('maps support message rows independently', () => {
    expect(mapSupportMessageRow({
      id: 'message-1',
      ticket_id: 'ticket-1',
      author_type: 'internal',
      author_name: null,
      body: 'Estamos analisando.',
      is_internal: true,
      created_at: '2026-06-03T11:00:00.000Z',
      updated_at: '2026-06-03T11:00:00.000Z',
    })).toMatchObject({
      ticketId: 'ticket-1',
      authorType: 'internal',
      body: 'Estamos analisando.',
      isInternal: true,
    })
  })

  it('builds filters without empty values', () => {
    expect(buildSupportTicketFilters({
      organizationId: 'org-1',
      clientId: '',
      contractId: 'contract-1',
      projectId: undefined,
      status: 'open',
    })).toEqual({
      organizationId: 'org-1',
      contractId: 'contract-1',
      status: 'open',
    })
  })

  it('builds Supabase payloads for ticket creation, messages, and updates', () => {
    expect(buildCreateTicketPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      subject: 'Novo chamado',
      category: 'technical',
      priority: 'urgent',
      slaDueAt: '2026-06-04T12:00:00.000Z',
      internalNotes: '',
    })).toEqual({
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      project_id: null,
      subject: 'Novo chamado',
      category: 'technical',
      priority: 'urgent',
      sla_due_at: '2026-06-04T12:00:00.000Z',
      internal_notes: null,
    })

    expect(buildCreateMessagePayload({
      ticketId: 'ticket-1',
      authorType: 'client',
      authorName: 'Ana',
      body: 'Mensagem inicial',
      isInternal: false,
    })).toEqual({
      ticket_id: 'ticket-1',
      author_type: 'client',
      author_name: 'Ana',
      body: 'Mensagem inicial',
      is_internal: false,
    })

    expect(buildUpdateTicketPayload({
      status: 'resolved',
      priority: 'medium',
      internalNotes: 'Resolvido pelo time.',
    })).toEqual({
      status: 'resolved',
      priority: 'medium',
      internal_notes: 'Resolvido pelo time.',
      resolved_at: expect.any(String),
      closed_at: null,
    })
  })
})
