export interface SectorTemplate {
  key: string
  label: string
  description: string
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

export function getSectorTemplate(key: string): SectorTemplate | undefined {
  return sectorTemplateCatalog.find(t => t.key === key)
}
