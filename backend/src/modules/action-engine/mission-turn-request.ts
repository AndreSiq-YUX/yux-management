import type { AppEnv } from '../../config/env.js'
import { createActionEngineCapabilityRegistry } from './capabilities/index.js'
import { createCapabilityManifest } from './capability-manifest.js'
import { buildMissionOperationalContext } from './context-builder.js'
import { buildMissionAccountAvailability, resolveMissionAccountAccess } from './mission-account-availability.js'
import { resolveRadarMissionAvailability } from './radar-pack-registration.js'
import { conversationPackAvailable } from './conversation-pack-availability.js'
import { CAMPAIGN_LAUNCH_PACK_V1 } from './packs/campaign-launch-v1.js'
import { CAMPAIGN_OPTIMIZATION_PACK_V1 } from './packs/campaign-optimization-v1.js'
import { CRM_PREPARATION_PACK_V1 } from './packs/crm-preparation-v1.js'
import { FUNNEL_NURTURE_PACK_V1 } from './packs/funnel-nurture-v1.js'
import { RADAR_PROSPECTING_PACK_V1 } from './packs/radar-prospecting-v1.js'
import { REVENUE_RECOVERY_PACK_V0 } from './packs/revenue-recovery-v0.js'
import type { MissionConversationTurnRequestWire } from './generated/mission-wire.js'
import type { Queryable } from './repository.js'
import type { MissionConversationMessage } from './types.js'
import { getCompanyStrategyRevisionForEditing, canConfigureCompanyStrategy, listCompanyStrategies } from '../company-strategy/repository.js'

export async function buildMissionTurnRequest(pool: Queryable, env: AppEnv, input: {
  organizationId: string
  contractId?: string
  actorId: string
  conversationId: string
  audience: MissionConversationTurnRequestWire['audience']
  message: string
  currentBrief: Record<string, unknown>
  messages: Array<Pick<MissionConversationMessage, 'actorType' | 'content'>>
  preview?: boolean
}) {
  const { organizationId, audience } = input
  const registry = createActionEngineCapabilityRegistry()
  const [access, radar] = await Promise.all([
    resolveMissionAccountAccess(pool, env, { organizationId, actorId: input.actorId, contractId: input.contractId ?? null }),
    resolveRadarMissionAvailability(pool, env, organizationId, input.actorId),
  ])
  const availability = buildMissionAccountAvailability(registry, access, radar)
  const metadata = availability.capabilities
  const manifest = createCapabilityManifest(registry, metadata.map((item) => ({ key: item.key, version: item.version })))
  const operational = await buildMissionOperationalContext(pool, {
    organizationId,
    ...(input.contractId ? { contractId: input.contractId } : {}),
    query: input.message,
    requestedModules: access.enabledModules,
    capabilityManifest: manifest.entries,
    platformToolCatalog: availability.catalog,
    accountAvailability: availability.snapshot,
    restrictMemoryToContract: true,
    packKeys: stringArray(input.currentBrief.packKeys),
  })
  const tenant = await pool.query<{ client_id: string | null }>(
    `SELECT client_id FROM public.organizations WHERE id = $1 LIMIT 1`, [organizationId],
  )
  const bounded = boundTranscript(input.messages)
  const allowedKeys = new Set(manifest.entries.map(item => item.key))
  const packs = [CRM_PREPARATION_PACK_V1, REVENUE_RECOVERY_PACK_V0, FUNNEL_NURTURE_PACK_V1, CAMPAIGN_LAUNCH_PACK_V1, CAMPAIGN_OPTIMIZATION_PACK_V1, RADAR_PROSPECTING_PACK_V1]
    .filter(pack => conversationPackAvailable(pack, allowedKeys, operational.accountAvailability!))
  const request: MissionConversationTurnRequestWire = {
    schemaVersion: 1,
    organization_id: organizationId,
    client_id: tenant.rows[0]?.client_id ?? undefined,
    contract_id: input.contractId,
    conversation_id: input.conversationId,
    audience,
    user_message: input.message,
    transcript: bounded.transcript as MissionConversationTurnRequestWire['transcript'],
    rollingSummary: bounded.rollingSummary,
    currentBrief: input.currentBrief,
    operationalContext: operational,
    allowedActionPacks: packs.map((pack) => ({
      key: pack.key, version: pack.semanticVersion, contentHash: pack.contentHash,
    })) as MissionConversationTurnRequestWire['allowedActionPacks'],
    allowedCapabilityKeys: manifest.entries.map((item) => item.key),
  }
  const conversationOperational=request.operationalContext!
  conversationOperational.companyStrategyAccess={canPropose:canConfigureCompanyStrategy(access.role)}
  if(!input.preview && canConfigureCompanyStrategy(access.role)) {
    const strategies=await listCompanyStrategies(pool as never,{organizationId,actorId:input.actorId,role:access.role})
    conversationOperational.companyStrategyRecords=strategies.filter(strategy=>!strategy.archivedAt).map(strategy=>({strategyId:strategy.id,version:strategy.version,title:(strategy.publishedRevision??strategy.draftRevision)?.content.title,revisionId:(strategy.draftRevision??strategy.publishedRevision)?.id,hasDraft:Boolean(strategy.draftRevision)}))
  }
  const review=input.currentBrief.companyStrategyReview as {strategyId:string;revisionId:string;expectedVersion:number}|undefined
  if(review && canConfigureCompanyStrategy(access.role)) {
    const revision=await getCompanyStrategyRevisionForEditing(pool,{organizationId,actorId:input.actorId,role:access.role},review.strategyId,review.revisionId)
    conversationOperational.companyStrategyReview={...review,workingDraft:revision.content}
  }
  return { request, access }
}

function boundTranscript(messages: Array<Pick<MissionConversationMessage, 'actorType' | 'content'>>) {
  const recent = messages.slice(-20)
  let remaining = 20_000
  const transcript = recent.map((message) => {
    const content = message.content.slice(0, Math.max(0, remaining))
    remaining -= content.length
    return { role: message.actorType === 'user' ? 'user' as const : 'agent' as const, content }
  }).filter((message) => message.content.length > 0)
  const older = messages.slice(0, Math.max(0, messages.length - 20))
  const rollingSummary = older.map((message) => `${message.actorType}: ${message.content}`).join('\n').slice(-8_000)
  return { transcript, rollingSummary }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
