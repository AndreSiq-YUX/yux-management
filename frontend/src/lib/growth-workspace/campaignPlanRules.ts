import type {
  CampaignPlan,
  CampaignPlanObjective,
  CampaignPlanProgress,
  CampaignPlanRecommendedAction,
  CampaignPlanStep,
  CampaignPlanStepKey,
  CampaignPlanStepStatus,
  CampaignPlanStepTemplate,
} from '@/types/growthWorkspace'

const objectiveLabel: Record<CampaignPlanObjective, string> = {
  lead_generation: 'Geracao de leads',
  whatsapp_capture: 'Captura via WhatsApp',
  offer_promotion: 'Promocao de oferta',
  reactivation: 'Reativacao',
  appointment_booking: 'Agendamento',
  service_launch: 'Lancamento de servico',
  remarketing: 'Remarketing',
}

const baseStepTemplates: CampaignPlanStepTemplate[] = [
  {
    key: 'segment',
    label: 'Publico e segmento',
    description: 'Definir quem sera impactado e quais filtros comerciais entram na campanha.',
    moduleKey: 'crm',
    sortOrder: 1,
    isRequired: true,
    dependsOn: [],
    actionLabel: 'Definir segmento',
  },
  {
    key: 'landing_page',
    label: 'Landing page',
    description: 'Criar ou vincular a pagina de destino com promessa, oferta e tracking.',
    moduleKey: 'landing_pages',
    sortOrder: 2,
    isRequired: true,
    dependsOn: ['segment'],
    actionLabel: 'Preparar landing page',
  },
  {
    key: 'form',
    label: 'Formulario',
    description: 'Garantir campos de captura, origem e consentimento para entrada no funil.',
    moduleKey: 'crm',
    sortOrder: 3,
    isRequired: true,
    dependsOn: ['landing_page'],
    actionLabel: 'Configurar formulario',
  },
  {
    key: 'creative',
    label: 'Criativos',
    description: 'Preparar imagem, video, copy e variacoes de mensagem para aprovacao.',
    moduleKey: 'marketing_studio',
    sortOrder: 4,
    isRequired: true,
    dependsOn: ['landing_page'],
    actionLabel: 'Criar criativos',
  },
  {
    key: 'ad',
    label: 'Anuncio pago',
    description: 'Configurar campanha de midia, conta de anuncios, budget, publico e UTM.',
    moduleKey: 'campaigns',
    sortOrder: 5,
    isRequired: true,
    dependsOn: ['creative', 'landing_page'],
    actionLabel: 'Configurar anuncio',
  },
  {
    key: 'organic_post',
    label: 'Post organico',
    description: 'Planejar publicacao de apoio para reforcar mensagem e reaproveitar criativos.',
    moduleKey: 'marketing_studio',
    sortOrder: 6,
    isRequired: false,
    dependsOn: ['creative'],
    actionLabel: 'Planejar post',
  },
  {
    key: 'whatsapp_or_email_followup',
    label: 'Follow-up WhatsApp/E-mail',
    description: 'Definir mensagem de resposta, proxima acao e abordagem do vendedor.',
    moduleKey: 'whatsapp_ai',
    sortOrder: 7,
    isRequired: true,
    dependsOn: ['form'],
    actionLabel: 'Preparar follow-up',
  },
  {
    key: 'automation',
    label: 'Automacao',
    description: 'Ativar fluxo para distribuir leads, criar tarefas e acompanhar resposta.',
    moduleKey: 'automations',
    sortOrder: 8,
    isRequired: true,
    dependsOn: ['form', 'whatsapp_or_email_followup'],
    actionLabel: 'Configurar automacao',
  },
  {
    key: 'approval',
    label: 'Aprovacao',
    description: 'Submeter assets, budget e fluxo para aprovacao antes da ativacao.',
    moduleKey: 'projects',
    sortOrder: 9,
    isRequired: true,
    dependsOn: ['ad', 'creative', 'automation'],
    actionLabel: 'Enviar para aprovacao',
  },
  {
    key: 'report',
    label: 'Relatorio',
    description: 'Definir indicadores de acompanhamento: leads, CPL, propostas, clientes e MROI.',
    moduleKey: 'bi_reports',
    sortOrder: 10,
    isRequired: true,
    dependsOn: ['approval'],
    actionLabel: 'Preparar relatorio',
  },
]

export function buildCampaignPlanStepTemplates(objective: CampaignPlanObjective): CampaignPlanStepTemplate[] {
  return baseStepTemplates.map(template => ({
    ...template,
    description: objectiveDescription(objective, template),
  }))
}

export function createCampaignPlanDraft(input: {
  organizationId: string
  contractId?: string
  name: string
  objective: CampaignPlanObjective
  ownerId?: string
  sourceBlueprintId?: string
  currentDate?: string | Date
}): CampaignPlan {
  const createdAt = normalizeIso(input.currentDate)
  const planId = `campaign-plan:${slug(input.name)}:${input.objective}`
  const steps = buildCampaignPlanStepTemplates(input.objective).map(template => ({
    ...template,
    id: `${planId}:${template.key}`,
    planId,
    status: template.dependsOn.length > 0 ? 'blocked' : 'not_started',
    blockedReason: template.dependsOn.length > 0 ? buildBlockedReason(template.dependsOn) : undefined,
  })) satisfies CampaignPlanStep[]

  return updateCampaignPlanStepStatuses({
    id: planId,
    organizationId: input.organizationId,
    contractId: input.contractId,
    name: input.name.trim() || objectiveLabel[input.objective],
    objective: input.objective,
    status: 'planning',
    ownerId: input.ownerId,
    sourceBlueprintId: input.sourceBlueprintId,
    steps,
    createdAt,
    updatedAt: createdAt,
  })
}

export function updateCampaignPlanStepStatuses(plan: CampaignPlan): CampaignPlan {
  const byKey = new Map(plan.steps.map(step => [step.key, step]))

  return {
    ...plan,
    steps: plan.steps.map(step => {
      const dependenciesDone = step.dependsOn.every(key => isStepDone(byKey.get(key)?.status))
      const shouldBlock = !dependenciesDone && !isStepDone(step.status)
      const shouldUnblock = dependenciesDone && step.status === 'blocked'

      if (shouldBlock) {
        return {
          ...step,
          status: 'blocked',
          blockedReason: buildBlockedReason(step.dependsOn.filter(key => !isStepDone(byKey.get(key)?.status))),
        }
      }

      if (shouldUnblock) {
        return {
          ...step,
          status: 'not_started',
          blockedReason: undefined,
        }
      }

      return {
        ...step,
        blockedReason: step.status === 'blocked' ? step.blockedReason : undefined,
      }
    }),
  }
}

export function calculateCampaignPlanProgress(plan: CampaignPlan): CampaignPlanProgress {
  const normalizedPlan = updateCampaignPlanStepStatuses(plan)
  const total = normalizedPlan.steps.length
  const completed = normalizedPlan.steps.filter(step => isStepDone(step.status)).length
  const blockers = listBlockedCampaignPlanSteps(normalizedPlan)

  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    blockers,
  }
}

export function listBlockedCampaignPlanSteps(plan: CampaignPlan): CampaignPlanStep[] {
  return updateCampaignPlanStepStatuses(plan).steps
    .filter(step => step.status === 'blocked')
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function pickCampaignPlanNextAction(plan: CampaignPlan): CampaignPlanRecommendedAction | undefined {
  const normalizedPlan = updateCampaignPlanStepStatuses(plan)
  const nextStep = normalizedPlan.steps
    .filter(step => !isStepDone(step.status))
    .sort((a, b) => a.sortOrder - b.sortOrder)[0]

  if (!nextStep) return undefined

  return {
    stepKey: nextStep.key,
    stepId: nextStep.id,
    label: nextStep.actionLabel,
    description: nextStep.description,
    status: nextStep.status,
    sortOrder: nextStep.sortOrder,
    reason: nextStep.blockedReason,
  }
}

function isStepDone(status?: CampaignPlanStepStatus) {
  return status === 'completed' || status === 'linked' || status === 'skipped'
}

function objectiveDescription(objective: CampaignPlanObjective, template: CampaignPlanStepTemplate) {
  if (objective === 'whatsapp_capture' && template.key === 'whatsapp_or_email_followup') {
    return 'Priorizar WhatsApp, handoff e resposta rapida para transformar contato em conversa.'
  }

  if (objective === 'appointment_booking' && template.key === 'form') {
    return 'Capturar dados minimos e preferencia de horario para agendamento.'
  }

  if (objective === 'reactivation' && template.key === 'segment') {
    return 'Selecionar leads ou clientes antigos com potencial de retorno.'
  }

  if (objective === 'remarketing' && template.key === 'ad') {
    return 'Configurar midia para publico ja impactado, com exclusoes e janela de retorno.'
  }

  return template.description
}

function buildBlockedReason(dependencies: CampaignPlanStepKey[]) {
  if (dependencies.length === 0) return undefined
  return `Depende de: ${dependencies.map(formatStepKey).join(', ')}`
}

function formatStepKey(key: CampaignPlanStepKey) {
  const match = baseStepTemplates.find(template => template.key === key)
  return match?.label || key
}

function normalizeIso(value?: string | Date) {
  if (!value) return new Date().toISOString()
  if (value instanceof Date) return value.toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'campanha'
}
