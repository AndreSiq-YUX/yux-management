import { describe, expect, it } from 'vitest'
import {
  canAddCrmMember,
  canMemberSeeLead,
  canPublishCrmConfiguration,
  chooseLeadMigrationStrategy,
} from './governanceRules'
import type { CrmGovernanceContext, CrmInstanceMember, CrmLead } from '@/types/crm'

const instance = {
  id: 'crm-1',
  organizationId: 'org-1',
  contractId: 'contract-1',
  status: 'active',
  sellerSeatLimit: 2,
  managerSeatLimit: 1,
  adminSeatLimit: 1,
  maxPipelineCount: 3,
  maxCustomFieldCount: 8,
  maxAutomationCount: 2,
  allowClientPipelineCustomization: true,
  allowClientFieldCustomization: true,
  allowClientCategoryCustomization: false,
  defaultAssignmentMode: 'queue',
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z',
} satisfies CrmGovernanceContext['instance']

const member = (id: string, role: CrmInstanceMember['role']): CrmInstanceMember => ({
  id,
  crmInstanceId: 'crm-1',
  userId: `user-${id}`,
  role,
  status: 'active',
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z',
})

describe('canAddCrmMember', () => {
  it('blocks seller creation when the contracted seller limit is reached', () => {
    const result = canAddCrmMember(instance, [member('s1', 'seller'), member('s2', 'seller')], 'seller')
    expect(result).toEqual({
      allowed: false,
      reason: 'seller_seat_limit_reached',
      currentCount: 2,
      limit: 2,
    })
  })

  it('allows client admin creation when the admin limit has capacity', () => {
    const result = canAddCrmMember(instance, [member('s1', 'seller')], 'client_admin')
    expect(result.allowed).toBe(true)
    expect(result.currentCount).toBe(0)
    expect(result.limit).toBe(1)
  })
})

describe('canMemberSeeLead', () => {
  const lead = {
    id: 'lead-1',
    organizationId: 'org-1',
    crmInstanceId: 'crm-1',
    pipelineId: 'pipe-1',
    stageId: 'stage-1',
    ownerMemberId: 'seller-1',
    teamId: 'team-1',
    name: 'Lead',
    email: 'lead@yux.test',
    source: 'manual',
    score: 40,
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
  } satisfies CrmLead

  it('allows a seller to see only their owned lead', () => {
    expect(canMemberSeeLead(member('seller-1', 'seller'), lead, [])).toBe(true)
    expect(canMemberSeeLead(member('seller-2', 'seller'), lead, [])).toBe(false)
  })

  it('allows a manager to see leads from managed teams', () => {
    expect(canMemberSeeLead(member('manager-1', 'manager'), lead, [{
      id: 'tm-1',
      teamId: 'team-1',
      memberId: 'manager-1',
      role: 'manager',
      createdAt: '2026-06-03T00:00:00.000Z',
    }])).toBe(true)
  })
})

describe('canPublishCrmConfiguration', () => {
  it('requires a migration strategy when existing leads are impacted', () => {
    const result = canPublishCrmConfiguration({
      pipelinesChanged: true,
      customFieldsChanged: false,
      categoriesChanged: false,
      impactedOpenLeadCount: 5,
      migrationStrategy: undefined,
    })
    expect(result).toEqual({ allowed: false, reason: 'migration_strategy_required' })
  })
})

describe('chooseLeadMigrationStrategy', () => {
  it('keeps existing leads when no pipeline or field shape changed', () => {
    expect(chooseLeadMigrationStrategy({
      pipelinesChanged: false,
      customFieldsChanged: false,
      impactedOpenLeadCount: 10,
    })).toBe('keep_existing')
  })
})
