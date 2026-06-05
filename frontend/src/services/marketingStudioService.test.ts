import { describe, expect, it } from 'vitest'
import {
  buildContentInsertPayload,
  buildIdeaInsertPayload,
  buildUsageLedgerPayload,
  mapMarketingContent,
  mapMarketingSettings,
} from './marketingStudioService'

describe('marketingStudioService mapping helpers', () => {
  it('maps settings rows to camelCase domain objects', () => {
    expect(mapMarketingSettings({
      id: 'settings-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      operation_mode: 'managed_by_yux',
      monthly_credit_limit: 500,
      current_credit_balance: 120,
      approval_policy: { publishSocial: true },
      allowed_channels: ['linkedin'],
      tone_of_voice: 'consultivo',
      persona: null,
      visual_preferences: null,
      forbidden_topics: ['promessa garantida'],
      priority_topics: ['ia para pmes'],
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:00:00.000Z',
    })).toMatchObject({
      id: 'settings-1',
      organizationId: 'org-1',
      operationMode: 'managed_by_yux',
      monthlyCreditLimit: 500,
      currentCreditBalance: 120,
      allowedChannels: ['linkedin'],
      toneOfVoice: 'consultivo',
    })
  })

  it('builds idea insert payload with trimmed fields', () => {
    expect(buildIdeaInsertPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      title: '  Topico  ',
      summary: '  Resumo  ',
      sourceType: 'manual',
      priority: 'high',
      opportunityScore: 80,
    })).toMatchObject({
      organization_id: 'org-1',
      title: 'Topico',
      summary: 'Resumo',
      source_type: 'manual',
      priority: 'high',
      opportunity_score: 80,
    })
  })

  it('builds content insert payload with optional references', () => {
    expect(buildContentInsertPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      title: '  Post  ',
      contentType: 'social_post',
      channel: 'linkedin',
      brief: ' Brief ',
      body: ' Body ',
      cta: ' CTA ',
      campaignId: 'campaign-1',
      landingPageId: 'landing-1',
      sourceIdeaId: 'idea-1',
    })).toMatchObject({
      organization_id: 'org-1',
      title: 'Post',
      brief: 'Brief',
      body: 'Body',
      cta: 'CTA',
      campaign_id: 'campaign-1',
      landing_page_id: 'landing-1',
      source_idea_id: 'idea-1',
    })
  })

  it('maps content rows including internal notes for internal callers', () => {
    const mapped = mapMarketingContent({
      id: 'content-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      title: 'Post',
      content_type: 'social_post',
      channel: 'linkedin',
      status: 'draft',
      brief: null,
      body: 'Body',
      cta: null,
      campaign_id: null,
      landing_page_id: null,
      source_idea_id: null,
      created_by_agent_id: null,
      approved_by: null,
      scheduled_at: null,
      published_at: null,
      published_url: null,
      internal_notes: 'Custo interno',
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:00:00.000Z',
    })

    expect(mapped.internalNotes).toBe('Custo interno')
  })

  it('builds usage ledger payload with numeric defaults', () => {
    expect(buildUsageLedgerPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      action: 'generate_social_post',
      creditsCharged: 5,
    })).toMatchObject({
      organization_id: 'org-1',
      action: 'generate_social_post',
      input_tokens: 0,
      output_tokens: 0,
      raw_cost_estimate: 0,
      credits_charged: 5,
      status: 'pending',
    })
  })
})
