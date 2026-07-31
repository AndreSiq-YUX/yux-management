import { describe, expect, it } from 'vitest'
import {
  applyCockpitFilters,
  buildCsvImportPreview,
  calculateStageAge,
  detectDuplicateLeadCandidates,
  isLeadStalled,
  rankTodayLead,
  requiresLossReason,
} from './cockpitRules'
import type { CrmCockpitLead } from '@/types/crmCockpit'

const now = new Date('2026-06-04T12:00:00.000Z')

const lead = (overrides: Partial<CrmCockpitLead> = {}): CrmCockpitLead => ({
  id: 'lead-1',
  organizationId: 'org-1',
  crmInstanceId: 'crm-1',
  pipelineId: 'pipeline-1',
  stageId: 'stage-1',
  name: 'Ana Lead',
  email: 'ana@example.com',
  phone: '+55 11 99999-0000',
  whatsappPhone: '+55 11 99999-0000',
  company: 'Clinica Alpha',
  source: 'Meta Ads',
  score: 55,
  status: 'open',
  value: 3000,
  createdAt: '2026-06-01T12:00:00.000Z',
  updatedAt: '2026-06-01T12:00:00.000Z',
  currentStageEnteredAt: '2026-06-01T12:00:00.000Z',
  ...overrides,
})

describe('cockpitRules', () => {
  it('calculates stage age and stalled state', () => {
    expect(calculateStageAge(lead(), now)).toBe(3)
    expect(isLeadStalled(lead(), 3, now)).toBe(true)
    expect(isLeadStalled(lead({ status: 'won' }), 3, now)).toBe(false)
  })

  it('ranks overdue hot leads above ordinary leads', () => {
    const ordinary = rankTodayLead(lead({ score: 50 }), now)
    const hot = rankTodayLead(lead({
      score: 50,
      temperature: 'hot',
      urgency: 'high',
      nextFollowUpAt: '2026-06-04T09:00:00.000Z',
    }), now)

    expect(hot).toBeGreaterThan(ordinary)
  })

  it('requires loss reason only for configured lost stages', () => {
    expect(requiresLossReason({ id: 'lost-stage', isLost: true }, [{
      id: 'reason-1',
      crmInstanceId: 'crm-1',
      stageId: 'lost-stage',
      label: 'Sem fit',
      requiredForLost: true,
      isActive: true,
    }])).toBe(true)
    expect(requiresLossReason({ id: 'open-stage', isLost: false }, [])).toBe(false)
  })

  it('detects duplicate candidates by email or phone', () => {
    const duplicates = detectDuplicateLeadCandidates([
      lead({ id: 'lead-1', email: 'ana@example.com' }),
      lead({ id: 'lead-2', email: 'bruno@example.com', phone: '+55 11 98888-0000' }),
    ], {
      id: 'candidate',
      email: 'ANA@example.com',
      phone: '+55 (11) 98888-0000',
    })

    expect(duplicates.map(item => item.id)).toEqual(['lead-1', 'lead-2'])
  })

  it('builds CSV preview with invalid email row', () => {
    const preview = buildCsvImportPreview([
      'name,email,phone,source,value',
      'Ana,ana@example.com,11999990000,Meta Ads,3000',
      'Bruno,email-invalido,,Google Ads,1000',
    ].join('\n'))

    expect(preview.validRows).toBe(1)
    expect(preview.invalidRows).toBe(1)
    expect(preview.rows[1].errors).toContain('invalid_email')
  })

  it('applies saved-view style filters', () => {
    const filtered = applyCockpitFilters([
      lead({ id: 'lead-1', teamId: 'team-1', temperature: 'hot', tagIds: ['vip'], value: 5000 }),
      lead({ id: 'lead-2', teamId: 'team-2', temperature: 'cold', tagIds: ['low'], value: 500 }),
    ], {
      teamId: 'team-1',
      temperature: 'hot',
      minValue: 1000,
      tagIds: ['vip'],
    }, now)

    expect(filtered.map(item => item.id)).toEqual(['lead-1'])
  })
})
