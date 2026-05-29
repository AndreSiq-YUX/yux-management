export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'REVIEW', 'COMPLETED', 'PAUSED', 'CANCELLED', 'ARCHIVED'] as const
export const PROJECT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export const PROJECT_TYPES = ['WEBSITE', 'ECOMMERCE', 'MOBILE_APP', 'MARKETING', 'BRANDING', 'CONSULTING', 'OTHER'] as const

export type ProjectStatus = typeof PROJECT_STATUSES[number]
export type ProjectPriority = typeof PROJECT_PRIORITIES[number]
export type ProjectType = typeof PROJECT_TYPES[number]

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type PhaseStatus = 'planning' | 'in_progress' | 'completed' | 'on_hold'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Project {
  id: string
  name: string
  description: string
  status: ProjectStatus
  priority: ProjectPriority
  type: ProjectType
  startDate: string
  expectedEndDate: string
  actualEndDate?: string
  endDate?: string
  createdAt: string
  updatedAt: string
  budget: number
  actualCost?: number
  spent?: number
  currency: string
  progress: number
  completedTasks?: number
  totalTasks?: number
  clientId: string
  client?: {
    id: string
    companyName: string
    contactName: string
    email?: string
  }
  managerId?: string
  teamMembers?: string[]
  isActive: boolean
  isArchived: boolean
  phases?: ProjectPhase[]
  tasks?: ProjectTask[]
  tags?: string[]
  notes?: string
}

export interface ProjectPhase {
  id: string
  projectId: string
  name: string
  description?: string
  status: PhaseStatus
  startDate?: string
  endDate?: string
  budget?: number
  actualCost?: number
  progress: number
  orderIndex: number
  createdAt: string
  updatedAt: string
  tasks?: ProjectTask[]
}

export interface ProjectTask {
  id: string
  projectId: string
  phaseId?: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  assignedTo?: string
  dueDate?: string
  completedAt?: string
  estimatedHours?: number
  actualHours?: number
  orderIndex: number
  createdAt: string
  updatedAt: string
}

export interface ProjectFormData {
  name: string
  description: string
  status: ProjectStatus
  priority: ProjectPriority
  type: ProjectType
  startDate: string
  expectedEndDate: string
  budget: number
  currency: string
  clientId: string
  managerId?: string
  teamMembers?: string[]
  tags?: string[]
  notes?: string
}

export interface ProjectFilters {
  status?: ProjectStatus[]
  priority?: ProjectPriority[]
  type?: ProjectType[]
  clientId?: string
  managerId?: string
  startDateFrom?: string
  startDateTo?: string
  budgetMin?: number
  budgetMax?: number
  search?: string
}

export interface ProjectStats {
  total: number
  active: number
  completed: number
  planning: number
  overdue: number
  totalBudget: number
  completedBudget: number
  averageProgress: number
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planejamento',
  ACTIVE: 'Em Andamento',
  REVIEW: 'Em Revisao',
  COMPLETED: 'Concluido',
  PAUSED: 'Pausado',
  CANCELLED: 'Cancelado',
  ARCHIVED: 'Arquivado',
}

export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
}

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  WEBSITE: 'Website',
  ECOMMERCE: 'E-commerce',
  MOBILE_APP: 'App Mobile',
  MARKETING: 'Marketing',
  BRANDING: 'Branding',
  CONSULTING: 'Consultoria',
  OTHER: 'Outros',
}

export const PROJECT_STATUS_OPTIONS = PROJECT_STATUSES.map(status => ({
  value: status,
  label: PROJECT_STATUS_LABELS[status],
}))

export const PROJECT_PRIORITY_OPTIONS = PROJECT_PRIORITIES.map(priority => ({
  value: priority,
  label: PROJECT_PRIORITY_LABELS[priority],
}))

export const PROJECT_TYPE_OPTIONS = PROJECT_TYPES.map(type => ({
  value: type,
  label: PROJECT_TYPE_LABELS[type],
}))

export type Task = ProjectTask
export type Phase = ProjectPhase

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendente',
  in_progress: 'Em Andamento',
  completed: 'Concluida',
  cancelled: 'Cancelada',
}

export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  planning: 'Planejamento',
  in_progress: 'Em Andamento',
  completed: 'Concluida',
  on_hold: 'Em Espera',
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

export const TASK_STATUS_OPTIONS = Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({
  value: value as TaskStatus,
  label,
}))

export const PHASE_STATUS_OPTIONS = Object.entries(PHASE_STATUS_LABELS).map(([value, label]) => ({
  value: value as PhaseStatus,
  label,
}))

export const TASK_PRIORITY_OPTIONS = Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({
  value: value as TaskPriority,
  label,
}))
