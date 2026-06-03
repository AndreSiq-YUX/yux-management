import type {
  PortalSupportTicket,
  SupportSlaState,
  SupportSummary,
  SupportTicket,
  SupportTicketPriority,
} from '@/types/support'

const closedStatuses = new Set(['resolved', 'closed'])
const priorityWeight: Record<SupportTicketPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
}

function activeTickets(tickets: SupportTicket[]) {
  return tickets.filter(ticket => !closedStatuses.has(ticket.status))
}

export function getTicketSlaState(ticket: SupportTicket, now = new Date()): SupportSlaState {
  if (ticket.status === 'resolved') return 'resolved'
  if (ticket.status === 'closed') return 'closed'
  if (!ticket.slaDueAt) return 'unscheduled'

  const dueAt = new Date(ticket.slaDueAt).getTime()
  const current = now.getTime()
  const dueSoonWindowMs = 4 * 60 * 60 * 1000

  if (dueAt < current) return 'overdue'
  if (dueAt - current <= dueSoonWindowMs) return 'due_soon'
  return 'on_track'
}

export function calculateSupportSummary(tickets: SupportTicket[], now = new Date()): SupportSummary {
  const openTickets = activeTickets(tickets)
  const nextSlaDueAt = openTickets
    .filter(ticket => ticket.slaDueAt)
    .map(ticket => ticket.slaDueAt as string)
    .sort()[0]

  return {
    totalOpen: openTickets.length,
    urgentCount: openTickets.filter(ticket => ticket.priority === 'urgent').length,
    overdueCount: openTickets.filter(ticket => getTicketSlaState(ticket, now) === 'overdue').length,
    waitingClientCount: openTickets.filter(ticket => ticket.status === 'waiting_client').length,
    resolvedCount: tickets.filter(ticket => ticket.status === 'resolved' || ticket.status === 'closed').length,
    nextSlaDueAt,
  }
}

export function getNextSupportTicket(tickets: SupportTicket[], now = new Date()) {
  return [...activeTickets(tickets)].sort((left, right) => {
    const leftState = getTicketSlaState(left, now)
    const rightState = getTicketSlaState(right, now)
    const leftSlaWeight = leftState === 'overdue' ? 3 : leftState === 'due_soon' ? 2 : left.slaDueAt ? 1 : 0
    const rightSlaWeight = rightState === 'overdue' ? 3 : rightState === 'due_soon' ? 2 : right.slaDueAt ? 1 : 0

    if (leftSlaWeight !== rightSlaWeight) return rightSlaWeight - leftSlaWeight
    if (left.slaDueAt && right.slaDueAt && left.slaDueAt !== right.slaDueAt) {
      return left.slaDueAt.localeCompare(right.slaDueAt)
    }
    if (priorityWeight[left.priority] !== priorityWeight[right.priority]) {
      return priorityWeight[right.priority] - priorityWeight[left.priority]
    }
    return left.createdAt.localeCompare(right.createdAt)
  })[0]
}

export function sanitizeTicketForPortal(ticket: SupportTicket): PortalSupportTicket {
  const { internalNotes: _internalNotes, messages, ...safeTicket } = ticket
  return {
    ...safeTicket,
    messages: messages
      .filter(message => !message.isInternal)
      .map(({ isInternal: _isInternal, ...message }) => message),
  }
}
