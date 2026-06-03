import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildLeadLostPayload,
  buildLeadScoreUpdatePayload,
  buildLeadTaskInsertPayload,
  buildLeadWonPayload,
} from './crmService'

describe('crmService payload builders', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('clamps lead score updates to the supported range', () => {
    expect(buildLeadScoreUpdatePayload(151)).toEqual({ score: 100 })
    expect(buildLeadScoreUpdatePayload(-4)).toEqual({ score: 0 })
    expect(buildLeadScoreUpdatePayload(72.4)).toEqual({ score: 72 })
  })

  it('builds commercial lead task inserts with trimmed fields and defaults', () => {
    expect(buildLeadTaskInsertPayload({
      organizationId: 'org-1',
      leadId: 'lead-1',
      title: '  Ligar para decisor  ',
      description: '  Confirmar briefing  ',
      dueAt: '2026-06-04T12:00:00.000Z',
    })).toEqual({
      organization_id: 'org-1',
      lead_id: 'lead-1',
      title: 'Ligar para decisor',
      description: 'Confirmar briefing',
      due_at: '2026-06-04T12:00:00.000Z',
      assigned_to: null,
      priority: 'medium',
    })
  })

  it('builds won and lost payloads for CRM outcome transitions', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z'))

    expect(buildLeadWonPayload({ leadId: 'lead-1', stageId: 'won-stage', value: 5000 })).toEqual({
      stage_id: 'won-stage',
      stage: 'WON',
      status: 'won',
      value: 5000,
      won_at: '2026-06-03T12:00:00.000Z',
      lost_at: null,
      lost_reason: null,
    })
    expect(buildLeadLostPayload({ leadId: 'lead-1', stageId: 'lost-stage', lostReason: ' Sem fit ' })).toEqual({
      stage_id: 'lost-stage',
      stage: 'LOST',
      status: 'lost',
      lost_reason: 'Sem fit',
      lost_at: '2026-06-03T12:00:00.000Z',
      won_at: null,
    })
  })
})
