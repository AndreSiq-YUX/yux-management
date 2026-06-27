import type { Blueprint } from '@/types/platform'
import type {
  GrowthOnboardingChecklist,
  GrowthOnboardingProgress,
  GrowthOnboardingStep,
  GrowthOnboardingStepKey,
  GrowthOnboardingStepTemplate,
} from '@/types/growthWorkspace'

const baseSteps: GrowthOnboardingStepTemplate[] = [
  { key: 'company_profile', label: 'Completar perfil da empresa', moduleKey: 'company', estimatedMinutes: 10, sortOrder: 1, href: '/empresa/perfil' },
  { key: 'users_and_permissions', label: 'Convidar equipe e revisar permissoes', moduleKey: 'company', estimatedMinutes: 8, sortOrder: 2, href: '/empresa/usuarios' },
  { key: 'brand_voice', label: 'Configurar marca e tom de voz', moduleKey: 'marketing_studio', estimatedMinutes: 15, sortOrder: 3, href: '/empresa/marca' },
  { key: 'knowledge_base', label: 'Carregar base de conhecimento', moduleKey: 'knowledge_base', estimatedMinutes: 20, sortOrder: 4, href: '/empresa/conhecimento' },
  { key: 'channels', label: 'Conectar canais de atendimento', moduleKey: 'whatsapp_ai', estimatedMinutes: 15, sortOrder: 5, href: '/atendimento/canais' },
  { key: 'crm_pipeline', label: 'Revisar funil comercial setorial', moduleKey: 'crm', estimatedMinutes: 12, sortOrder: 6, href: '/comercial/funis' },
  { key: 'campaign_plan', label: 'Criar primeira Campanha 360', moduleKey: 'campaigns', estimatedMinutes: 18, sortOrder: 7, href: '/marketing/campanhas' },
  { key: 'landing_page', label: 'Preparar primeira landing page', moduleKey: 'landing_pages', estimatedMinutes: 15, sortOrder: 8, href: '/marketing/landing-pages' },
  { key: 'automation', label: 'Ativar automacao inicial', moduleKey: 'automations', estimatedMinutes: 15, sortOrder: 9, href: '/automacoes/templates' },
  { key: 'reports', label: 'Validar relatorios executivos', moduleKey: 'bi_reports', estimatedMinutes: 10, sortOrder: 10, href: '/relatorios' },
]

const sectorOverrides: Record<string, Partial<Record<GrowthOnboardingStepKey, string>>> = {
  clinicas: {
    channels: 'Conectar WhatsApp para agendamentos',
    crm_pipeline: 'Revisar funil de triagem, consulta e retorno',
    campaign_plan: 'Criar campanha de captacao de pacientes',
  },
  saude: {
    channels: 'Conectar WhatsApp para agendamentos',
    crm_pipeline: 'Revisar funil de triagem, consulta e retorno',
    campaign_plan: 'Criar campanha de captacao de pacientes',
  },
  imobiliarias: {
    crm_pipeline: 'Revisar funil de imoveis e visitas',
    campaign_plan: 'Criar campanha para captacao de compradores',
    reports: 'Validar relatorio de origem, visitas e propostas',
  },
  imobiliario: {
    crm_pipeline: 'Revisar funil de imoveis e visitas',
    campaign_plan: 'Criar campanha para captacao de compradores',
    reports: 'Validar relatorio de origem, visitas e propostas',
  },
  revendas_carro: {
    crm_pipeline: 'Revisar funil de test-drive e proposta',
    campaign_plan: 'Criar campanha para ofertas de veiculos',
    automation: 'Ativar follow-up automatico de proposta',
  },
  automotivo: {
    crm_pipeline: 'Revisar funil de test-drive e proposta',
    campaign_plan: 'Criar campanha para ofertas de veiculos',
    automation: 'Ativar follow-up automatico de proposta',
  },
  oficinas: {
    crm_pipeline: 'Revisar funil de orcamento e retorno',
    campaign_plan: 'Criar campanha para manutencao preventiva',
    automation: 'Ativar lembrete de revisao e retorno',
  },
  agencias: {
    crm_pipeline: 'Revisar funil de briefing, proposta e entrega',
    campaign_plan: 'Criar campanha de aquisicao B2B',
    reports: 'Validar relatorio de campanhas e entregas',
  },
  consultorias: {
    crm_pipeline: 'Revisar funil consultivo e diagnostico',
    campaign_plan: 'Criar campanha para diagnostico comercial',
    reports: 'Validar relatorio de propostas, receita e MROI',
  },
}

function normalize(value?: string) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function resolveSectorKey(blueprint: Pick<Blueprint, 'key' | 'sector'>) {
  const candidates = [normalize(blueprint.key), normalize(blueprint.sector)]
  return candidates.find(candidate => sectorOverrides[candidate]) || 'generic'
}

export function buildOnboardingChecklistFromBlueprint(
  blueprint: Pick<Blueprint, 'key' | 'sector' | 'moduleKeys'>
): GrowthOnboardingStepTemplate[] {
  const overrides = sectorOverrides[resolveSectorKey(blueprint)] || {}
  const moduleKeys = new Set(blueprint.moduleKeys)

  return baseSteps
    .filter(step => (
      step.moduleKey === 'company'
      || step.moduleKey === 'knowledge_base'
      || moduleKeys.has(step.moduleKey)
    ))
    .map(step => ({
      ...step,
      label: overrides[step.key] || step.label,
    }))
}

export function createOnboardingChecklistDraft(input: {
  organizationId: string
  contractId?: string
  blueprint: Pick<Blueprint, 'id' | 'key' | 'sector' | 'moduleKeys'>
}): GrowthOnboardingChecklist {
  const checklistId = `onboarding:${input.organizationId}:${input.blueprint.id}`
  const steps: GrowthOnboardingStep[] = buildOnboardingChecklistFromBlueprint(input.blueprint).map(step => ({
    ...step,
    id: `${checklistId}:${step.key}`,
    checklistId,
    status: 'not_started',
  }))

  return {
    id: checklistId,
    organizationId: input.organizationId,
    contractId: input.contractId,
    sourceBlueprintId: input.blueprint.id,
    status: 'active',
    steps,
  }
}

export function summarizeOnboardingProgress(checklist: Pick<GrowthOnboardingChecklist, 'steps'>): GrowthOnboardingProgress {
  const total = checklist.steps.length
  const pending = checklist.steps.filter(step => !['completed', 'skipped'].includes(step.status))
  const completed = total - pending.length

  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    pending,
  }
}

export function pickNextOnboardingSteps(checklist: Pick<GrowthOnboardingChecklist, 'steps'>, limit = 3) {
  return summarizeOnboardingProgress(checklist)
    .pending
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, limit)
}
