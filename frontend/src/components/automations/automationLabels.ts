import { automationTriggerCatalog } from '@/lib/automations/automationCatalog'
import type { AutomationAction, AutomationCondition, AutomationExecutionRun, AutomationFlow, AutomationRunStatus } from '@/types/automation'
import type { StatusChipVariant } from '@/components/portal-ui'

/** Textos em português para o Portal do Cliente (glossário: gatilho, condição, ação, modo de teste). */

export function triggerLabel(triggerType: string) {
  return automationTriggerCatalog.find(trigger => trigger.key === triggerType)?.label ?? triggerType
}

const operatorLabels: Record<string, string> = {
  equals: 'é igual a',
  not_equals: 'é diferente de',
  contains: 'contém',
  greater_than: 'é maior que',
  less_than: 'é menor que',
  exists: 'existe',
}

const fieldLabels: Record<string, string> = {
  source: 'Origem do lead',
  stage: 'Etapa do funil',
  status: 'Situação',
  owner: 'Responsável',
  temperature: 'Temperatura',
  value: 'Valor da proposta',
  days_in_stage: 'Dias na etapa',
  email: 'E-mail',
  phone: 'Telefone',
  company: 'Empresa',
  cpl: 'Custo por lead (CPL)',
}

const actionLabels: Record<string, string> = {
  create_task: 'Criar tarefa',
  change_stage: 'Mover de etapa',
  assign_owner: 'Atribuir responsável',
  update_field: 'Atualizar campo',
  register_activity: 'Registrar atividade',
  send_whatsapp: 'Enviar WhatsApp',
  send_email: 'Enviar e-mail',
  create_ticket: 'Criar chamado',
  webhook: 'Enviar dados a outro sistema',
  call_api: 'Consultar outro sistema',
  ai_classify_lead: 'Classificar lead com IA',
  ai_generate_message: 'Gerar mensagem com IA',
  ai_generate_proposal: 'Gerar proposta com IA',
}

export function describeCondition(condition: AutomationCondition) {
  const field = fieldLabels[condition.field] ?? condition.field
  const operator = operatorLabels[condition.operator] ?? condition.operator
  const value = condition.value === undefined || condition.value === null || condition.value === '' ? '' : ` ${String(condition.value)}`
  return `${field} ${operator}${value}`
}

export function describeAction(action: AutomationAction) {
  const label = actionLabels[action.actionType] ?? action.actionType
  const detail = [action.payload?.title, action.payload?.subject, action.payload?.body]
    .find(value => typeof value === 'string' && value.trim().length > 0)
  const text = typeof detail === 'string' ? ` · ${detail.length > 60 ? `${detail.slice(0, 57)}…` : detail}` : ''
  return `${action.orderIndex}. ${label}${text}`
}

export function isRunInProgress(run: AutomationExecutionRun) {
  return run.status === 'processing' || run.status === 'queued'
}

export const runStatusLabel: Record<AutomationRunStatus, string> = {
  queued: 'Na fila',
  processing: 'Em andamento',
  completed: 'Concluída',
  failed: 'Falhou',
  skipped: 'Ignorada',
}

export const runStatusVariant: Record<AutomationRunStatus, StatusChipVariant> = {
  queued: 'neutral',
  // Em andamento = a automação (YUX) está trabalhando.
  processing: 'yux',
  completed: 'ok',
  failed: 'crit',
  skipped: 'neutral',
}

export const objectiveChannelLabel: Record<string, string> = {
  crm: 'Comercial',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  dashboard: 'Painel',
}

export function flowStatus(flow: AutomationFlow): { label: string; variant: StatusChipVariant } {
  if (flow.status === 'failed') return { label: 'Com falha', variant: 'crit' }
  if (flow.status === 'draft') return { label: 'Rascunho', variant: 'neutral' }
  if (flow.status === 'archived') return { label: 'Arquivado', variant: 'neutral' }
  if (flow.isEnabled) return { label: 'Ativo', variant: 'ok' }
  return { label: 'Pausado', variant: 'warn' }
}
