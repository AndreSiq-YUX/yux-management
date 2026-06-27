import type {
  CampaignPlanStepKey,
  GrowthTemplate,
  GrowthTemplateCoverage,
  GrowthTemplateFilter,
  GrowthTemplateKind,
  GrowthTemplateModule,
} from '@/types/growthWorkspace'

const allSectors = ['clinic', 'real_estate', 'dealer', 'workshop', 'agency', 'retail', 'services', 'education']

export const growthTemplateCatalog: GrowthTemplate[] = [
  {
    id: 'campaign:lead-generation-360',
    label: 'Campanha 360 de geracao de leads',
    description: 'Plano completo com segmento, landing page, criativos, anuncio, follow-up, automacao e relatorio.',
    kind: 'campaign',
    moduleKey: 'campaigns',
    sectorKeys: allSectors,
    objectiveKeys: ['lead_generation', 'service_launch'],
    channels: ['meta_ads', 'google_ads', 'landing_page', 'whatsapp', 'dashboard'],
    requiredModuleKeys: ['campaigns', 'landing_pages', 'crm', 'automations', 'bi_reports'],
    portalVisible: true,
    recommendedForCampaignStepKeys: ['segment', 'landing_page', 'creative', 'ad', 'automation', 'report'],
  },
  {
    id: 'landing_page:offer-capture',
    label: 'Landing page de captura',
    description: 'Pagina de oferta com promessa, formulario, UTM e orientacao para aprovacao.',
    kind: 'landing_page',
    moduleKey: 'landing_pages',
    sectorKeys: allSectors,
    objectiveKeys: ['lead_generation', 'appointment_booking', 'offer_promotion'],
    channels: ['landing_page', 'meta_ads', 'google_ads'],
    requiredModuleKeys: ['landing_pages', 'crm'],
    portalVisible: true,
    recommendedForCampaignStepKeys: ['landing_page', 'form'],
  },
  {
    id: 'post:organic-support',
    label: 'Post organico de apoio',
    description: 'Post para reforcar a oferta nos canais sociais e reaproveitar criativos aprovados.',
    kind: 'post',
    moduleKey: 'marketing_studio',
    sectorKeys: allSectors,
    objectiveKeys: ['offer_promotion', 'service_launch', 'remarketing'],
    channels: ['instagram', 'facebook'],
    requiredModuleKeys: ['marketing_studio'],
    portalVisible: true,
    recommendedForCampaignStepKeys: ['organic_post', 'creative'],
  },
  {
    id: 'paid_ad:meta-lead',
    label: 'Anuncio Meta para leads',
    description: 'Estrutura de anuncio com criativo, copy, publico, budget e destino configuravel.',
    kind: 'paid_ad',
    moduleKey: 'campaigns',
    sectorKeys: allSectors,
    objectiveKeys: ['lead_generation', 'whatsapp_capture', 'remarketing'],
    channels: ['meta_ads', 'instagram', 'facebook'],
    requiredModuleKeys: ['campaigns', 'marketing_studio'],
    portalVisible: true,
    recommendedForCampaignStepKeys: ['ad', 'creative'],
  },
  {
    id: 'whatsapp_message:new-lead',
    label: 'Mensagem WhatsApp para lead novo',
    description: 'Primeira resposta com contexto da campanha, pergunta de qualificacao e proxima acao.',
    kind: 'whatsapp_message',
    moduleKey: 'whatsapp_ai',
    sectorKeys: allSectors,
    objectiveKeys: ['whatsapp_capture', 'follow_up', 'appointment_booking'],
    channels: ['whatsapp'],
    requiredModuleKeys: ['whatsapp_ai', 'crm'],
    portalVisible: true,
    recommendedForCampaignStepKeys: ['whatsapp_or_email_followup'],
  },
  {
    id: 'email:proposal-follow-up',
    label: 'E-mail de follow-up de proposta',
    description: 'Sequencia curta para lembrar proposta aberta e criar tarefa comercial quando nao houver resposta.',
    kind: 'email',
    moduleKey: 'marketing_studio',
    sectorKeys: allSectors,
    objectiveKeys: ['follow_up', 'reactivation'],
    channels: ['email'],
    requiredModuleKeys: ['marketing_studio', 'crm', 'automations'],
    portalVisible: true,
    recommendedForCampaignStepKeys: ['whatsapp_or_email_followup', 'automation'],
  },
  {
    id: 'smart_segment:stale-opportunities',
    label: 'Segmento inteligente de oportunidades paradas',
    description: 'Filtro para leads por origem, etapa, responsavel, atividade, score, campanha e status de proposta.',
    kind: 'smart_segment',
    moduleKey: 'crm',
    sectorKeys: allSectors,
    objectiveKeys: ['reactivation', 'remarketing', 'follow_up'],
    channels: ['crm', 'dashboard'],
    requiredModuleKeys: ['crm'],
    portalVisible: true,
    recommendedForCampaignStepKeys: ['segment'],
  },
  {
    id: 'automation:new-lead-response',
    label: 'Automacao de resposta a lead novo',
    description: 'Fluxo para responder novo lead, distribuir responsavel, criar tarefa e acompanhar SLA.',
    kind: 'automation',
    moduleKey: 'automations',
    sectorKeys: allSectors,
    objectiveKeys: ['lead_generation', 'whatsapp_capture', 'appointment_booking'],
    channels: ['crm', 'whatsapp', 'email'],
    requiredModuleKeys: ['automations', 'crm'],
    portalVisible: true,
    recommendedForCampaignStepKeys: ['automation', 'whatsapp_or_email_followup'],
  },
  {
    id: 'report:mroi-campaign',
    label: 'Relatorio de MROI por campanha',
    description: 'Painel para leads, CPL, propostas, clientes, receita atribuida e recomendacoes de IA.',
    kind: 'report',
    moduleKey: 'bi_reports',
    sectorKeys: allSectors,
    objectiveKeys: ['lead_generation', 'offer_promotion', 'remarketing'],
    channels: ['dashboard'],
    requiredModuleKeys: ['bi_reports', 'campaigns', 'crm'],
    portalVisible: true,
    recommendedForCampaignStepKeys: ['report'],
  },
  {
    id: 'automation:internal-cpl-alert',
    label: 'Alerta interno de CPL alto',
    description: 'Template operacional para avisar a equipe YUX quando uma campanha passar do limite de CPL.',
    kind: 'automation',
    moduleKey: 'automations',
    sectorKeys: allSectors,
    objectiveKeys: ['offer_promotion'],
    channels: ['dashboard', 'email'],
    requiredModuleKeys: ['automations', 'campaigns'],
    portalVisible: false,
    recommendedForCampaignStepKeys: ['automation', 'report'],
  },
]

export function filterGrowthTemplates(
  templates: GrowthTemplate[] = growthTemplateCatalog,
  filters: GrowthTemplateFilter = {},
) {
  return templates.filter(template => {
    if (filters.sectorKey && !template.sectorKeys.includes(filters.sectorKey)) return false
    if (filters.objectiveKey && !template.objectiveKeys.includes(filters.objectiveKey)) return false
    if (filters.moduleKey && template.moduleKey !== filters.moduleKey) return false
    if (filters.channel && !template.channels.includes(filters.channel)) return false
    if (filters.requiredModuleKey && !template.requiredModuleKeys.includes(filters.requiredModuleKey)) return false
    if (filters.portalVisibleOnly && !template.portalVisible) return false
    if (filters.campaignStepKey && !template.recommendedForCampaignStepKeys.includes(filters.campaignStepKey)) return false
    return true
  })
}

export function groupGrowthTemplatesByModule(templates: GrowthTemplate[] = growthTemplateCatalog) {
  return templates.reduce<Partial<Record<GrowthTemplateModule, GrowthTemplate[]>>>((groups, template) => {
    groups[template.moduleKey] = [...(groups[template.moduleKey] || []), template]
    return groups
  }, {})
}

export function getTemplateById(id: string, templates: GrowthTemplate[] = growthTemplateCatalog) {
  return templates.find(template => template.id === id)
}

export function getTemplatesForCampaignStep(
  stepKey: CampaignPlanStepKey,
  filters: Omit<GrowthTemplateFilter, 'campaignStepKey'> = {},
) {
  return filterGrowthTemplates(growthTemplateCatalog, { ...filters, campaignStepKey: stepKey })
}

export function summarizeTemplateCoverage(templates: GrowthTemplate[] = growthTemplateCatalog): GrowthTemplateCoverage {
  return templates.reduce<GrowthTemplateCoverage>((coverage, template) => {
    coverage.total += 1
    if (template.portalVisible) coverage.portalVisible += 1
    coverage.byKind[template.kind] += 1
    coverage.byModule[template.moduleKey] = (coverage.byModule[template.moduleKey] || 0) + 1
    return coverage
  }, {
    total: 0,
    portalVisible: 0,
    byKind: emptyKindCounts(),
    byModule: {},
  })
}

function emptyKindCounts(): Record<GrowthTemplateKind, number> {
  return {
    campaign: 0,
    landing_page: 0,
    post: 0,
    paid_ad: 0,
    whatsapp_message: 0,
    email: 0,
    smart_segment: 0,
    automation: 0,
    report: 0,
  }
}
