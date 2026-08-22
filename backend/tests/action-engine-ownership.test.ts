import { describe, expect, it } from 'vitest'
import { resolveAutomationConflict, type MissionOwnership } from '../src/modules/action-engine/execution-ownership.js'

const exclusive: MissionOwnership = { missionId: 'mission-1', mode: 'exclusive', conflictPolicy: 'mission_wins', allowedActionKeys: ['send_email'], active: true }
const shared: MissionOwnership = { missionId: 'mission-1', mode: 'shared', conflictPolicy: 'allow_disjoint', allowedActionKeys: ['send_email'], active: true }

describe('Action Engine execution ownership', () => {
  it('blocks standalone actions under exclusive ownership', () => {
    expect(resolveAutomationConflict(exclusive, { missionBound: false, actionKey: 'move_stage' })).toEqual({ outcome: 'block', reason: 'mission_exclusive_ownership' })
  })

  it('allows disjoint shared actions but blocks overlapping action keys', () => {
    expect(resolveAutomationConflict(shared, { missionBound: false, actionKey: 'add_note' })).toEqual({ outcome: 'allow', reason: 'disjoint_action' })
    expect(resolveAutomationConflict(shared, { missionBound: false, actionKey: 'send_email' })).toEqual({ outcome: 'block', reason: 'action_key_conflict' })
  })

  it('always lets a mission-bound subprocess of the same mission continue', () => {
    expect(resolveAutomationConflict(exclusive, { missionId: 'mission-1', missionBound: true, actionKey: 'send_email' })).toEqual({ outcome: 'allow', reason: 'same_mission_subprocess' })
  })
})
