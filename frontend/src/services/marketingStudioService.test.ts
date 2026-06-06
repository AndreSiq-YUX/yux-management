import { describe, expect, it } from 'vitest'
import {
  buildContentInsertPayload,
  buildCalendarItemPayload,
  buildContentReviewPayload,
  buildContentVersionPayload,
  buildIdeaInsertPayload,
  buildUsageLedgerPayload,
  mapMarketingCalendarItem,
  mapMarketingContent,
  mapMarketingContentReview,
  mapMarketingContentVersion,
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

  it('maps content versions and builds version payloads', () => {
    expect(mapMarketingContentVersion({
      id: 'version-1',
      content_item_id: 'content-1',
      version_number: 2,
      title: 'Post v2',
      body: 'Body',
      change_summary: 'Ajuste de CTA',
      created_by: null,
      created_by_agent_id: 'agent-1',
      created_at: '2026-06-05T12:00:00.000Z',
    })).toMatchObject({
      id: 'version-1',
      contentItemId: 'content-1',
      versionNumber: 2,
      changeSummary: 'Ajuste de CTA',
      createdByAgentId: 'agent-1',
    })

    expect(buildContentVersionPayload({
      contentItemId: 'content-1',
      versionNumber: 3,
      title: '  Post v3  ',
      body: ' Body ',
      changeSummary: ' CTA ',
    })).toMatchObject({
      content_item_id: 'content-1',
      version_number: 3,
      title: 'Post v3',
      body: 'Body',
      change_summary: 'CTA',
    })
  })

  it('maps reviews and builds review payloads', () => {
    expect(mapMarketingContentReview({
      id: 'review-1',
      content_item_id: 'content-1',
      reviewer_id: 'user-1',
      status: 'changes_requested',
      quality_score: 72,
      comments: 'Ajustar promessa',
      checklist: { cta: true },
      decided_at: null,
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:30:00.000Z',
    })).toMatchObject({
      id: 'review-1',
      contentItemId: 'content-1',
      reviewerId: 'user-1',
      status: 'changes_requested',
      qualityScore: 72,
      checklist: { cta: true },
    })

    expect(buildContentReviewPayload({
      contentItemId: 'content-1',
      comments: ' Aprovar com ajuste ',
      checklist: { tone: true },
    })).toMatchObject({
      content_item_id: 'content-1',
      status: 'pending',
      comments: 'Aprovar com ajuste',
      checklist: { tone: true },
    })
  })

  it('maps calendar items and builds calendar payloads', () => {
    expect(mapMarketingCalendarItem({
      id: 'calendar-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      content_item_id: 'content-1',
      title: 'Post LinkedIn',
      channel: 'linkedin',
      status: 'planned',
      starts_at: '2026-06-08T12:00:00.000Z',
      ends_at: null,
      responsible_user_id: null,
      metadata: { slot: 'manha' },
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:00:00.000Z',
    })).toMatchObject({
      id: 'calendar-1',
      contentItemId: 'content-1',
      startsAt: '2026-06-08T12:00:00.000Z',
      metadata: { slot: 'manha' },
    })

    expect(buildCalendarItemPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      contentItemId: 'content-1',
      title: '  Post LinkedIn  ',
      channel: 'linkedin',
      startsAt: '2026-06-08T12:00:00.000Z',
    })).toMatchObject({
      organization_id: 'org-1',
      content_item_id: 'content-1',
      title: 'Post LinkedIn',
      channel: 'linkedin',
      status: 'planned',
    })
  })
})
