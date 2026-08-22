import { describe, expect, it } from 'vitest'
import { availableMissionCommands, formatMetric, missionProgress } from './missionRules'
import type { ActionMission, MissionActionRun } from '@/types/actionEngine'

const mission = { id: 'm1', organizationId: 'o1', packVersionId: 'p1', status: 'ready', mode: 'assisted', title: 'Missão', objective: 'Objetivo', parameters: {}, budget: {}, version: 4, createdBy: 'u1', createdAt: '', updatedAt: '' } as unknown as ActionMission

describe('missionRules', () => {
  it('derives safe commands from the canonical state', () => {
    expect(availableMissionCommands(mission)).toMatchObject({ start: true, pause: false, plan: false })
  })

  it('calculates progress only from terminal action states', () => {
    const actions = [{ status: 'succeeded' }, { status: 'running' }, { status: 'skipped' }, { status: 'pending' }] as MissionActionRun[]
    expect(missionProgress(actions)).toBe(50)
  })

  it('never turns an unknown metric into a fake zero', () => {
    expect(formatMetric({ kind: 'unknown', reason: 'missing', unit: 'BRL' })).toBe('Indisponível')
  })
})
