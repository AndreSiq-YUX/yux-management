import { ids, uid } from './ids'
import { daysAgo, daysFromNow, hoursAgo } from './time'
import { leads, tasks } from './crm'
import type { MockRoute } from './types'

/* ------------------------------ Automacoes ------------------------------ */

const flowDefs: Array<[string, string, string, string, boolean, string]> = [
  ['Boas-vindas ao novo lead', 'lead.created', 'send_whatsapp', 'published', true, 'low'],
  ['Follow-up de orçamento sem resposta', 'lead.stage_changed', 'create_task', 'published', true, 'low'],
  ['Lembrete de consulta 24h antes', 'lead.stage_changed', 'send_email', 'published', true, 'low'],
  ['Reativação de pacientes inativos', 'lead.status_changed', 'send_whatsapp', 'paused', false, 'medium'],
  ['Pós-atendimento e pedido de avaliação', 'conversation.handoff', 'send_email', 'draft', false, 'low'],
]

const runStatuses = ['completed', 'completed', 'failed', 'completed', 'processing', 'skipped', 'completed', 'queued']

export const flows = flowDefs.map(([name, trigger, action, status, enabled, risk], index) => ({
  id: uid('flow', index + 1),
  organizationId: ids.organization,
  name,
  description: `Automação "${name}" para a operação da clínica.`,
  status,
  isEnabled: enabled,
  automationKind: 'flow',
  builderMode: 'guided',
  publishedVersion: status === 'draft' ? 0 : 3,
  dailyRunLimit: 500,
  allowReentry: false,
  reentryCooldownMinutes: 0,
  requiresHumanApproval: risk === 'medium',
  riskLevel: risk,
  lastError: status === 'paused' ? 'Pausada manualmente pela clínica.' : undefined,
  triggers: [{ id: uid('trigger', index + 1), triggerType: trigger, config: {} }],
  conditions: [{ id: uid('cond', index + 1), field: 'lead.source', operator: 'exists' }],
  actions: [{ id: uid('action', index + 1), actionType: action, orderIndex: 0, payload: { template: 'padrao' } }],
  executionRuns: Array.from({ length: 4 }, (_, run) => ({
    id: uid('flow-run', index * 10 + run),
    organizationId: ids.organization,
    status: runStatuses[(index + run) % runStatuses.length],
    eventType: trigger,
    leadId: leads[(index + run) % leads.length].id,
    lastError: runStatuses[(index + run) % runStatuses.length] === 'failed' ? 'Número de WhatsApp sem consentimento.' : undefined,
    startedAt: hoursAgo(2 + run * 7 + index * 3),
    completedAt: hoursAgo(1 + run * 7 + index * 3),
  })),
  createdAt: daysAgo(90 - index * 8),
  updatedAt: daysAgo(index + 1),
}))

const sequences = [
  { id: uid('aseq', 1), organizationId: ids.organization, name: 'Nutrição pós-avaliação', description: '4 toques em 10 dias.', channel: 'mixed', status: 'active', conversionGoal: 'Fechar tratamento', activeEnrollmentCount: 12, convertedEnrollmentCount: 5,
    steps: [
      { id: uid('astep', 1), sequenceId: uid('aseq', 1), orderIndex: 0, stepKind: 'message', channel: 'whatsapp', body: 'Olá! Conseguiu avaliar o plano?', delayMinutes: 1440, requiresHumanApproval: false, isActive: true },
      { id: uid('astep', 2), sequenceId: uid('aseq', 1), orderIndex: 1, stepKind: 'message', channel: 'email', subject: 'Seu plano de tratamento', body: 'Resumo do plano.', delayMinutes: 4320, requiresHumanApproval: false, isActive: true },
    ] },
  { id: uid('aseq', 2), organizationId: ids.organization, name: 'Reativação de inativos', channel: 'whatsapp', status: 'paused', activeEnrollmentCount: 0, convertedEnrollmentCount: 3, steps: [] },
]

/* ------------------------------ Tarefas (work-items) ------------------------------ */

const workItems = tasks.filter(task => task.status === 'pending').map((task, index) => ({
  sourceType: index % 4 === 3 ? 'project_task' : 'crm_task',
  sourceId: task.id,
  title: task.title,
  status: index % 5 === 4 ? 'awaiting_approval' : 'pending',
  dueAt: task.dueAt,
  assigneeId: ids.user,
  missionId: null,
  organizationId: ids.organization,
  version: '1',
}))

/* ------------------------------ Missoes ------------------------------ */

const missionDefs: Array<[string, string, string, string]> = [
  ['Recuperar orçamentos sem resposta', 'active', 'assisted', 'Retomar contato com pacientes que receberam orçamento e não responderam.'],
  ['Campanha de implantes — outubro', 'pending_plan_approval', 'prepare', 'Planejar e lançar campanha de captação de implantes.'],
  ['Nutrir leads frios com conteúdo', 'succeeded', 'assisted', 'Sequência de conteúdo educativo para leads frios.'],
]

export const missions = missionDefs.map(([title, status, mode, objective], index) => ({
  id: uid('mission', index + 1),
  organizationId: ids.organization,
  contractId: ids.contract,
  packVersionId: uid('pack-version', 1),
  status,
  mode,
  title,
  objective,
  goal: { statement: objective, requestedOutcome: 'Aumentar conversões', scopeHints: [], constraints: {}, acceptanceCriteria: [{ key: 'revenue', operator: 'gte', target: '25000', unit: 'BRL' }] },
  autonomyEnvelope: { mode, allowedModules: ['crm', 'whatsapp_ai'], allowedCapabilityKeys: [], maxTotalCostBrl: '800.00', maxHumanHours: '10', expiresAt: daysFromNow(30), alwaysRequireApprovalFor: ['send_whatsapp'] },
  packSelection: {},
  parameters: { targetRevenueBrl: '25000.00', deadlineDays: 30, inactiveDays: 14, canarySize: 10, maxPopulation: 200, maxTotalCostBrl: '800.00', maxHumanHours: '10', minimumValueCostRatio: '3', channels: ['whatsapp', 'email'] },
  budget: {},
  deadlineAt: daysFromNow(20 - index * 6),
  version: 3,
  createdBy: ids.user,
  createdAt: daysAgo(14 - index * 4),
  updatedAt: daysAgo(index),
}))

const conversations = [
  {
    id: uid('mconv', 1), organizationId: ids.organization, contractId: ids.contract, missionId: missions[0].id, status: 'converted',
    title: 'Recuperar orçamentos sem resposta', currentBrief: { title: 'Recuperar orçamentos', objective: 'Retomar orçamentos parados' }, briefHash: 'hash1',
    contextReadiness: { status: 'ready_for_plan' }, version: 4, createdBy: ids.user, createdAt: daysAgo(14), updatedAt: daysAgo(12), completedAt: daysAgo(12),
    messages: [
      { id: uid('mmsg', 1), organizationId: ids.organization, conversationId: uid('mconv', 1), sequence: 1, actorType: 'user', messageKind: 'text', content: 'Quero retomar os orçamentos de implante que ficaram sem resposta.', structuredPayload: {}, sourceRefs: [], createdAt: daysAgo(14) },
    ],
  },
  {
    id: uid('mconv', 2), organizationId: ids.organization, contractId: ids.contract, status: 'awaiting_user',
    title: 'Campanha de clareamento de verão', currentBrief: { title: 'Campanha de clareamento' }, briefHash: 'hash2',
    contextReadiness: { status: 'needs_information' }, version: 2, createdBy: ids.user, createdAt: daysAgo(1), updatedAt: hoursAgo(5),
    messages: [
      { id: uid('mmsg', 2), organizationId: ids.organization, conversationId: uid('mconv', 2), sequence: 1, actorType: 'user', messageKind: 'text', content: 'Quero uma campanha de clareamento para o verão.', structuredPayload: {}, sourceRefs: [], createdAt: daysAgo(1) },
      { id: uid('mmsg', 3), organizationId: ids.organization, conversationId: uid('mconv', 2), sequence: 2, actorType: 'agent', messageKind: 'question', content: 'Qual o orçamento mensal para anúncios?', structuredPayload: {}, sourceRefs: [], createdAt: hoursAgo(5) },
    ],
  },
]

export const operationsRoutes: MockRoute[] = [
  { method: 'GET', path: '/automations/flows', respond: () => flows },
  { method: 'GET', path: /^\/automations\/flows\/[^/]+\/executions$/, respond: () => [] },
  { method: 'GET', path: '/automations/sequences', respond: () => sequences },
  { method: 'GET', path: '/workspace/work-items', respond: () => ({ items: workItems }) },
  { method: 'GET', path: '/action-engine/missions', respond: () => missions },
  { method: 'GET', path: /^\/action-engine\/missions\/([^/]+)$/, respond: ({ params }) => missions.find(mission => mission.id === params[0]) ?? missions[0] },
  { method: 'GET', path: '/action-engine/mission-conversations', respond: () => conversations },
  { method: 'GET', path: /^\/action-engine\/mission-conversations\/([^/]+)$/, respond: ({ params }) => conversations.find(item => item.id === params[0]) ?? conversations[0] },
  { method: 'GET', path: /^\/action-engine\/missions\/[^/]+\/economics$/, respond: () => ({ producedValueBrl: '18400.00', totalExecutionCostBrl: '420.00', netValueBrl: '17980.00', valueCostRatio: '43.8', valuePerHumanHourBrl: '920.00', humanFreeExecutionRate: '0.62' }) },
  { method: 'GET', path: '/action-engine/action-packs', respond: () => [] },
  { method: 'GET', path: '/action-engine/mission-recipes', respond: () => [] },
]
