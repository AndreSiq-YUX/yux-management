import { describe, expect, it } from 'vitest'
import {
  buildCampaignPlanStepTemplates,
  calculateCampaignPlanProgress,
  createCampaignPlanDraft,
  listBlockedCampaignPlanSteps,
  pickCampaignPlanNextAction,
  updateCampaignPlanStepStatuses,
} from './campaignPlanRules'
import type { CampaignPlanObjective } from '@/types/growthWorkspace'

const objectives: CampaignPlanObjective[] = [
  'lead_generation',
  'whatsapp_capture',
  'offer_promotion',
  'reactivation',
  'appointment_booking',
  'service_launch',
  'remarketing',
]

describe('campaignPlanRules', () => {
  it('builds deterministic templates for all objectives', () => {
    for (const objective of objectives) {
      expect(buildCampaignPlanStepTemplates(objective).map(step => step.key)).toEqual([
        'segment',
        'landing_page',
        'form',
        'creative',
        'ad',
        'organic_post',
        'whatsapp_or_email_followup',
        'automation',
        'approval',
        'report',
      ])
    }
  })

  it('creates a lead generation plan with the expected checklist', () => {
    const plan = createCampaignPlanDraft({
      organizationId: 'org-1',
      contractId: 'contract-1',
      name: 'Geracao de leads Junho',
      objective: 'lead_generation',
      currentDate: '2026-06-08T12:00:00.000Z',
    })

    expect(plan.steps.map(step => step.key)).toEqual([
      'segment',
      'landing_page',
      'form',
      'creative',
      'ad',
      'organic_post',
      'whatsapp_or_email_followup',
      'automation',
      'approval',
      'report',
    ])
    expect(plan.steps[0].status).toBe('not_started')
    expect(plan.steps.slice(1).every(step => step.status === 'blocked')).toBe(true)
  })

  it('calculates progress from completed and linked steps', () => {
    const plan = createCampaignPlanDraft({
      organizationId: 'org-1',
      name: 'Campanha',
      objective: 'lead_generation',
    })
    const updatedPlan = {
      ...plan,
      steps: plan.steps.map(step => step.key === 'segment'
        ? { ...step, status: 'completed' as const }
        : step.key === 'landing_page'
          ? { ...step, status: 'linked' as const }
          : step),
    }

    expect(calculateCampaignPlanProgress(updatedPlan)).toMatchObject({
      completed: 2,
      total: 10,
      percentage: 20,
    })
  })

  it('unblocks dependent steps when previous required work is done', () => {
    const plan = createCampaignPlanDraft({
      organizationId: 'org-1',
      name: 'Campanha',
      objective: 'lead_generation',
    })
    const updatedPlan = updateCampaignPlanStepStatuses({
      ...plan,
      steps: plan.steps.map(step => step.key === 'segment' ? { ...step, status: 'completed' as const } : step),
    })

    expect(updatedPlan.steps.find(step => step.key === 'landing_page')?.status).toBe('not_started')
    expect(updatedPlan.steps.find(step => step.key === 'form')?.status).toBe('blocked')
    expect(listBlockedCampaignPlanSteps(updatedPlan).map(step => step.key)).toContain('form')
  })

  it('picks the first blocked or unstarted next action', () => {
    const plan = createCampaignPlanDraft({
      organizationId: 'org-1',
      name: 'Campanha',
      objective: 'lead_generation',
    })

    expect(pickCampaignPlanNextAction(plan)).toMatchObject({
      stepKey: 'segment',
      status: 'not_started',
    })

    const unblockedPlan = updateCampaignPlanStepStatuses({
      ...plan,
      steps: plan.steps.map(step => step.key === 'segment' ? { ...step, status: 'completed' as const } : step),
    })

    expect(pickCampaignPlanNextAction(unblockedPlan)).toMatchObject({
      stepKey: 'landing_page',
      status: 'not_started',
    })
  })
})
