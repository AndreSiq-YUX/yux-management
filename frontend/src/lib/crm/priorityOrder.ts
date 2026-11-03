import type { CrmLead } from '@/types/crm'

export function priorityQueueKey(lead: CrmLead) {
  const priority = lead.priority
  return priority?.state === 'ranked' && priority.queueId
    ? `queue:${priority.queueId}`
    : priority?.state
}

export function compareLeadPriority(a: CrmLead, b: CrmLead) {
  const order = (lead: CrmLead) =>
    lead.priority?.queueOrder ??
    (lead.priority?.state === 'needs_data' ? 100 : lead.priority?.state === 'pending' ? 101 : 102)
  const date = (lead: CrmLead) => Date.parse(lead.nextFollowUpAt ?? '') || Number.MAX_SAFE_INTEGER
  return (
    order(a) - order(b) ||
    (b.priority?.priorityScore ?? -1) - (a.priority?.priorityScore ?? -1) ||
    date(a) - date(b) ||
    a.id.localeCompare(b.id)
  )
}
