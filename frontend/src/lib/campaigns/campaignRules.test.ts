import { describe, expect, it } from 'vitest'
import { calculateCampaignMroi, canExecuteProviderMutation, sanitizeCampaignForPortal, validateBudgetChange } from './campaignRules'
import type { Campaign } from '@/types/campaign'

const campaign: Campaign = {
  id: 'campaign-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  providerConnectionId: 'connection-1',
  adAccountId: 'account-1',
  name: 'Botox Junho',
  provider: 'meta',
  objective: 'lead_generation',
  lifecycleStatus: 'active',
  dailyBudget: 50,
  totalBudget: 1500,
  spend: 1000,
  attributedRevenue: 4300,
  impressions: 10000,
  clicks: 500,
  leads: 83,
  cpl: 12.05,
  mroi: 3.3,
  protectedError: 'token abc123 failed',
  executionLogs: [{ id: 'log-1', status: 'failed', protectedError: 'token abc123 failed' }],
  createdAt: '2026-06-03T10:00:00.000Z',
  updatedAt: '2026-06-03T10:00:00.000Z',
}

describe('campaignRules', () => {
  it('requires explicit approval for unsafe budget mutations', () => {
    expect(validateBudgetChange({ currentDaily: 50, nextDaily: 5000 })).toEqual({
      ok: false,
      reason: 'budget_change_requires_explicit_approval',
    })
  })

  it('removes protected provider details from portal campaigns', () => {
    expect(sanitizeCampaignForPortal(campaign)).not.toHaveProperty('protectedError')
    expect(sanitizeCampaignForPortal(campaign).executionLogs).toBeUndefined()
  })

  it('calculates campaign MROI from spend and attributed revenue', () => {
    expect(calculateCampaignMroi({ spend: 1000, attributedRevenue: 4300 })).toBe(3.3)
  })

  it('requires approved campaign before native provider activation', () => {
    expect(canExecuteProviderMutation({
      lifecycleStatus: 'draft',
      providerStatus: 'connected',
      action: 'create_campaign',
      explicitApproval: true,
    })).toEqual({ ok: false, reason: 'campaign_must_be_approved' })

    expect(canExecuteProviderMutation({
      lifecycleStatus: 'approved',
      providerStatus: 'needs_reauth',
      action: 'create_campaign',
      explicitApproval: true,
    })).toEqual({ ok: false, reason: 'provider_needs_reauth' })

    expect(canExecuteProviderMutation({
      lifecycleStatus: 'approved',
      providerStatus: 'connected',
      action: 'create_campaign',
      explicitApproval: false,
    })).toEqual({ ok: false, reason: 'explicit_approval_required' })

    expect(canExecuteProviderMutation({
      lifecycleStatus: 'approved',
      providerStatus: 'connected',
      action: 'create_campaign',
      explicitApproval: true,
    })).toEqual({ ok: true })
  })
})
