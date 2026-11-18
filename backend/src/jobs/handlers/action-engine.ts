import type { AppEnv } from '../../config/env.js'
import { runWithDatabaseRequestContext } from '../../db/request-context.js'
import { createHash } from 'node:crypto'
import type { AppJobQueue } from '../../server.js'
import { createActionEngineCapabilityRegistry } from '../../modules/action-engine/capabilities/index.js'
import { ensureCrmPreparationPackVersion } from '../../modules/action-engine/packs/crm-preparation-v1.js'
import { compileSupervisorPlan, diffMissionPlans, requestMissionPlan, type CompiledMissionPlan } from '../../modules/action-engine/planner.js'
import {
  getMission, insertMissionContextSnapshot, insertPlanRevision, recordApproval, recordEvaluation, transitionMission, type Queryable,
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
import { reconcilePlanningCost, reservePlanningCall, settlePlanningCall } from '../../modules/action-engine/planning-cycle.js'
import { enforceMissionRetention } from '../../modules/action-engine/retention.js'
import { processCompletedMissionLearning } from '../../modules/action-engine/learning.js'
import { redactMissionTelemetry } from '../../modules/action-engine/telemetry-redaction.js'
import { buildMissionDecisionSummary } from '../../modules/action-engine/decision-summary.js'
import { deliverDecisionNotification, enqueuePendingDecisionNotifications, persistDecisionNotificationSchedule } from '../../modules/action-engine/decision-notifications.js'
import { decideCampaignOptimization } from '../../modules/action-engine/capabilities/campaign-optimization.js'
import { invokeMissionConversationTurn } from '../../lib/agent-runtime-client.js'
import { buildMissionPlanningCatalog, buildMissionPlanningContext, buildMissionPlanRequest, getMissionPlanningLimits } from '../../modules/action-engine/mission-plan-request.js'
import { buildMissionTurnRequest } from '../../modules/action-engine/mission-turn-request.js'
import { missionIntakeSourceScope, missionSourceFingerprint, resolveMissionTurnHistory } from '../../modules/action-engine/mission-conversation-history.js'
import { intakePromptScope, missionPromptPilotEnabled, pinMissionPromptVersion } from '../../modules/action-engine/mission-prompt-versions.js'
import { agentSourceCategory, excludedAgentSources, requiredSourcesMessage } from '../../modules/action-engine/agent-source-rules.js'
import {
  completeAgentConversationTurn,
  getMissionConversation,
  isMissionConversationRolloutEnabled,
  projectMissionConversationPlanningResult,
  projectCrmPreparationOutcome,
  recordMissionConversationProcessingError,
} from '../../modules/action-engine/mission-conversations.js'
import { verifyMissionKnowledgeContext } from '../../modules/action-engine/mission-source-verifier.js'
import { getCompanyStrategyRevisionForEditing, canConfigureCompanyStrategy, listCompanyStrategies } from '../../modules/company-strategy/repository.js'
import { validateMissionStrategyProposal } from '../../modules/company-strategy/proposals.js'

type Pool = {
  query: Queryable['query']
  connect(): Promise<Queryable & { release(): void }>
}

export async function handleActionEngineProcessMissionConversation(
  pool: Pool,
  env: AppEnv,
  data: Record<string, unknown>,
  dependencies: {
    invokeTurn?: typeof invokeMissionConversationTurn
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
    const missionPrompt = await pinMissionPromptVersion(pool, env, {
      organizationId, scope: intakePromptScope(audience), operationId: userMessage.id, operationVersion: requestedVersion,
    })
    const excludedSources = excludedAgentSources(missionPrompt?.source_rules)
    const history = await resolveMissionTurnHistory(pool, conversation, audience, excludedSources)
    const { request, access } = await buildMissionTurnRequest(pool, env, {
      organizationId, contractId: conversation.contractId, actorId: conversation.createdBy,
      conversationId: conversation.id, audience, message: userMessage.content,
      currentBrief: history.currentBrief, messages: history.messages,
    })
    if (request.allowedCapabilityKeys?.includes('crm.pipeline.create_draft')
      && access.enabledModules.includes('automations')) await ensureCrmPreparationPackVersion(pool, conversation.createdBy)
    if (missionPrompt) request.mission_prompt = missionPrompt
    const operationId = request.client_id && request.contract_id ? userMessage.id : undefined
    const response = await (dependencies.invokeTurn ?? invokeMissionConversationTurn)(
      env, request, operationId, missionPromptPilotEnabled(env, organizationId),
    )
    const sourceScope = missionIntakeSourceScope(conversation, audience)
    const cited = response.sources ?? []
    const citedFingerprints = new Set(cited.map(missionSourceFingerprint))
    const inputSources = response.retrievedSources ?? []
    if ([...cited, ...inputSources].some(source => excludedSources.includes(agentSourceCategory(source.kind)))) {
      throw new Error('mission_source_policy_violation')
    }
    const remaining = new Map([...history.sources, ...inputSources].map(source => [missionSourceFingerprint(source), source]))
    for (const fingerprint of citedFingerprints) remaining.delete(fingerprint)
    await verifyMissionKnowledgeContext(pool, { ...sourceScope, sourceRefs: [...cited, ...remaining.values()] })
    let strategyProposal
    if(response.strategyProposal && canConfigureCompanyStrategy(access.role)) {
      try { strategyProposal=await validateMissionStrategyProposal(pool,{organizationId,actorId:conversation.createdBy,role:access.role},response.strategyProposal) }
      catch { /* Invalid proposals never discard a valid conversational reply. */ }
    }
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
        ...(strategyProposal?{strategyProposal}:{}),
      },
      sourceRefs: (response.sources ?? []) as unknown as Array<Record<string, unknown>>,
      harnessRunId: response.retrievalTraceId,
      contextHash: response.contextHash,
      currentBrief: response.brief as unknown as Record<string, unknown>,
      contextReadiness: response.readiness as unknown as Record<string, unknown>,
      promptContext: { audience, historyAfterSequence: history.historyAfterSequence, inputSources, excludedSources },
      ...(strategyProposal?{strategyProposalAccess:{organizationId,actorId:conversation.createdBy,role:access.role}}:{}),
    })
    return { skipped: false, conversation: updated }
  } catch (error) {
    if (error instanceof Error && error.message === 'mission_conversation_turn_in_progress') {
      return { skipped: true, reason: 'mission_conversation_turn_in_progress' }
    }
    const errorCode = safeConversationError(error)
    await recordMissionConversationProcessingError(pool, {
      organizationId, conversationId, expectedVersion: requestedVersion,
      errorCode,
    })
    return { skipped: false, blocked: true, reason: errorCode }
  }
}


function safeConversationError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown'
  if (message === 'mission_conversation_output_truncated') return 'harness_response_incomplete'
  if (message === 'agent_required_sources_missing') return 'agent_required_sources_missing'
  if (['mission_conversation_runtime_contract_invalid', 'mission_conversation_wire_response_invalid', 'mission_conversation_runtime_422'].includes(message)) return 'harness_response_invalid'
  if (message.includes('timeout') || message.includes('aborted')) return 'harness_timeout'
  if (message.includes('mission_conversation_runtime_402')) return 'insufficient_ai_credits'
  if (message.includes('mission_conversation_runtime_503')) return 'harness_unavailable'
  if (message.includes('mission_source_')) return 'source_verification_failed'
  return 'conversation_processing_failed'
}

export async function handleActionEngineSchedule(pool: Pool, queue: AppJobQueue, data: Record<string, unknown>) {
  const missionId = typeof data.missionId === 'string' ? data.missionId : undefined
  const missions = await pool.query<{id:string;organization_id:string}>(
    "SELECT id,organization_id FROM public.action_missions WHERE status='active' AND ($1::uuid IS NULL OR id=$1)", [missionId ?? null],
  )
  const result={ready:0,waitingApproval:0}
  for(const mission of missions.rows){
    const scheduled=await runWithDatabaseRequestContext({role:'yux_operator',organizationIds:[mission.organization_id],serviceRole:'worker'},
      ()=>scheduleReadyActions(pool as never,queue,mission.id))
    result.ready+=scheduled.ready;result.waitingApproval+=scheduled.waitingApproval
  }
  return result
}

export async function handleActionEngineDecisionNotification(pool: Pool, queue: AppJobQueue, data: Record<string, unknown>, enabled = true, graphVersion?: string) {
  if (!enabled) return { skipped: 'mission_decision_notifications_disabled' }
  return deliverDecisionNotification(pool as never, queue, data, { graphVersion })
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
  radarConfig:import('../../modules/radar/action-engine-commands.js').RadarActionEngineConfig={},
) {
  const actionRunId = stringField(data, 'actionRunId')
  const organizationId = stringField(data, 'organizationId')
  const missionId = stringField(data, 'missionId')
  const result = await executeActionRun(pool as never, createActionEngineCapabilityRegistry(), {
    actionRunId, organizationId, workerId, commands: createActionEngineCommands(pool as never, missionId,radarConfig), mutationLeaseSecret,
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
  if (result.preparationCheckpoint) await queue.add('action-engine.collectMetrics', { missionId, organizationId })
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
    await runWithDatabaseRequestContext({role:'yux_operator',organizationIds:[mission.organization_id],serviceRole:'worker'},async()=>{
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
          attribution?.policyHash ?? null, JSON.stringify(attribution?.eventIds ?? [])],
      )
      snapshots += 1
    }
    await queue.add('action-engine.evaluateMission', {
      missionId: mission.id, organizationId: mission.organization_id, checkpointKey: `scheduled-${snapshot.measuredAt.slice(0, 16)}`,
    })
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
         SELECT 1 FROM public.action_autonomy_grants autonomy_grant
         WHERE autonomy_grant.mission_id=mission.id AND autonomy_grant.organization_id=mission.organization_id
           AND autonomy_grant.starts_at <= $2 AND autonomy_grant.expires_at > $2
           AND EXISTS (SELECT 1 FROM public.action_autonomy_grant_events event WHERE event.grant_id=autonomy_grant.id AND event.event_type='activated')
           AND NOT EXISTS (SELECT 1 FROM public.action_autonomy_grant_events event WHERE event.grant_id=autonomy_grant.id AND event.event_type='revoked')
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
    if (!['campaign_launch','composite','crm_preparation'].includes(packSnapshot.packKey)) {
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
      if (packSnapshot.packKey === 'crm_preparation' && ['succeeded','failed','blocked','expired'].includes(nextStatus)) {
        await projectCrmPreparationOutcome(client, { organizationId, missionId, succeeded: nextStatus === 'succeeded' })
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
  dependencies: { invokePlan?: typeof requestMissionPlan } = {},
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

  const catalog = await buildMissionPlanningCatalog(pool, env, mission)
  const { registry, packs, pack } = catalog
  try {
    const missionPrompt = await pinMissionPromptVersion(pool, env, {
      organizationId, scope: 'mission-planning', operationId: missionId, operationVersion: requestedVersion,
    })
    const { planningContext, groundingMetadata, linkedConversation, sourcePolicy } = await buildMissionPlanningContext(
      pool, mission, catalog, false, missionPrompt?.source_rules ?? undefined,
    )
    if (sourcePolicy?.missing.length) throw new Error('agent_required_sources_missing')
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
    const limits = getMissionPlanningLimits(mission)
    const { planningBudget, planningEstimate } = limits
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
    const payload = await buildMissionPlanRequest(pool, mission, catalog, planningContext, isReplan, limits, {
      snapshotId: contextSnapshot.id, cycleId: planningCycle.id,
    })
    if (missionPrompt) payload.mission_prompt = missionPrompt
    const previousCompiled = payload.previous_revision as Record<string, unknown> | undefined
    const planningStartedAt = Date.now()
    const rawPlan = await (dependencies.invokePlan ?? requestMissionPlan)(env, payload)
    const planningDurationMs = Math.max(0, Date.now() - planningStartedAt)
    const rawEnvelope = rawPlan && typeof rawPlan === 'object' ? rawPlan as Record<string, unknown> : {}
    const rawUsage = rawEnvelope.usage && typeof rawEnvelope.usage === 'object' ? rawEnvelope.usage as Record<string, unknown> : {}
    const { planningMeasurements, missionPromptVersion, ...rawTrace } = rawEnvelope.trace && typeof rawEnvelope.trace === 'object'
      ? rawEnvelope.trace as Record<string, unknown> : {}
    const storedPlan = rawEnvelope.trace ? { ...rawEnvelope, trace: rawTrace } : rawEnvelope
    const cost = reconcilePlanningCost(planningMeasurements, planningEstimate.costBrl)
    await transaction(pool, async (client) => {
      await settlePlanningCall(client, {
        cycleId: planningCycle.id, organizationId, reservationId: planningCycle.reservationId,
        actual: {
          calls: 1, inputTokens: Number(rawUsage.inputTokens ?? 0), outputTokens: Number(rawUsage.outputTokens ?? 0),
          costBrl: cost.budgetCostBrl, latencyMs: planningDurationMs,
        },
        providerModelId: typeof rawTrace.resolvedModelId === 'string' ? rawTrace.resolvedModelId : undefined,
        metadata: {
          profileKey: rawTrace.profileKey ?? 'mission_supervisor', promptHash: rawTrace.promptHash ?? null,
          measurements: cost.measurements,
          ...(typeof missionPromptVersion === 'number' ? { missionPromptVersion } : {}),
        },
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
        steps: compiled.steps, proposedPayload: storedPlan,
        compiledPayload: {
          ...(compiled as unknown as Record<string, unknown>),
          ...(groundingMetadata ? { grounding: { ...groundingMetadata, contextSnapshotId: contextSnapshot.id } } : {}),
        },
        planHash: compiled.planHash,
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
            quantity: pack.key === 'crm_preparation' ? 1 : inferArtifactQuantity(step.parameters), label: humanizeCapability(step.capabilityKey),
            version: `${step.capabilityVersion}:${step.capabilityDefinitionHash}`, providerTarget: step.capabilityKey.split('.')[0],
          })),
        existingContacts: Number(mission.parameters.existingContacts ?? 0), futureEligibleContacts: pack.key !== 'crm_preparation',
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
          content: safeErrorCode(error) === 'agent_required_sources_missing'
            ? requiredSourcesMessage : 'Não consegui preparar um plano seguro com o contexto atual. Revise as pendências e tente novamente.',
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

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`${key}_required`)
  return value
}

function safeErrorCode(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
}

function inferArtifactQuantity(parameters: Record<string, unknown>): number {
  for (const value of Object.values(parameters)) {
    if (Array.isArray(value) && value.length > 0) return value.length
  }
  return 1
}

function humanizeCapability(key: string): string {
  const drafts: Record<string,string> = { 'crm.pipeline.create_draft': 'Funil de CRM em rascunho',
    'email.template.create_draft': 'E-mail em rascunho', 'crm.sequence.create_draft': 'Sequência desativada' }
  if (drafts[key]) return drafts[key]
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
