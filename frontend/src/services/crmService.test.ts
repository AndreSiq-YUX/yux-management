import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildGovernedLeadInsertPayload,
  buildLeadAssignmentPayload,
  buildLeadLostPayload,
  buildLeadScoreUpdatePayload,
  buildLeadTaskInsertPayload,
  buildLeadWonPayload,
  buildPipelinePayload,
  buildPipelinePatchPayload,
  buildPipelineStagePayload,
  crmService,
} from './crmService'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('crmService payload builders', () => {
  afterEach(() => {
    vi.useRealTimers()
    fetchMock.mockReset()
    vi.unstubAllGlobals()
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

  it('normalizes pipeline configuration payloads', () => {
    expect(buildPipelinePayload({
      organizationId: 'org-1',
      crmInstanceId: 'instance-1',
      name: '  Novos negócios  ',
      description: '  Entrada comercial  ',
    })).toEqual({
      organizationId: 'org-1',
      crmInstanceId: 'instance-1',
      name: 'Novos negócios',
      description: 'Entrada comercial',
      isDefault: false,
      isActive: true,
    })
    expect(buildPipelinePatchPayload({ name: '  Vendas  ', isDefault: true })).toEqual({
      name: 'Vendas',
      isDefault: true,
    })
    expect(buildPipelineStagePayload({
      pipelineId: 'pipeline-1',
      name: '  Qualificação  ',
      key: '  qualification  ',
      color: '#2563eb',
    })).toEqual({
      name: 'Qualificação',
      key: 'qualification',
      color: '#2563eb',
      isWon: false,
      isLost: false,
      isActive: true,
    })
  })
})

describe('crmService backend API methods', () => {
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('loads leads from the backend CRM endpoint', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 'lead-1', name: 'Maria' }]))

    await expect(crmService.getLeads('org-1', 'pipeline-1')).resolves.toEqual([{ id: 'lead-1', name: 'Maria' }])
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/leads?organizationId=org-1&pipelineId=pipeline-1', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
  })

  it('loads CRM pipelines from the backend CRM endpoint', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 'pipeline-1', name: 'Comercial', stages: [] }]))

    await expect(crmService.getPipelines('org-1')).resolves.toEqual([{ id: 'pipeline-1', name: 'Comercial', stages: [] }])
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/pipelines?organizationId=org-1', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
  })

  it('connects pipeline and stage management routes', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'pipeline-1', name: 'Vendas', stages: [] }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'pipeline-1', name: 'Comercial', stages: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'stage-1', pipelineId: 'pipeline-1', name: 'Novo' }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'stage-1', pipelineId: 'pipeline-1', name: 'Qualificado' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'pipeline-1', name: 'Comercial', stages: [] }))

    await crmService.createPipeline({ organizationId: 'org-1', crmInstanceId: 'instance-1', name: 'Vendas' })
    await crmService.updatePipeline('pipeline-1', { name: 'Comercial' })
    await crmService.createPipelineStage({ pipelineId: 'pipeline-1', name: 'Novo', key: 'new', color: '#2563eb' })
    await crmService.updatePipelineStage('stage-1', { name: 'Qualificado' })
    await crmService.reorderPipelineStages('pipeline-1', ['stage-1'])

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/crm/pipelines', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/crm/pipelines/pipeline-1', expect.objectContaining({ method: 'PATCH' }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/crm/pipelines/pipeline-1/stages', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/crm/pipeline-stages/stage-1', expect.objectContaining({ method: 'PATCH' }))
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/crm/pipelines/pipeline-1/stages/order', expect.objectContaining({ method: 'PUT' }))
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/crm/pipelines/pipeline-1/stages/order', expect.objectContaining({
      body: JSON.stringify({ stageIds: ['stage-1'] }),
    }))
  })

  it('creates CRM leads through the backend CRM endpoint', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'lead-1', name: 'Maria' }, { status: 201 }))

    await expect(crmService.createLead({
      organizationId: 'org-1',
      pipelineId: 'pipeline-1',
      stageId: 'stage-1',
      name: 'Maria',
      email: 'maria@yux.com.br',
      source: 'manual',
      score: 10,
    })).resolves.toEqual({ id: 'lead-1', name: 'Maria' })
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/leads', {
      method: 'POST',
      headers: expect.any(Headers),
      body: expect.stringContaining('"organizationId":"org-1"'),
      credentials: 'include',
    })
  })

  it('creates lead tasks through the backend CRM endpoint', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'task-1', title: 'Ligar' }, { status: 201 }))

    await expect(crmService.createLeadTask({
      organizationId: 'org-1',
      leadId: 'lead-1',
      title: ' Ligar ',
      dueAt: '2026-01-01T00:00:00.000Z',
    })).resolves.toEqual({ id: 'task-1', title: 'Ligar' })
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/leads/lead-1/tasks', {
      method: 'POST',
      headers: expect.any(Headers),
      body: expect.stringContaining('"title":"Ligar"'),
      credentials: 'include',
    })
  })

  it('moves leads and completes tasks through backend CRM endpoints', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'lead-1', stageId: 'stage-2' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'task-1', status: 'completed' }))

    await expect(crmService.moveLeadToStage('lead-1', 'stage-2')).resolves.toEqual({ id: 'lead-1', stageId: 'stage-2' })
    await expect(crmService.completeLeadTask('task-1')).resolves.toEqual({ id: 'task-1', status: 'completed' })
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/crm/leads/lead-1/stage', {
      method: 'PATCH',
      headers: expect.any(Headers),
      body: JSON.stringify({ stageId: 'stage-2' }),
      credentials: 'include',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/crm/tasks/task-1/complete', {
      method: 'PATCH',
      headers: expect.any(Headers),
      credentials: 'include',
    })
  })

  it('loads CRM sequences, enrollments and executions through backend endpoints', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(jsonResponse([{ id: 'sequence-1', name: 'Follow-up' }]))
      .mockResolvedValueOnce(jsonResponse([{ id: 'enrollment-1', leadId: 'lead-1' }]))
      .mockResolvedValueOnce(jsonResponse([{ id: 'execution-1', leadId: 'lead-1' }]))

    await expect(crmService.getSequences('org-1')).resolves.toEqual([{ id: 'sequence-1', name: 'Follow-up' }])
    await expect(crmService.getEnrollments('lead-1')).resolves.toEqual([{ id: 'enrollment-1', leadId: 'lead-1' }])
    await expect(crmService.getExecutions('lead-1')).resolves.toEqual([{ id: 'execution-1', leadId: 'lead-1' }])

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/crm/sequences?organizationId=org-1', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/crm/leads/lead-1/enrollments', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/crm/leads/lead-1/executions', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
  })

  it('enrolls leads and queues sequence dispatch through backend endpoints', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'enrollment-1', leadId: 'lead-1' }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, jobId: 'job-1' }, { status: 202 }))

    await expect(crmService.enrollLead('org-1', 'lead-1', 'sequence-1')).resolves.toEqual({
      id: 'enrollment-1',
      leadId: 'lead-1',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/crm/leads/lead-1/enrollments', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ organizationId: 'org-1', sequenceId: 'sequence-1' }),
      credentials: 'include',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/automations/dispatch', {
      method: 'POST',
      headers: expect.any(Headers),
      body: expect.stringContaining('crm.sequence.enrolled'),
      credentials: 'include',
    })
  })
})
