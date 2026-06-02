import { describe, expect, it } from 'vitest'
import {
  buildChannelEventIdempotencyKey,
  calculateRetentionDeadline,
  decideResponseMode,
  estimateAiCost,
  getKnowledgeEntriesForAi,
  isAllowedWidgetOrigin,
  matchesHandoffRule,
  selectHandoffOutcome,
  selectRoutingCandidate,
  shouldSyncConversationToCrm,
} from './omnichannelRules'
import type {
  AiTokenPrices,
  HandoffRule,
  OmnichannelRoutingCandidates,
  OmnichannelRuleContext,
} from '@/types/omnichannel'

const baseContext: OmnichannelRuleContext = {
  channel: 'whatsapp',
  currentQueueId: 'queue-support',
  responsibleUserId: 'user-owner',
  tagIds: ['vip', 'enterprise'],
  humanRequested: false,
  aiConfidence: 0.91,
  messageText: 'Quero agendar uma conversa sobre a proposta',
  leadQualified: true,
  purchaseIntent: true,
  schedulingIntent: true,
  isBusinessHours: true,
  slaElapsedMinutes: 15,
  sentiment: 'positive',
  repeatedContactCount: 1,
}

describe('omnichannel domain rules', () => {
  it('builds a stable idempotency key from connection, external event and event type', () => {
    expect(buildChannelEventIdempotencyKey({
      connectionId: 'conn-1',
      externalEventId: 'evt-9',
      eventType: 'message.created',
    })).toBe('conn-1:message.created:evt-9')
  })

  it('decides response modes from organization mode and context', () => {
    expect(decideResponseMode('automatic', baseContext)).toBe('automatic')
    expect(decideResponseMode('automatic', { ...baseContext, humanRequested: true })).toBe('assisted')
    expect(decideResponseMode('assisted', baseContext)).toBe('assisted')
    expect(decideResponseMode('manual', baseContext)).toBe('manual')
  })

  it('matches handoff rules with all and any combinators', () => {
    const allRule: HandoffRule = {
      id: 'all',
      priority: 10,
      combinator: 'all',
      conditions: [
        { type: 'human_request' },
        { type: 'low_confidence', threshold: 0.5 },
      ],
      outcome: { type: 'assist' },
    }
    const anyRule: HandoffRule = {
      ...allRule,
      id: 'any',
      combinator: 'any',
    }

    const context = { ...baseContext, humanRequested: true, aiConfidence: 0.8 }

    expect(matchesHandoffRule(allRule, context)).toBe(false)
    expect(matchesHandoffRule(anyRule, context)).toBe(true)
  })

  it('selects the first matching outcome by ascending priority', () => {
    const rules: HandoffRule[] = [
      {
        id: 'later',
        priority: 20,
        combinator: 'all',
        conditions: [{ type: 'purchase_intent' }],
        outcome: { type: 'route', queueId: 'queue-sales' },
      },
      {
        id: 'first',
        priority: 5,
        combinator: 'all',
        conditions: [{ type: 'qualified_lead' }],
        outcome: { type: 'route', queueId: 'queue-priority' },
      },
    ]

    expect(selectHandoffOutcome(rules, baseContext)).toEqual({ type: 'route', queueId: 'queue-priority' })
  })

  it('evaluates supported handoff condition types', () => {
    const rule: HandoffRule = {
      id: 'complete',
      priority: 1,
      combinator: 'all',
      conditions: [
        { type: 'human_request' },
        { type: 'low_confidence', threshold: 0.7 },
        { type: 'critical_keyword', keywords: ['cancelar', 'reembolso'] },
        { type: 'qualified_lead' },
        { type: 'purchase_intent' },
        { type: 'scheduling_intent' },
        { type: 'business_hours', expected: false },
        { type: 'sla_threshold', minutes: 30 },
        { type: 'sentiment', sentiment: 'negative' },
        { type: 'repeated_contact', count: 3 },
        { type: 'channel', channel: 'email' },
        { type: 'tag', tagId: 'urgent' },
        { type: 'queue', queueId: 'queue-billing' },
        { type: 'responsible_user', userId: 'user-2' },
      ],
      outcome: { type: 'manual' },
    }

    expect(matchesHandoffRule(rule, {
      ...baseContext,
      channel: 'email',
      currentQueueId: 'queue-billing',
      responsibleUserId: 'user-2',
      tagIds: ['urgent'],
      humanRequested: true,
      aiConfidence: 0.6,
      messageText: 'Preciso cancelar e quero reembolso',
      isBusinessHours: false,
      slaElapsedMinutes: 31,
      sentiment: 'negative',
      repeatedContactCount: 3,
    })).toBe(true)
  })

  it('selects routing candidates by explicit queue, team, owner, available team member, fixed user and supervisor fallback', () => {
    const candidates: OmnichannelRoutingCandidates = {
      leadOwnerUserId: 'user-owner',
      supervisorUserId: 'user-supervisor',
      teamMembers: [
        { userId: 'user-busy', teamId: 'team-sales', available: false },
        { userId: 'user-available', teamId: 'team-sales', available: true },
      ],
    }

    expect(selectRoutingCandidate({ type: 'route', queueId: 'queue-explicit' }, candidates)).toEqual({ queueId: 'queue-explicit' })
    expect(selectRoutingCandidate({ type: 'route', teamId: 'team-sales' }, candidates)).toEqual({ userId: 'user-available', teamId: 'team-sales' })
    expect(selectRoutingCandidate({ type: 'route', useLeadOwner: true }, candidates)).toEqual({ userId: 'user-owner' })
    expect(selectRoutingCandidate({ type: 'route', fixedUserId: 'user-fixed' }, candidates)).toEqual({ userId: 'user-fixed' })
    expect(selectRoutingCandidate({ type: 'route', teamId: 'team-empty' }, candidates)).toEqual({ userId: 'user-supervisor' })
  })

  it('filters CRM sync eligibility', () => {
    expect(shouldSyncConversationToCrm({
      channels: ['whatsapp'],
      requiredTagIds: ['enterprise'],
      excludedTagIds: ['spam'],
      statuses: ['open'],
      onlyQualifiedLeads: true,
    }, {
      channel: 'whatsapp',
      tagIds: ['enterprise'],
      status: 'open',
      leadQualified: true,
    })).toEqual({ shouldSync: true, reasons: [] })

    expect(shouldSyncConversationToCrm({
      channels: ['instagram'],
      requiredTagIds: ['enterprise'],
      excludedTagIds: ['spam'],
      statuses: ['resolved'],
      onlyQualifiedLeads: true,
    }, {
      channel: 'whatsapp',
      tagIds: ['spam'],
      status: 'open',
      leadQualified: false,
    })).toEqual({
      shouldSync: false,
      reasons: ['channel_not_allowed', 'missing_required_tag', 'has_excluded_tag', 'status_not_allowed', 'lead_not_qualified'],
    })
  })

  it('calculates conversation and attachment retention deadlines', () => {
    expect(calculateRetentionDeadline('2026-01-15T12:00:00.000Z')).toBe('2027-01-15T12:00:00.000Z')
    expect(calculateRetentionDeadline('2026-01-15T12:00:00.000Z', 3)).toBe('2026-04-15T12:00:00.000Z')
  })

  it('returns only published knowledge entries for AI', () => {
    expect(getKnowledgeEntriesForAi([
      { id: 'draft', state: 'draft', title: 'Draft' },
      { id: 'published', state: 'published', title: 'Published' },
      { id: 'archived', state: 'archived', title: 'Archived' },
    ])).toEqual([{ id: 'published', state: 'published', title: 'Published' }])
  })

  it('estimates AI cost from input and output token prices', () => {
    const prices: AiTokenPrices = { inputPerMillion: 2, outputPerMillion: 8 }

    expect(estimateAiCost({ inputTokens: 500_000, outputTokens: 250_000 }, prices)).toEqual({
      inputCost: 1,
      outputCost: 2,
      totalCost: 3,
    })
  })

  it('matches allowed origins for the webchat widget', () => {
    expect(isAllowedWidgetOrigin('https://app.example.com', ['https://app.example.com'])).toBe(true)
    expect(isAllowedWidgetOrigin('https://sales.example.com', ['https://*.example.com'])).toBe(true)
    expect(isAllowedWidgetOrigin('https://example.org', ['https://*.example.com'])).toBe(false)
    expect(isAllowedWidgetOrigin('not a url', ['*'])).toBe(false)
  })
})
