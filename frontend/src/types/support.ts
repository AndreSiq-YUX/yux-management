export type SupportTicketStatus = 'open' | 'in_progress' | 'waiting_client' | 'resolved' | 'closed'
export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'urgent'
export type SupportTicketCategory = 'technical' | 'billing' | 'content' | 'access' | 'request' | 'other'
export type SupportMessageAuthorType = 'client' | 'internal' | 'system'
export type SupportSlaState = 'on_track' | 'due_soon' | 'overdue' | 'resolved' | 'closed' | 'unscheduled'

export interface SupportMessage {
  id: string
  ticketId: string
  authorType: SupportMessageAuthorType
  authorName?: string
  body: string
  isInternal: boolean
  createdAt: string
  updatedAt: string
}

export interface SupportTicket {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  projectId?: string
  subject: string
  category: SupportTicketCategory
  priority: SupportTicketPriority
  status: SupportTicketStatus
  slaDueAt?: string
  lastMessageAt?: string
  resolvedAt?: string
  closedAt?: string
  internalNotes?: string
  clientName?: string
  contractName?: string
  projectName?: string
  createdAt: string
  updatedAt: string
  messages: SupportMessage[]
}

export interface SupportSummary {
  totalOpen: number
  urgentCount: number
  overdueCount: number
  waitingClientCount: number
  resolvedCount: number
  nextSlaDueAt?: string
}

export interface SupportTicketFilters {
  organizationId?: string
  clientId?: string
  contractId?: string
  projectId?: string
  status?: SupportTicketStatus
  priority?: SupportTicketPriority
  category?: SupportTicketCategory
}

export type PortalSupportMessage = Omit<SupportMessage, 'isInternal'>
export type PortalSupportTicket = Omit<SupportTicket, 'internalNotes' | 'messages'> & {
  messages: PortalSupportMessage[]
}
