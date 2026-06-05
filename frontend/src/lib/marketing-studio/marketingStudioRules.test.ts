import { describe, expect, it } from 'vitest'
import {
  canTransitionContentStatus,
  calculateCreditsForAction,
  requiresHumanApproval,
  sanitizeMarketingContentForPortal,
  selectAllowedAgentTools,
  shouldBlockCreditDebit,
} from './marketingStudioRules'
import type { MarketingContentItem, MarketingStudioSettings } from '@/types/marketingStudio'

const settings: MarketingStudioSettings = {
  id: 'settings-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  operationMode: 'managed_by_yux',
  monthlyCreditLimit: 500,
  currentCreditBalance: 120,
  approvalPolicy: {
    publishSocial: true,
    publishWordPress: true,
    paidCampaignDraft: true,
    premiumImage: true,
    regulatedContent: true,
  },
  allowedChannels: ['linkedin', 'instagram', 'blog', 'newsletter'],
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}

const content: MarketingContentItem = {
  id: 'content-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  title: 'Post sobre funil',
  contentType: 'social_post',
  channel: 'linkedin',
  status: 'draft',
  brief: 'Explicar funil comercial para PMEs',
  body: 'Texto interno',
  cta: 'Fale com a YUX',
  createdByAgentId: 'agent-1',
  internalNotes: 'Margem e custo interno',
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}

describe('marketingStudioRules', () => {
  it('requires human approval for publish and sensitive actions', () => {
    expect(requiresHumanApproval({ action: 'publish_wordpress', settings })).toBe(true)
    expect(requiresHumanApproval({ action: 'generate_short_caption', settings })).toBe(false)
    expect(requiresHumanApproval({ action: 'regulated_claim', settings })).toBe(true)
  })

  it('allows explicit content workflow transitions only', () => {
    expect(canTransitionContentStatus('draft', 'in_review')).toBe(true)
    expect(canTransitionContentStatus('in_review', 'approved')).toBe(true)
    expect(canTransitionContentStatus('approved', 'scheduled')).toBe(true)
    expect(canTransitionContentStatus('draft', 'published')).toBe(false)
    expect(canTransitionContentStatus('rejected', 'published')).toBe(false)
  })

  it('calculates credits by action and premium multiplier', () => {
    expect(calculateCreditsForAction({ action: 'classify_idea' })).toBe(1)
    expect(calculateCreditsForAction({ action: 'generate_blog_article' })).toBe(30)
    expect(calculateCreditsForAction({ action: 'generate_image', premium: true })).toBe(60)
  })

  it('blocks debit when balance or monthly limit is exceeded', () => {
    expect(shouldBlockCreditDebit({ balance: 4, monthlyUsed: 100, monthlyLimit: 500, debit: 5 })).toBe(true)
    expect(shouldBlockCreditDebit({ balance: 20, monthlyUsed: 499, monthlyLimit: 500, debit: 2 })).toBe(true)
    expect(shouldBlockCreditDebit({ balance: 20, monthlyUsed: 100, monthlyLimit: 500, debit: 5 })).toBe(false)
  })

  it('limits agent tools by agent type and operation mode', () => {
    expect(selectAllowedAgentTools({ agentType: 'content_radar', operationMode: 'managed_by_yux' })).toEqual([
      'jina_reader',
      'jina_search',
      'curated_sources',
    ])
    expect(selectAllowedAgentTools({ agentType: 'controlled_publisher', operationMode: 'assisted_client' })).toEqual([
      'create_task',
      'create_wordpress_draft',
    ])
  })

  it('removes internal fields from portal content', () => {
    expect(sanitizeMarketingContentForPortal(content)).toEqual({
      id: 'content-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      title: 'Post sobre funil',
      contentType: 'social_post',
      channel: 'linkedin',
      status: 'draft',
      brief: 'Explicar funil comercial para PMEs',
      body: 'Texto interno',
      cta: 'Fale com a YUX',
      createdByAgentId: 'agent-1',
      createdAt: '2026-06-05T12:00:00.000Z',
      updatedAt: '2026-06-05T12:00:00.000Z',
    })
  })
})
