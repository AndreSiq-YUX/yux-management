import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildGovernedLeadInsertPayload,
  buildLeadAssignmentPayload,
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

  it('creates a lead linked to crm instance, team, owner, and assignment mode', () => {
    expect(buildGovernedLeadInsertPayload({
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      pipelineId: 'pipe-1',
      stageId: 'stage-1',
      teamId: 'team-1',
      ownerMemberId: 'member-1',
      assignmentMode: 'round_robin',
      name: 'Maria',
      email: 'maria@yux.test',
      source: 'whatsapp',
      score: 50,
    })).toMatchObject({
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      pipeline_id: 'pipe-1',
      stage_id: 'stage-1',
      team_id: 'team-1',
      owner_member_id: 'member-1',
      assignment_mode: 'round_robin',
      assignment_state: 'assigned',
    })
  })

  it('creates reassignment payload with audit-friendly timestamp', () => {
    const payload = buildLeadAssignmentPayload({
      teamId: 'team-2',
      ownerMemberId: 'member-2',
      assignmentMode: 'manual',
    })

    expect(payload).toMatchObject({
      team_id: 'team-2',
      owner_member_id: 'member-2',
      assignment_mode: 'manual',
      assignment_state: 'reassigned',
    })
    expect(typeof payload.last_assignment_at).toBe('string')
  })
})
