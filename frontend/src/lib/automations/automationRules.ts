import type { AutomationAction, AutomationCondition, AutomationEvent, AutomationFlow } from '@/types/automation'

const valueAt = (source: Record<string, unknown>, path: string) => (
  path.split('.').reduce<unknown>((current, key) => (
    current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined
  ), source)
)

const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase()

export function evaluateConditions(conditions: AutomationCondition[], context: Record<string, unknown>) {
  return conditions.every(condition => {
    const current = valueAt(context, condition.field)
    if (condition.operator === 'exists') return current !== undefined && current !== null && current !== ''
    if (condition.operator === 'equals') return normalized(current) === normalized(condition.value)
    if (condition.operator === 'not_equals') return normalized(current) !== normalized(condition.value)
    if (condition.operator === 'contains') return normalized(current).includes(normalized(condition.value))
    if (condition.operator === 'greater_than') return Number(current) > Number(condition.value)
    if (condition.operator === 'less_than') return Number(current) < Number(condition.value)
    return false
  })
}

export function matchesTrigger(flow: AutomationFlow, event: AutomationEvent) {
  if (!flow.isEnabled || flow.status !== 'published') return false

  return flow.triggers.some(trigger => {
    if (trigger.triggerType !== event.type) return false
    if (trigger.config.stageId && trigger.config.stageId !== event.stageId) return false
    if (trigger.config.status && trigger.config.status !== event.status) return false
    return true
  })
}

export function sortActions(actions: AutomationAction[]) {
  return [...actions].sort((left, right) => left.orderIndex - right.orderIndex)
}
