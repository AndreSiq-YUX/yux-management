import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '@/lib/apiClient'
import {
  buildCrmInstanceInsertPayload,
  buildCrmMemberInvitePayload,
  buildCrmPublicationPayload,
  crmGovernanceService,
} from './crmGovernanceService'

vi.mock('@/lib/apiClient', () => ({
  apiRequest: vi.fn(),
  rethrowAuthorizationError: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('crmGovernanceService payload builders', () => {
  it('builds contracted instance payload with safe defaults', () => {
    expect(buildCrmInstanceInsertPayload({
      organizationId: 'org-1',
      contractId: 'contract-1',
      sectorKey: 'medical_clinic',
      blueprintId: 'blueprint-1',
      sellerSeatLimit: 10,
      managerSeatLimit: 3,
      adminSeatLimit: 2,
    })).toEqual({
      organization_id: 'org-1',
      contract_id: 'contract-1',
      status: 'draft',
      sector_key: 'medical_clinic',
      blueprint_id: 'blueprint-1',
      seller_seat_limit: 10,
      manager_seat_limit: 3,
      admin_seat_limit: 2,
      max_pipeline_count: 3,
      max_custom_field_count: 20,
      max_automation_count: 5,
      allow_client_pipeline_customization: true,
      allow_client_field_customization: true,
      allow_client_category_customization: true,
      default_assignment_mode: 'queue',
    })
  })

  it('builds member invite payload', () => {
    expect(buildCrmMemberInvitePayload({
      crmInstanceId: 'crm-1',
      userId: 'user-1',
      role: 'seller',
      displayName: 'Ana Silva',
      email: 'ana@yux.test',
    })).toEqual({
      crm_instance_id: 'crm-1',
      user_id: 'user-1',
      role: 'seller',
      status: 'invited',
      display_name: 'Ana Silva',
      email: 'ana@yux.test',
    })
  })

  it('builds publication payload with explicit migration strategy', () => {
    expect(buildCrmPublicationPayload({
      crmInstanceId: 'crm-1',
      draftId: 'draft-1',
      migrationStrategy: 'mapped_stages',
      impactSummary: { impactedOpenLeadCount: 12 },
    })).toEqual({
      crm_instance_id: 'crm-1',
      draft_id: 'draft-1',
      status: 'reviewing',
      migration_strategy: 'mapped_stages',
      impact_summary: { impactedOpenLeadCount: 12 },
    })
  })

  it('loads the CRM governance context through the tenant-scoped endpoint', async () => {
    const context = {
      instance: { id: 'crm-instance-1' },
      members: [],
      teams: [],
      teamMemberships: [],
    }
    vi.mocked(apiRequest).mockResolvedValue(context)

    await expect(crmGovernanceService.getGovernanceContext('crm-instance-1')).resolves.toBe(context)
    expect(apiRequest).toHaveBeenCalledWith('/crm/governance-context?crmInstanceId=crm-instance-1')
  })
})
