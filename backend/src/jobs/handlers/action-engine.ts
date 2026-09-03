import type { AppEnv } from '../../config/env.js'
import { createHash } from 'node:crypto'
import type { AppJobQueue } from '../../server.js'
import { createActionEngineCapabilityRegistry } from '../../modules/action-engine/capabilities/index.js'
import { REVENUE_RECOVERY_PACK_V0 } from '../../modules/action-engine/packs/revenue-recovery-v0.js'
import { CAMPAIGN_LAUNCH_PACK_V1 } from '../../modules/action-engine/packs/campaign-launch-v1.js'
import { CAMPAIGN_OPTIMIZATION_PACK_V1 } from '../../modules/action-engine/packs/campaign-optimization-v1.js'
import { FUNNEL_NURTURE_PACK_V1 } from '../../modules/action-engine/packs/funnel-nurture-v1.js'
import { compileSupervisorPlan, diffMissionPlans, requestMissionPlan, type CompiledMissionPlan } from '../../modules/action-engine/planner.js'
import type { ActionPackVersion } from '../../modules/action-engine/action-pack.js'
import {
  getMission, getPlan, insertMissionContextSnapshot, insertPlanRevision, recordApproval, recordEvaluation, transitionMission, type Queryable,
} from '../../modules/action-engine/repository.js'
import { recordDomainEvent } from '../../modules/events/repository.js'
import { executeActionRun, scheduleReadyActions } from '../../modules/action-engine/executor.js'
import { collectMissionEconomics, releaseAutonomyUsageReservations } from '../../modules/action-engine/economics.js'
import { evaluateMission } from '../../modules/action-engine/evaluator.js'
import { collectPackMissionMetrics } from '../../modules/action-engine/evaluator.js'
import { createActionEngineCommands } from '../../modules/action-engine/commands.js'
import {
  ProviderEffectResolverRegistry,
  createPostgresExternalEffectReconciliationStore,
  reconcileUnknownEffect,
} from '../../modules/action-engine/provider-reconciliation.js'
import { releaseResourceClaims } from '../../modules/action-engine/resource-claims.js'
import { reservePlanningCall, settlePlanningCall, type PlanningCycleBudget } from '../../modules/action-engine/planning-cycle.js'
import { enforceMissionRetention } from '../../modules/action-engine/retention.js'
import { processCompletedMissionLearning } from '../../modules/action-engine/learning.js'
import { createCapabilityManifest } from '../../modules/action-engine/capability-manifest.js'
import { redactMissionTelemetry } from '../../modules/action-engine/telemetry-redaction.js'
import { buildMissionDecisionSummary } from '../../modules/action-engine/decision-summary.js'
import { deliverDecisionNotification, enqueuePendingDecisionNotifications, persistDecisionNotificationSchedule } from '../../modules/action-engine/decision-notifications.js'
import { decideCampaignOptimization } from '../../modules/action-engine/capabilities/campaign-optimization.js'
import { invokeMissionConversationTurn } from '../../lib/agent-runtime-client.js'
import { buildMissionOperationalContext } from '../../modules/action-engine/context-builder.js'
import {
  completeAgentConversationTurn,
  getMissionConversationForMission,
  getMissionConversation,
  isMissionConversationRolloutEnabled,
  projectMissionConversationPlanningResult,
  recordMissionConversationProcessingError,
} from '../../modules/action-engine/mission-conversations.js'
import { composeVerifiedMissionContext, verifyMissionKnowledgeContext } from '../../modules/action-engine/mission-source-verifier.js'
import type { MissionSourceRefWire } from '../../modules/action-engine/generated/mission-wire.js'
import type { MissionConversationTurnRequestWire, MissionConversationTurnResponseWire } from '../../modules/action-engine/generated/mission-wire.js'
import type { MissionConversationMessage } from '../../modules/action-engine/types.js'

type Pool = {
  query: Queryable['query']
  connect(): Promise<Queryable & { release(): void }>
}

export async function handleActionEngineProcessMissionConversation(
  pool: Pool,
  env: AppEnv,
  data: Record<string, unknown>,
  dependencies: {
    invokeTurn?: (env: AppEnv, request: MissionConversationTurnRequestWire) => Promise<MissionConversationTurnResponseWire>
  } = {},
) {
  const conversationId = typeof data.conversationId === 'string' ? data.conversationId : ''
  const organizationId = typeof data.organizationId === 'string' ? data.organizationId : ''
  const requestedVersion = Number(data.requestedVersion)
  const audience = data.audience === 'internal_operator' ? 'internal_operator' : 'client_user'
  if (!conversationId || !organizationId || !Number.isInteger(requestedVersion) || requestedVersion < 1) {
    throw new Error('mission_conversation_job_invalid')
  }
  if (!isMissionConversationRolloutEnabled(env, organizationId)) {
    return { skipped: true, reason: 'mission_conversations_disabled' }
  }
  const conversation = await getMissionConversation(pool, conversationId, organizationId)
  if (!conversation || conversation.version !== requestedVersion || conversation.status !== 'collecting_context') {
    return { skipped: true, reason: 'mission_conversation_job_stale' }
  }
  const userMessage = [...conversation.messages].reverse().find((message) => message.actorType === 'user')
  if (!userMessage) throw new Error('mission_conversation_user_message_missing')
  const startedAt = Date.now()
  try {
    const registry = createActionEngineCapabilityRegistry()
    const metadata = registry.listMetadata()
    const manifest = createCapabilityManifest(registry, metadata.map((item) => ({ key: item.key, version: item.version })))
    const allowedModules = stringArray(conversation.currentBrief.allowedModules)
    const operational = await buildMissionOperationalContext(pool, {
      organizationId,
      ...(conversation.contractId ? { contractId: conversation.contractId } : {}),
      query: userMessage.content,
      requestedModules: allowedModules.length ? allowedModules : ['crm', 'automations', 'campaigns', 'landing_pages'],
      capabilityManifest: manifest.entries,
      packKeys: stringArray(conversation.currentBrief.packKeys),
    })
    const tenant = await pool.query<{ client_id: string | null }>(
      `SELECT client_id FROM public.organizations WHERE id = $1 LIMIT 1`, [organizationId],
    )
    const bounded = boundTranscript(conversation.messages)
    const packs = [REVENUE_RECOVERY_PACK_V0, FUNNEL_NURTURE_PACK_V1, CAMPAIGN_LAUNCH_PACK_V1, CAMPAIGN_OPTIMIZATION_PACK_V1]
    const request: MissionConversationTurnRequestWire = {
      schemaVersion: 1,
      organization_id: organizationId,
      client_id: tenant.rows[0]?.client_id ?? undefined,
      contract_id: conversation.contractId,
      conversation_id: conversation.id,
      audience,
      user_message: userMessage.content,
      transcript: bounded.transcript as MissionConversationTurnRequestWire['transcript'],
      rollingSummary: bounded.rollingSummary,
      currentBrief: conversation.currentBrief,
      operationalContext: operational,
      allowedActionPacks: packs.map((pack) => ({
        key: pack.key, version: pack.semanticVersion, contentHash: pack.contentHash,
      })) as MissionConversationTurnRequestWire['allowedActionPacks'],
      allowedCapabilityKeys: manifest.entries.map((item) => item.key),
    }
    const response = await (dependencies.invokeTurn ?? invokeMissionConversationTurn)(env, request)
    await verifyMissionKnowledgeContext(pool, {
      organizationId, audience, sourceRefs: response.sources ?? [], agentProfileKey: 'growth_strategist',
    })
    const status = response.kind === 'brief_confirmation'
      ? 'brief_confirmation'
      : response.kind === 'blocked' ? 'blocked' : 'awaiting_user'
    const messageKind = response.kind === 'questions'
      ? 'question'
      : response.kind === 'brief_confirmation' ? 'brief' : response.kind === 'blocked' ? 'error' : 'text'
    const updated = await completeAgentConversationTurn(pool, {
      organizationId, conversationId, expectedVersion: requestedVersion, status, messageKind,
      content: response.reply,
      structuredPayload: {
        kind: response.kind, understood: response.understood, questions: response.questions,
        readiness: response.readiness, brief: response.brief, suggestedActions: response.suggestedActions,
        usage: response.usage, latencyMs: Date.now() - startedAt,
      },
      sourceRefs: (response.sources ?? []) as unknown as Array<Record<string, unknown>>,
      harnessRunId: response.retrievalTraceId,
      contextHash: response.contextHash,
      currentBrief: response.brief as unknown as Record<string, unknown>,
      contextReadiness: response.readiness as unknown as Record<string, unknown>,
    })
    return { skipped: false, conversation: updated }
  } catch (error) {
    const errorCode = safeConversationError(error)
    await recordMissionConversationProcessingError(pool, {
      organizationId, conversationId, expectedVersion: requestedVersion,
      errorCode,
    })
    return { skipped: false, blocked: true, reason: errorCode }
  }
}

function boundTranscript(messages: MissionConversationMessage[]) {
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

function safeConversationError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown'
  if (message.includes('timeout') || message.includes('aborted')) return 'harness_timeout'
  if (message.includes('mission_conversation_runtime_402')) return 'insufficient_ai_credits'
  if (message.includes('mission_conversation_runtime_503')) return 'harness_unavailable'
  if (message.includes('mission_source_')) return 'source_verification_failed'
  return 'conversation_processing_failed'
}

export async function handleActionEngineSchedule(pool: Pool, queue: AppJobQueue, data: Record<string, unknown>) {
  const missionId = typeof data.missionId === 'string' ? data.missionId : undefined
  return scheduleReadyActions(pool as never, queue, missionId)
}

export async function handleActionEngineDecisionNotification(pool: Pool, queue: AppJobQueue, data: Record<string, unknown>, enabled = true) {
  if (!enabled) return { skipped: 'mission_decision_notifications_disabled' }
  return deliverDecisionNotification(pool as never, queue, data)
}

export async function handleActionEngineDecisionNotificationDispatch(pool: Pool, queue: AppJobQueue, data: Record<string, unknown>, enabled = true) {
  if (!enabled) return { skipped: 'mission_decision_notifications_disabled' }
  return enqueuePendingDecisionNotifications(pool as never, queue, { limit: typeof data.limit === 'number' ? data.limit : 100 })
}

export async function handleActionEngineExecute(
  pool: Pool,
  queue: AppJobQueue,
  data: Record<string, unknown>,
  workerId = 'action-engine-worker',
  mutationLeaseSecret = process.env.ACTION_ENGINE_MUTATION_LEASE_SECRET,
) {
  const actionRunId = stringField(data, 'actionRunId')
  const organizationId = stringField(data, 'organizationId')
  const missionId = stringField(data, 'missionId')
  const result = await executeActionRun(pool as never, createActionEngineCapabilityRegistry(), {
    actionRunId, organizationId, workerId, commands: createActionEngineCommands(pool as never, missionId), mutationLeaseSecret,
  })
  if (result.reconciliation) {
    await queue.add('action-engine.reconcileProviderEffect', {
      effectId: result.reconciliation.effectId,
      organizationId: result.reconciliation.organizationId,
    }, { delay: 15_000 })
  }
  if (result.containment) {
    await queue.add('action-engine.collectMetrics', { missionId, organizationId, reason: result.containment.reason })
  }
  if (result.status === 'succeeded' || result.status === 'failed' || result.status === 'skipped') {
    await queue.add('action-engine.scheduleReadyActions', { missionId })
  }
  return result
}

export async function handleActionEngineReconcileProviderEffect(
  pool: Pool,
  queue: AppJobQueue,
  data: Record<string, unknown>,
  resolvers = new ProviderEffectResolverRegistry(),
) {
  const effectId = stringField(data, 'effectId')
  const organizationId = stringField(data, 'organizationId')
  const result = await reconcileUnknownEffect(
    createPostgresExternalEffectReconciliationStore(pool as never),
    resolvers,
    { effectId, organizationId },
  )

  if ((result.outcome === 'created' || result.outcome === 'failed') && result.effect) {
    await finalizeReconciledAction(pool, result.effect.runId, organizationId, result.outcome, {
      externalEffectId: result.effect.id,
      providerReference: result.effect.providerReference ?? null,
      evidence: result.effect.outcomeEvidence,
    })
    if (result.outcome === 'created') {
      await queue.add('action-engine.scheduleReadyActions', { missionId: result.effect.missionId })
    }
  } else if (result.outcome === 'deferred' && result.effect?.nextReconcileAt) {
    const delay = Math.max(1_000, new Date(result.effect.nextReconcileAt).getTime() - Date.now())
    await queue.add('action-engine.reconcileProviderEffect', {
      effectId: result.effect.id,
      organizationId: result.effect.organizationId,
      scheduledFor: result.effect.nextReconcileAt,
    }, { delay })
  }

  return result
}

async function finalizeReconciledAction(
  pool: Pool,
  actionRunId: string,
  organizationId: string,
  outcome: 'created' | 'failed',
  reconciliation: Record<string, unknown>,
): Promise<void> {
  await transaction(pool, async (client) => {
    const action = await client.query<{ mission_id: string; status: string }>(
      `SELECT mission_id, status FROM public.action_runs
       WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [actionRunId, organizationId],
    )
    const row = action.rows[0]
    if (!row || !['blocked', 'running'].includes(row.status)) return
    const status = outcome === 'created' ? 'succeeded' : 'failed'
    await releaseAutonomyUsageReservations(client, {
      organizationId, runId: actionRunId, reason: `provider_effect_confirmed_${outcome}`,
    })
    await client.query(
      `UPDATE public.action_runs
       SET status = $3, output = CASE WHEN $3 = 'succeeded' THEN $4::jsonb ELSE output END,
           last_error = CASE WHEN $3 = 'failed' THEN 'provider_effect_confirmed_failed' ELSE NULL END,
           completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [actionRunId, organizationId, status, { reconciliation }],
    )
    await client.query(
      `UPDATE public.action_run_attempts
       SET status = $2, output_snapshot = CASE WHEN $2 = 'succeeded' THEN $3::jsonb ELSE output_snapshot END,
           error_code = CASE WHEN $2 = 'failed' THEN 'provider_effect_confirmed_failed' ELSE error_code END,
           completed_at = NOW()
       WHERE id = (
         SELECT id FROM public.action_run_attempts WHERE run_id = $1 ORDER BY attempt_number DESC LIMIT 1
       )`,
      [actionRunId, status, { reconciliation }],
    )
    await recordDomainEvent(client, {
      eventType: outcome === 'created' ? 'action.succeeded' : 'action.failed',
      organizationId,
      aggregateType: 'action_run',
      aggregateId: actionRunId,
      actor: { type: 'system' },
      payload: { missionId: row.mission_id, reason: `provider_effect_confirmed_${outcome}`, reconciliation },
    })
  })
}

export async function handleActionEngineExpireWaits(pool: Pool, queue: AppJobQueue, data: Record<string, unknown>) {
  const limit = Math.max(1, Math.min(500, typeof data.limit === 'number' ? Math.floor(data.limit) : 100))
  const completed = await transaction(pool, async (client) => {
    const result = await client.query<{ id: string; mission_id: string; organization_id: string }>(
      `WITH due AS (
         SELECT run.id FROM public.action_runs run
         JOIN public.action_plan_steps step ON step.id = run.plan_step_id
         JOIN public.action_missions mission ON mission.id = run.mission_id
         WHERE run.status = 'running' AND run.claimed_by = 'durable_wait'
           AND step.capability_key = 'system.signal.wait' AND run.available_at <= NOW()
           AND mission.status = 'active'
         ORDER BY run.available_at FOR UPDATE OF run SKIP LOCKED LIMIT $1
       )
       UPDATE public.action_runs run SET status = 'succeeded', completed_at = NOW(), claimed_by = 'wait_scheduler', updated_at = NOW()
       FROM due WHERE run.id = due.id RETURNING run.id, run.mission_id, run.organization_id`, [limit],
    )
    for (const row of result.rows) {
      await recordDomainEvent(client, {
        eventType: 'action.succeeded', organizationId: row.organization_id, aggregateType: 'action_run', aggregateId: row.id,
        actor: { type: 'system' }, payload: { missionId: row.mission_id, capabilityKey: 'system.signal.wait', reason: 'durable_wait_elapsed' },
      })
    }
    return result.rows
  })
  for (const missionId of new Set(completed.map((row) => row.mission_id))) {
    await queue.add('action-engine.scheduleReadyActions', { missionId })
  }
  return { completed: completed.length }
}

export async function handleActionEngineCollectMetrics(pool: Pool, queue: AppJobQueue, data: Record<string, unknown>) {
  const missionId = typeof data.missionId === 'string' ? data.missionId : undefined
  const missions = await pool.query<{ id: string; organization_id: string; version: number }>(
    `SELECT id, organization_id, version FROM public.action_missions
     WHERE status IN ('active','paused','blocked') AND ($1::UUID IS NULL OR id = $1)
     ORDER BY updated_at LIMIT 100`, [missionId ?? null],
  )
  let snapshots = 0
  for (const mission of missions.rows) {
    const snapshot = await collectPackMissionMetrics(pool, mission.id, mission.organization_id)
    for (const [key, metric] of Object.entries(snapshot.metrics)) {
      const evidence = snapshot.evidence[key]
      const attribution = evidence?.attribution
      await pool.query(
        `INSERT INTO public.action_mission_metrics (
           organization_id, mission_id, metric_key, value_kind, numeric_value, unit, reason,
           source_type, source_record_id, measured_at, attribution_status,
           attribution_policy_version, attribution_policy_hash, attribution_event_ids
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [mission.organization_id, mission.id, key, metric.kind, metric.kind === 'known' ? metric.value : null,
          metric.unit, metric.kind === 'known' ? null : metric.reason,
          evidence?.sourceType ?? 'mission_observer', evidence?.sourceRecordId ?? null, snapshot.measuredAt,
          attribution?.status ?? 'not_applicable', attribution?.policyVersion ?? null,
          attribution?.policyHash ?? null, attribution?.eventIds ?? []],
      )
      snapshots += 1
    }
    await queue.add('action-engine.evaluateMission', {
      missionId: mission.id, organizationId: mission.organization_id, checkpointKey: `scheduled-${snapshot.measuredAt.slice(0, 16)}`,
    })
  }
  return { missions: missions.rows.length, snapshots }
}

export async function handleCampaignOptimizationCheckpoints(pool: Pool, data: Record<string, unknown>) {
  const now = typeof data.now === 'string' && Number.isFinite(Date.parse(data.now)) ? new Date(data.now) : new Date()
  const requestedMissionId = typeof data.missionId === 'string' ? data.missionId : null
  const candidates = await pool.query<{
    mission_id: string; organization_id: string; plan_id: string; mission_version: number; parameters: Record<string, unknown>;
    campaign_id: string; campaign_version_id: string; daily_budget_brl: string; spent_brl: string;
    impressions: number | string; clicks: number | string; leads: number | string; tracking_known: boolean;
  }>(
    `SELECT mission.id AS mission_id,mission.organization_id,mission.active_plan_id AS plan_id,
            mission.version AS mission_version,mission.parameters,campaign.id AS campaign_id,
            campaign.active_mission_version_id AS campaign_version_id,campaign.daily_budget::TEXT AS daily_budget_brl,
            COALESCE(campaign.spent,0)::TEXT AS spent_brl,COALESCE(campaign.impressions,0) AS impressions,
            COALESCE(campaign.clicks,0) AS clicks,COALESCE(campaign.leads,0) AS leads,
            (campaign.utm_source IS NOT NULL AND campaign.utm_medium IS NOT NULL AND campaign.utm_campaign IS NOT NULL) AS tracking_known
     FROM public.action_missions mission
     JOIN public.action_plans plan ON plan.id=mission.active_plan_id AND plan.status='active'
     JOIN public.action_pack_versions pack_version ON pack_version.id=plan.pack_version_id
     JOIN public.action_packs pack ON pack.id=pack_version.pack_id
     JOIN public.campaigns campaign ON campaign.mission_id=mission.id AND campaign.organization_id=mission.organization_id
       AND campaign.lifecycle_status='active'
     WHERE mission.status='active' AND mission.mode='autonomous'
       AND ($1::UUID IS NULL OR mission.id=$1)
       AND (pack.key IN ('campaign_launch','campaign_optimization') OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(plan.compiled_payload->'packs','[]'::JSONB)) selected
         WHERE selected->>'key' IN ('campaign_launch','campaign_optimization')
       ))
       AND EXISTS (
         SELECT 1 FROM public.action_autonomy_grants grant
         WHERE grant.mission_id=mission.id AND grant.organization_id=mission.organization_id
           AND grant.starts_at <= $2 AND grant.expires_at > $2
           AND EXISTS (SELECT 1 FROM public.action_autonomy_grant_events event WHERE event.grant_id=grant.id AND event.event_type='activated')
           AND NOT EXISTS (SELECT 1 FROM public.action_autonomy_grant_events event WHERE event.grant_id=grant.id AND event.event_type='revoked')
       )
     ORDER BY mission.updated_at LIMIT 100`,
    [requestedMissionId, now.toISOString()],
  )
  let recorded = 0
  let duplicates = 0
  let approvals = 0
  let paused = 0
  for (const row of candidates.rows) {
    const frequency = row.parameters.checkpointFrequency === 'hourly' ? 'hourly' : 'daily'
    const windowKey = frequency === 'hourly' ? now.toISOString().slice(0, 13) : now.toISOString().slice(0, 10)
    const checkpointKey = `campaign-optimization:${frequency}:${windowKey}`
    const decision = decideCampaignOptimization({
      trackingKnown: row.tracking_known, impressions: Number(row.impressions), clicks: Number(row.clicks), leads: Number(row.leads),
      spendBrl: String(row.spent_brl), currentDailyBudgetBrl: String(row.daily_budget_brl),
      minimumImpressions: integerParameter(row.parameters.minimumImpressions, 1000),
      minimumClicks: integerParameter(row.parameters.minimumClicks, 50),
      minimumLeadsForScale: integerParameter(row.parameters.minimumLeadsForScale, 5),
      minimumCtr: decimalParameter(row.parameters.minimumCtr, '0.01'),
      targetCplBrl: decimalParameter(row.parameters.targetCplBrl, '50'),
      maximumCplBrl: decimalParameter(row.parameters.maximumCplBrl, '100'),
      maxBudgetAdjustmentPercent: decimalParameter(row.parameters.maxBudgetAdjustmentPercent, '10'),
    })
    const created = await transaction(pool, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.action_campaign_optimization_checkpoints (
           organization_id,mission_id,plan_id,campaign_id,campaign_version_id,checkpoint_key,window_started_at,
           metric_snapshot,decision,rationale,proposed_action,requires_approval,status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (mission_id,checkpoint_key) DO NOTHING RETURNING id`,
        [row.organization_id,row.mission_id,row.plan_id,row.campaign_id,row.campaign_version_id,checkpointKey,
          frequency === 'hourly' ? `${windowKey}:00:00.000Z` : `${windowKey}T00:00:00.000Z`,
          { impressions:Number(row.impressions),clicks:Number(row.clicks),leads:Number(row.leads),spendBrl:row.spent_brl,trackingKnown:row.tracking_known,dailyBudgetBrl:row.daily_budget_brl },
          decision.conclusion,{ reason:decision.reason,deterministic:true },decision,decision.requiresApproval,
          decision.requiresApproval?'pending_approval':decision.conclusion==='observe'||decision.conclusion==='continue'?'observed':'action_proposed'],
      )
      if (!inserted.rows[0]) return false
      const evaluationDecision = decision.conclusion === 'pause' ? 'pause'
        : ['decrease_budget','increase_budget','creative_draft'].includes(decision.conclusion) ? 'replan' : 'continue'
      await recordEvaluation(client, {
        organizationId:row.organization_id,missionId:row.mission_id,planId:row.plan_id,checkpointKey,
        idempotencyKey:`${row.mission_id}:${checkpointKey}`,decision:evaluationDecision,
        metricSnapshot:{impressions:Number(row.impressions),clicks:Number(row.clicks),leads:Number(row.leads),trackingKnown:row.tracking_known},
        economicsSnapshot:{spendBrl:row.spent_brl,currentDailyBudgetBrl:row.daily_budget_brl},rationale:{...decision,deterministic:true},
      })
      if (decision.requiresApproval) {
        const subjectHash = createHash('sha256').update(stableCheckpoint({ missionId:row.mission_id,checkpointKey,decision })).digest('hex')
        await recordApproval(client, {
          organizationId:row.organization_id,missionId:row.mission_id,approvalType:'budget_increase',subjectHash,
          requestedPayload:{ checkpointId:inserted.rows[0].id,campaignId:row.campaign_id,campaignVersionId:row.campaign_version_id,checkpointKey,decision },
        })
        approvals += 1
      }
      if (decision.conclusion === 'pause') {
        await client.query(`UPDATE public.action_missions SET status='paused',version=version+1,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND status='active'`,[row.mission_id,row.organization_id])
        await recordDomainEvent(client,{eventType:'mission.paused',organizationId:row.organization_id,aggregateType:'mission',aggregateId:row.mission_id,actor:{type:'system'},payload:{reason:decision.reason,checkpointKey,campaignId:row.campaign_id}})
        paused += 1
      }
      return true
    })
    if (created) recorded += 1
    else duplicates += 1
  }
  return { candidates: candidates.rows.length, recorded, duplicates, approvals, paused }
}

export async function handleActionEngineRetention(pool: Pool) {
  return enforceMissionRetention(pool)
}

export async function handleActionEngineLearning(pool: Pool, data: Record<string, unknown>) {
  const limit = typeof data.limit === 'number' ? Math.max(1,Math.min(Math.floor(data.limit),200)) : 50
  return processCompletedMissionLearning(pool,limit)
}

export async function handleActionEngineEvaluation(pool: Pool, data: Record<string, unknown>, queue?: AppJobQueue) {
  const missionId = stringField(data, 'missionId')
  const organizationId = stringField(data, 'organizationId')
  const checkpointKey = typeof data.checkpointKey === 'string' ? data.checkpointKey : 'manual'
  const result = await transaction(pool, async (client) => {
    const current = await getMission(client, missionId, organizationId)
    if (!current) throw new Error('mission_not_found')
    if (!['active','paused','blocked'].includes(current.status)) return { skipped: 'mission_not_evaluable' }
    const evaluating = current.status === 'active'
      ? await transitionMission(client, { missionId, organizationId, expectedVersion: current.version, toStatus: 'evaluating', actor: { type: 'system' }, reason: `evaluation:${checkpointKey}` })
      : current
    const packSnapshot = await collectPackMissionMetrics(client, missionId, organizationId)
    const signedRevenue = metricFromSnapshot(packSnapshot.metrics, ['attributed_revenue_brl','qualified_demand_value_brl','signed_revenue'])
      ?? { kind: 'unknown' as const, reason: 'confirmed_revenue_snapshot_required', unit: 'BRL' }
    const actionCounts = await client.query<{ completed: number | string; human: number | string; human_minutes: string | null }>(
      `SELECT COUNT(*) FILTER (WHERE run.status = 'succeeded')::INT AS completed,
              COUNT(*) FILTER (WHERE run.status = 'succeeded' AND step.capability_key = 'human.task.create')::INT AS human,
              (SELECT SUM(COALESCE(entry.human_minutes,0))::TEXT FROM public.action_cost_entries entry
               WHERE entry.mission_id = $1 AND entry.organization_id = $2 AND entry.nature IN ('actual','reversal')) AS human_minutes
       FROM public.action_runs run JOIN public.action_plan_steps step ON step.id = run.plan_step_id
       WHERE run.mission_id = $1 AND run.organization_id = $2`, [missionId, organizationId],
    )
    const campaignSpend = metricFromSnapshot(packSnapshot.metrics, ['spend_brl'])
    const economics = await collectMissionEconomics(client, missionId, organizationId, campaignSpend ? {
      producedValueBrl: signedRevenue.kind === 'known' ? signedRevenue.value : '0',
      ...(campaignSpend.kind === 'known' ? { mediaSpendBrl: campaignSpend.value } : {}),
    } : undefined)
    const completedActions = Number(actionCounts.rows[0]?.completed ?? 0)
    const targetRevenue = Number(current.parameters.targetRevenueBrl ?? 0)
    const observedRevenue = signedRevenue.kind === 'known' ? Number(signedRevenue.value) : Number.NaN
    if (!['campaign_launch','composite'].includes(packSnapshot.packKey)) {
      packSnapshot.signals.minimumSampleReached = completedActions >= 20
      packSnapshot.signals.offTrack = completedActions >= 20 && Number.isFinite(observedRevenue)
        && targetRevenue > 0 && observedRevenue / targetRevenue < 0.25
    }
    const evaluation = await evaluateMission(client, {
      missionId, organizationId, checkpointKey, idempotencyKey: `${missionId}:${checkpointKey}:${evaluating.version}`,
      signedRevenue, economics, minimumSampleReached: completedActions >= 20,
      offTrack: completedActions >= 20 && Number.isFinite(observedRevenue) && targetRevenue > 0 && observedRevenue / targetRevenue < 0.25,
      packSnapshot,
    })
    if (current.status === 'active') {
      const nextStatus = ({ continue: 'active', pause: 'paused', block: 'blocked', propose_replan: 'pending_replan_approval', succeed: 'succeeded', fail: 'failed', expire: 'expired' } as const)[evaluation.conclusion]
      const transitioned = await transitionMission(client, { missionId, organizationId, expectedVersion: evaluating.version, toStatus: nextStatus, actor: { type: 'system' }, reason: evaluation.reasons.join(',') })
      if (['succeeded','failed','expired','cancelled'].includes(nextStatus)) {
        await releaseResourceClaims(client, missionId, organizationId)
      }
      return { evaluation, economics, replanVersion: nextStatus === 'pending_replan_approval' ? transitioned.version : undefined }
    }
    return { evaluation, economics }
  })
  if (result.replanVersion && queue) {
    await queue.add('action-engine.planMission', { missionId, organizationId, requestedVersion: result.replanVersion, replan: true })
  }
  return result
}

export async function handleActionEnginePlanMission(
  pool: Pool,
  env: AppEnv,
  data: Record<string, unknown>,
  queue?: AppJobQueue,
): Promise<{ planId?: string; skipped?: string }> {
  if (env.MISSION_SUPERVISOR_ENABLED === false) throw new Error('mission_supervisor_disabled')
  const missionId = stringField(data, 'missionId')
  const organizationId = stringField(data, 'organizationId')
  const requestedVersion = numberField(data, 'requestedVersion')
  const isReplan = data.replan === true
  const mission = await getMission(pool, missionId, organizationId)
  if (!mission) throw new Error('mission_not_found')
  if (['succeeded','failed','expired','cancelled'].includes(mission.status)) return { skipped: 'mission_terminal' }
  const expectedStatus = isReplan ? 'pending_replan_approval' : 'planning'
  if (mission.status !== expectedStatus || mission.version !== requestedVersion) return { skipped: 'mission_state_changed' }

  const registry = createActionEngineCapabilityRegistry()
  const packs = await loadMissionActionPacks(pool, mission.packVersionId, mission.packSelection)
  const pack = packs[0]!
  const serializablePacks = packs.map((item) => {
    const { parameters: _runtimeSchema, ...serializable } = item as ActionPackVersion & { parameters?: unknown }
    return serializable
  })
  const serializablePack = serializablePacks[0]!
  const allowedKeys = new Set(packs.flatMap((item) => item.allowedCapabilities.map((capability) => capability.key)))
  const capabilityCatalog = registry.listMetadata().filter((item) => allowedKeys.has(item.key))
  try {
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
    packKeys: packs.map(item=>item.key),
  })
  const linkedConversation = await getMissionConversationForMission(pool, missionId, organizationId)
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
  if (linkedConversation?.lastHarnessRunId && linkedConversation.lastContextHash) {
    const latestGroundedMessage = [...linkedConversation.messages].reverse().find(message => message.actorType === 'agent' && message.sourceRefs.length)
    const sourceRefs = (latestGroundedMessage?.sourceRefs ?? []) as unknown as MissionSourceRefWire[]
    const audience = sourceRefs.some(source => source.kind.startsWith('knowledge_') && source.visibility === 'internal')
      ? 'internal_operator' as const : 'client_user' as const
    const verified = await verifyMissionKnowledgeContext(pool, {
      organizationId, audience, sourceRefs, agentProfileKey: 'growth_strategist',
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
  const contextSnapshot = await transaction(pool, (client) => insertMissionContextSnapshot(client, {
    organizationId, missionId, query: planningContext.query, companyContext: planningContext.companyContext,
    knowledgeItems: planningContext.knowledgeItems, strategyItems: planningContext.strategyItems,
    approvedLearningMemory: planningContext.learningMemoryItems,
    liveState: planningContext.liveState,
    capabilityManifest: planningContext.capabilityManifest as unknown as Array<Record<string, unknown>>,
    capabilityCatalogHash: planningContext.capabilityCatalogHash, sourceIds: planningContext.sourceIds,
    ...(planningContext.harnessRetrievalTraceId ? { harnessRetrievalTraceId: planningContext.harnessRetrievalTraceId } : {}),
    ...(planningContext.harnessKnowledgeContextHash ? { harnessKnowledgeContextHash: planningContext.harnessKnowledgeContextHash } : {}),
  }))
  const planningBudget: PlanningCycleBudget = {
    maxCalls: 8,
    maxInputTokens: 50_000,
    maxOutputTokens: 10_000,
    maxCostBrl: planningCostCeiling(mission.budget.maxTotalCostBrl),
    maxLatencyMs: 120_000,
  }
  const planningEstimate = { calls: 1, inputTokens: 12_000, outputTokens: 2_500, costBrl: '5', latencyMs: 60_000 }
  const planningCycle = await transaction(pool, async (client) => {
    const contextHash = planningContext.contextHash
    const created = await client.query<{ id: string }>(
      `INSERT INTO public.action_planning_cycles (
         organization_id, mission_id, plan_revision, context_hash, pack_key, pack_version, budget
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (mission_id, plan_revision) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [organizationId, missionId, requestedVersion, contextHash, packs.length > 1 ? 'composite' : pack.key,
        packs.length > 1 ? packs.map((item) => `${item.key}@${item.semanticVersion}`).join('+') : pack.semanticVersion, planningBudget],
    )
    const cycleId = created.rows[0]?.id
    if (!cycleId) throw new Error('planning_cycle_create_failed')
    const reservation = await reservePlanningCall(client, {
      cycleId, organizationId, specialistProfile: 'growth_strategist', specialistVersion: 1,
      reservation: planningEstimate,
    })
    return { id: cycleId, contextHash, reservationId: reservation.reservationId }
  })
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
    const planningStartedAt = Date.now()
    const rawPlan = await requestMissionPlan(env, {
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
      context_snapshot_id: contextSnapshot.id,
      allowed_source_ids: planningContext.sourceIds,
      asked_question_keys: Array.isArray(mission.packSelection.askedQuestionKeys)
        ? mission.packSelection.askedQuestionKeys.filter((key): key is string => typeof key === 'string')
        : [],
      clarification_round: Number(mission.packSelection.clarificationRound ?? 0),
      observations: observations.rows,
      planning_budget: {
        cycleId: planningCycle.id,
        contextHash: planningCycle.contextHash,
        budget: planningBudget,
        usage: { calls: 0, inputTokens: 0, outputTokens: 0, costBrl: '0', latencyMs: 0 },
        estimate: planningEstimate,
      },
      ...(previousCompiled ? { previous_revision: previousCompiled } : {}),
    })
    const planningDurationMs = Math.max(0, Date.now() - planningStartedAt)
    const rawEnvelope = rawPlan && typeof rawPlan === 'object' ? rawPlan as Record<string, unknown> : {}
    const rawUsage = rawEnvelope.usage && typeof rawEnvelope.usage === 'object' ? rawEnvelope.usage as Record<string, unknown> : {}
    const rawTrace = rawEnvelope.trace && typeof rawEnvelope.trace === 'object' ? rawEnvelope.trace as Record<string, unknown> : {}
    await transaction(pool, async (client) => {
      await settlePlanningCall(client, {
        cycleId: planningCycle.id, organizationId, reservationId: planningCycle.reservationId,
        actual: {
          calls: 1, inputTokens: Number(rawUsage.inputTokens ?? 0), outputTokens: Number(rawUsage.outputTokens ?? 0),
          costBrl: '0', latencyMs: planningDurationMs,
        },
        providerModelId: typeof rawTrace.resolvedModelId === 'string' ? rawTrace.resolvedModelId : undefined,
        metadata: { profileKey: rawTrace.profileKey ?? 'mission_supervisor', promptHash: rawTrace.promptHash ?? null },
      })
      const telemetryKey = env.ACTION_ENGINE_TELEMETRY_REDACTION_KEY ?? env.ACTION_ENGINE_MUTATION_LEASE_SECRET
      if (telemetryKey) {
        const payload = redactMissionTelemetry({
          missionId, durationMs: planningDurationMs,
          inputTokens: Number(rawUsage.inputTokens ?? 0), outputTokens: Number(rawUsage.outputTokens ?? 0),
          modelId: rawTrace.resolvedModelId ?? rawTrace.requestedModelId ?? null,
          promptHash: rawTrace.promptHash ?? null, contextHash: contextSnapshot.contextHash,
          packVersion: packs.map((item) => `${item.key}@${item.semanticVersion}`).join('+'), status: rawEnvelope.kind ?? 'unknown',
        }, { missionId, tokenKey: telemetryKey })
        await client.query(
          `INSERT INTO public.action_mission_telemetry (organization_id, mission_id, artifact_kind, payload)
           VALUES ($1,$2,'redacted_model_trace',$3)`,
          [organizationId, missionId, payload],
        )
      }
    })
    const compileResult = compileSupervisorPlan({
      rawProposal: rawPlan, missionId, packCatalog: packs, registry,
      maxTotalCostBrl: String(mission.budget.maxTotalCostBrl ?? mission.autonomyEnvelope.maxTotalCostBrl ?? '0'),
      allowedSourceIds: contextSnapshot.sourceIds, contextHash: contextSnapshot.contextHash,
      capabilityCatalogHash: contextSnapshot.capabilityCatalogHash,
      expectedCapabilityCatalogHash: planningContext.capabilityCatalogHash,
      autonomyEnvelope: mission.autonomyEnvelope,
    })
    await pool.query(
      `UPDATE public.action_planning_cycles SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'active'`,
      [planningCycle.id, organizationId],
    )
    if (compileResult.kind === 'clarification') {
      return await transaction(pool, async (client) => {
        const current = await getMission(client, missionId, organizationId)
        if (!current || current.status !== expectedStatus || current.version !== requestedVersion) return { skipped: 'mission_state_changed' }
        await client.query(
          `UPDATE public.action_missions
           SET pack_selection = COALESCE(pack_selection, '{}'::jsonb) || $3::jsonb, updated_at = NOW()
           WHERE id = $1 AND organization_id = $2`,
          [missionId, organizationId, {
            clarification: { interpretation: compileResult.interpretation, questions: compileResult.questions, contextSnapshotId: contextSnapshot.id },
            askedQuestionKeys: compileResult.questions.map((question) => question.key),
            clarificationRound: 1,
          }],
        )
        await transitionMission(client, {
          missionId, organizationId, expectedVersion: requestedVersion, toStatus: isReplan ? 'paused' : 'qualifying',
          actor: { type: 'system' }, reason: 'mission_clarification_required',
        })
        await recordDomainEvent(client, {
          eventType: 'mission.clarification_requested', organizationId, aggregateType: 'mission', aggregateId: missionId,
          actor: { type: 'system' }, payload: { questions: compileResult.questions, contextSnapshotId: contextSnapshot.id },
        })
        await projectMissionConversationPlanningResult(client, {
          organizationId, missionId, status: 'awaiting_user', messageKind: 'question',
          content: `Antes de fechar o plano, preciso confirmar: ${compileResult.questions.map(question => question.label).join(' ')}`,
          structuredPayload: {
            kind: 'questions', projectionKey: `planning-clarification:${contextSnapshot.id}`,
            questions: compileResult.questions, brief: linkedConversation?.currentBrief ?? mission.goal,
            readiness: {
              status: 'needs_information', knownFacts: [], assumptions: [],
              missing: compileResult.questions.map(question => ({ key: question.key, category: 'company', reason: question.whyNeeded, requiredFor: packs.map(item => item.key) })),
            },
          },
          contextReadiness: {
            status: 'needs_information',
            missing: compileResult.questions.map(question => ({ key: question.key, category: 'company', reason: question.whyNeeded, requiredFor: packs.map(item => item.key) })),
          },
        })
        return { skipped: 'clarification_required' }
      })
    }
    const compiled = compileResult.compiled
    const planningResult = await transaction(pool, async (client) => {
      const current = await getMission(client, missionId, organizationId)
      if (!current || current.status !== expectedStatus || current.version !== requestedVersion) return { skipped: 'mission_state_changed' }
      const diff = isReplan && previousCompiled
        ? diffMissionPlans(previousCompiled as unknown as CompiledMissionPlan, compiled)
        : null
      if (isReplan && diff && !diff.requiresReplanApproval) {
        await transitionMission(client, {
          missionId, organizationId, expectedVersion: requestedVersion, toStatus: 'active',
          actor: { type: 'system' }, reason: 'replan_no_material_change',
        })
        return { skipped: 'replan_no_material_change' }
      }
      const plan = await insertPlanRevision(client, {
        organizationId, missionId, packVersionId: mission.packVersionId,
        packContentHash: compiled.packContentHash, parameters: compiled.parameters,
        deviations: compiled.deviations, estimatedEconomics: compiled.estimatedEconomics,
        capabilityManifest: compiled.capabilityManifest,
        capabilityManifestHash: compiled.capabilityManifestHash,
        steps: compiled.steps, proposedPayload: rawPlan as Record<string, unknown>,
        compiledPayload: compiled as unknown as Record<string, unknown>, planHash: compiled.planHash,
      })
      await client.query(`UPDATE public.action_plans SET status = 'pending_approval', updated_at = NOW() WHERE id = $1`, [plan.id])
      const effectsByCapability = new Map(compiled.capabilityManifest.map(item => [`${item.key}@${item.version}`, item.effect]))
      const decisionSummary = buildMissionDecisionSummary({
        headline: mission.objective, planRevision: plan.revision, planHash: compiled.planHash,
        manifestHash: compiled.capabilityManifestHash, sourceIds: compiled.sourceIds ?? [],
        artifacts: compiled.steps
          .filter(step => effectsByCapability.get(`${step.capabilityKey}@${step.capabilityVersion}`) !== 'none')
          .map(step => ({
            id: step.stepKey, entityType: step.capabilityKey.split('.')[1] ?? 'artifact', operation: step.capabilityKey.split('.').at(-1) ?? 'change',
            quantity: inferArtifactQuantity(step.parameters), label: humanizeCapability(step.capabilityKey),
            version: `${step.capabilityVersion}:${step.capabilityDefinitionHash}`, providerTarget: step.capabilityKey.split('.')[0],
          })),
        existingContacts: Number(mission.parameters.existingContacts ?? 0), futureEligibleContacts: true,
        channels: Array.isArray(mission.parameters.channels) ? mission.parameters.channels.map(String) : [],
        estimatedCostBrl: compiled.estimatedEconomics.totalExecutionCost,
        maximumCostBrl: mission.autonomyEnvelope.maxTotalCostBrl,
        estimatedHumanMinutes: Math.round(Number(compiled.estimatedEconomics.humanHours) * 60),
        capabilityManifest: compiled.capabilityManifest, assumptions: [],
      })
      const approval = await recordApproval(client, {
        organizationId, missionId, planId: plan.id, approvalType: isReplan ? 'replan' : 'plan', subjectHash: decisionSummary.decisionSubjectHash,
        requestedPayload: { decisionSummary, packContentHash: compiled.packContentHash, planHash: compiled.planHash, revision: plan.revision, ...(diff ? { diff } : {}) },
      })
      await persistDecisionNotificationSchedule(client as never, { approvalId: approval.id, organizationId })
      await recordDomainEvent(client, {
        eventType: isReplan ? 'mission.replan_requested' : 'mission.plan_proposed', organizationId, aggregateType: 'mission', aggregateId: missionId,
        actor: { type: 'system' }, payload: { planId: plan.id, revision: plan.revision, planHash: compiled.planHash, decisionSubjectHash: decisionSummary.decisionSubjectHash, ...(diff ? { diff } : {}) },
      })
      if (!isReplan) {
        await transitionMission(client, {
          missionId, organizationId, expectedVersion: requestedVersion, toStatus: 'pending_plan_approval',
          actor: { type: 'system' }, reason: 'plan_compiled_and_verified',
        })
      }
      await projectMissionConversationPlanningResult(client, {
        organizationId, missionId, status: 'awaiting_plan_approval', messageKind: 'plan',
        content: 'O plano está pronto. Revise os impactos, custos e aprovações antes de autorizar.',
        structuredPayload: {
          kind: 'plan', projectionKey: `plan:${plan.id}`, planId: plan.id, approvalId: approval.id,
          subjectHash: decisionSummary.decisionSubjectHash, missionVersion: isReplan ? current.version : requestedVersion + 1,
          decisionSummary, plan: {
            id: plan.id, revision: plan.revision, planHash: compiled.planHash,
            packContentHash: compiled.packContentHash, estimatedEconomics: compiled.estimatedEconomics,
            steps: compiled.steps, deviations: compiled.deviations,
          },
          sources: planningContext.sourceIds,
        },
      })
      return { planId: plan.id, approvalId: approval.id }
    })
    if (queue && 'approvalId' in planningResult && planningResult.approvalId) {
      await enqueuePendingDecisionNotifications(pool as never, queue, { approvalId: planningResult.approvalId }).catch(() => undefined)
    }
    return planningResult
  } catch (error) {
    await transaction(pool, async (client) => {
      const current = await getMission(client, missionId, organizationId)
      if (current?.status === expectedStatus && current.version === requestedVersion) {
        await transitionMission(client, {
          missionId, organizationId, expectedVersion: requestedVersion, toStatus: isReplan ? 'paused' : 'blocked',
          actor: { type: 'system' }, reason: safeErrorCode(error),
        })
        await projectMissionConversationPlanningResult(client, {
          organizationId, missionId, status: 'blocked', messageKind: 'error',
          content: 'Não consegui preparar um plano seguro com o contexto atual. Revise as pendências e tente novamente.',
          structuredPayload: { kind: 'blocked', projectionKey: `planning-blocked:${requestedVersion}`, errorCode: safeErrorCode(error) },
          contextReadiness: { status: 'needs_configuration', missing: [], processingError: safeErrorCode(error) },
        })
      }
    })
    throw error
  }
}

function stringField(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  if (typeof value !== 'string' || !value) throw new Error(`${key}_required`)
  return value
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

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`${key}_required`)
  return value
}

function safeErrorCode(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
}

function planningCostCeiling(value: unknown): string {
  const total = typeof value === 'string' && /^\d+(\.\d{1,6})?$/.test(value) ? Number(value) : 50
  return String(Math.max(5, Math.min(50, Math.round(total * 0.1 * 100) / 100)))
}

function inferArtifactQuantity(parameters: Record<string, unknown>): number {
  for (const value of Object.values(parameters)) {
    if (Array.isArray(value) && value.length > 0) return value.length
  }
  return 1
}

function humanizeCapability(key: string): string {
  return key.split('.').map(part => part.replace(/_/g, ' ')).join(' › ')
}

function metricFromSnapshot(metrics: Record<string, import('../../modules/action-engine/types.js').MetricValue>, keys: string[]) {
  for (const key of keys) {
    if (metrics[key]) return metrics[key]
    const namespaced = Object.entries(metrics).find(([candidate]) => candidate.endsWith(`.${key}`))?.[1]
    if (namespaced) return namespaced
  }
  return undefined
}

async function loadMissionActionPack(pool: Pool, packVersionId: string): Promise<ActionPackVersion> {
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
  pool: Pool,
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

function integerParameter(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function decimalParameter(value: unknown, fallback: string) {
  const candidate = typeof value === 'string' || typeof value === 'number' ? String(value) : fallback
  return /^\d+(?:\.\d+)?$/.test(candidate) ? candidate : fallback
}

function stableCheckpoint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableCheckpoint).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stableCheckpoint(item)}`).join(',')}}`
  return JSON.stringify(value)
}

async function transaction<T>(pool: Pool, work: (client: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}
