import { ids, uid } from './ids'
import { registerTable } from './query'
import { daysAgo, daysFromNow, hoursAgo } from './time'
import type { MockRoute } from './types'

export const crmInstanceId = uid('crm-instance')
export const pipelineId = uid('pipeline', 1)
export const secondaryPipelineId = uid('pipeline', 2)

const stageDefs = [
  { key: 'new', name: 'Novo contato', color: '#6366f1' },
  { key: 'qualified', name: 'Qualificado', color: '#0ea5e9' },
  { key: 'evaluation', name: 'Avaliação agendada', color: '#14b8a6' },
  { key: 'proposal', name: 'Orçamento enviado', color: '#f59e0b' },
  { key: 'negotiation', name: 'Negociação', color: '#ec4899' },
  { key: 'won', name: 'Tratamento fechado', color: '#22c55e', isWon: true },
  { key: 'lost', name: 'Perdido', color: '#ef4444', isLost: true },
] as const

export const stages = stageDefs.map((stage, index) => ({
  id: uid('stage', index + 1),
  pipelineId,
  key: stage.key,
  name: stage.name,
  color: stage.color,
  orderIndex: index,
  isWon: 'isWon' in stage ? Boolean(stage.isWon) : false,
  isLost: 'isLost' in stage ? Boolean(stage.isLost) : false,
  isActive: true,
}))

export const pipelines = [
  {
    id: pipelineId,
    organizationId: ids.organization,
    crmInstanceId,
    name: 'Pacientes — Avaliação e tratamento',
    description: 'Do primeiro contato ao fechamento do tratamento.',
    isDefault: true,
    isActive: true,
    stages,
  },
  {
    id: secondaryPipelineId,
    organizationId: ids.organization,
    crmInstanceId,
    name: 'Convênios e empresas',
    description: 'Parcerias com empresas e planos odontológicos.',
    isDefault: false,
    isActive: true,
    stages: [
      { id: uid('stage-b', 1), pipelineId: secondaryPipelineId, key: 'new', name: 'Prospecção', color: '#6366f1', orderIndex: 0, isWon: false, isLost: false, isActive: true },
      { id: uid('stage-b', 2), pipelineId: secondaryPipelineId, key: 'proposal', name: 'Proposta', color: '#f59e0b', orderIndex: 1, isWon: false, isLost: false, isActive: true },
      { id: uid('stage-b', 3), pipelineId: secondaryPipelineId, key: 'won', name: 'Convênio ativo', color: '#22c55e', orderIndex: 2, isWon: true, isLost: false, isActive: true },
    ],
  },
]

const patients: Array<{
  name: string; company?: string; source: string; sourceKind: string; stage: number; value: number
  score: number; createdDaysAgo: number; followUp?: number; city: string; interest: string
  temperature: 'hot' | 'warm' | 'cold'; utmCampaign?: string
}> = [
  { name: 'Camila Rocha', source: 'Meta Ads', sourceKind: 'paid_campaign', stage: 0, value: 4200, score: 62, createdDaysAgo: 1, followUp: 0, city: 'São Paulo', interest: 'Clareamento', temperature: 'warm', utmCampaign: 'clareamento_out' },
  { name: 'Eduardo Martins', source: 'Landing page', sourceKind: 'landing_page', stage: 0, value: 9800, score: 55, createdDaysAgo: 2, followUp: 1, city: 'Guarulhos', interest: 'Implante unitário', temperature: 'warm' },
  { name: 'Patrícia Lima', source: 'Google Ads', sourceKind: 'paid_campaign', stage: 0, value: 6500, score: 48, createdDaysAgo: 3, followUp: -1, city: 'São Paulo', interest: 'Facetas de porcelana', temperature: 'cold' },
  { name: 'Rafael Nunes', source: 'WhatsApp', sourceKind: 'whatsapp_cta', stage: 1, value: 12500, score: 78, createdDaysAgo: 4, followUp: 0, city: 'Osasco', interest: 'Protocolo sobre implantes', temperature: 'hot' },
  { name: 'Juliana Prado', source: 'Indicação', sourceKind: 'referral', stage: 1, value: 3800, score: 71, createdDaysAgo: 6, followUp: 2, city: 'São Paulo', interest: 'Ortodontia invisível', temperature: 'hot' },
  { name: 'Marcos Tavares', source: 'Meta Ads', sourceKind: 'paid_campaign', stage: 1, value: 5600, score: 59, createdDaysAgo: 7, followUp: -2, city: 'Santo André', interest: 'Lentes de contato dental', temperature: 'warm', utmCampaign: 'lentes_set' },
  { name: 'Fernanda Alves', source: 'Landing page', sourceKind: 'landing_page', stage: 2, value: 7400, score: 84, createdDaysAgo: 9, followUp: 1, city: 'São Paulo', interest: 'Reabilitação oral', temperature: 'hot' },
  { name: 'Bruno Carvalho', source: 'Orgânico', sourceKind: 'organic', stage: 2, value: 2900, score: 66, createdDaysAgo: 10, followUp: 3, city: 'São Caetano', interest: 'Limpeza e avaliação', temperature: 'warm' },
  { name: 'Larissa Gomes', source: 'Meta Ads', sourceKind: 'paid_campaign', stage: 2, value: 8900, score: 73, createdDaysAgo: 11, followUp: 0, city: 'São Paulo', interest: 'Implante + coroa', temperature: 'hot', utmCampaign: 'implantes_out' },
  { name: 'Thiago Ribeiro', source: 'WhatsApp', sourceKind: 'whatsapp_cta', stage: 3, value: 15200, score: 88, createdDaysAgo: 13, followUp: -3, city: 'São Paulo', interest: 'Reabilitação total', temperature: 'hot' },
  { name: 'Beatriz Souza', source: 'Google Ads', sourceKind: 'paid_campaign', stage: 3, value: 6100, score: 69, createdDaysAgo: 15, followUp: 1, city: 'Diadema', interest: 'Ortodontia', temperature: 'warm' },
  { name: 'Gustavo Pires', source: 'Indicação', sourceKind: 'referral', stage: 3, value: 4300, score: 64, createdDaysAgo: 16, followUp: 4, city: 'São Paulo', interest: 'Prótese protocolo', temperature: 'warm' },
  { name: 'Aline Ferreira', source: 'Landing page', sourceKind: 'landing_page', stage: 4, value: 11800, score: 91, createdDaysAgo: 18, followUp: 0, city: 'São Paulo', interest: 'Full arch', temperature: 'hot' },
  { name: 'Diego Moreira', source: 'Meta Ads', sourceKind: 'paid_campaign', stage: 4, value: 5200, score: 74, createdDaysAgo: 20, followUp: 2, city: 'Barueri', interest: 'Lentes de resina', temperature: 'warm' },
  { name: 'Renata Cardoso', source: 'Orgânico', sourceKind: 'organic', stage: 5, value: 9400, score: 95, createdDaysAgo: 22, city: 'São Paulo', interest: 'Implantes', temperature: 'hot' },
  { name: 'Felipe Azevedo', source: 'Meta Ads', sourceKind: 'paid_campaign', stage: 5, value: 3600, score: 90, createdDaysAgo: 24, city: 'Santo André', interest: 'Clareamento', temperature: 'hot' },
  { name: 'Vanessa Duarte', source: 'Indicação', sourceKind: 'referral', stage: 5, value: 14100, score: 97, createdDaysAgo: 27, city: 'São Paulo', interest: 'Reabilitação oral', temperature: 'hot' },
  { name: 'Otávio Barros', source: 'Google Ads', sourceKind: 'paid_campaign', stage: 6, value: 5400, score: 35, createdDaysAgo: 19, city: 'Guarulhos', interest: 'Facetas', temperature: 'cold' },
  { name: 'Priscila Mendes', source: 'WhatsApp', sourceKind: 'whatsapp_cta', stage: 6, value: 2200, score: 28, createdDaysAgo: 26, city: 'São Paulo', interest: 'Limpeza', temperature: 'cold' },
  { name: 'Leandro Dias', source: 'Meta Ads', sourceKind: 'paid_campaign', stage: 0, value: 3100, score: 44, createdDaysAgo: 0, followUp: 0, city: 'São Paulo', interest: 'Avaliação geral', temperature: 'warm', utmCampaign: 'clareamento_out' },
  { name: 'Natália Freitas', source: 'Landing page', sourceKind: 'landing_page', stage: 1, value: 7200, score: 67, createdDaysAgo: 5, followUp: 1, city: 'Osasco', interest: 'Ortodontia invisível', temperature: 'warm' },
  { name: 'Henrique Lopes', source: 'Google Ads', sourceKind: 'paid_campaign', stage: 3, value: 8100, score: 70, createdDaysAgo: 28, followUp: -5, city: 'São Paulo', interest: 'Prótese sobre implante', temperature: 'warm' },
  { name: 'Carolina Melo', source: 'WhatsApp', sourceKind: 'whatsapp_cta', stage: 2, value: 4800, score: 61, createdDaysAgo: 12, followUp: 2, city: 'São Paulo', interest: 'Bruxismo e placa', temperature: 'warm' },
]

const companies = ['Construtora Alvorada', 'Escritório Moraes & Lima', 'Grupo Vila Nova', 'Padaria Estrela', 'Studio Bem-Estar', 'Colégio Horizonte', 'Transportes Rota 66', 'Farmácia Central']

const statusFor = (stageIndex: number) => (stageIndex === 5 ? 'won' : stageIndex === 6 ? 'lost' : 'open')

export const leads = patients.map((patient, index) => {
  const stage = stages[patient.stage]
  const created = daysAgo(patient.createdDaysAgo, index % 5)
  const slug = patient.name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/\s+/g, '.')
  return {
    id: uid('lead', index + 1),
    organizationId: ids.organization,
    crmInstanceId,
    pipelineId,
    stageId: stage.id,
    assignmentState: 'assigned',
    assignmentMode: 'round_robin',
    ownerMemberId: uid('member', (index % 2) + 1),
    name: patient.name,
    email: `${slug}@email.example`,
    phone: `(11) 9${String(7000 + index * 37).padStart(4, '0')}-${String(1000 + index * 91).slice(0, 4)}`,
    whatsappPhone: `(11) 9${String(7000 + index * 37).padStart(4, '0')}-${String(1000 + index * 91).slice(0, 4)}`,
    company: companies[index % companies.length] && index % 2 === 0 ? companies[index % companies.length] : undefined,
    source: patient.source,
    sourceKind: patient.sourceKind,
    status: statusFor(patient.stage),
    score: patient.score,
    fitScore: Math.min(100, patient.score + 4),
    intentScore: Math.max(0, patient.score - 6),
    value: patient.value,
    city: patient.city,
    state: 'SP',
    segment: 'Odontologia',
    interest: patient.interest,
    temperature: patient.temperature,
    urgency: patient.temperature === 'hot' ? 'high' : patient.temperature === 'warm' ? 'medium' : 'low',
    consentLgpd: true,
    whatsappOptIn: true,
    emailOptIn: index % 3 !== 0,
    notes: `Interesse em ${patient.interest.toLowerCase()}.`,
    wonAt: patient.stage === 5 ? daysAgo(Math.max(1, patient.createdDaysAgo - 6)) : undefined,
    lostAt: patient.stage === 6 ? daysAgo(Math.max(1, patient.createdDaysAgo - 4)) : undefined,
    lostReason: patient.stage === 6 ? 'Optou por outra clínica' : undefined,
    lastActivityAt: patient.stage < 5 && index % 7 === 3 ? daysAgo(12) : hoursAgo(2 + index * 5),
    nextFollowUpAt: patient.followUp === undefined ? undefined : daysFromNow(patient.followUp, 1),
    currentStageEnteredAt: daysAgo(Math.max(0, patient.createdDaysAgo - 2)),
    attributionContext: patient.utmCampaign
      ? { utmSource: patient.source.toLowerCase().replace(/\s/g, ''), utmMedium: 'paid', utmCampaign: patient.utmCampaign }
      : {},
    aiSummary: patient.temperature === 'hot' ? `${patient.name.split(' ')[0]} pediu valores e disponibilidade para esta semana.` : undefined,
    intent: patient.temperature === 'hot' ? 'agendar_avaliacao' : undefined,
    sentiment: 'positive',
    createdAt: created,
    updatedAt: hoursAgo(2 + index * 5),
  }
})

const taskTitles = [
  'Ligar para confirmar avaliação',
  'Enviar orçamento revisado',
  'Retornar mensagem no WhatsApp',
  'Confirmar documentos do convênio',
  'Agendar retorno pós-avaliação',
  'Enviar plano de tratamento',
  'Follow-up de proposta sem resposta',
  'Reativar paciente inativo',
  'Confirmar consulta de amanhã',
  'Enviar opções de parcelamento',
]

export const tasks = taskTitles.map((title, index) => {
  const lead = leads[(index * 2) % leads.length]
  const stage = stages.find(item => item.id === lead.stageId)
  const overdue = index < 3
  return {
    id: uid('task', index + 1),
    organizationId: ids.organization,
    leadId: lead.id,
    title,
    description: 'Registrar o resultado no histórico do lead.',
    status: index === 9 ? 'completed' : 'pending',
    priority: (['urgent', 'high', 'medium', 'medium', 'low'] as const)[index % 5],
    dueAt: overdue ? daysAgo(index + 1) : daysFromNow(index - 2, 3),
    completedAt: index === 9 ? daysAgo(1) : undefined,
    assignedTo: ids.user,
    leadName: lead.name,
    leadCompany: undefined,
    pipelineName: pipelines[0].name,
    stageName: stage?.name,
    assignedToName: index % 2 ? 'Mariana Costa' : 'Paulo Henrique',
  }
})

const instance = {
  id: crmInstanceId,
  organization_id: ids.organization,
  contract_id: ids.contract,
  status: 'active',
  sector_key: 'odontologia',
  seller_seat_limit: 5,
  manager_seat_limit: 2,
  admin_seat_limit: 2,
  max_pipeline_count: 3,
  max_custom_field_count: 20,
  max_automation_count: 10,
  allow_client_pipeline_customization: true,
  allow_client_field_customization: true,
  allow_client_category_customization: true,
  default_assignment_mode: 'round_robin',
  created_at: daysAgo(150),
  updated_at: daysAgo(10),
}

const members = [
  { id: uid('member', 1), crm_instance_id: crmInstanceId, user_id: ids.user, role: 'client_admin', status: 'active', display_name: 'Mariana Costa', email: 'mariana.costa@sorrisopleno.example', created_at: daysAgo(150), updated_at: daysAgo(150) },
  { id: uid('member', 2), crm_instance_id: crmInstanceId, user_id: uid('user', 2), role: 'seller', status: 'active', display_name: 'Paulo Henrique', email: 'paulo@sorrisopleno.example', created_at: daysAgo(140), updated_at: daysAgo(140) },
  { id: uid('member', 3), crm_instance_id: crmInstanceId, user_id: uid('user', 3), role: 'seller', status: 'invited', display_name: 'Aline Prado', email: 'aline@sorrisopleno.example', created_at: daysAgo(6), updated_at: daysAgo(6) },
]

registerTable('crm_instances', [instance])
registerTable('crm_instance_members', members)
registerTable('lead_next_actions', leads.filter(lead => lead.temperature === 'hot' && lead.status === 'open').slice(0, 4).map((lead, index) => ({
  id: uid('next-action', index),
  crm_instance_id: crmInstanceId,
  lead_id: lead.id,
  kind: (['respond_now', 'send_proposal', 'schedule_meeting', 'request_budget'] as const)[index],
  title: ['Responder agora', 'Enviar proposta', 'Agendar avaliação', 'Pedir orçamento anterior'][index],
  due_at: daysFromNow(index),
  completed_at: null,
})))
registerTable('lead_saved_views', [])
registerTable('lead_tags', [])
registerTable('lead_tag_assignments', [])
registerTable('lead_stage_history', [])
registerTable('lead_sources', [
  { id: uid('lead-source', 1), crm_instance_id: crmInstanceId, name: 'Meta Ads', kind: 'paid_campaign', created_at: daysAgo(100) },
  { id: uid('lead-source', 2), crm_instance_id: crmInstanceId, name: 'Landing page', kind: 'landing_page', created_at: daysAgo(100) },
  { id: uid('lead-source', 3), crm_instance_id: crmInstanceId, name: 'WhatsApp', kind: 'whatsapp_cta', created_at: daysAgo(100) },
])

const scoringModel = {
  id: uid('scoring-model'),
  crmInstanceId,
  name: 'Modelo Clínica — fit e intenção',
  fitWeight: 55,
  intentWeight: 45,
  thresholds: [30, 60, 80],
  isActive: true,
  createdAt: daysAgo(90),
  updatedAt: daysAgo(15),
}

const scoringRules = [
  { name: 'Procura por implante', dimension: 'fit', eventType: 'form.submitted', fieldPath: 'interest', operator: 'contains', comparisonValue: 'implante', points: 25 },
  { name: 'Mora a menos de 15 km', dimension: 'fit', eventType: 'lead.created', fieldPath: 'city', operator: 'exists', points: 10 },
  { name: 'Pediu orçamento', dimension: 'intent', eventType: 'lead.interaction_recorded', points: 20 },
  { name: 'Abriu proposta', dimension: 'intent', eventType: 'email.clicked', points: 15 },
  { name: 'Sem resposta há 7 dias', dimension: 'intent', eventType: 'lead.stage_changed', points: -15 },
].map((rule, index) => ({ id: uid('scoring-rule', index), modelId: scoringModel.id, isActive: true, ...rule }))

const sequences = [
  {
    id: uid('sequence', 1), organization_id: ids.organization, name: 'Reativação pós-orçamento', description: 'Três toques em 7 dias.', is_active: true,
    crm_sequence_steps: [
      { id: uid('seq-step', 1), sequence_id: uid('sequence', 1), action_type: 'whatsapp', delay_minutes: 1440, subject: null, body: 'Olá! Conseguiu avaliar o orçamento?', order_index: 0, is_active: true },
      { id: uid('seq-step', 2), sequence_id: uid('sequence', 1), action_type: 'email', delay_minutes: 4320, subject: 'Seu plano de tratamento', body: 'Segue o resumo do plano.', order_index: 1, is_active: true },
    ],
  },
]

export const crmRoutes: MockRoute[] = [
  { method: 'GET', path: '/crm/pipelines', respond: () => pipelines },
  {
    method: 'GET',
    path: '/crm/leads',
    respond: ({ query }) => {
      const pipeline = query.get('pipelineId')
      return pipeline && pipeline !== pipelineId ? [] : leads
    },
  },
  {
    method: 'GET',
    path: '/crm/tasks',
    respond: ({ query }) => {
      const status = query.get('status')
      const items = status ? tasks.filter(task => task.status === status) : tasks
      return { items, total: items.length }
    },
  },
  { method: 'GET', path: '/crm/sequences', respond: () => sequences },
  { method: 'GET', path: /^\/crm\/leads\/[^/]+\/interactions$/, respond: () => [] },
  { method: 'GET', path: /^\/crm\/leads\/[^/]+\/tasks$/, respond: () => [] },
  { method: 'GET', path: /^\/crm\/leads\/[^/]+\/enrollments$/, respond: () => [] },
  { method: 'GET', path: /^\/crm\/leads\/[^/]+\/executions$/, respond: () => [] },
  { method: 'GET', path: /^\/crm\/leads\/[^/]+\/score-events$/, respond: () => [] },
  {
    method: 'GET',
    path: '/crm/governance-context',
    respond: () => ({
      instance: {
        id: instance.id, organizationId: instance.organization_id, contractId: instance.contract_id, status: 'active',
        sectorKey: 'odontologia', sellerSeatLimit: 5, managerSeatLimit: 2, adminSeatLimit: 2, maxPipelineCount: 3,
        maxCustomFieldCount: 20, maxAutomationCount: 10, allowClientPipelineCustomization: true,
        allowClientFieldCustomization: true, allowClientCategoryCustomization: true, defaultAssignmentMode: 'round_robin',
        createdAt: instance.created_at, updatedAt: instance.updated_at,
      },
      currentMember: {
        id: members[0].id, crmInstanceId, userId: ids.user, role: 'client_admin', status: 'active',
        displayName: 'Mariana Costa', email: 'mariana.costa@sorrisopleno.example', createdAt: members[0].created_at, updatedAt: members[0].updated_at,
      },
      members: members.map(member => ({
        id: member.id, crmInstanceId, userId: member.user_id, role: member.role, status: member.status,
        displayName: member.display_name, email: member.email, createdAt: member.created_at, updatedAt: member.updated_at,
      })),
      teams: [{ id: uid('team', 1), crmInstanceId, name: 'Comercial — Recepção', description: 'Time de pré-venda', assignmentMode: 'round_robin', isActive: true, createdAt: daysAgo(100), updatedAt: daysAgo(100) }],
      teamMemberships: [
        { id: uid('team-member', 1), teamId: uid('team', 1), memberId: members[1].id, role: 'seller', createdAt: daysAgo(100) },
      ],
    }),
  },
  { method: 'GET', path: '/crm/scoring/model', respond: () => ({ model: scoringModel, rules: scoringRules }) },
]
