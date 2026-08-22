import type { AppEnv } from '../../config/env.js'
import type { AppJobQueue } from '../../server.js'
import { createActionEngineCapabilityRegistry } from '../../modules/action-engine/capabilities/index.js'
import { REVENUE_RECOVERY_PACK_V0 } from '../../modules/action-engine/packs/revenue-recovery-v0.js'
import { compileMissionPlan, diffMissionPlans, requestMissionPlan, type CompiledMissionPlan } from '../../modules/action-engine/planner.js'
import {
  getMission, getPlan, insertPlanRevision, recordApproval, transitionMission, type Queryable,
} from '../../modules/action-engine/repository.js'
import { recordDomainEvent } from '../../modules/events/repository.js'
import { executeActionRun, scheduleReadyActions } from '../../modules/action-engine/executor.js'
import { collectMissionEconomics } from '../../modules/action-engine/economics.js'
import { evaluateMission } from '../../modules/action-engine/evaluator.js'
import { collectMissionMetrics } from '../../modules/action-engine/evaluator.js'
import { createActionEngineCommands } from '../../modules/action-engine/commands.js'

type Pool = {
  query: Queryable['query']
  connect(): Promise<Queryable & { release(): void }>
}

export async function handleActionEngineSchedule(pool: Pool, queue: AppJobQueue, data: Record<string, unknown>) {
  const missionId = typeof data.missionId === 'string' ? data.missionId : undefined
  return scheduleReadyActions(pool as never, queue, missionId)
}

export async function handleActionEngineExecute(pool: Pool, queue: AppJobQueue, data: Record<string, unknown>, workerId = 'action-engine-worker') {
  const actionRunId = stringField(data, 'actionRunId')
  const organizationId = stringField(data, 'organizationId')
  const missionId = stringField(data, 'missionId')
  const result = await executeActionRun(pool as never, createActionEngineCapabilityRegistry(), {
    actionRunId, organizationId, workerId, commands: createActionEngineCommands(pool as never, missionId),
  })
  if (result.status === 'succeeded' || result.status === 'failed' || result.status === 'skipped') {
    await queue.add('action-engine.scheduleReadyActions', { missionId })
  }
  return result
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
    const metrics = await collectMissionMetrics(pool, mission.id, mission.organization_id)
    const measuredAt = new Date().toISOString()
    for (const [key, metric] of Object.entries(metrics)) {
      await pool.query(
        `INSERT INTO public.action_mission_metrics (
           organization_id, mission_id, metric_key, value_kind, numeric_value, unit, reason, source_type, measured_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'mission_observer',$8)`,
        [mission.organization_id, mission.id, key, metric.kind, metric.kind === 'known' ? metric.value : null,
          metric.unit, metric.kind === 'known' ? null : metric.reason, measuredAt],
      )
      snapshots += 1
    }
    await queue.add('action-engine.evaluateMission', {
      missionId: mission.id, organizationId: mission.organization_id, checkpointKey: `scheduled-${measuredAt.slice(0, 16)}`,
    })
  }
  return { missions: missions.rows.length, snapshots }
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
    const metric = await client.query<{ value_kind: string; numeric_value: string | null; reason: string | null }>(
      `SELECT value_kind, numeric_value::TEXT, reason FROM public.action_mission_metrics
       WHERE mission_id = $1 AND organization_id = $2 AND metric_key = 'signed_revenue'
       ORDER BY measured_at DESC LIMIT 1`, [missionId, organizationId],
    )
    const signedRevenue = metric.rows[0]?.value_kind === 'known' && metric.rows[0].numeric_value !== null
      ? { kind: 'known' as const, value: metric.rows[0].numeric_value as `${number}`, unit: 'BRL' }
      : { kind: 'unknown' as const, reason: metric.rows[0]?.reason ?? 'confirmed_revenue_snapshot_required', unit: 'BRL' }
    const actionCounts = await client.query<{ completed: number | string; human: number | string; human_minutes: string | null }>(
      `SELECT COUNT(*) FILTER (WHERE run.status = 'succeeded')::INT AS completed,
              COUNT(*) FILTER (WHERE run.status = 'succeeded' AND step.capability_key = 'human.task.create')::INT AS human,
              (SELECT SUM(COALESCE(entry.human_minutes,0))::TEXT FROM public.action_cost_entries entry
               WHERE entry.mission_id = $1 AND entry.organization_id = $2 AND entry.nature IN ('actual','reversal')) AS human_minutes
       FROM public.action_runs run JOIN public.action_plan_steps step ON step.id = run.plan_step_id
       WHERE run.mission_id = $1 AND run.organization_id = $2`, [missionId, organizationId],
    )
    const economics = await collectMissionEconomics(client, missionId, organizationId)
    const completedActions = Number(actionCounts.rows[0]?.completed ?? 0)
    const targetRevenue = Number(current.parameters.targetRevenueBrl ?? 0)
    const observedRevenue = signedRevenue.kind === 'known' ? Number(signedRevenue.value) : Number.NaN
    const evaluation = await evaluateMission(client, {
      missionId, organizationId, checkpointKey, idempotencyKey: `${missionId}:${checkpointKey}:${evaluating.version}`,
      signedRevenue, economics, minimumSampleReached: completedActions >= 20,
      offTrack: completedActions >= 20 && Number.isFinite(observedRevenue) && targetRevenue > 0 && observedRevenue / targetRevenue < 0.25,
    })
    if (current.status === 'active') {
      const nextStatus = ({ continue: 'active', pause: 'paused', block: 'blocked', propose_replan: 'pending_replan_approval', succeed: 'succeeded', fail: 'failed', expire: 'expired' } as const)[evaluation.conclusion]
      const transitioned = await transitionMission(client, { missionId, organizationId, expectedVersion: evaluating.version, toStatus: nextStatus, actor: { type: 'system' }, reason: evaluation.reasons.join(',') })
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
  _queue?: AppJobQueue,
): Promise<{ planId?: string; skipped?: string }> {
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
  const { parameters: _runtimeSchema, ...serializablePack } = REVENUE_RECOVERY_PACK_V0
  const allowedKeys = new Set(REVENUE_RECOVERY_PACK_V0.allowedCapabilities.map((item) => item.key))
  const capabilityCatalog = registry.listMetadata().filter((item) => allowedKeys.has(item.key))
  try {
    const previousPlan = isReplan && mission.activePlanId ? await getPlan(pool, mission.activePlanId, organizationId) : null
    const previousCompiled = previousPlan && typeof previousPlan === 'object'
      ? Reflect.get(previousPlan, 'compiledPayload') as Record<string, unknown> | undefined
      : undefined
    const observations = isReplan ? await pool.query<Record<string, unknown>>(
      `SELECT observation_type AS "type", payload, observed_at AS "observedAt"
       FROM public.action_observations WHERE mission_id = $1 AND organization_id = $2
       ORDER BY observed_at DESC LIMIT 100`, [missionId, organizationId],
    ) : { rows: [] }
    const rawPlan = await requestMissionPlan(env, {
      organization_id: organizationId,
      ...(mission.contractId ? { contract_id: mission.contractId } : {}),
      mission: {
        id: mission.id, objective: mission.objective, parameters: mission.parameters,
        budget: mission.budget, deadlineAt: mission.deadlineAt,
      },
      action_pack: serializablePack,
      readiness: { ready: true, source: 'server_preflight' },
      baseline: {}, capabilities: capabilityCatalog,
      limits: mission.budget, strategy_context: {}, observations: observations.rows,
      ...(previousCompiled ? { previous_plan: previousCompiled } : {}),
    })
    const compiled = compileMissionPlan({
      rawPlan, missionId, pack: REVENUE_RECOVERY_PACK_V0, registry,
      maxTotalCostBrl: String(mission.budget.maxTotalCostBrl ?? '0'),
    })
    return await transaction(pool, async (client) => {
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
        steps: compiled.steps, proposedPayload: rawPlan as Record<string, unknown>,
        compiledPayload: compiled as unknown as Record<string, unknown>, planHash: compiled.planHash,
      })
      await client.query(`UPDATE public.action_plans SET status = 'pending_approval', updated_at = NOW() WHERE id = $1`, [plan.id])
      await recordApproval(client, {
        organizationId, missionId, planId: plan.id, approvalType: isReplan ? 'replan' : 'plan', subjectHash: compiled.planHash,
        requestedPayload: { packContentHash: compiled.packContentHash, planHash: compiled.planHash, revision: plan.revision, ...(diff ? { diff } : {}) },
      })
      await recordDomainEvent(client, {
        eventType: isReplan ? 'mission.replan_requested' : 'mission.plan_proposed', organizationId, aggregateType: 'mission', aggregateId: missionId,
        actor: { type: 'system' }, payload: { planId: plan.id, revision: plan.revision, planHash: compiled.planHash, ...(diff ? { diff } : {}) },
      })
      if (!isReplan) {
        await transitionMission(client, {
          missionId, organizationId, expectedVersion: requestedVersion, toStatus: 'pending_plan_approval',
          actor: { type: 'system' }, reason: 'plan_compiled_and_verified',
        })
      }
      return { planId: plan.id }
    })
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
