import { describe, expect, it } from 'vitest'
import { buildSequencePayload, mapAutomationSequence } from './automationSequenceService'

describe('automationSequenceService helpers', () => {
  it('builds sequence payloads with defaults', () => {
    expect(buildSequencePayload({
      organizationId: 'org-1',
      name: ' Reativacao ',
      conversionGoal: 'meeting_booked',
    })).toEqual({
      organization_id: 'org-1',
      name: 'Reativacao',
      description: null,
      channel: 'whatsapp',
      sector_template_key: null,
      conversion_goal: 'meeting_booked',
      is_active: true,
    })
  })

  it('maps sequence rows with multichannel steps', () => {
    expect(mapAutomationSequence({
      id: 'sequence-1',
      organization_id: 'org-1',
      name: 'Clinica',
      is_active: true,
      channel: 'mixed',
      sector_template_key: 'clinic',
      active_enrollment_count: 10,
      converted_enrollment_count: 3,
      crm_sequence_steps: [{
        id: 'step-1',
        sequence_id: 'sequence-1',
        order_index: 1,
        step_kind: 'message',
        channel: 'email',
        delay_minutes: 15,
        body: 'Ola',
        requires_human_approval: false,
        is_active: true,
      }],
    })).toMatchObject({
      channel: 'mixed',
      status: 'active',
      activeEnrollmentCount: 10,
      convertedEnrollmentCount: 3,
      steps: [{ channel: 'email', stepKind: 'message' }],
    })
  })
})
