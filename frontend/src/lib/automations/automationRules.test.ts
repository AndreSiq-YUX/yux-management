import { describe, expect, it } from 'vitest'
import { evaluateConditions, matchesTrigger, sortActions } from './automationRules'
import type { AutomationFlow } from '@/types/automation'

const flow: AutomationFlow = {
  id: 'flow-1',
  organizationId: 'org-1',
  name: 'Lead quente para WhatsApp',
  status: 'published',
  isEnabled: true,
  sectorTemplateKey: 'clinic',
  lastError: undefined,
  triggers: [{ id: 'trigger-1', triggerType: 'lead.stage_changed', config: { stageId: 'stage-2' } }],
  conditions: [{ id: 'condition-1', field: 'source', operator: 'equals', value: 'instagram' }],
  actions: [
    { id: 'action-2', actionType: 'register_activity', orderIndex: 2, payload: { title: 'Atividade' } },
    { id: 'action-1', actionType: 'create_task', orderIndex: 1, payload: { title: 'Ligar' } },
  ],
  executionRuns: [],
  createdAt: '2026-06-03T12:00:00.000Z',
  updatedAt: '2026-06-03T12:00:00.000Z',
}

describe('automationRules', () => {
  it('matches eligible lead triggers for published enabled flows', () => {
    expect(matchesTrigger(flow, { type: 'lead.stage_changed', leadId: 'lead-1', stageId: 'stage-2' })).toBe(true)
  })

  it('evaluates automation conditions from event context', () => {
    expect(evaluateConditions([
      { field: 'source', operator: 'equals', value: 'instagram' },
    ], { source: 'instagram' })).toBe(true)
  })

  it('sorts actions by order index before dispatch', () => {
    expect(sortActions(flow.actions).map(action => action.id)).toEqual(['action-1', 'action-2'])
  })
})
