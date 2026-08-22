import { describe, expect, it } from 'vitest'
import { assertActionTransition, assertMissionTransition, assertPlanTransition } from '../src/modules/action-engine/state-machine.js'

describe('Action Engine state machines', () => {
  it('accepts only explicit mission transitions and protects terminal states', () => {
    expect(() => assertMissionTransition('draft', 'planning')).not.toThrow()
    expect(() => assertMissionTransition('draft', 'active')).toThrowError('mission_transition_not_allowed')
    expect(() => assertMissionTransition('succeeded', 'active')).toThrowError('mission_terminal')
  })

  it('keeps approved plans immutable except for lifecycle transitions', () => {
    expect(() => assertPlanTransition('approved', 'active')).not.toThrow()
    expect(() => assertPlanTransition('approved', 'proposed')).toThrowError('plan_transition_not_allowed')
  })

  it('prevents a completed effect from being executed again', () => {
    expect(() => assertActionTransition('running', 'succeeded')).not.toThrow()
    expect(() => assertActionTransition('succeeded', 'running')).toThrowError('action_terminal')
  })
})
