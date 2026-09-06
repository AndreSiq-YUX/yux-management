import { describe, expect, it } from 'vitest'
import { validateAutomationDefinition } from '../src/modules/automations/journey.js'

const validFlow = {
  dailyRunLimit: 500,
  requiresHumanApproval: false,
  triggers: [{ triggerType: 'lead.created', config: {} }],
  conditions: [{ field: 'source', operator: 'exists', value: true }],
  actions: [{ actionType: 'create_task', orderIndex: 1, payload: { title: 'Retornar contato' } }],
  graph: {
    nodes: [{ id: 'trigger', type: 'trigger' }, { id: 'action', type: 'action' }],
    edges: [{ source: 'trigger', target: 'action' }],
  },
}

describe('automation journey validation', () => {
  it('accepts a registered, complete and acyclic definition', () => {
    expect(validateAutomationDefinition(validFlow)).toEqual({ valid: true, errors: [] })
  })

  it('rejects cycles, unsupported actions and missing required inputs', () => {
    const result = validateAutomationDefinition({
      ...validFlow,
      actions: [
        { actionType: 'unknown_action', orderIndex: 1, payload: {} },
        { actionType: 'create_task', orderIndex: 2, payload: {} },
      ],
      graph: {
        nodes: [{ id: 'a', type: 'trigger' }, { id: 'b', type: 'action' }],
        edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }],
      },
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      'automation_action_type_unregistered:unknown_action',
      'automation_create_task_title_required',
      'automation_graph_cycle',
    ]))
  })

  it('requires human approval before external effects can be activated', () => {
    const result = validateAutomationDefinition({
      ...validFlow,
      actions: [{ actionType: 'send_email', orderIndex: 1, payload: { subject: 'Olá' } }],
    })

    expect(result).toEqual({ valid: false, errors: ['automation_external_action_requires_approval'] })
  })
})
