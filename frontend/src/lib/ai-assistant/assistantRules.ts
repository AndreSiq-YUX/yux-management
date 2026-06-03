import type { AiAssistantDecisionContext, AiAssistantSettings } from '@/types/aiAssistant'

const normalized = (value: string) => value.trim().toLowerCase()

export function getMissingCollectedFields(collectedFields: string[], requiredFields: string[]) {
  const collected = new Set(collectedFields.map(normalized))
  return requiredFields.filter(field => !collected.has(normalized(field)))
}

function matchesExpected(value: unknown, expected: unknown) {
  if (expected === undefined || expected === null || expected === '') return true
  if (Array.isArray(expected)) return expected.map(String).map(normalized).includes(normalized(String(value || '')))
  return normalized(String(value || '')) === normalized(String(expected))
}

export function shouldHandoffToHuman(context: AiAssistantDecisionContext, settings: Pick<AiAssistantSettings, 'handoffRules'>) {
  return settings.handoffRules.some(rule => {
    if (!rule.isEnabled) return false
    if (rule.minConfidence !== undefined && (context.confidence ?? 0) < rule.minConfidence) return false

    if (rule.ruleType === 'human_request') return Boolean(context.humanRequested || rule.conditions.humanRequested)
    if (rule.ruleType === 'low_confidence') return (context.confidence ?? 1) <= Number(rule.conditions.threshold ?? 0.5)
    if (rule.ruleType === 'missing_required_field') return Boolean(context.missingFields?.length)
    if (rule.ruleType === 'safety') return Boolean(context.safetyTriggered)

    return matchesExpected(context.sentiment, rule.conditions.sentiment)
      && matchesExpected(context.intent, rule.conditions.intent)
  })
}

export function buildAssistantRunMetadata(settings?: AiAssistantSettings | null) {
  if (!settings) return { assistantConfigured: false }

  return {
    assistantConfigured: true,
    assistantId: settings.id,
    name: settings.name,
    tone: settings.tone,
    objectives: settings.objectives.map(objective => objective.label),
    requiredFields: settings.requiredFields.map(field => field.fieldKey),
    handoffRules: settings.handoffRules.filter(rule => rule.isEnabled).map(rule => rule.name),
    safetyRules: settings.safetyRules.filter(rule => rule.isEnabled).map(rule => rule.name),
    knowledgeLinks: settings.knowledgeLinks.map(link => link.title),
    summaryEnabled: settings.summaryEnabled,
    classificationEnabled: settings.classificationEnabled,
  }
}
