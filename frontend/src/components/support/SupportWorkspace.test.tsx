import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { SupportWorkspace } from './SupportWorkspace'
import type { SupportSummary, SupportTicket } from '@/types/support'

const summary: SupportSummary = {
  totalOpen: 3,
  urgentCount: 1,
  overdueCount: 1,
  waitingClientCount: 1,
  resolvedCount: 2,
  nextSlaDueAt: '2026-06-03T18:00:00.000Z',
}

const ticket: SupportTicket = {
  id: 'ticket-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  projectId: 'project-1',
  subject: 'Ajuste no dashboard',
  category: 'technical',
  priority: 'high',
  status: 'open',
  slaDueAt: '2026-06-03T18:00:00.000Z',
  lastMessageAt: '2026-06-03T12:00:00.000Z',
  internalNotes: 'Conta estrategica',
  clientName: 'Cliente YUX',
  contractName: 'Contrato principal',
  projectName: 'Portal',
  createdAt: '2026-06-03T10:00:00.000Z',
  updatedAt: '2026-06-03T12:00:00.000Z',
  messages: [
    {
      id: 'message-1',
      ticketId: 'ticket-1',
      authorType: 'client',
      authorName: 'Ana',
      body: 'Nao consigo ver o relatorio.',
      isInternal: false,
      createdAt: '2026-06-03T10:00:00.000Z',
      updatedAt: '2026-06-03T10:00:00.000Z',
    },
    {
      id: 'message-2',
      ticketId: 'ticket-1',
      authorType: 'internal',
      body: 'Investigar permissao interna.',
      isInternal: true,
      createdAt: '2026-06-03T11:00:00.000Z',
      updatedAt: '2026-06-03T11:00:00.000Z',
    },
  ],
}

describe('SupportWorkspace', () => {
  it('renders internal queue, ticket details, and operational controls', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const handlers = {
      onCreateTicket: vi.fn(),
      onAddMessage: vi.fn(),
      onUpdateTicket: vi.fn(),
      onRefresh: vi.fn(),
    }

    act(() => {
      root.render(
        <SupportWorkspace
          tickets={[ticket]}
          summary={summary}
          clients={[{ id: 'client-1', name: 'Cliente YUX' }]}
          contracts={[{ id: 'contract-1', clientId: 'client-1', name: 'Contrato principal' }]}
          projects={[{ id: 'project-1', clientId: 'client-1', name: 'Portal' }]}
          defaultOrganizationId="org-1"
          {...handlers}
        />,
      )
    })

    const html = container.innerHTML
    expect(html).toContain('Suporte')
    expect(html).toContain('Ajuste no dashboard')
    expect(html).toContain('Cliente YUX')
    expect(html).toContain('Conta estrategica')
    expect(html).toContain('Investigar permissao interna')
    expect(html).toContain('3')

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Criar chamado"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Responder chamado"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Colocar em atendimento"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Resolver chamado"]')!.click()
    })

    expect(handlers.onCreateTicket).toHaveBeenCalled()
    expect(handlers.onAddMessage).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      authorType: 'internal',
      body: expect.any(String),
      isInternal: false,
    })
    expect(handlers.onUpdateTicket).toHaveBeenCalledWith('ticket-1', { status: 'in_progress' })
    expect(handlers.onUpdateTicket).toHaveBeenCalledWith('ticket-1', { status: 'resolved' })

    act(() => root.unmount())
  })
})
