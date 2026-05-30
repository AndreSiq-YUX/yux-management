import type { CrmEnrollmentStatus } from '@/types/crm'

export function isPersistedOrganizationId(organizationId?: string): organizationId is string {
  return Boolean(organizationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId))
}

export function sortPipelineStages<T extends { orderIndex: number }>(stages: T[]) {
  return [...stages].sort((left, right) => left.orderIndex - right.orderIndex)
}

type EnrollmentState = {
  status: CrmEnrollmentStatus
  nextExecutionAt?: string
  manualNote?: string
}

type EnrollmentCommand =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'reschedule'; nextExecutionAt: string }
  | { type: 'takeover'; note: string }

export function applyEnrollmentCommand(state: EnrollmentState, command: EnrollmentCommand): EnrollmentState {
  if (command.type === 'pause') return { ...state, status: 'paused' }
  if (command.type === 'resume') return { ...state, status: 'active' }
  if (command.type === 'reschedule') {
    return { ...state, status: 'active', nextExecutionAt: command.nextExecutionAt }
  }
  return { ...state, status: 'manual', manualNote: command.note.trim() }
}
