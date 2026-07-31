import { automationTriggerCatalog } from './automationCatalog'
import type {
  AutomationCatalogTrigger,
  AutomationRiskAssessment,
  AutomationValidationResult,
  IntelligentAutomationAction,
} from '@/types/intelligentAutomation'

const DEFAULT_TRIGGER_MODULE = 'crm'
const SECRET_KEY_PARTS = ['token', 'secret', 'password', 'api_key', 'apikey', 'authorization']

export function normalizeAutomationTrigger(triggerType: string): AutomationCatalogTrigger {
  return automationTriggerCatalog.find(trigger => trigger.key === triggerType) || {
    key: triggerType,
    module: DEFAULT_TRIGGER_MODULE,
    label: triggerType,
    payloadSchema: {},
  }
}

export function validateAutomationAction(
  action: Pick<IntelligentAutomationAction, 'actionType' | 'payload'>,
): AutomationValidationResult {
  if (action.actionType === 'send_email' && action.payload.emailKind === 'marketing' && !action.payload.consentPolicy) {
    return { ok: false, reason: 'marketing_email_requires_consent_policy' }
  }

  if (action.actionType === 'send_whatsapp' && !action.payload.body && !action.payload.templateId) {
    return { ok: false, reason: 'whatsapp_message_requires_body_or_template' }
  }

  if (action.actionType.startsWith('ai_') && action.payload.sendAutomatically === true) {
    return { ok: false, reason: 'ai_automatic_send_requires_human_approval' }
  }

  return { ok: true }
}

export function estimateAutomationRisk(
  actions: Array<Pick<IntelligentAutomationAction, 'actionType' | 'orderIndex' | 'payload'>>,
): AutomationRiskAssessment {
  const reasons = new Set<string>()

  if (actions.some(action => action.actionType.startsWith('ai_') && action.payload.sendAutomatically === true)) {
    reasons.add('automatic_ai_action')
  }

  if (actions.some(action => ['send_email', 'send_whatsapp', 'convert_proposal'].includes(action.actionType))) {
    reasons.add('external_or_commercial_action')
  }

  if (actions.some(action => action.actionType === 'webhook' || action.actionType === 'call_api')) {
    reasons.add('external_integration_action')
  }

  const reasonList = Array.from(reasons)
  const level = reasonList.includes('automatic_ai_action') ? 'high' : reasonList.length ? 'medium' : 'low'

  return { level, requiresHumanApproval: level === 'high', reasons: reasonList }
}

export function canPublishAutomation(input: {
  status: string
  triggers: unknown[]
  conditions: unknown[]
  actions: Array<Pick<IntelligentAutomationAction, 'actionType' | 'orderIndex' | 'payload'>>
}): AutomationValidationResult {
  if (input.status === 'archived') return { ok: false, reason: 'archived_automation_cannot_be_published' }
  if (!input.triggers.length) return { ok: false, reason: 'automation_requires_trigger' }
  if (!input.actions.length) return { ok: false, reason: 'automation_requires_action' }

  const invalidAction = input.actions.map(validateAutomationAction).find(result => !result.ok)
  if (invalidAction) return invalidAction

  const risk = estimateAutomationRisk(input.actions)
  if (risk.requiresHumanApproval) return { ok: false, reason: 'automation_requires_human_approval' }

  return { ok: true }
}

export function sanitizeAutomationRunPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAutomationRunPayload)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    const normalizedKey = key.toLowerCase()
    const shouldRedact = SECRET_KEY_PARTS.some(secretKey => normalizedKey.includes(secretKey))
    return [key, shouldRedact ? '[redacted]' : sanitizeAutomationRunPayload(entry)]
  }))
}
