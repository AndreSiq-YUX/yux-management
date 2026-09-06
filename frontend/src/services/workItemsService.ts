import { apiRequest } from '@/lib/apiClient'

export type WorkItemSourceType = 'crm_task' | 'project_task' | 'mission_human_task'
export type WorkItemStatus = 'pending' | 'in_progress' | 'blocked' | 'awaiting_approval'

export type WorkItem = {
  sourceType: WorkItemSourceType
  sourceId: string
  title: string
  status: WorkItemStatus
  dueAt: string | null
  assigneeId: string | null
  missionId: string | null
  organizationId: string
  version: string
}

function query(params: Record<string, string | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  return search.toString()
}

export const workItemsService = {
  list: (input: { organizationId: string; assigneeId?: string; due?: 'all' | 'today' | 'overdue' | 'upcoming' }) =>
    apiRequest<{ items: WorkItem[] }>(`/workspace/work-items?${query(input)}`),
  complete: (item: Pick<WorkItem, 'sourceType' | 'sourceId' | 'organizationId' | 'version'>, input: {
    evidence: Record<string, unknown>
    minutesSpent: number
  }) => apiRequest<{ status: 'completed'; version: string }>(
    `/workspace/work-items/${item.sourceType}/${item.sourceId}/complete`,
    {
      method: 'POST',
      body: {
        organizationId: item.organizationId,
        expectedVersion: item.version,
        evidence: input.evidence,
        minutesSpent: input.minutesSpent,
      },
    },
  ),
}
