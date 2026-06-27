import { describe, expect, it } from 'vitest'
import { applyEnrollmentCommand, isPersistedOrganizationId, sortPipelineStages } from './followUpRules'

describe('sortPipelineStages', () => {
  it('orders configurable stages by order index', () => {
    expect(sortPipelineStages([
      { id: 'won', orderIndex: 4 },
      { id: 'new', orderIndex: 0 },
      { id: 'proposal', orderIndex: 2 },
    ]).map(stage => stage.id)).toEqual(['new', 'proposal', 'won'])
  })
})

describe('isPersistedOrganizationId', () => {
  it('rejects the local organization placeholder before backend hydration', () => {
    expect(isPersistedOrganizationId('local-yux')).toBe(false)
    expect(isPersistedOrganizationId('650e8400-e29b-41d4-a716-446655440001')).toBe(true)
  })
})

describe('applyEnrollmentCommand', () => {
  const enrollment = {
    status: 'active' as const,
    nextExecutionAt: '2026-05-30T12:00:00.000Z',
    manualNote: undefined,
  }

  it('pauses an automated enrollment', () => {
    expect(applyEnrollmentCommand(enrollment, { type: 'pause' })).toEqual({
      ...enrollment,
      status: 'paused',
    })
  })

  it('reschedules and resumes an enrollment', () => {
    expect(applyEnrollmentCommand(enrollment, {
      type: 'reschedule',
      nextExecutionAt: '2026-06-01T09:30:00.000Z',
    })).toEqual({
      ...enrollment,
      status: 'active',
      nextExecutionAt: '2026-06-01T09:30:00.000Z',
    })
  })

  it('marks manual takeover with its note', () => {
    expect(applyEnrollmentCommand(enrollment, {
      type: 'takeover',
      note: 'Cliente pediu contato humano.',
    })).toEqual({
      ...enrollment,
      status: 'manual',
      manualNote: 'Cliente pediu contato humano.',
    })
  })
})
