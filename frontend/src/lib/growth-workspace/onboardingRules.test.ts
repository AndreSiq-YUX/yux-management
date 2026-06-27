import { describe, expect, it } from 'vitest'
import {
  buildOnboardingChecklistFromBlueprint,
  createOnboardingChecklistDraft,
  pickNextOnboardingSteps,
  summarizeOnboardingProgress,
} from './onboardingRules'
import type { Blueprint } from '@/types/platform'

const baseBlueprint = (input: Partial<Blueprint>): Blueprint => ({
  id: input.id || `blueprint-${input.key || 'generic'}`,
  key: input.key || 'generic',
  name: input.name || 'Modelo generico',
  sector: input.sector || 'Generico',
  description: input.description || 'Modelo setorial',
  moduleKeys: input.moduleKeys || ['crm', 'whatsapp_ai', 'landing_pages', 'campaigns', 'marketing_studio', 'automations', 'bi_reports'],
  createdAt: '2026-06-08T10:00:00.000Z',
  updatedAt: '2026-06-08T10:00:00.000Z',
})

describe('onboardingRules', () => {
  it('builds clinic onboarding around appointments and patient capture', () => {
    const steps = buildOnboardingChecklistFromBlueprint(baseBlueprint({ key: 'clinicas', sector: 'Saude' }))

    expect(steps.map(step => step.label)).toContain('Conectar WhatsApp para agendamentos')
    expect(steps.map(step => step.label)).toContain('Criar campanha de captacao de pacientes')
  })

  it('builds real estate onboarding around visits and proposals', () => {
    const steps = buildOnboardingChecklistFromBlueprint(baseBlueprint({ key: 'imobiliarias', sector: 'Imobiliario' }))

    expect(steps.map(step => step.label)).toContain('Revisar funil de imoveis e visitas')
    expect(steps.map(step => step.label)).toContain('Validar relatorio de origem, visitas e propostas')
  })

  it('builds car dealership onboarding around test-drive and offers', () => {
    const steps = buildOnboardingChecklistFromBlueprint(baseBlueprint({ key: 'revendas_carro', sector: 'Automotivo' }))

    expect(steps.map(step => step.label)).toContain('Revisar funil de test-drive e proposta')
    expect(steps.map(step => step.label)).toContain('Criar campanha para ofertas de veiculos')
  })

  it('builds auto repair onboarding around maintenance reminders', () => {
    const steps = buildOnboardingChecklistFromBlueprint(baseBlueprint({ key: 'oficinas', sector: 'Automotivo' }))

    expect(steps.map(step => step.label)).toContain('Criar campanha para manutencao preventiva')
    expect(steps.map(step => step.label)).toContain('Ativar lembrete de revisao e retorno')
  })

  it('builds agency onboarding around briefing and deliveries', () => {
    const steps = buildOnboardingChecklistFromBlueprint(baseBlueprint({ key: 'agencias', sector: 'Servicos' }))

    expect(steps.map(step => step.label)).toContain('Revisar funil de briefing, proposta e entrega')
    expect(steps.map(step => step.label)).toContain('Validar relatorio de campanhas e entregas')
  })

  it('builds consulting onboarding around diagnosis and revenue', () => {
    const steps = buildOnboardingChecklistFromBlueprint(baseBlueprint({ key: 'consultorias', sector: 'Servicos B2B' }))

    expect(steps.map(step => step.label)).toContain('Criar campanha para diagnostico comercial')
    expect(steps.map(step => step.label)).toContain('Validar relatorio de propostas, receita e MROI')
  })

  it('uses a generic fallback and filters unavailable module steps', () => {
    const steps = buildOnboardingChecklistFromBlueprint(baseBlueprint({
      key: 'educacao',
      sector: 'Educacao',
      moduleKeys: ['crm', 'bi_reports'],
    }))

    expect(steps.map(step => step.key)).toEqual([
      'company_profile',
      'users_and_permissions',
      'knowledge_base',
      'crm_pipeline',
      'reports',
    ])
  })

  it('summarizes checklist progress and next pending steps', () => {
    const checklist = createOnboardingChecklistDraft({
      organizationId: 'org-1',
      contractId: 'contract-1',
      blueprint: baseBlueprint({ key: 'clinicas' }),
    })
    checklist.steps[0].status = 'completed'
    checklist.steps[1].status = 'skipped'

    expect(summarizeOnboardingProgress(checklist)).toMatchObject({
      completed: 2,
      total: checklist.steps.length,
    })
    expect(pickNextOnboardingSteps(checklist, 2).map(step => step.key)).toEqual(['brand_voice', 'knowledge_base'])
  })
})
