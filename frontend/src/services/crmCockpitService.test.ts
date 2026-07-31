import { describe, expect, it } from 'vitest'
import {
  buildLeadImportPayload,
  buildLeadImportRowPayload,
  buildLeadTagAssignmentPayload,
  buildLeadTagPayload,
  buildNextActionPayload,
  buildSavedViewPayload,
  buildStageHistoryPayload,
} from './crmCockpitService'
import type { LeadImportPreview } from '@/types/crmCockpit'

const preview: LeadImportPreview = {
  validRows: 1,
  invalidRows: 1,
  rows: [
    {
      rowNumber: 2,
      raw: { name: 'Ana', email: 'ana@example.com' },
      lead: { name: 'Ana', email: 'ana@example.com', source: 'CSV' },
      errors: [],
    },
    {
      rowNumber: 3,
      raw: { name: 'Bruno', email: 'invalid' },
      lead: { name: 'Bruno', email: 'invalid', source: 'CSV' },
      errors: ['invalid_email'],
    },
  ],
}

describe('crmCockpitService payload builders', () => {
  it('builds saved view payload', () => {
    expect(buildSavedViewPayload({
      crmInstanceId: 'crm-1',
      userId: 'user-1',
      name: 'Leads quentes',
      filters: { temperature: 'hot', stalledOnly: true },
      isShared: false,
    })).toEqual({
      crm_instance_id: 'crm-1',
      user_id: 'user-1',
      team_id: null,
      name: 'Leads quentes',
      filters: { temperature: 'hot', stalledOnly: true },
      is_shared: false,
    })
  })

  it('builds import and row payloads', () => {
    expect(buildLeadImportPayload({ crmInstanceId: 'crm-1', fileName: 'leads.csv', preview })).toEqual({
      crm_instance_id: 'crm-1',
      status: 'preview',
      file_name: 'leads.csv',
      total_rows: 2,
      valid_rows: 1,
      invalid_rows: 1,
    })
    expect(buildLeadImportRowPayload('crm-1', 'import-1', preview.rows[1])).toEqual({
      crm_instance_id: 'crm-1',
      import_id: 'import-1',
      row_number: 3,
      raw_payload: { name: 'Bruno', email: 'invalid' },
      normalized_payload: { name: 'Bruno', email: 'invalid', source: 'CSV' },
      errors: ['invalid_email'],
    })
  })

  it('builds tag payloads', () => {
    expect(buildLeadTagPayload({ crmInstanceId: 'crm-1', name: ' VIP ', color: '#16a34a' })).toEqual({
      crm_instance_id: 'crm-1',
      name: 'VIP',
      color: '#16a34a',
      is_active: true,
    })
    expect(buildLeadTagAssignmentPayload({ crmInstanceId: 'crm-1', leadId: 'lead-1', tagId: 'tag-1' })).toEqual({
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      tag_id: 'tag-1',
    })
  })

  it('builds stage history and next action payloads', () => {
    expect(buildStageHistoryPayload({
      crmInstanceId: 'crm-1',
      leadId: 'lead-1',
      fromStageId: 'stage-1',
      toStageId: 'stage-2',
      reason: 'Avancou',
    })).toEqual({
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      from_stage_id: 'stage-1',
      to_stage_id: 'stage-2',
      reason: 'Avancou',
      metadata: {},
    })
    expect(buildNextActionPayload({
      crmInstanceId: 'crm-1',
      leadId: 'lead-1',
      kind: 'respond_now',
      title: ' Responder WhatsApp ',
      dueAt: '2026-06-04T15:00:00.000Z',
    })).toEqual({
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      kind: 'respond_now',
      title: 'Responder WhatsApp',
      due_at: '2026-06-04T15:00:00.000Z',
      assigned_to_member_id: null,
    })
  })
})
