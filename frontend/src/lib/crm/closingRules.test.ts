import { describe, expect, it } from 'vitest'
import {
  buildConversionPlan,
  buildProposalFromLeadDraft,
  canCreateProposalFromLead,
  isConversionRetryable,
  recommendPackageForLead,
  requiresClosingApproval,
} from './closingRules'
import type { CrmInstanceMember, CrmLead, CrmTeamMember } from '@/types/crm'
import type { PackageDefinition } from '@/types/platform'

const packages: PackageDefinition[] = [
  {
    id: 'pkg-basic',
    key: 'basic',
    name: 'CRM Basico',
    description: 'CRM',
    moduleKeys: ['crm'],
    createdAt: '2026-06-04T12:00:00Z',
    updatedAt: '2026-06-04T12:00:00Z',
  },
  {
    id: 'pkg-growth',
    key: 'growth',
    name: 'Maquina Comercial',
    description: 'CRM com campanhas',
    moduleKeys: ['crm', 'proposals', 'campaigns', 'reports', 'finance'],
    createdAt: '2026-06-04T12:00:00Z',
    updatedAt: '2026-06-04T12:00:00Z',
  },
]

const lead = (overrides: Partial<CrmLead> = {}): CrmLead => ({
  id: 'lead-1',
  organizationId: 'org-1',
  crmInstanceId: 'crm-1',
  pipelineId: 'pipeline-1',
  stageId: 'stage-1',
  teamId: 'team-1',
  ownerMemberId: 'member-seller',
  name: 'Ana Lead',
  email: 'ana@example.com',
  phone: '+55 11 99999-0000',
  company: 'Clinica Alpha',
  source: 'Meta Ads',
  sourceKind: 'paid_campaign',
  segment: 'clinica medica',
  interest: 'agenda automatizada',
  status: 'open',
  score: 80,
  value: 25000,
  createdAt: '2026-06-04T12:00:00Z',
  updatedAt: '2026-06-04T12:00:00Z',
  ...overrides,
})

const member = (overrides: Partial<CrmInstanceMember> = {}): CrmInstanceMember => ({
  id: 'member-seller',
  crmInstanceId: 'crm-1',
  userId: 'user-1',
  role: 'seller',
  status: 'active',
  createdAt: '2026-06-04T12:00:00Z',
  updatedAt: '2026-06-04T12:00:00Z',
  ...overrides,
})

describe('closingRules', () => {
  it('allows seller to create proposal for an accessible lead', () => {
    expect(canCreateProposalFromLead(member(), lead()).allowed).toBe(true)
  })

  it('blocks proposal creation when the lead is not accessible', () => {
    expect(canCreateProposalFromLead(member({ id: 'other-seller' }), lead()).allowed).toBe(false)
    expect(canCreateProposalFromLead(undefined, lead()).reason).toBe('missing_member')
  })

  it('recommends package from lead source, segment and value', () => {
    const recommendation = recommendPackageForLead(lead(), packages)

    expect(recommendation?.package.id).toBe('pkg-growth')
    expect(recommendation?.reasons).toContain('module:campaigns')
    expect(recommendation?.moduleKeys).toContain('proposals')
  })

  it('builds proposal draft with inherited CRM context', () => {
    const recommendation = recommendPackageForLead(lead(), packages)!
    const draft = buildProposalFromLeadDraft(lead({ aiSummary: 'Quer melhorar agenda' }), recommendation)

    expect(draft).toMatchObject({
      organizationId: 'org-1',
      leadId: 'lead-1',
      crmInstanceId: 'crm-1',
      packageId: 'pkg-growth',
      title: 'Proposta - Ana Lead',
    })
    expect(draft.scope).toContain('Clinica Alpha')
  })

  it('requires approval for high value proposal', () => {
    expect(requiresClosingApproval({ finalValue: 30000, selectedModuleKeys: ['crm'] })).toEqual({
      required: true,
      reasons: ['high_value'],
    })
  })

  it('builds approved proposal conversion plan and prevents duplicate conversion', () => {
    expect(buildConversionPlan({ id: 'proposal-1', status: 'approved' }, [])).toMatchObject({
      canRun: true,
      idempotencyKey: 'proposal:proposal-1:conversion',
      nextAttemptNumber: 1,
    })

    expect(buildConversionPlan({ id: 'proposal-1', status: 'approved' }, [{ status: 'completed', attemptNumber: 1 }])).toMatchObject({
      canRun: false,
      blockedReason: 'already_converted',
    })
  })

  it('detects retryable conversion failure', () => {
    expect(isConversionRetryable({ status: 'failed', error: 'timeout' })).toBe(true)
    expect(isConversionRetryable({ status: 'completed' })).toBe(false)
  })

  it('allows manager to create proposal for team lead', () => {
    const memberships: CrmTeamMember[] = [{
      id: 'team-member-1',
      teamId: 'team-1',
      memberId: 'manager-1',
      role: 'manager',
      createdAt: '2026-06-04T12:00:00Z',
    }]

    expect(canCreateProposalFromLead(member({ id: 'manager-1', role: 'manager' }), lead(), memberships).allowed).toBe(true)
  })
})
