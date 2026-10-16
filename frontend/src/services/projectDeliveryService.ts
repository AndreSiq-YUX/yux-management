import { apiRequest } from '@/lib/apiClient'
import type {
  ApprovalDecisionValue,
  ApprovalRequest,
  Project,
  ProjectDeliverable,
  ProjectPhase,
  ProjectTask,
  ProjectTimelineEntry,
} from '@/types/project'

export interface ProjectDeliverySnapshot {
  tasks: ProjectTask[]
  phases: ProjectPhase[]
  deliverables: ProjectDeliverable[]
  approvals: ApprovalRequest[]
  timeline: ProjectTimelineEntry[]
}
const scope = (organizationId: string) =>
  `?${new URLSearchParams({ organizationId })}`
const base = '/project-delivery/portal/projects'
export const projectDeliveryService = {
  approvals(organizationId: string) {
    return apiRequest<{ approvals: ApprovalRequest[] }>(
      `/project-delivery/portal/approvals${scope(organizationId)}`
    )
  },
  list(organizationId: string) {
    return apiRequest<{ projects: Project[] }>(
      `${base}${scope(organizationId)}`
    )
  },
  details(organizationId: string, projectId: string) {
    return apiRequest<ProjectDeliverySnapshot>(
      `${base}/${encodeURIComponent(projectId)}${scope(organizationId)}`
    )
  },
  decide(
    organizationId: string,
    projectId: string,
    approvalId: string,
    decision: ApprovalDecisionValue,
    comment: string
  ) {
    return apiRequest<{ success: boolean }>(
      `${base}/${encodeURIComponent(projectId)}/approvals/${encodeURIComponent(approvalId)}/decision${scope(organizationId)}`,
      {
        method: 'POST',
        body: { decision, comment: comment.trim() },
      }
    )
  },
}
