import type { ActionRunStatus, MissionStatus, PlanStatus } from './types.js'

export const MISSION_TERMINAL_STATES = ['succeeded', 'failed', 'expired', 'cancelled'] as const satisfies readonly MissionStatus[]
export const PLAN_TERMINAL_STATES = ['invalid', 'superseded', 'completed', 'cancelled'] as const satisfies readonly PlanStatus[]
export const ACTION_TERMINAL_STATES = ['succeeded', 'failed', 'skipped', 'cancelled'] as const satisfies readonly ActionRunStatus[]

const missionTransitions: Record<MissionStatus, readonly MissionStatus[]> = {
  draft: ['qualifying', 'planning', 'cancelled'],
  qualifying: ['planning', 'blocked', 'cancelled'],
  planning: ['qualifying', 'pending_plan_approval', 'blocked', 'failed', 'cancelled'],
  pending_plan_approval: ['ready', 'planning', 'cancelled'],
  ready: ['active', 'blocked', 'cancelled'],
  active: ['paused', 'blocked', 'evaluating', 'succeeded', 'failed', 'expired', 'cancelled'],
  paused: ['active', 'evaluating', 'cancelled', 'expired'],
  blocked: ['qualifying', 'planning', 'ready', 'active', 'cancelled', 'expired', 'failed'],
  evaluating: ['active', 'paused', 'blocked', 'pending_replan_approval', 'succeeded', 'failed', 'expired', 'cancelled'],
  pending_replan_approval: ['active', 'paused', 'cancelled'],
  succeeded: [],
  failed: [],
  expired: [],
  cancelled: [],
}

const planTransitions: Record<PlanStatus, readonly PlanStatus[]> = {
  proposed: ['validating', 'cancelled'],
  validating: ['invalid', 'pending_approval', 'cancelled'],
  invalid: [],
  pending_approval: ['approved', 'cancelled'],
  approved: ['active', 'superseded', 'cancelled'],
  active: ['completed', 'superseded', 'cancelled'],
  superseded: [],
  completed: [],
  cancelled: [],
}

const actionTransitions: Record<ActionRunStatus, readonly ActionRunStatus[]> = {
  pending: ['ready', 'waiting_approval', 'blocked', 'skipped', 'cancelled'],
  ready: ['waiting_approval', 'queued', 'blocked', 'skipped', 'cancelled'],
  waiting_approval: ['queued', 'blocked', 'skipped', 'cancelled'],
  queued: ['running', 'blocked', 'cancelled'],
  running: ['succeeded', 'failed', 'retry_scheduled', 'blocked', 'cancelled'],
  retry_scheduled: ['queued', 'blocked', 'cancelled'],
  succeeded: [],
  failed: [],
  blocked: ['ready', 'waiting_approval', 'queued', 'skipped', 'cancelled'],
  skipped: [],
  cancelled: [],
}

export function assertMissionTransition(from: MissionStatus, to: MissionStatus): void {
  if ((MISSION_TERMINAL_STATES as readonly MissionStatus[]).includes(from)) throw new Error('mission_terminal')
  if (!missionTransitions[from].includes(to)) throw new Error('mission_transition_not_allowed')
}

export function assertPlanTransition(from: PlanStatus, to: PlanStatus): void {
  if ((PLAN_TERMINAL_STATES as readonly PlanStatus[]).includes(from)) throw new Error('plan_terminal')
  if (!planTransitions[from].includes(to)) throw new Error('plan_transition_not_allowed')
}

export function assertActionTransition(from: ActionRunStatus, to: ActionRunStatus): void {
  if ((ACTION_TERMINAL_STATES as readonly ActionRunStatus[]).includes(from)) throw new Error('action_terminal')
  if (!actionTransitions[from].includes(to)) throw new Error('action_transition_not_allowed')
}
