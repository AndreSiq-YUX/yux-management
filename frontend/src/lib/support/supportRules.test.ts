import { describe, expect, it } from 'vitest'
import type { SupportTicket } from '@/types/support'
import {
  calculateSupportSummary,
  getNextSupportTicket,
  getTicketSlaState,
  sanitizeTicketForPortal,
} from './supportRules'

const baseTicket: SupportTicket = {
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
  internalNotes: 'Cliente estrategico',
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
      body: 'Preciso de ajuda.',
      isInternal: false,
      createdAt: '2026-06-03T10:00:00.000Z',
      updatedAt: '2026-06-03T10:00:00.000Z',
    },
    {
      id: 'message-2',
      ticketId: 'ticket-1',
      authorType: 'internal',
      body: 'Nota operacional privada.',
      isInternal: true,
      createdAt: '2026-06-03T11:00:00.000Z',
      updatedAt: '2026-06-03T11:00:00.000Z',
    },
  ],
}

describe('supportRules', () => {
  it('classifies SLA state from ticket status and due date', () => {
    const now = new Date('2026-06-03T15:00:00.000Z')

    expect(getTicketSlaState(baseTicket, now)).toBe('due_soon')
    expect(getTicketSlaState({ ...baseTicket, slaDueAt: '2026-06-03T12:00:00.000Z' }, now)).toBe('overdue')
    expect(getTicketSlaState({ ...baseTicket, slaDueAt: '2026-06-05T12:00:00.000Z' }, now)).toBe('on_track')
    expect(getTicketSlaState({ ...baseTicket, status: 'resolved' }, now)).toBe('resolved')
    expect(getTicketSlaState({ ...baseTicket, status: 'closed' }, now)).toBe('closed')
  })

  it('summarizes active tickets by status, priority, and SLA', () => {
    const summary = calculateSupportSummary([
      baseTicket,
      { ...baseTicket, id: 'ticket-2', priority: 'urgent', status: 'in_progress', slaDueAt: '2026-06-03T12:00:00.000Z' },
      { ...baseTicket, id: 'ticket-3', priority: 'low', status: 'waiting_client', slaDueAt: undefined },
      { ...baseTicket, id: 'ticket-4', priority: 'medium', status: 'resolved', slaDueAt: '2026-06-03T12:00:00.000Z' },
    ], new Date('2026-06-03T15:00:00.000Z'))

    expect(summary.totalOpen).toBe(3)
    expect(summary.urgentCount).toBe(1)
    expect(summary.overdueCount).toBe(1)
    expect(summary.waitingClientCount).toBe(1)
    expect(summary.resolvedCount).toBe(1)
    expect(summary.nextSlaDueAt).toBe('2026-06-03T12:00:00.000Z')
  })

  it('selects the next actionable ticket by SLA and priority', () => {
    const ticket = getNextSupportTicket([
      { ...baseTicket, id: 'low', priority: 'low', slaDueAt: '2026-06-04T12:00:00.000Z' },
      { ...baseTicket, id: 'closed', status: 'closed', priority: 'urgent', slaDueAt: '2026-06-01T12:00:00.000Z' },
      { ...baseTicket, id: 'urgent', priority: 'urgent', slaDueAt: undefined },
      { ...baseTicket, id: 'overdue', priority: 'medium', slaDueAt: '2026-06-03T12:00:00.000Z' },
    ], new Date('2026-06-03T15:00:00.000Z'))

    expect(ticket?.id).toBe('overdue')
  })

  it('removes internal notes and messages from portal ticket payloads', () => {
    const portalTicket = sanitizeTicketForPortal(baseTicket)

    expect('internalNotes' in portalTicket).toBe(false)
    expect(portalTicket.messages).toHaveLength(1)
    expect(portalTicket.messages[0].body).toBe('Preciso de ajuda.')
    expect(JSON.stringify(portalTicket)).not.toContain('Nota operacional privada')
  })
})
