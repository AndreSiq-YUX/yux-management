import { describe, expect, it } from 'vitest'
import { dependenciesSatisfied } from '../src/modules/action-engine/executor.js'
import { assertActionTransition } from '../src/modules/action-engine/state-machine.js'
import { isDomainEventType } from '../src/modules/events/catalog.js'

describe('Action Engine execution invariants', () => {
  it('unblocks fan-out only after every dependency is successful or intentionally skipped', () => {
    expect(dependenciesSatisfied(['succeeded', 'skipped'])).toBe(true)
    expect(dependenciesSatisfied(['succeeded', 'running'])).toBe(false)
    expect(dependenciesSatisfied(['succeeded', 'failed'])).toBe(false)
  })

  it('keeps approval, retry and terminal transitions explicit', () => {
    expect(() => assertActionTransition('pending', 'waiting_approval')).not.toThrow()
    expect(() => assertActionTransition('running', 'retry_scheduled')).not.toThrow()
    expect(() => assertActionTransition('succeeded', 'queued')).toThrowError('action_terminal')
  })

  it('does not treat a duplicate claim as an executable state', () => {
    expect(() => assertActionTransition('running', 'running')).toThrowError('action_transition_not_allowed')
    expect(() => assertActionTransition('cancelled', 'running')).toThrowError('action_terminal')
  })

  it('publishes durable waits as a supported domain event', () => {
    expect(isDomainEventType('action.waiting')).toBe(true)
  })
})
