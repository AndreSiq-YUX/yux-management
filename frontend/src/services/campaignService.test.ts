import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: mocks.invoke,
    },
    from: mocks.from,
  },
}))

import { buildCampaignDraftPayload, buildProviderMutationPayload, campaignService } from './campaignService'

describe('campaignService payload builders', () => {
  it('builds API-first campaign draft payloads while preserving legacy fields', () => {
    expect(buildCampaignDraftPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      provider: 'meta',
      providerConnectionId: 'connection-1',
      adAccountId: 'account-1',
      landingPageId: 'lp-1',
      pipelineId: 'pipeline-1',
      initialStageId: 'stage-1',
      name: ' Botox Junho ',
      objective: 'lead_generation',
      dailyBudget: 50,
      totalBudget: 1500,
      startsAt: '2026-06-03T12:00:00.000Z',
    })).toEqual(expect.objectContaining({
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      provider: 'meta',
      platform: 'META',
      name: 'Botox Junho',
      lifecycle_status: 'draft',
      status: 'PAUSED',
      daily_budget: 50,
      total_budget: 1500,
      budget: 1500,
      utm_source: 'meta',
      utm_medium: 'paid',
      utm_campaign: 'botox_junho',
    }))
  })

  it('builds provider mutation payloads with stable campaign idempotency keys', () => {
    expect(buildProviderMutationPayload({
      organizationId: 'org-1',
      provider: 'google',
      action: 'update_budget',
      campaignId: 'campaign-1',
      providerConnectionId: 'connection-1',
      requestPayload: { dailyBudget: 100 },
    })).toEqual(expect.objectContaining({
      organization_id: 'org-1',
      provider: 'google',
      action: 'update_budget',
      campaign_id: 'campaign-1',
      provider_connection_id: 'connection-1',
      request_payload: { dailyBudget: 100 },
      idempotency_key: 'google:update_budget:campaign-1',
    }))
  })

  it('executes approved provider mutation through edge function instead of only inserting a row', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { success: true, run: { id: 'run-1' } }, error: null })

    await campaignService.executeProviderMutation({
      organizationId: 'org-1',
      provider: 'meta',
      action: 'create_campaign',
      campaignId: 'campaign-1',
      providerConnectionId: 'connection-1',
      explicitApproval: true,
      requestPayload: { landingPageUrl: 'https://example.com' },
    })

    expect(mocks.invoke).toHaveBeenCalledWith('execute-ad-provider-mutation', expect.objectContaining({
      body: expect.objectContaining({
        provider: 'meta',
        action: 'create_campaign',
        campaignId: 'campaign-1',
        explicitApproval: true,
      }),
    }))
  })
})
