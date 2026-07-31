import type {
  Blueprint,
  BlueprintApplicationSummary,
  BlueprintPipelineTemplate,
} from '@/types/platform'

const fallbackStageColors = [
  '#2563eb',
  '#7c3aed',
  '#d97706',
  '#0891b2',
  '#16a34a',
  '#64748b',
  '#475569',
]

export function buildPipelineFromBlueprint(blueprint: Blueprint): BlueprintPipelineTemplate {
  const template = blueprint.pipelineTemplate
  const fallbackTemplate: BlueprintPipelineTemplate = {
    key: `${blueprint.key}_pipeline`,
    name: `Funil ${blueprint.name}`,
    description: blueprint.description,
    stages: [
      { key: 'new', name: 'Novo lead', orderIndex: 0 },
      { key: 'qualified', name: 'Qualificado', orderIndex: 1 },
      { key: 'proposal', name: 'Proposta', orderIndex: 2 },
      { key: 'won', name: 'Ganho', orderIndex: 3, isWon: true },
      { key: 'lost', name: 'Perdido', orderIndex: 4, isLost: true },
    ],
  }

  const resolved = template || fallbackTemplate

  return {
    ...resolved,
    stages: [...resolved.stages]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((stage, index) => ({
        ...stage,
        color: stage.color || fallbackStageColors[index % fallbackStageColors.length],
        isWon: Boolean(stage.isWon),
        isLost: Boolean(stage.isLost),
      })),
  }
}

export function summarizeBlueprintApplication(blueprint: Blueprint): BlueprintApplicationSummary {
  return {
    moduleCount: blueprint.moduleKeys.length,
    stageCount: buildPipelineFromBlueprint(blueprint).stages.length,
    customFieldCount: blueprint.customFields?.length || 0,
    messageTemplateCount: blueprint.messageTemplates?.length || 0,
    automationTemplateCount: blueprint.automationTemplates?.length || 0,
    reportPresetCount: blueprint.reportPresets?.length || 0,
  }
}
