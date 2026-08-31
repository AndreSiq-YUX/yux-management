import type { CapabilityEffect } from './capability-registry.js'
import { formatScaledDecimal, parseScaledDecimal } from './economics.js'
import type { AutonomyGrant, MissionMode } from './types.js'

export type AutonomyUsageSnapshot = {
  costBrl: string
  humanMinutes: string
  externalContacts: number
  capabilityCounts: Record<string, number>
  unresolvedExternalEffects: number
}

export type AutonomousPreflightDecision =
  | { outcome: 'allow'; reason: 'autonomy_preflight_allowed' }
  | { outcome: 'approval'; reason: 'autonomy_scope_expansion_requires_approval' }
  | { outcome: 'pause'; reason: string }
  | { outcome: 'deny'; reason: string }

export function calculateAutonomyRemaining(grant: AutonomyGrant, usage: AutonomyUsageSnapshot) {
  const remainingCost = nonNegative(
    parseScaledDecimal(grant.envelope.maxTotalCostBrl, 6) - parseScaledDecimal(usage.costBrl, 6),
  )
  const remainingHumanMinutes = nonNegative(
    parseScaledDecimal(grant.envelope.maxHumanHours, 2) * 60n - parseScaledDecimal(usage.humanMinutes, 2),
  )
  return {
    costBrl: formatScaledDecimal(remainingCost, 6),
    humanMinutes: formatScaledDecimal(remainingHumanMinutes, 2),
    externalContacts: Math.max(0, (grant.envelope.maxExternalContacts ?? 0) - usage.externalContacts),
  }
}

export function evaluateAutonomousPreflight(input: {
  missionMode: MissionMode
  grant: AutonomyGrant | null
  usage: AutonomyUsageSnapshot
  capability: { key: string; effect: CapabilityEffect; requiredModules: readonly string[] }
  projected?: { costBrl?: string; humanMinutes?: string; externalContacts?: number }
  scopeExpansionApproved?: boolean
  now?: Date
}): AutonomousPreflightDecision {
  if (input.missionMode !== 'autonomous') return { outcome: 'allow', reason: 'autonomy_preflight_allowed' }
  const grant = input.grant
  const now = input.now ?? new Date()
  if (!grant || grant.status !== 'active') return pause('autonomy_grant_inactive')
  if (Date.parse(grant.startsAt) > now.getTime()) return pause('autonomy_grant_not_started')
  if (!Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= now.getTime()) {
    return pause('autonomy_grant_expired')
  }

  const capabilityAllowed = grant.envelope.allowedCapabilityKeys.length === 0
    || grant.envelope.allowedCapabilityKeys.includes(input.capability.key)
  const modulesAllowed = input.capability.requiredModules.every((key) => grant.envelope.allowedModules.includes(key))
  if ((!capabilityAllowed || !modulesAllowed || input.capability.effect === 'destructive') && !input.scopeExpansionApproved) {
    return { outcome: 'approval', reason: 'autonomy_scope_expansion_requires_approval' }
  }

  if (input.capability.effect === 'external' && input.usage.unresolvedExternalEffects > 0) {
    return pause('autonomy_external_effect_unresolved')
  }

  const projected = input.projected ?? {}
  const currentCost = parseScaledDecimal(input.usage.costBrl, 6)
  const nextCost = currentCost + parseScaledDecimal(projected.costBrl ?? '0', 6)
  const maximumCost = parseScaledDecimal(grant.envelope.maxTotalCostBrl, 6)
  if (currentCost > maximumCost) return pause('autonomy_cost_limit_exceeded')
  if (nextCost > maximumCost) return pause('autonomy_cost_limit_would_exceed')

  const currentMinutes = parseScaledDecimal(input.usage.humanMinutes, 2)
  const nextMinutes = currentMinutes + parseScaledDecimal(projected.humanMinutes ?? '0', 2)
  const maximumMinutes = parseScaledDecimal(grant.envelope.maxHumanHours, 2) * 60n
  if (currentMinutes > maximumMinutes) return pause('autonomy_human_limit_exceeded')
  if (nextMinutes > maximumMinutes) return pause('autonomy_human_limit_would_exceed')

  const maximumContacts = grant.envelope.maxExternalContacts ?? 0
  if (input.usage.externalContacts > maximumContacts) return pause('autonomy_contact_limit_exceeded')
  if (input.usage.externalContacts + (projected.externalContacts ?? 0) > maximumContacts) {
    return pause('autonomy_contact_limit_would_exceed')
  }
  return { outcome: 'allow', reason: 'autonomy_preflight_allowed' }
}

export function estimateAutonomousEffectUsage(
  capabilityKey: string,
  input: Record<string, unknown>,
): { costBrl: string; humanMinutes: string; externalContacts: number } {
  return {
    costBrl: firstDecimal(input, ['estimatedCostBrl', 'maximumCostBrl']) ?? '0',
    humanMinutes: firstDecimal(input, ['estimatedHumanMinutes'])
      ?? (capabilityKey === 'human.task.create' ? '1' : '0'),
    externalContacts: firstNonNegativeInteger(input, ['externalContactCount'])
      ?? (['email.message.queue', 'whatsapp.template.queue'].includes(capabilityKey) ? 1 : 0),
  }
}

function pause(reason: string): Extract<AutonomousPreflightDecision, { outcome: 'pause' }> {
  return { outcome: 'pause', reason }
}

function firstDecimal(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key]
    if ((typeof value === 'string' || typeof value === 'number') && /^\d+(?:\.\d+)?$/.test(String(value))) return String(value)
  }
  return undefined
}

function firstNonNegativeInteger(input: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  }
  return undefined
}

function nonNegative(value: bigint): bigint { return value > 0n ? value : 0n }
