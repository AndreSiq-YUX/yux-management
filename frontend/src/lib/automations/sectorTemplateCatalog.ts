export interface SectorTemplate {
  key: string
  label: string
  description: string
  objectiveKey?: string
  moduleKey?: string
  channel?: string
  portalVisible?: boolean
  requiredModuleKeys?: string[]
  triggers: Array<{ triggerType: string; config: Record<string, unknown> }>
  conditions: Array<{ field: string; operator: string; value?: unknown }>
  actions: Array<{ actionType: string; payload: Record<string, unknown> }>
}

export const sectorTemplateCatalog: SectorTemplate[] = [
  {
    key: 'clinic',
    label: 'Clinica',
    description: 'Follow-up para pacientes apos consulta. Cria tarefa e envia WhatsApp.',
    triggers: [{ triggerType: 'lead.stage_changed', config: {} }],
    conditions: [{ field: 'source', operator: 'equals', value: 'clinic' }],
    actions: [
      { actionType: 'create_task', payload: { title: 'Follow-up pos-consulta', description: 'Verificar satisfacao do paciente' } },
      { actionType: 'send_whatsapp', payload: { body: 'Ola! Como esta se sentindo apos a consulta?' } },
    ],
  },
  {
    key: 'real_estate',
    label: 'Imobiliaria',
    description: 'Lead de imovel visitado. Cria tarefa para corretor e registra atividade.',
    triggers: [{ triggerType: 'lead.stage_changed', config: {} }],
    conditions: [{ field: 'source', operator: 'equals', value: 'real_estate' }],
    actions: [
      { actionType: 'create_task', payload: { title: 'Contato pos-visita', description: 'Ligar para o lead em 24h' } },
      { actionType: 'register_activity', payload: { activityType: 'property_visit', description: 'Visita realizada' } },
    ],
  },
  {
    key: 'dealer',
    label: 'Revenda',
    description: 'Lead de test-drive. Atribui responsavel e envia WhatsApp com catalogo.',
    triggers: [{ triggerType: 'lead.created', config: {} }],
    conditions: [{ field: 'source', operator: 'equals', value: 'dealer' }],
    actions: [
      { actionType: 'assign_owner', payload: { ownerId: 'sales-team' } },
      { actionType: 'send_whatsapp', payload: { body: 'Obrigado pelo interesse! Segue nosso catalogo de veiculos.' } },
    ],
  },
  {
    key: 'workshop',
    label: 'Oficina',
    description: 'Servico concluido. Cria tarefa de follow-up e envia WhatsApp.',
    triggers: [{ triggerType: 'lead.stage_changed', config: {} }],
    conditions: [{ field: 'source', operator: 'equals', value: 'workshop' }],
    actions: [
      { actionType: 'create_task', payload: { title: 'Follow-up pos-servico', description: 'Ligar em 7 dias' } },
      { actionType: 'send_whatsapp', payload: { body: 'Seu veiculo esta pronto! Quando pode retirar?' } },
    ],
  },
  {
    key: 'agency',
    label: 'Agencia',
    description: 'Lead de proposta. Cria tarefa comercial e registra atividade.',
    triggers: [{ triggerType: 'proposal.approved', config: {} }],
    conditions: [],
    actions: [
      { actionType: 'create_task', payload: { title: 'Iniciar onboarding', description: 'Enviar contrato e agendar kickoff' } },
      { actionType: 'register_activity', payload: { activityType: 'proposal_approved', description: 'Proposta aprovada pelo cliente' } },
    ],
  },
]

export const automationObjectiveTemplates: SectorTemplate[] = [
  {
    key: 'objective:new_lead_response',
    label: 'Responder lead novo',
    description: 'Quando um lead entra, responder pelo canal principal, criar tarefa e registrar atividade.',
    objectiveKey: 'new_lead_response',
    moduleKey: 'automations',
    channel: 'crm',
    portalVisible: true,
    requiredModuleKeys: ['crm', 'automations'],
    triggers: [{ triggerType: 'lead.created', config: {} }],
    conditions: [],
    actions: [
      { actionType: 'create_task', payload: { title: 'Responder lead novo', description: 'Contato inicial em ate 15 minutos' } },
      { actionType: 'register_activity', payload: { activityType: 'new_lead_response', description: 'Resposta inicial planejada' } },
    ],
  },
  {
    key: 'objective:proposal_follow_up',
    label: 'Follow-up de proposta',
    description: 'Acompanhar proposta visualizada ou enviada e criar proxima acao comercial.',
    objectiveKey: 'proposal_follow_up',
    moduleKey: 'automations',
    channel: 'email',
    portalVisible: true,
    requiredModuleKeys: ['crm', 'automations'],
    triggers: [{ triggerType: 'proposal.viewed', config: {} }],
    conditions: [{ field: 'status', operator: 'not_equals', value: 'won' }],
    actions: [
      { actionType: 'create_task', payload: { title: 'Follow-up de proposta', description: 'Entrar em contato sobre a proposta aberta' } },
      { actionType: 'send_email', payload: { subject: 'Podemos seguir com a proposta?', body: 'Oi, queria confirmar se ficou alguma duvida sobre a proposta.' } },
    ],
  },
  {
    key: 'objective:reactivate_client',
    label: 'Reativar cliente',
    description: 'Encontrar contatos sem atividade recente e iniciar abordagem de retorno.',
    objectiveKey: 'reactivate_client',
    moduleKey: 'automations',
    channel: 'whatsapp',
    portalVisible: true,
    requiredModuleKeys: ['crm', 'automations'],
    triggers: [{ triggerType: 'lead.stage_changed', config: {} }],
    conditions: [{ field: 'days_in_stage', operator: 'greater_than', value: 30 }],
    actions: [
      { actionType: 'send_whatsapp', payload: { body: 'Ola! Podemos retomar sua avaliacao?' } },
      { actionType: 'create_task', payload: { title: 'Reativar lead parado', description: 'Revisar historico antes do contato' } },
    ],
  },
  {
    key: 'objective:confirm_appointment',
    label: 'Confirmar agendamento',
    description: 'Enviar lembrete e preparar handoff quando uma reuniao ou visita for marcada.',
    objectiveKey: 'confirm_appointment',
    moduleKey: 'automations',
    channel: 'whatsapp',
    portalVisible: true,
    requiredModuleKeys: ['crm', 'automations'],
    triggers: [{ triggerType: 'appointment.scheduled', config: {} }],
    conditions: [],
    actions: [
      { actionType: 'send_whatsapp', payload: { body: 'Confirmando nosso atendimento agendado. Posso ajudar com algo antes?' } },
      { actionType: 'register_activity', payload: { activityType: 'appointment_confirmation', description: 'Confirmacao automatica enviada' } },
    ],
  },
  {
    key: 'objective:remind_service',
    label: 'Lembrar atendimento',
    description: 'Gerar lembrete para atendimento pendente e manter SLA visivel.',
    objectiveKey: 'remind_service',
    moduleKey: 'automations',
    channel: 'crm',
    portalVisible: true,
    requiredModuleKeys: ['crm', 'automations'],
    triggers: [{ triggerType: 'conversation.unanswered', config: {} }],
    conditions: [],
    actions: [
      { actionType: 'create_task', payload: { title: 'Atendimento pendente', description: 'Responder conversa sem retorno' } },
      { actionType: 'register_activity', payload: { activityType: 'sla_reminder', description: 'Lembrete de SLA criado' } },
    ],
  },
  {
    key: 'objective:create_seller_task',
    label: 'Criar tarefa para vendedor',
    description: 'Transformar mudanca de etapa ou qualificacao em tarefa clara para o responsavel.',
    objectiveKey: 'create_seller_task',
    moduleKey: 'automations',
    channel: 'crm',
    portalVisible: true,
    requiredModuleKeys: ['crm', 'automations'],
    triggers: [{ triggerType: 'lead.stage_changed', config: {} }],
    conditions: [{ field: 'stage', operator: 'contains', value: 'qualificado' }],
    actions: [
      { actionType: 'create_task', payload: { title: 'Proxima acao comercial', description: 'Executar follow-up da etapa atual' } },
    ],
  },
  {
    key: 'objective:high_cpl_alert',
    label: 'Avisar campanha com CPL alto',
    description: 'Criar alerta quando a campanha ultrapassar o custo por lead esperado.',
    objectiveKey: 'high_cpl_alert',
    moduleKey: 'automations',
    channel: 'dashboard',
    portalVisible: false,
    requiredModuleKeys: ['campaigns', 'automations'],
    triggers: [{ triggerType: 'campaign.cpl_above_threshold', config: {} }],
    conditions: [{ field: 'cpl', operator: 'greater_than', value: 100 }],
    actions: [
      { actionType: 'create_task', payload: { title: 'Revisar campanha com CPL alto', description: 'Checar criativo, publico, budget e landing page' } },
    ],
  },
  {
    key: 'objective:creative_approval',
    label: 'Pedir aprovacao de criativo',
    description: 'Enviar tarefa de aprovacao quando um criativo estiver pronto para revisao.',
    objectiveKey: 'creative_approval',
    moduleKey: 'automations',
    channel: 'dashboard',
    portalVisible: true,
    requiredModuleKeys: ['projects', 'marketing_studio', 'automations'],
    triggers: [{ triggerType: 'creative.approval_requested', config: {} }],
    conditions: [],
    actions: [
      { actionType: 'create_task', payload: { title: 'Aprovar criativo', description: 'Revisar copy, imagem, canal e restricoes antes da publicacao' } },
    ],
  },
]

export function getSectorTemplate(key: string): SectorTemplate | undefined {
  return [...sectorTemplateCatalog, ...automationObjectiveTemplates].find(t => t.key === key)
}
