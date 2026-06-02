import type {
  AiCostEstimate,
  AiTokenPrices,
  AiTokenUsage,
  ChannelEventIdempotencyInput,
  CrmSyncContext,
  CrmSyncDecision,
  CrmSyncFilters,
  HandoffCondition,
  HandoffOutcome,
  HandoffRule,
  KnowledgeEntry,
  OmnichannelRoutingCandidates,
  OmnichannelRuleContext,
  ResponseMode,
  RoutingCandidate,
} from '@/types/omnichannel'

const DEFAULT_RETENTION_MONTHS = 12

export function buildChannelEventIdempotencyKey(input: ChannelEventIdempotencyInput) {
  return `${input.connectionId}:${input.eventType}:${input.externalEventId}`
}

export function decideResponseMode(mode: ResponseMode, context: OmnichannelRuleContext): ResponseMode {
  if (mode === 'manual') return 'manual'
  if (mode === 'assisted') return 'assisted'
  if (context.humanRequested || context.aiConfidence !== undefined && context.aiConfidence < 0.5) return 'assisted'
  return 'automatic'
}

export function matchesHandoffRule(rule: HandoffRule, context: OmnichannelRuleContext) {
  const matches = rule.conditions.map(condition => matchesHandoffCondition(condition, context))
  if (rule.combinator === 'any') return matches.some(Boolean)
  return matches.every(Boolean)
}

export function selectHandoffOutcome(rules: HandoffRule[], context: OmnichannelRuleContext): HandoffOutcome | undefined {
  const sortedRules = [...rules].sort((left, right) => left.priority - right.priority)
  return sortedRules.find(rule => matchesHandoffRule(rule, context))?.outcome
}

export function selectRoutingCandidate(
  outcome: HandoffOutcome,
  candidates: OmnichannelRoutingCandidates,
): RoutingCandidate | undefined {
  if (outcome.type !== 'route') return undefined
  if (outcome.queueId) return { queueId: outcome.queueId }
  if (outcome.fixedUserId) return { userId: outcome.fixedUserId }
  if (outcome.useLeadOwner && candidates.leadOwnerUserId) return { userId: candidates.leadOwnerUserId }

  if (outcome.teamId) {
    const member = candidates.teamMembers.find(candidate => candidate.teamId === outcome.teamId && candidate.available)
    if (member) return { userId: member.userId, teamId: member.teamId }
  }

  if (candidates.supervisorUserId) return { userId: candidates.supervisorUserId }
  return undefined
}

export function shouldSyncConversationToCrm(filters: CrmSyncFilters, context: CrmSyncContext): CrmSyncDecision {
  const reasons: CrmSyncDecision['reasons'] = []
  const tagIds = context.tagIds ?? []

  if (filters.channels?.length && !filters.channels.includes(context.channel)) {
    reasons.push('channel_not_allowed')
  }

  if (filters.requiredTagIds?.some(tagId => !tagIds.includes(tagId))) {
    reasons.push('missing_required_tag')
  }

  if (filters.excludedTagIds?.some(tagId => tagIds.includes(tagId))) {
    reasons.push('has_excluded_tag')
  }

  if (filters.statuses?.length && (!context.status || !filters.statuses.includes(context.status))) {
    reasons.push('status_not_allowed')
  }

  if (filters.onlyQualifiedLeads && !context.leadQualified) {
    reasons.push('lead_not_qualified')
  }

  return { shouldSync: reasons.length === 0, reasons }
}

export function calculateRetentionDeadline(createdAt: string, months = DEFAULT_RETENTION_MONTHS) {
  const deadline = new Date(createdAt)
  deadline.setUTCMonth(deadline.getUTCMonth() + months)
  return deadline.toISOString()
}

export function getKnowledgeEntriesForAi<T extends KnowledgeEntry>(entries: T[]) {
  return entries.filter(entry => entry.state === 'published')
}

export function estimateAiCost(usage: AiTokenUsage, prices: AiTokenPrices): AiCostEstimate {
  const inputCost = usage.inputTokens / 1_000_000 * prices.inputPerMillion
  const outputCost = usage.outputTokens / 1_000_000 * prices.outputPerMillion
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  }
}

export function isAllowedWidgetOrigin(origin: string, allowedOrigins: string[]) {
  const parsedOrigin = parseOrigin(origin)
  if (!parsedOrigin) return false

  return allowedOrigins.some(allowedOrigin => {
    if (allowedOrigin === '*') return true

    const parsedAllowedOrigin = parseOrigin(allowedOrigin.replace('://*.', '://wildcard.'))
    if (!parsedAllowedOrigin) return false

    if (allowedOrigin.includes('://*.')) {
      const suffix = parsedAllowedOrigin.hostname.replace(/^wildcard\./, '')
      return parsedOrigin.protocol === parsedAllowedOrigin.protocol && parsedOrigin.hostname.endsWith(`.${suffix}`)
    }

    return parsedOrigin.origin === parsedAllowedOrigin.origin
  })
}

function matchesHandoffCondition(condition: HandoffCondition, context: OmnichannelRuleContext) {
  if (condition.type === 'human_request') return Boolean(context.humanRequested)
  if (condition.type === 'low_confidence') return context.aiConfidence !== undefined && context.aiConfidence < condition.threshold
  if (condition.type === 'critical_keyword') return matchesAnyKeyword(context.messageText, condition.keywords)
  if (condition.type === 'qualified_lead') return Boolean(context.leadQualified)
  if (condition.type === 'purchase_intent') return Boolean(context.purchaseIntent)
  if (condition.type === 'scheduling_intent') return Boolean(context.schedulingIntent)
  if (condition.type === 'business_hours') return context.isBusinessHours === condition.expected
  if (condition.type === 'sla_threshold') return context.slaElapsedMinutes !== undefined && context.slaElapsedMinutes >= condition.minutes
  if (condition.type === 'sentiment') return context.sentiment === condition.sentiment
  if (condition.type === 'repeated_contact') return (context.repeatedContactCount ?? 0) >= condition.count
  if (condition.type === 'channel') return context.channel === condition.channel
  if (condition.type === 'tag') return Boolean(context.tagIds?.includes(condition.tagId))
  if (condition.type === 'queue') return context.currentQueueId === condition.queueId
  return context.responsibleUserId === condition.userId
}

function matchesAnyKeyword(messageText: string | undefined, keywords: string[]) {
  const normalizedText = messageText?.toLocaleLowerCase() ?? ''
  return keywords.some(keyword => normalizedText.includes(keyword.toLocaleLowerCase()))
}

function parseOrigin(origin: string) {
  try {
    return new URL(origin)
  } catch {
    return undefined
  }
}
