import { describe, expect, it } from 'vitest'
import {
  canTransitionContentStatus,
  calculateCreditsForAction,
  canScheduleContent,
  canSubmitContentForReview,
  getNextVersionNumber,
  requiresHumanApproval,
  sanitizeMarketingContentForPortal,
  selectAllowedAgentTools,
  shouldBlockCreditDebit,
  statusAfterReviewDecision,
  summarizeReviewQueue,
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

  it('calculates next version number from existing content versions', () => {
    expect(getNextVersionNumber([])).toBe(1)
    expect(getNextVersionNumber([{ versionNumber: 1 }, { versionNumber: 3 }])).toBe(4)
  })

  it('allows review submission only for drafted content with body', () => {
    expect(canSubmitContentForReview(content)).toBe(true)
    expect(canSubmitContentForReview({ ...content, body: '' })).toBe(false)
    expect(canSubmitContentForReview({ ...content, status: 'published' })).toBe(false)
  })

  it('maps review decisions to editorial status', () => {
    expect(statusAfterReviewDecision('approved')).toBe('approved')
    expect(statusAfterReviewDecision('changes_requested')).toBe('changes_requested')
    expect(statusAfterReviewDecision('rejected')).toBe('rejected')
    expect(statusAfterReviewDecision('pending')).toBe('in_review')
  })

  it('blocks scheduling unless content is approved and the slot is free', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(canScheduleContent({ content: { ...content, status: 'approved' }, startsAt: future })).toBe(true)
    expect(canScheduleContent({ content, startsAt: future })).toBe(false)
    expect(canScheduleContent({
      content: { ...content, status: 'approved' },
      startsAt: future,
      existingCalendarItems: [{ contentItemId: content.id, startsAt: future, status: 'planned' }],
    })).toBe(false)
  })

  it('summarizes review queue status counts', () => {
    expect(summarizeReviewQueue([
      {
        id: 'review-1',
        contentItemId: 'content-1',
        status: 'pending',
        checklist: {},
        createdAt: '2026-06-05T12:00:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
      },
      {
        id: 'review-2',
        contentItemId: 'content-2',
        status: 'changes_requested',
        checklist: {},
        createdAt: '2026-06-05T12:00:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
      },
    ])).toEqual({ pending: 1, approved: 0, changesRequested: 1, rejected: 0 })
  })
})
