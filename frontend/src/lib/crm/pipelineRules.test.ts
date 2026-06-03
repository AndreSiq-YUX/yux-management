import { describe, expect, it } from 'vitest'
import { calculatePipelineSummary, getLeadAttentionState, sortPipelineStages } from './pipelineRules'

describe('pipelineRules', () => {
  it('sorts pipeline stages by order index', () => {
    expect(sortPipelineStages([
      { id: 'proposal', orderIndex: 3 },
      { id: 'new', orderIndex: 1 },
    ])).toEqual([
      expect.objectContaining({ id: 'new' }),
      expect.objectContaining({ id: 'proposal' }),
    ])
  })

  it('detects stale leads without next follow-up', () => {
    expect(getLeadAttentionState({
      status: 'open',
      lastActivityAt: '2026-06-01T10:00:00.000Z',
      nextFollowUpAt: undefined,
    }, new Date('2026-06-03T10:00:00.000Z'))).toBe('stale')
  })

  it('summarizes the commercial pipeline for cockpit metrics', () => {
    const summary = calculatePipelineSummary([
      { status: 'open', stageId: 'new', value: 1000, lastActivityAt: '2026-06-03T09:00:00.000Z' },
      { status: 'open', stageId: 'proposal', value: 2000, lastActivityAt: '2026-06-01T10:00:00.000Z' },
      { status: 'won', stageId: 'won', value: 3000, wonAt: '2026-06-03T12:00:00.000Z' },
      { status: 'lost', stageId: 'lost', value: 500, lostAt: '2026-06-03T12:00:00.000Z' },
    ], new Date('2026-06-03T10:00:00.000Z'))

    expect(summary.newLeads).toBe(1)
    expect(summary.staleLeads).toBe(1)
    expect(summary.openPipelineValue).toBe(3000)
    expect(summary.conversionRate).toBe(50)
  })
})
