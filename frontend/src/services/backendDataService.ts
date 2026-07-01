import { apiRequest } from '@/lib/apiClient'
import type {
  ApprovalDecisionValue,
  ApprovalTargetType,
  ProjectDeliverable,
} from '@/types/project'

type QueryValue = string | number | boolean | Array<string | number | boolean> | null | undefined
type QueryParams = Record<string, QueryValue>

function buildQuery(params?: QueryParams) {
  if (!params) return ''

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      value.forEach(item => search.append(key, String(item)))
      continue
    }
    search.set(key, String(value))
  }

  const query = search.toString()
  return query ? `?${query}` : ''
}

export class BackendDataService {
  async getDashboardStats() {
    return apiRequest<any>('/workspace/dashboard/stats')
  }

  async getUsers(params?: { limit?: number; search?: string }) {
    return apiRequest<any>(`/workspace/users${buildQuery(params)}`)
  }

  async getClients(params?: {
    page?: number
    limit?: number
    search?: string
    sector?: string
    sizes?: string[]
    leadSources?: string[]
    minValue?: number
    maxValue?: number
    startDate?: string
    endDate?: string
  }) {
    return apiRequest<any>(`/workspace/clients${buildQuery(params)}`)
  }

  async getClientById(id: string) {
    return apiRequest<any>(`/workspace/clients/${id}`)
  }

  async getClientStats() {
    return apiRequest<any>('/workspace/clients/stats')
  }

  async getClientSuggestions(params?: { limit?: number }) {
    return apiRequest<any>(`/workspace/clients/suggestions${buildQuery(params)}`)
  }

  async createClient(clientData: unknown) {
    return apiRequest<any>('/workspace/clients', {
      method: 'POST',
      body: clientData,
    })
  }

  async updateClient(id: string, clientData: unknown) {
    return apiRequest<any>(`/workspace/clients/${id}`, {
      method: 'PATCH',
      body: clientData,
    })
  }

  async sendClientAccessEmail(id: string) {
    return apiRequest<any>(`/workspace/clients/${id}/access-email`, {
      method: 'POST',
    })
  }

  async deleteClient(id: string) {
    return apiRequest<any>(`/workspace/clients/${id}`, { method: 'DELETE' })
  }

  async getProjects(params?: {
    page?: number
    limit?: number
    search?: string
    status?: string
    priority?: string
    clientId?: string
    managerId?: string
    startDate?: string
    endDate?: string
    budgetMin?: number
    budgetMax?: number
    tags?: string[]
  }) {
    return apiRequest<any>(`/workspace/projects${buildQuery(params)}`)
  }

  async createProject(projectData: unknown) {
    return apiRequest<any>('/workspace/projects', {
      method: 'POST',
      body: projectData,
    })
  }

  async updateProject(id: string, projectData: unknown) {
    return apiRequest<any>(`/workspace/projects/${id}`, {
      method: 'PATCH',
      body: projectData,
    })
  }

  async deleteProject(id: string) {
    return apiRequest<any>(`/workspace/projects/${id}`, { method: 'DELETE' })
  }

  async getProjectById(id: string) {
    return apiRequest<any>(`/workspace/projects/${id}`)
  }

  async archiveProject(id: string) {
    return apiRequest<any>(`/workspace/projects/${id}/archive`, { method: 'POST' })
  }

  async unarchiveProject(id: string) {
    return apiRequest<any>(`/workspace/projects/${id}/unarchive`, { method: 'POST' })
  }

  async duplicateProject(id: string, data?: { name?: string; clientId?: string; startDate?: string }) {
    return apiRequest<any>(`/workspace/projects/${id}/duplicate`, {
      method: 'POST',
      body: data ?? {},
    })
  }

  async getProjectStats() {
    return apiRequest<any>('/workspace/projects/stats')
  }

  async getProjectsByClient(clientId: string, params?: { status?: string; includeArchived?: boolean }) {
    return apiRequest<any>(`/workspace/projects/client/${clientId}${buildQuery(params)}`)
  }

  async getProjectTasks(projectId: string) {
    return apiRequest<any>(`/workspace/projects/${projectId}/tasks`)
  }

  async createProjectTask(projectId: string, taskData: {
    title: string
    description?: string
    status: string
    priority: string
    assignedTo?: string
    dueDate?: string
    estimatedHours?: number
    phaseId?: string
  }) {
    return apiRequest<any>(`/workspace/projects/${projectId}/tasks`, {
      method: 'POST',
      body: taskData,
    })
  }

  async updateProjectTask(projectId: string, taskId: string, taskData: {
    title?: string
    description?: string
    status?: string
    priority?: string
    assignedTo?: string
    dueDate?: string
    estimatedHours?: number
    actualHours?: number
    phaseId?: string
    isClientVisible?: boolean
  }) {
    return apiRequest<any>(`/workspace/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: taskData,
    })
  }

  async deleteProjectTask(projectId: string, taskId: string) {
    return apiRequest<any>(`/workspace/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE' })
  }

  async updateProjectTaskVisibility(projectId: string, taskId: string, isClientVisible: boolean) {
    return this.updateProjectTask(projectId, taskId, { isClientVisible })
  }

  async getProjectPhases(projectId: string) {
    return apiRequest<any>(`/workspace/projects/${projectId}/phases`)
  }

  async createProjectPhase(projectId: string, phaseData: {
    name: string
    description?: string
    status?: string
    startDate: string
    endDate: string
    budget?: number
    orderIndex: number
  }) {
    return apiRequest<any>(`/workspace/projects/${projectId}/phases`, {
      method: 'POST',
      body: phaseData,
    })
  }

  async updateProjectPhase(projectId: string, phaseId: string, phaseData: {
    name?: string
    description?: string
    status?: string
    startDate?: string
    endDate?: string
    progress?: number
  }) {
    return apiRequest<any>(`/workspace/projects/${projectId}/phases/${phaseId}`, {
      method: 'PATCH',
      body: phaseData,
    })
  }

  async deleteProjectPhase(projectId: string, phaseId: string) {
    return apiRequest<any>(`/workspace/projects/${projectId}/phases/${phaseId}`, { method: 'DELETE' })
  }

  async getProjectDeliverables(projectId: string) {
    return apiRequest<any>(`/workspace/projects/${projectId}/deliverables`)
  }

  async createProjectDeliverable(projectId: string, deliverable: {
    title: string
    description?: string
    phaseId?: string
    dueDate?: string
    externalUrl?: string
    isClientVisible: boolean
  }) {
    return apiRequest<any>(`/workspace/projects/${projectId}/deliverables`, {
      method: 'POST',
      body: deliverable,
    })
  }

  async updateProjectDeliverable(projectId: string, deliverableId: string, updates: Partial<{
    title: string
    description: string
    phaseId: string
    dueDate: string
    externalUrl: string
    status: ProjectDeliverable['status']
    isClientVisible: boolean
  }>) {
    return apiRequest<any>(`/workspace/projects/${projectId}/deliverables/${deliverableId}`, {
      method: 'PATCH',
      body: updates,
    })
  }

  async getProjectApprovalRequests(projectId: string) {
    return apiRequest<any>(`/workspace/projects/${projectId}/approvals`)
  }

  async createApprovalRequest(projectId: string, request: {
    targetType: ApprovalTargetType
    targetId: string
    title: string
    instructions?: string
    isClientVisible?: boolean
  }) {
    return apiRequest<any>(`/workspace/projects/${projectId}/approvals`, {
      method: 'POST',
      body: request,
    })
  }

  async submitApprovalDecision(approvalRequestId: string, decision: ApprovalDecisionValue, comment?: string) {
    return apiRequest<any>('/workspace/approval-decisions', {
      method: 'POST',
      body: { approvalRequestId, decision, comment },
    })
  }

  async getProjectTimeline(projectId: string) {
    return apiRequest<any>(`/workspace/projects/${projectId}/timeline`)
  }

  async createProjectTimelineEntry(projectId: string, entry: {
    title: string
    body?: string
    isClientVisible: boolean
  }) {
    return apiRequest<any>(`/workspace/projects/${projectId}/timeline`, {
      method: 'POST',
      body: entry,
    })
  }
}

export const backendDataService = new BackendDataService()
