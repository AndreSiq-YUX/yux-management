import { evaluateConditions } from './automationRules'
import type { AutomationAction, AutomationCondition, AutomationEvent, AutomationFlow } from '@/types/automation'

export interface SimulationResult {
  matched: boolean
  triggerMatched: boolean
  triggerDetails: string
  conditionResults: Array<{
    condition: AutomationCondition
    passed: boolean
    reason: string
  }>
  plannedActions: AutomationAction[]
  blockedReasons: string[]
}

export function simulateAutomationFlow(flow: AutomationFlow, event: AutomationEvent): SimulationResult {
  const blockedReasons: string[] = []

  if (!flow.isEnabled) blockedReasons.push('flow_disabled')
  if (flow.status !== 'published') blockedReasons.push('flow_not_published')

  const triggerMatched = flow.triggers.some(trigger => {
    if (trigger.triggerType !== event.type) return false
    if (trigger.config.stageId && trigger.config.stageId !== event.stageId) return false
    if (trigger.config.status && trigger.config.status !== event.status) return false
    return true
  })

  const triggerDetails = triggerMatched
    ? `Evento "${event.type}" corresponde a ${flow.triggers.length} trigger(s)`
    : `Evento "${event.type}" nao corresponde a nenhum trigger`

  const conditionResults = flow.conditions.map(condition => {
    const context = event.payload || event
    const passed = evaluateConditions([condition], context)
    return {
      condition,
      passed,
      reason: passed
        ? `${condition.field} ${condition.operator} ${condition.value ?? ''} => verdadeiro`
        : `${condition.field} ${condition.operator} ${condition.value ?? ''} => falso`,
    }
  })

  const allConditionsPassed = conditionResults.every(r => r.passed)
  const matched = triggerMatched && allConditionsPassed && blockedReasons.length === 0

  const plannedActions = matched
    ? [...flow.actions].sort((a, b) => a.orderIndex - b.orderIndex)
    : []

  if (!triggerMatched) blockedReasons.push('trigger_not_matched')
  if (!allConditionsPassed) blockedReasons.push('conditions_not_met')

  return {
    matched,
    triggerMatched,
    triggerDetails,
    conditionResults,
    plannedActions,
    blockedReasons,
  }
}
