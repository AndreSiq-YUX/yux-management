import type { CrmLeadAttentionState, CrmLeadStatus, CrmPipelineSummary } from '@/types/crm'

type StageLike = {
  orderIndex: number
}

type LeadLike = {
  stageId?: string
  stageKey?: string
  status?: CrmLeadStatus | string
  value?: number
  wonAt?: string
  lostAt?: string
  lastActivityAt?: string
  nextFollowUpAt?: string
}

const STALE_AFTER_MS = 48 * 60 * 60 * 1000

const isSameDay = (left: Date, right: Date) => (
  left.getUTCFullYear() === right.getUTCFullYear()
  && left.getUTCMonth() === right.getUTCMonth()
  && left.getUTCDate() === right.getUTCDate()
)

const normalizeStatus = (status?: string): CrmLeadStatus => {
  if (status === 'won' || status === 'WON') return 'won'
  if (status === 'lost' || status === 'LOST') return 'lost'
  return 'open'
}

export function sortPipelineStages<T extends StageLike>(stages: T[]): T[] {
  return [...stages].sort((left, right) => left.orderIndex - right.orderIndex)
}

export function getLeadAttentionState(lead: LeadLike, now = new Date()): CrmLeadAttentionState {
  const status = normalizeStatus(lead.status)
  if (status === 'won') return 'won'
  if (status === 'lost') return 'lost'

  if (lead.nextFollowUpAt) {
    const nextFollowUp = new Date(lead.nextFollowUpAt)
    if (Number.isNaN(nextFollowUp.getTime())) return 'on_track'
    if (nextFollowUp.getTime() < now.getTime()) return 'overdue'
    if (isSameDay(nextFollowUp, now)) return 'due_today'
    return 'on_track'
  }

  if (lead.lastActivityAt) {
    const lastActivity = new Date(lead.lastActivityAt)
    if (!Number.isNaN(lastActivity.getTime()) && now.getTime() - lastActivity.getTime() >= STALE_AFTER_MS) {
      return 'stale'
    }
  }

  return 'on_track'
}

export function calculatePipelineSummary(leads: LeadLike[], now = new Date()): CrmPipelineSummary {
  const wonLeads = leads.filter(lead => normalizeStatus(lead.status) === 'won').length
  const lostLeads = leads.filter(lead => normalizeStatus(lead.status) === 'lost').length
  const closedLeads = wonLeads + lostLeads

  return {
    newLeads: leads.filter(lead => lead.stageId === 'new' || lead.stageKey === 'new').length,
    staleLeads: leads.filter(lead => getLeadAttentionState(lead, now) === 'stale').length,
    tasksDue: leads.filter(lead => {
      if (!lead.nextFollowUpAt || normalizeStatus(lead.status) !== 'open') return false
      const nextFollowUp = new Date(lead.nextFollowUpAt)
      return !Number.isNaN(nextFollowUp.getTime()) && nextFollowUp.getTime() <= now.getTime()
    }).length,
    openPipelineValue: leads
      .filter(lead => normalizeStatus(lead.status) === 'open')
      .reduce((sum, lead) => sum + (lead.value || 0), 0),
    conversionRate: closedLeads === 0 ? 0 : Math.round((wonLeads / closedLeads) * 100),
  }
}
