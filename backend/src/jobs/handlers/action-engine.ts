import type { AppEnv } from '../../config/env.js'
import type { AppJobQueue } from '../../server.js'
import { createActionEngineCapabilityRegistry } from '../../modules/action-engine/capabilities/index.js'
import { REVENUE_RECOVERY_PACK_V0 } from '../../modules/action-engine/packs/revenue-recovery-v0.js'
import { CAMPAIGN_LAUNCH_PACK_V1 } from '../../modules/action-engine/packs/campaign-launch-v1.js'
import { compileSupervisorPlan, diffMissionPlans, requestMissionPlan, type CompiledMissionPlan } from '../../modules/action-engine/planner.js'
import type { ActionPackVersion } from '../../modules/action-engine/action-pack.js'
import {
  getMission, getPlan, insertMissionContextSnapshot, insertPlanRevision, recordApproval, transitionMission, type Queryable,
} from '../../modules/action-engine/repository.js'
import { recordDomainEvent } from '../../modules/events/repository.js'
import { executeActionRun, scheduleReadyActions } from '../../modules/action-engine/executor.js'
import { collectMissionEconomics } from '../../modules/action-engine/economics.js'
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
import { buildMissionContext } from '../../modules/action-engine/context-builder.js'
import { createCapabilityManifest } from '../../modules/action-engine/capability-manifest.js'
import { redactMissionTelemetry } from '../../modules/action-engine/telemetry-redaction.js'
import { buildMissionDecisionSummary } from '../../modules/action-engine/decision-summary.js'
import { deliverDecisionNotification, enqueuePendingDecisionNotifications, persistDecisionNotificationSchedule } from '../../modules/action-engine/decision-notifications.js'

type Pool = {
  query: Queryable['query']
  connect(): Promise<Queryable & { release(): void }>
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

export async function handleActionEngineRetention(pool: Pool) {
  return enforceMissionRetention(pool)
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
    const signedRevenue = packSnapshot.metrics.signed_revenue
      ?? packSnapshot.metrics.attributed_revenue_brl
      ?? { kind: 'unknown' as const, reason: 'confirmed_revenue_snapshot_required', unit: 'BRL' }
    const actionCounts = await client.query<{ completed: number | string; human: number | string; human_minutes: string | null }>(
      `SELECT COUNT(*) FILTER (WHERE run.status = 'succeeded')::INT AS completed,
              COUNT(*) FILTER (WHERE run.status = 'succeeded' AND step.capability_key = 'human.task.create')::INT AS human,
              (SELECT SUM(COALESCE(entry.human_minutes,0))::TEXT FROM public.action_cost_entries entry
               WHERE entry.mission_id = $1 AND entry.organization_id = $2 AND entry.nature IN ('actual','reversal')) AS human_minutes
       FROM public.action_runs run JOIN public.action_plan_steps step ON step.id = run.plan_step_id
       WHERE run.mission_id = $1 AND run.organization_id = $2`, [missionId, organizationId],
    )
    const economics = await collectMissionEconomics(client, missionId, organizationId, packSnapshot.packKey === 'campaign_launch' ? {
      producedValueBrl: signedRevenue.kind === 'known' ? signedRevenue.value : '0',
      ...(packSnapshot.metrics.spend_brl?.kind === 'known' ? { mediaSpendBrl: packSnapshot.metrics.spend_brl.value } : {}),
    } : undefined)
    const completedActions = Number(actionCounts.rows[0]?.completed ?? 0)
    const targetRevenue = Number(current.parameters.targetRevenueBrl ?? 0)
    const observedRevenue = signedRevenue.kind === 'known' ? Number(signedRevenue.value) : Number.NaN
    if (packSnapshot.packKey !== 'campaign_launch') {
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
  const pack = await loadMissionActionPack(pool, mission.packVersionId)
  const { parameters: _runtimeSchema, ...serializablePack } = pack as ActionPackVersion & { parameters?: unknown }
  const allowedKeys = new Set(pack.allowedCapabilities.map((item) => item.key))
  const capabilityCatalog = registry.listMetadata().filter((item) => allowedKeys.has(item.key))
  try {
  const manifest = createCapabilityManifest(
    registry,
    capabilityCatalog.map((item) => ({ key: item.key, version: item.version })),
  )
  const builtContext = await buildMissionContext(pool, {
    organizationId, ...(mission.contractId ? { contractId: mission.contractId } : {}),
    query: `${mission.goal.statement}\n${mission.goal.requestedOutcome}`,
    agentProfileKey: 'mission_supervisor',
    requestedModules: mission.autonomyEnvelope.allowedModules,
    capabilityManifest: manifest.entries,
  })
  const contextSnapshot = await transaction(pool, (client) => insertMissionContextSnapshot(client, {
    organizationId, missionId, query: builtContext.query, companyContext: builtContext.companyContext,
    knowledgeItems: builtContext.knowledgeItems, strategyItems: builtContext.strategyItems,
    liveState: builtContext.liveState,
    capabilityManifest: builtContext.capabilityManifest as unknown as Array<Record<string, unknown>>,
    capabilityCatalogHash: builtContext.capabilityCatalogHash, sourceIds: builtContext.sourceIds,
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
    const contextHash = builtContext.contextHash
    const created = await client.query<{ id: string }>(
      `INSERT INTO public.action_planning_cycles (
         organization_id, mission_id, plan_revision, context_hash, pack_key, pack_version, budget
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (mission_id, plan_revision) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [organizationId, missionId, requestedVersion, contextHash, pack.key,
        pack.semanticVersion, planningBudget],
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
    const providerConnections = pack.key === CAMPAIGN_LAUNCH_PACK_V1.key
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
      pack_catalog: [serializablePack],
      readiness: {
        ready: true, source: 'server_preflight',
        providerPlatforms: [...new Set(providerConnections.rows.map(row => row.provider))],
        providerConnections: providerConnections.rows.map(row => ({ id: row.id, platform: row.provider })),
      },
      baseline: builtContext.liveState, capabilities: capabilityCatalog,
      limits: mission.budget,
      strategy_context: {
        companyContext: builtContext.companyContext,
        strategyItems: builtContext.strategyItems,
        knowledgeItems: builtContext.knowledgeItems,
      },
      context_snapshot_id: contextSnapshot.id,
      allowed_source_ids: builtContext.sourceIds,
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
          packVersion: pack.semanticVersion, status: rawEnvelope.kind ?? 'unknown',
        }, { missionId, tokenKey: telemetryKey })
        await client.query(
          `INSERT INTO public.action_mission_telemetry (organization_id, mission_id, artifact_kind, payload)
           VALUES ($1,$2,'redacted_model_trace',$3)`,
          [organizationId, missionId, payload],
        )
      }
    })
    const compileResult = compileSupervisorPlan({
      rawProposal: rawPlan, missionId, packCatalog: [pack], registry,
      maxTotalCostBrl: String(mission.budget.maxTotalCostBrl ?? mission.autonomyEnvelope.maxTotalCostBrl ?? '0'),
      allowedSourceIds: contextSnapshot.sourceIds, contextHash: contextSnapshot.contextHash,
      capabilityCatalogHash: contextSnapshot.capabilityCatalogHash,
      expectedCapabilityCatalogHash: builtContext.capabilityCatalogHash,
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
