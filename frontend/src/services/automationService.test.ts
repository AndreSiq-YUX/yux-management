import { describe, expect, it } from 'vitest'
import { buildFlowPayload, buildTriggerPayload, mapAutomationFlow } from './automationService'

describe('automationService helpers', () => {
  it('builds flow payloads with draft and enabled defaults', () => {
    expect(buildFlowPayload({
      organizationId: 'org-1',
      name: ' Follow-up Instagram ',
      description: 'Fluxo comercial',
      sectorTemplateKey: 'clinic',
    })).toEqual(expect.objectContaining({
      organization_id: 'org-1',
      name: 'Follow-up Instagram',
      description: 'Fluxo comercial',
      sector_template_key: 'clinic',
      status: 'draft',
      is_enabled: true,
    }))
  })

  it('builds trigger payloads from flow events', () => {
    expect(buildTriggerPayload('flow-1', {
      triggerType: 'lead.stage_changed',
      config: { stageId: 'stage-2' },
    })).toEqual({
      flow_id: 'flow-1',
      trigger_type: 'lead.stage_changed',
      config: { stageId: 'stage-2' },
    })
  })

  it('maps flows with blocks and execution history', () => {
    expect(mapAutomationFlow({
      id: 'flow-1',
      organization_id: 'org-1',
      name: 'Follow-up Instagram',
      description: 'Fluxo comercial',
      status: 'published',
      is_enabled: true,
      sector_template_key: 'clinic',
      last_error: 'provider failed',
      created_at: '2026-06-03T12:00:00.000Z',
      updated_at: '2026-06-03T13:00:00.000Z',
      automation_triggers: [{ id: 'trigger-1', trigger_type: 'lead.stage_changed', config: { stageId: 'stage-2' } }],
      automation_conditions: [{ id: 'condition-1', field: 'source', operator: 'equals', value: 'instagram' }],
      automation_actions: [{ id: 'action-1', action_type: 'create_task', order_index: 1, payload: { title: 'Ligar' } }],
      automation_execution_runs: [{ id: 'run-1', status: 'failed', last_error: 'provider failed', started_at: '2026-06-03T13:00:00.000Z' }],
    })).toMatchObject({
      id: 'flow-1',
      status: 'published',
      triggers: [{ triggerType: 'lead.stage_changed' }],
      conditions: [{ field: 'source' }],
      actions: [{ actionType: 'create_task' }],
      executionRuns: [{ status: 'failed' }],
    })
  })
})
