import { describe, expect, it, vi } from 'vitest'
import {
  buildClosingChecklistPayload,
  buildCrmConversionRunPatch,
  buildProposalFollowUpPayload,
  buildProposalObjectionPayload,
  buildProposalViewEventPayload,
  buildRecommendationPayload,
  defaultClosingChecklistSteps,
  mapCrmProposalConversionRun,
  mapProposalViewEvent,
} from './crmClosingService'
import type { CrmLead } from '@/types/crm'
import type { PackageDefinition } from '@/types/platform'

vi.mock('@/lib/crmClosingDataClient', () => ({
  crmClosingDataClient: {},
}))

const lead: CrmLead = {
  id: 'lead-1',
  organizationId: 'org-1',
  crmInstanceId: 'crm-1',
  pipelineId: 'pipeline-1',
  stageId: 'stage-1',
  name: 'Ana Lead',
  email: 'ana@example.com',
  source: 'Meta Ads',
  status: 'open',
  score: 80,
  createdAt: '2026-06-04T12:00:00Z',
  updatedAt: '2026-06-04T12:00:00Z',
}

const pkg: PackageDefinition = {
  id: 'pkg-1',
  key: 'growth',
  name: 'Growth',
  description: 'Pacote comercial',
  moduleKeys: ['crm', 'proposals', 'finance'],
  createdAt: '2026-06-04T12:00:00Z',
  updatedAt: '2026-06-04T12:00:00Z',
}

describe('crmClosingService builders and mappers', () => {
  it('builds recommendation payload', () => {
    expect(buildRecommendationPayload(lead, {
      package: pkg,
      score: 85,
      reasons: ['module:crm'],
      moduleKeys: ['crm', 'proposals'],
    })).toEqual({
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      package_id: 'pkg-1',
      module_keys: ['crm', 'proposals'],
      score: 85,
      reasons: ['module:crm'],
      status: 'suggested',
    })
  })

  it('builds event, follow-up and objection payloads', () => {
    expect(buildProposalViewEventPayload({
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      leadId: 'lead-1',
      proposalId: 'proposal-1',
      eventType: 'viewed',
      actorType: 'client',
      metadata: { source: 'portal' },
    })).toEqual({
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      proposal_id: 'proposal-1',
      event_type: 'viewed',
      actor_type: 'client',
      actor_id: null,
      metadata: { source: 'portal' },
    })

    expect(buildProposalFollowUpPayload({
      organizationId: 'org-1',
      leadId: 'lead-1',
      proposalId: 'proposal-1',
      title: ' Retomar proposta ',
      dueAt: '2026-06-05T12:00:00Z',
    })).toMatchObject({
      title: 'Retomar proposta',
      status: 'pending',
    })

    expect(buildProposalObjectionPayload({
      organizationId: 'org-1',
      leadId: 'lead-1',
      proposalId: 'proposal-1',
      category: ' preco ',
      description: ' Achou caro ',
    })).toMatchObject({
      category: 'preco',
      description: 'Achou caro',
      status: 'open',
    })
  })

  it('builds closing checklist payload', () => {
    expect(buildClosingChecklistPayload({
      id: 'proposal-1',
      organizationId: 'org-1',
      leadId: 'lead-1',
      crmInstanceId: 'crm-1',
    })).toEqual({
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      proposal_id: 'proposal-1',
      status: 'open',
      steps: defaultClosingChecklistSteps,
    })
  })

  it('builds conversion patch with idempotency key', () => {
    const patch = buildCrmConversionRunPatch({
      id: 'proposal-1',
      organizationId: 'org-1',
      leadId: 'lead-1',
      crmInstanceId: 'crm-1',
    }, 'proposal:proposal-1:conversion', {
      clientId: 'client-1',
      contractId: 'contract-1',
      projectId: 'project-1',
    })

    expect(patch).toMatchObject({
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      idempotency_key: 'proposal:proposal-1:conversion',
      client_id: 'client-1',
      contract_id: 'contract-1',
      project_id: 'project-1',
    })
  })

  it('maps events and conversion runs', () => {
    expect(mapProposalViewEvent({
      id: 'event-1',
      organization_id: 'org-1',
      crm_instance_id: null,
      lead_id: 'lead-1',
      proposal_id: 'proposal-1',
      event_type: 'accepted',
      actor_type: 'client',
      actor_id: null,
      metadata: {},
      created_at: '2026-06-04T12:00:00Z',
    })).toMatchObject({
      id: 'event-1',
      eventType: 'accepted',
      actorType: 'client',
    })

    expect(mapCrmProposalConversionRun({
      id: 'run-1',
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      lead_id: 'lead-1',
      proposal_id: 'proposal-1',
      idempotency_key: null,
      status: 'completed',
      attempt_number: '2',
      client_id: 'client-1',
      contract_id: null,
      project_id: null,
      invoice_id: null,
      error: null,
      created_at: '2026-06-04T12:00:00Z',
      completed_at: null,
    })).toMatchObject({
      attemptNumber: 2,
      idempotencyKey: 'proposal:proposal-1:conversion',
      clientId: 'client-1',
    })
  })
})
