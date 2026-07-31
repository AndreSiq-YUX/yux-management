import { describe, expect, it } from 'vitest'
import { buildPipelineFromBlueprint, summarizeBlueprintApplication } from './blueprintApplicationRules'
import type { Blueprint } from '@/types/platform'

const clinicBlueprint: Blueprint = {
  id: 'blueprint-clinic',
  key: 'clinicas',
  name: 'Clinicas',
  sector: 'Saude',
  description: 'Blueprint para clinicas com atendimento, agenda, CRM e relatorios.',
  moduleKeys: ['crm', 'whatsapp_ai', 'landing_pages', 'campaigns', 'bi_reports'],
  createdAt: '2026-06-03T10:00:00.000Z',
  updatedAt: '2026-06-03T10:00:00.000Z',
  pipelineTemplate: {
    key: 'clinic_growth',
    name: 'Funil de captacao para clinicas',
    stages: [
      { key: 'new', name: 'Novo lead', orderIndex: 0 },
      { key: 'ai_triage', name: 'Triagem IA', orderIndex: 1 },
      { key: 'appointment_pending', name: 'Agendamento pendente', orderIndex: 2 },
      { key: 'appointment_confirmed', name: 'Consulta confirmada', orderIndex: 3 },
      { key: 'attended', name: 'Compareceu', orderIndex: 4, isWon: true },
      { key: 'post_consultation', name: 'Pos-consulta', orderIndex: 5 },
      { key: 'future_reactivation', name: 'Reativacao futura', orderIndex: 6 },
    ],
  },
  customFields: [
    { key: 'specialty', label: 'Especialidade', fieldType: 'text' },
    { key: 'desired_date', label: 'Data desejada', fieldType: 'date' },
  ],
  messageTemplates: [
    { key: 'appointment_confirmed', name: 'Confirmacao de consulta', channel: 'whatsapp', body: 'Consulta confirmada.' },
  ],
  automationTemplates: [
    { key: 'reactivation_30d', name: 'Reativacao 30 dias', triggerEvent: 'lead_stale', draftPayload: { days: 30 } },
  ],
  reportPresets: [
    { key: 'clinic_roi', name: 'ROI por campanha', metricKeys: ['spend', 'leads', 'appointments'] },
  ],
}

describe('blueprintApplicationRules', () => {
  it('builds the clinic pipeline from its sector blueprint', () => {
    expect(buildPipelineFromBlueprint(clinicBlueprint).stages.map(stage => stage.name)).toEqual([
      'Novo lead',
      'Triagem IA',
      'Agendamento pendente',
      'Consulta confirmada',
      'Compareceu',
      'Pos-consulta',
      'Reativacao futura',
    ])
  })

  it('summarizes correlated assets before applying a blueprint', () => {
    expect(summarizeBlueprintApplication(clinicBlueprint)).toEqual({
      moduleCount: 5,
      stageCount: 7,
      customFieldCount: 2,
      messageTemplateCount: 1,
      automationTemplateCount: 1,
      reportPresetCount: 1,
    })
  })
})
