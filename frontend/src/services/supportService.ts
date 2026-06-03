import { supabase } from '@/lib/supabase'
import { calculateSupportSummary, sanitizeTicketForPortal } from '@/lib/support/supportRules'
import type {
  PortalSupportTicket,
  SupportMessage,
  SupportMessageAuthorType,
  SupportSummary,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketFilters,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@/types/support'

export function mapSupportMessageRow(row: any): SupportMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorType: row.author_type as SupportMessageAuthorType,
    authorName: row.author_name || undefined,
    body: row.body,
    isInternal: Boolean(row.is_internal),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapSupportTicketRow(row: any): SupportTicket {
  const messages = Array.isArray(row.support_messages)
    ? [...row.support_messages].sort((left, right) => String(left.created_at).localeCompare(String(right.created_at))).map(mapSupportMessageRow)
    : []

  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    projectId: row.project_id || undefined,
    subject: row.subject,
    category: row.category as SupportTicketCategory,
    priority: row.priority as SupportTicketPriority,
    status: row.status as SupportTicketStatus,
    slaDueAt: row.sla_due_at || undefined,
    lastMessageAt: row.last_message_at || undefined,
    resolvedAt: row.resolved_at || undefined,
    closedAt: row.closed_at || undefined,
    internalNotes: row.internal_notes || undefined,
    clientName: row.clients?.company_name,
    contractName: row.contracts?.name,
    projectName: row.projects?.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
  }
}

export function buildSupportTicketFilters(filters: SupportTicketFilters): SupportTicketFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ) as SupportTicketFilters
}

export function buildCreateTicketPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  projectId?: string
  subject: string
  category: SupportTicketCategory
  priority: SupportTicketPriority
  slaDueAt?: string
  internalNotes?: string
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    project_id: input.projectId || null,
    subject: input.subject,
    category: input.category,
    priority: input.priority,
    sla_due_at: input.slaDueAt || null,
    internal_notes: input.internalNotes || null,
  }
}

export function buildCreateMessagePayload(input: {
  ticketId: string
  authorType: SupportMessageAuthorType
  authorName?: string
  body: string
  isInternal?: boolean
}) {
  return {
    ticket_id: input.ticketId,
    author_type: input.authorType,
    author_name: input.authorName || null,
    body: input.body,
    is_internal: Boolean(input.isInternal),
  }
}

export function buildUpdateTicketPayload(input: {
  status?: SupportTicketStatus
  priority?: SupportTicketPriority
  category?: SupportTicketCategory
  slaDueAt?: string | null
  internalNotes?: string
}) {
  const payload: Record<string, unknown> = {}

  if (input.status) {
    payload.status = input.status
    payload.resolved_at = input.status === 'resolved' ? new Date().toISOString() : null
    payload.closed_at = input.status === 'closed' ? new Date().toISOString() : null
  }
  if (input.priority) payload.priority = input.priority
  if (input.category) payload.category = input.category
  if (input.slaDueAt !== undefined) payload.sla_due_at = input.slaDueAt
  if (input.internalNotes !== undefined) payload.internal_notes = input.internalNotes || null

  return payload
}

const ticketSelect = '*, support_messages(*), clients(company_name), contracts(name), projects(name)'

export class SupportService {
  async getTickets(filters: SupportTicketFilters = {}): Promise<SupportTicket[]> {
    const activeFilters = buildSupportTicketFilters(filters)
    let query = supabase
      .from('support_tickets')
      .select(ticketSelect)
      .order('updated_at', { ascending: false })

    if (activeFilters.organizationId) query = query.eq('organization_id', activeFilters.organizationId)
    if (activeFilters.clientId) query = query.eq('client_id', activeFilters.clientId)
    if (activeFilters.contractId) query = query.eq('contract_id', activeFilters.contractId)
    if (activeFilters.projectId) query = query.eq('project_id', activeFilters.projectId)
    if (activeFilters.status) query = query.eq('status', activeFilters.status)
    if (activeFilters.priority) query = query.eq('priority', activeFilters.priority)
    if (activeFilters.category) query = query.eq('category', activeFilters.category)

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapSupportTicketRow)
  }

  async getPortalTickets(contractId: string): Promise<PortalSupportTicket[]> {
    const tickets = await this.getTickets({ contractId })
    return tickets.map(sanitizeTicketForPortal)
  }

  async getSummary(filters: SupportTicketFilters = {}): Promise<SupportSummary> {
    return calculateSupportSummary(await this.getTickets(filters))
  }

  async createTicket(input: Parameters<typeof buildCreateTicketPayload>[0]): Promise<SupportTicket> {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert(buildCreateTicketPayload(input))
      .select(ticketSelect)
      .single()

    if (error) throw error
    return mapSupportTicketRow(data)
  }

  async addMessage(input: Parameters<typeof buildCreateMessagePayload>[0]): Promise<SupportMessage> {
    const { data, error } = await supabase
      .from('support_messages')
      .insert(buildCreateMessagePayload(input))
      .select()
      .single()

    if (error) throw error
    return mapSupportMessageRow(data)
  }

  async updateTicket(ticketId: string, input: Parameters<typeof buildUpdateTicketPayload>[0]): Promise<SupportTicket> {
    const { data, error } = await supabase
      .from('support_tickets')
      .update(buildUpdateTicketPayload(input))
      .eq('id', ticketId)
      .select(ticketSelect)
      .single()

    if (error) throw error
    return mapSupportTicketRow(data)
  }
}

export const supportService = new SupportService()
