import type { BudgetChangeInput, BudgetChangeValidation, Campaign, PortalCampaign } from '@/types/campaign'

export function calculateCampaignMroi(input: { spend: number; attributedRevenue: number }) {
  if (input.spend <= 0) return 0
  return Math.round(((input.attributedRevenue - input.spend) / input.spend) * 10) / 10
}

export function validateBudgetChange(input: BudgetChangeInput): BudgetChangeValidation {
  if (input.nextDaily <= 0) {
    return { ok: false, reason: 'budget_must_be_positive' }
  }

  const increaseFactor = input.currentDaily > 0 ? input.nextDaily / input.currentDaily : Infinity
  const absoluteIncrease = input.nextDaily - input.currentDaily

  if (!input.explicitApproval && (increaseFactor >= 3 || absoluteIncrease >= 1000)) {
    return { ok: false, reason: 'budget_change_requires_explicit_approval' }
  }

  return { ok: true }
}

export function sanitizeCampaignForPortal(campaign: Campaign): PortalCampaign {
  const {
    protectedError: _protectedError,
    executionLogs: _executionLogs,
    ...safeCampaign
  } = campaign

  return safeCampaign
}

export function calculateCampaignSummary(campaigns: Campaign[]) {
  const spend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0)
  const leads = campaigns.reduce((sum, campaign) => sum + campaign.leads, 0)
  const attributedRevenue = campaigns.reduce((sum, campaign) => sum + campaign.attributedRevenue, 0)

  return {
    spend,
    leads,
    cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0,
    mroi: calculateCampaignMroi({ spend, attributedRevenue }),
    activeCampaigns: campaigns.filter(campaign => campaign.lifecycleStatus === 'active').length,
  }
}
