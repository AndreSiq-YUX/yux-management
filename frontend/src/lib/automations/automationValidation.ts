import type { AutomationAction, AutomationCondition, AutomationTrigger } from '@/types/automation'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export function validateTrigger(trigger: AutomationTrigger | null): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!trigger) {
    errors.push('Adicione pelo menos um trigger para iniciar a automação')
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function validateCondition(condition: AutomationCondition): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!condition.field) {
    errors.push('Campo é obrigatório')
  }

  if (!condition.operator) {
    errors.push('Operador é obrigatório')
  }

  if (condition.operator !== 'exists' && !condition.value && condition.value !== 0) {
    warnings.push('Valor não definido - a condição pode não funcionar como esperado')
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function validateAction(action: AutomationAction): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!action.actionType) {
    errors.push('Tipo de ação é obrigatório')
  }

  if (action.actionType === 'send_whatsapp' && !action.payload.body && !action.payload.templateId) {
    errors.push('WhatsApp requer corpo da mensagem ou template ID')
  }

  if (action.actionType === 'send_email' && !action.payload.body) {
    errors.push('Email requer corpo da mensagem')
  }

  if (action.actionType === 'send_email' && action.payload.emailKind === 'marketing' && !action.payload.consentPolicy) {
    errors.push('Email de marketing requer política de consentimento')
  }

  if (action.actionType.startsWith('ai_') && action.payload.sendAutomatically) {
    warnings.push('Ações de IA com envio automático requerem aprovação humana')
  }

  if (action.actionType === 'change_stage' && !action.payload.stageId) {
    errors.push('Mover etapa requer ID da etapa de destino')
  }

  if (action.actionType === 'assign_owner' && !action.payload.ownerId) {
    errors.push('Atribuir responsável requer ID do responsável')
  }

  if (action.actionType === 'webhook' && !action.payload.url) {
    errors.push('Webhook requer URL')
  }

  if (action.actionType === 'call_api' && !action.payload.url) {
    errors.push('Chamar API requer URL')
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function validateFlow(input: {
  triggers: AutomationTrigger[]
  conditions: AutomationCondition[]
  actions: AutomationAction[]
}): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (input.triggers.length === 0) {
    errors.push('Adicione pelo menos um trigger')
  }

  if (input.actions.length === 0) {
    errors.push('Adicione pelo menos uma ação')
  }

  input.conditions.forEach((condition, index) => {
    const result = validateCondition(condition)
    errors.push(...result.errors.map(e => `Condição ${index + 1}: ${e}`))
    warnings.push(...result.warnings.map(w => `Condição ${index + 1}: ${w}`))
  })

  input.actions.forEach((action, index) => {
    const result = validateAction(action)
    errors.push(...result.errors.map(e => `Ação ${index + 1}: ${e}`))
    warnings.push(...result.warnings.map(w => `Ação ${index + 1}: ${w}`))
  })

  const hasHighRiskAction = input.actions.some(
    a => a.actionType.startsWith('ai_') && a.payload.sendAutomatically
  )
  if (hasHighRiskAction) {
    warnings.push('Ações de IA com envio automático requerem aprovação humana antes de publicar')
  }

  return { valid: errors.length === 0, errors, warnings }
}
