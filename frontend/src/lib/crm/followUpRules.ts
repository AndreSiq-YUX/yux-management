import type { CrmEnrollmentStatus } from '@/types/crm'

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
