import type { AppEnv } from '../../config/env.js'
import type { ActionPackVersion } from './action-pack.js'
import { createActionEngineCapabilityRegistry } from './capabilities/index.js'
import { createCapabilityManifest } from './capability-manifest.js'
import { buildMissionOperationalContext } from './context-builder.js'
import type { MissionSourceRefWire } from './generated/mission-wire.js'
import { addCompanyStrategyToMissionPlanning } from './mission-company-strategy.js'
import { getMissionConversationForMission } from './mission-conversations.js'
import { composeVerifiedMissionContext, verifyMissionKnowledgeContext } from './mission-source-verifier.js'
import { CAMPAIGN_LAUNCH_PACK_V1 } from './packs/campaign-launch-v1.js'
import { CAMPAIGN_OPTIMIZATION_PACK_V1 } from './packs/campaign-optimization-v1.js'
import { RADAR_PROSPECTING_PACK_V1 } from './packs/radar-prospecting-v1.js'
import { REVENUE_RECOVERY_PACK_V0 } from './packs/revenue-recovery-v0.js'
import type { PlanningCycleBudget } from './planning-cycle.js'
import { RADAR_MISSION_KNOWLEDGE_SCOPE, retrieveRadarMissionKnowledge } from './radar-knowledge-context.js'
import { radarMissionAvailable } from './radar-pack-registration.js'
import { getPlan, type Queryable } from './repository.js'
import type { ActionMission } from './types.js'

export async function buildMissionPlanningCatalog(pool: Queryable, env: AppEnv, mission: ActionMission) {
  const { organizationId } = mission
  const registry = createActionEngineCapabilityRegistry()
  const packs = await loadMissionActionPacks(pool, mission.packVersionId, mission.packSelection)
  const pack = packs[0]!
  if (packs.some(item => item.key === 'crm_preparation') && (packs.length !== 1 || mission.mode !== 'prepare')) throw new Error('crm_preparation_scope_invalid')
  const radar=packs.some(item=>item.key===RADAR_PROSPECTING_PACK_V1.key)
  if(radar&&(!await radarMissionAvailable(pool,env,organizationId,mission.createdBy)||mission.mode!=='assisted'||packs.length!==1))throw new Error('radar_mission_unavailable')
  const serializablePacks = packs.map((item) => {
    const { parameters: _runtimeSchema, ...serializable } = item as ActionPackVersion & { parameters?: unknown }
    return serializable
  })
  const serializablePack = serializablePacks[0]!
  const allowedKeys = new Set(packs.flatMap((item) => item.allowedCapabilities.map((capability) => capability.key)))
  const capabilityCatalog = registry.listMetadata().filter((item) => allowedKeys.has(item.key))
  return { registry, packs, pack, radar, serializablePack, serializablePacks, capabilityCatalog }
}

type PlanningCatalog = Awaited<ReturnType<typeof buildMissionPlanningCatalog>>

export async function buildMissionPlanningContext(
  pool: Queryable, mission: ActionMission, catalog: PlanningCatalog, preview = false,
) {
  const { id: missionId, organizationId } = mission
  const { registry, packs, radar, capabilityCatalog } = catalog
  const manifest = createCapabilityManifest(
    registry,
    capabilityCatalog.map((item) => ({ key: item.key, version: item.version })),
  )
  const operationalContext = await buildMissionOperationalContext(pool, {
    organizationId, ...(mission.contractId ? { contractId: mission.contractId } : {}),
    query: `${mission.goal.statement}\n${mission.goal.requestedOutcome}`,
    agentProfileKey: 'mission_supervisor',
    requestedModules: mission.autonomyEnvelope.allowedModules,
    capabilityManifest: manifest.entries,
    packKeys: packs.map(item => item.key),
    restrictMemoryToContract: true,
  })
  const linkedConversation = await getMissionConversationForMission(pool, missionId, organizationId)
  let groundingMetadata: Record<string, unknown> | null = null
  let planningContext = {
    query: operationalContext.query,
    companyContext: operationalContext.companyContext as Record<string, unknown>,
    knowledgeItems: operationalContext.knowledgeItems as Array<Record<string, unknown>>,
    strategyItems: operationalContext.strategyItems as Array<Record<string, unknown>>,
    learningMemoryItems: operationalContext.learningMemoryItems as Array<Record<string, unknown>>,
    liveState: { ...operationalContext.liveState, providerHealth: operationalContext.providerHealth },
    capabilityManifest: operationalContext.capabilityManifest,
    capabilityCatalogHash: operationalContext.capabilityCatalogHash,
    sourceIds: operationalContext.sourceIds,
    contextHash: operationalContext.contextHash,
    harnessRetrievalTraceId: undefined as string | undefined,
    harnessKnowledgeContextHash: undefined as string | undefined,
  }
  if (radar) {
    const knowledge=await retrieveRadarMissionKnowledge(pool,{organizationId,...(mission.contractId?{contractId:mission.contractId}:{}), record: !preview})
    groundingMetadata={...RADAR_MISSION_KNOWLEDGE_SCOPE,contractId:mission.contractId}
    const composed=composeVerifiedMissionContext({organizationId,companyContext:linkedConversation?companyContextFromConversation(linkedConversation.contextReadiness):{},operational:operationalContext,knowledge:knowledge.verified,harnessRetrievalTraceId:knowledge.queryId,harnessKnowledgeContextHash:knowledge.contextHash})
    planningContext={...planningContext,companyContext:composed.companyContext,knowledgeItems:composed.knowledgeItems,strategyItems:composed.strategyItems,learningMemoryItems:composed.approvedLearningMemory,liveState:composed.liveState,sourceIds:composed.sourceIds,contextHash:composed.contextHash,harnessRetrievalTraceId:composed.harnessRetrievalTraceId,harnessKnowledgeContextHash:composed.harnessKnowledgeContextHash}
  } else if (linkedConversation?.lastHarnessRunId && linkedConversation.lastContextHash) {
    const latestGroundedMessage = [...linkedConversation.messages].reverse().find(message => message.actorType === 'agent' && message.sourceRefs.length)
    const sourceRefs = (latestGroundedMessage?.sourceRefs ?? []) as unknown as MissionSourceRefWire[]
    const audience = sourceRefs.some(source => (source.kind.startsWith('knowledge_') || source.kind === 'company_strategy') && source.visibility === 'internal')
      ? 'internal_operator' as const : 'client_user' as const
    groundingMetadata = {
      audience,
      agentProfileKey: 'growth_strategist',
      contractId: mission.contractId,
      moduleKey: 'marketing_studio',
      workflowKey: 'mission_intake_conversation',
      channel: null,
    }
    const verified = await verifyMissionKnowledgeContext(pool, {
      organizationId, audience, sourceRefs, agentProfileKey: 'growth_strategist',
      contractId: mission.contractId, moduleKey: 'marketing_studio', workflowKey: 'mission_intake_conversation',
    })
    const allowedSourceIds = [...new Set([
      ...verified.sources.map(source => source.id), ...verified.sourceIds,
    ])].sort()
    const composed = composeVerifiedMissionContext({
      organizationId,
      companyContext: companyContextFromConversation(linkedConversation.contextReadiness),
      operational: operationalContext,
      knowledge: { ...verified, sourceIds: allowedSourceIds },
      harnessRetrievalTraceId: linkedConversation.lastHarnessRunId,
      harnessKnowledgeContextHash: linkedConversation.lastContextHash,
    })
    planningContext = {
      query: operationalContext.query,
      companyContext: composed.companyContext,
      knowledgeItems: composed.knowledgeItems,
      strategyItems: composed.strategyItems,
      learningMemoryItems: composed.approvedLearningMemory,
      liveState: composed.liveState,
      capabilityManifest: composed.capabilityManifest,
      capabilityCatalogHash: composed.capabilityCatalogHash,
      sourceIds: composed.sourceIds,
      contextHash: composed.contextHash,
      harnessRetrievalTraceId: composed.harnessRetrievalTraceId,
      harnessKnowledgeContextHash: composed.harnessKnowledgeContextHash,
    }
  }
  planningContext = await addCompanyStrategyToMissionPlanning(pool, { organizationId, contractId: mission.contractId, query: planningContext.query, context: planningContext })
  return { planningContext, groundingMetadata, linkedConversation }
}

type PlanningContext = Awaited<ReturnType<typeof buildMissionPlanningContext>>['planningContext']

export function getMissionPlanningLimits(mission: ActionMission) {
  const planningBudget: PlanningCycleBudget = {
    maxCalls: 8,
    maxInputTokens: 50_000,
    maxOutputTokens: 10_000,
    maxCostBrl: planningCostCeiling(mission.budget.maxTotalCostBrl),
    maxLatencyMs: 120_000,
  }
  const planningEstimate = { calls: 1, inputTokens: 12_000, outputTokens: 2_500, costBrl: '5', latencyMs: 60_000 }
  return { planningBudget, planningEstimate }
}

export async function buildMissionPlanRequest(
  pool: Queryable, mission: ActionMission, catalog: PlanningCatalog, planningContext: PlanningContext,
  isReplan: boolean, limits: ReturnType<typeof getMissionPlanningLimits>,
  leases?: { snapshotId: string; cycleId: string },
): Promise<Record<string, unknown>> {
  const { id: missionId, organizationId } = mission
  const { packs, serializablePack, serializablePacks, capabilityCatalog } = catalog
  const { planningBudget, planningEstimate } = limits
  const previousPlan = isReplan && mission.activePlanId ? await getPlan(pool, mission.activePlanId, organizationId) : null
  const previousCompiled = previousPlan && typeof previousPlan === 'object'
    ? Reflect.get(previousPlan, 'compiledPayload') as Record<string, unknown> | undefined
    : undefined
  const observations = isReplan ? await pool.query<Record<string, unknown>>(
    `SELECT observation_type AS "type", payload, observed_at AS "observedAt"
     FROM public.action_observations WHERE mission_id = $1 AND organization_id = $2
     ORDER BY observed_at DESC LIMIT 100`, [missionId, organizationId],
  ) : { rows: [] }
  const providerConnections = packs.some((item) => [CAMPAIGN_LAUNCH_PACK_V1.key,CAMPAIGN_OPTIMIZATION_PACK_V1.key].includes(item.key))
    ? await pool.query<{ id: string; provider: string }>(
      `SELECT id,provider FROM public.ad_provider_connections
       WHERE organization_id=$1 AND status='connected' ORDER BY updated_at DESC`, [organizationId],
    )
    : { rows: [] }
  return {
    organization_id: organizationId,
    ...(mission.contractId ? { contract_id: mission.contractId } : {}),
    mission: {
      id: mission.id, objective: mission.objective, parameters: mission.parameters,
      budget: mission.budget, deadlineAt: mission.deadlineAt,
      goal: mission.goal, autonomyEnvelope: mission.autonomyEnvelope,
    },
    action_pack: serializablePack,
    pack_catalog: serializablePacks,
    readiness: {
      ready: true, source: 'server_preflight',
      providerPlatforms: [...new Set(providerConnections.rows.map(row => row.provider))],
      providerConnections: providerConnections.rows.map(row => ({ id: row.id, platform: row.provider })),
    },
    baseline: planningContext.liveState, capabilities: capabilityCatalog,
    limits: mission.budget,
    strategy_context: {
      companyContext: planningContext.companyContext,
      strategyItems: planningContext.strategyItems,
      knowledgeItems: planningContext.knowledgeItems,
    },
    ...(leases?.snapshotId ? { context_snapshot_id: leases.snapshotId } : {}),
    allowed_source_ids: planningContext.sourceIds,
    asked_question_keys: Array.isArray(mission.packSelection.askedQuestionKeys)
      ? mission.packSelection.askedQuestionKeys.filter((key): key is string => typeof key === 'string')
      : [],
    clarification_round: Number(mission.packSelection.clarificationRound ?? 0),
    observations: observations.rows,
    planning_budget: {
      cycleId: leases?.cycleId,
      contextHash: planningContext.contextHash,
      budget: planningBudget,
      usage: { calls: 0, inputTokens: 0, outputTokens: 0, costBrl: '0', latencyMs: 0 },
      estimate: planningEstimate,
    },
    ...(previousCompiled ? { previous_revision: previousCompiled } : {}),
  }
}

function companyContextFromConversation(readiness: Record<string, unknown>): Record<string, unknown> {
  const facts = Array.isArray(readiness.knownFacts) ? readiness.knownFacts : []
  const companyContext = Object.fromEntries(facts.flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    const item = value as Record<string, unknown>
    return typeof item.key === 'string' ? [[item.key, item.value]] : []
  }))
  const assumptions = Array.isArray(readiness.assumptions) ? readiness.assumptions : []
  return assumptions.length ? { ...companyContext, assumptions } : companyContext
}

function planningCostCeiling(value: unknown): string {
  const total = typeof value === 'string' && /^\d+(\.\d{1,6})?$/.test(value) ? Number(value) : 50
  return String(Math.max(5, Math.min(50, Math.round(total * 0.1 * 100) / 100)))
}

async function loadMissionActionPack(pool: Queryable, packVersionId: string): Promise<ActionPackVersion> {
  const result = await pool.query<{
    key: string; semantic_version: string; outcome_type: string; status: ActionPackVersion['status'];
    definition: Record<string, unknown>; content_hash: string;
  }>(
    `SELECT pack.key, version.semantic_version, version.outcome_type, version.status,
            version.definition, version.content_hash
     FROM public.action_pack_versions version
     JOIN public.action_packs pack ON pack.id = version.pack_id
     WHERE version.id = $1 AND version.status IN ('published_for_internal_pilot','published') LIMIT 1`,
    [packVersionId],
  )
  const row = result.rows[0]
  if (!row) throw new Error('mission_action_pack_unavailable')
  if(row.key===RADAR_PROSPECTING_PACK_V1.key&&row.semantic_version===RADAR_PROSPECTING_PACK_V1.semanticVersion){
    if(row.content_hash!==RADAR_PROSPECTING_PACK_V1.contentHash)throw new Error('action_pack_hash_mismatch')
    return RADAR_PROSPECTING_PACK_V1
  }
  if (row.key === REVENUE_RECOVERY_PACK_V0.key && row.semantic_version === REVENUE_RECOVERY_PACK_V0.semanticVersion) {
    if (row.content_hash !== REVENUE_RECOVERY_PACK_V0.contentHash) throw new Error('action_pack_hash_mismatch')
    return REVENUE_RECOVERY_PACK_V0
  }
  if (row.key === CAMPAIGN_LAUNCH_PACK_V1.key && row.semantic_version === CAMPAIGN_LAUNCH_PACK_V1.semanticVersion) {
    if (row.content_hash !== CAMPAIGN_LAUNCH_PACK_V1.contentHash) throw new Error('action_pack_hash_mismatch')
    return CAMPAIGN_LAUNCH_PACK_V1
  }
  if (row.key === CAMPAIGN_OPTIMIZATION_PACK_V1.key && row.semantic_version === CAMPAIGN_OPTIMIZATION_PACK_V1.semanticVersion) {
    if (row.content_hash !== CAMPAIGN_OPTIMIZATION_PACK_V1.contentHash) throw new Error('action_pack_hash_mismatch')
    return CAMPAIGN_OPTIMIZATION_PACK_V1
  }
  const definition = row.definition
  const pack = {
    ...definition,
    key: row.key,
    semanticVersion: row.semantic_version,
    outcomeType: row.outcome_type,
    status: row.status,
    contentHash: row.content_hash,
  } as ActionPackVersion
  if (pack.schemaVersion !== 1 || !Array.isArray(pack.allowedCapabilities) || !Array.isArray(pack.protectedStepKeys)
    || !pack.topologyTemplate || !Array.isArray(pack.topologyTemplate.steps)) {
    throw new Error('mission_action_pack_contract_invalid')
  }
  return pack
}

async function loadMissionActionPacks(
  pool: Queryable,
  primaryPackVersionId: string,
  packSelection: Record<string, unknown>,
): Promise<ActionPackVersion[]> {
  const primary = await loadMissionActionPack(pool, primaryPackVersionId)
  const rawSelections = Array.isArray(packSelection.packs) ? packSelection.packs : []
  const references = rawSelections.flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    const item = value as Record<string, unknown>
    if (typeof item.key !== 'string' || typeof item.version !== 'string') return []
    return [{ key: item.key, version: item.version, contentHash: typeof item.contentHash === 'string' ? item.contentHash : undefined }]
  })
  if (references.length <= 1) return [primary]
  const packs: ActionPackVersion[] = []
  for (const reference of references) {
    if (reference.key === primary.key && reference.version === primary.semanticVersion) {
      if (reference.contentHash && reference.contentHash !== primary.contentHash) throw new Error('action_pack_hash_mismatch')
      packs.push(primary)
      continue
    }
    const version = await pool.query<{ id: string }>(
      `SELECT version.id FROM public.action_pack_versions version
       JOIN public.action_packs pack ON pack.id = version.pack_id
       WHERE pack.key = $1 AND version.semantic_version = $2
         AND version.status IN ('published_for_internal_pilot','published') LIMIT 1`,
      [reference.key, reference.version],
    )
    if (!version.rows[0]) throw new Error('mission_action_pack_unavailable')
    const resolved = await loadMissionActionPack(pool, version.rows[0].id)
    if (reference.contentHash && reference.contentHash !== resolved.contentHash) throw new Error('action_pack_hash_mismatch')
    packs.push(resolved)
  }
  if (new Set(packs.map((item) => `${item.key}@${item.semanticVersion}`)).size !== packs.length) {
    throw new Error('mission_pack_selection_duplicate')
  }
  return packs
}
