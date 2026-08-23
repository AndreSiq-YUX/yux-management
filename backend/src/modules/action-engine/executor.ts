import { createHash } from 'node:crypto'
import type { AppJobQueue } from '../../server.js'
import type { CapabilityContext, CapabilityDefinition, CapabilityRegistry } from './capability-registry.js'
import { createActionRuns, getMission, recordApproval, transitionMission, type Connectable, type Queryable } from './repository.js'
import type { ActionRunStatus } from './types.js'
import { recordDomainEvent } from '../events/repository.js'
import { recordCapabilityCosts } from './economics.js'
import {
  markExternalEffectDispatched,
  markExternalEffectUnknown,
  reserveExternalEffect,
  resolveExternalEffect,
  type ExternalEffect,
} from './external-effects.js'
import { assertPinnedCapabilityAvailable, hashCapabilityManifest, type CapabilityManifestEntry } from './capability-manifest.js'
import { acquireResourceClaim, renewMissionResourceClaims } from './resource-claims.js'

type ActionRow = {
  id: string; organization_id: string; mission_id: string; plan_id: string; plan_step_id: string;
  status: ActionRunStatus; idempotency_key: string; input: Record<string, unknown>;
  capability_key: string; capability_version: number; approval_required: boolean;
  capability_definition_hash: string | null; capability_manifest: CapabilityManifestEntry[];
  capability_manifest_hash: string;
  mission_status: string; plan_status: string; available_at: string | Date;
}

export async function startMission(pool: Connectable, input: {
  organizationId: string; missionId: string; expectedVersion: number; actorId: string
}) {
  return transaction(pool, async (client) => {
    const mission = await getMission(client, input.missionId, input.organizationId)
    if (!mission) throw new Error('mission_not_found')
    if (mission.version !== input.expectedVersion) throw new Error('mission_version_conflict')
    if (mission.status !== 'ready' || !mission.activePlanId) throw new Error('mission_not_ready')
    const plan = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM public.action_plans WHERE id = $1 AND mission_id = $2 AND organization_id = $3 FOR UPDATE`,
      [mission.activePlanId, input.missionId, input.organizationId],
    )
    if (plan.rows[0]?.status !== 'approved') throw new Error('mission_plan_not_approved')
    await acquireResourceClaim(client, {
      organizationId: input.organizationId,
      missionId: input.missionId,
      missionLabel: mission.title,
      resourceKey: 'crm.lead_population',
      scope: 'inactive_revenue_recovery',
      mode: 'exclusive',
      ttlSeconds: 900,
    })
    const runCount = await createActionRuns(client, { organizationId: input.organizationId, missionId: input.missionId, planId: mission.activePlanId })
    await client.query(`UPDATE public.action_plans SET status = 'active', updated_at = NOW() WHERE id = $1`, [mission.activePlanId])
    const active = await transitionMission(client, {
      missionId: input.missionId, organizationId: input.organizationId, expectedVersion: input.expectedVersion,
      toStatus: 'active', actor: { type: 'user', id: input.actorId }, reason: 'mission_started',
    })
    await recordDomainEvent(client, {
      eventType: 'mission.started', organizationId: input.organizationId, aggregateType: 'mission',
      aggregateId: input.missionId, actor: { type: 'user', id: input.actorId },
      payload: { planId: mission.activePlanId, actionRunCount: runCount },
    })
    return { mission: active, actionRunCount: runCount }
  })
}

export async function scheduleReadyActions(pool: Connectable, queue: AppJobQueue, missionId?: string): Promise<{ ready: number; waitingApproval: number }> {
  const scheduled = await transaction(pool, async (client) => {
    const candidates = await client.query<{ id: string; organization_id: string; mission_id: string; approval_required: boolean; idempotency_key: string; capability_key: string }>(
      `SELECT run.id, run.organization_id, run.mission_id, step.approval_required, run.idempotency_key, step.capability_key
       FROM public.action_runs run
       JOIN public.action_plan_steps step ON step.id = run.plan_step_id
       JOIN public.action_missions mission ON mission.id = run.mission_id
       WHERE run.status = 'pending' AND mission.status = 'active'
         AND ($1::UUID IS NULL OR run.mission_id = $1)
         AND NOT EXISTS (
           SELECT 1 FROM unnest(step.depends_on) dependency(step_key)
           LEFT JOIN public.action_plan_steps dependency_step ON dependency_step.plan_id = run.plan_id AND dependency_step.step_key = dependency.step_key
           LEFT JOIN public.action_runs dependency_run ON dependency_run.plan_step_id = dependency_step.id
           WHERE dependency_run.status NOT IN ('succeeded','skipped') OR dependency_run.id IS NULL
         )
       ORDER BY run.created_at FOR UPDATE OF run SKIP LOCKED`,
      [missionId ?? null],
    )
    let ready = 0
    let waitingApproval = 0
    const queueItems: Array<{ id: string; organizationId: string; missionId: string }> = []
    for (const candidate of candidates.rows) {
      if (candidate.approval_required) {
        await client.query(`UPDATE public.action_runs SET status = 'waiting_approval', updated_at = NOW() WHERE id = $1`, [candidate.id])
        await recordApproval(client, {
          organizationId: candidate.organization_id, missionId: candidate.mission_id, runId: candidate.id,
          approvalType: 'action', subjectHash: hashSubject(candidate.idempotency_key), requestedPayload: { actionRunId: candidate.id },
        })
        waitingApproval += 1
      } else {
        await client.query(`UPDATE public.action_runs SET status = 'queued', updated_at = NOW() WHERE id = $1`, [candidate.id])
        queueItems.push({ id: candidate.id, organizationId: candidate.organization_id, missionId: candidate.mission_id })
        ready += 1
      }
    }
    return { ready, waitingApproval, queueItems }
  })
  for (const item of scheduled.queueItems) {
    await queue.add('action-engine.executeAction', { actionRunId: item.id, organizationId: item.organizationId, missionId: item.missionId })
  }
  return { ready: scheduled.ready, waitingApproval: scheduled.waitingApproval }
}

export async function executeActionRun(
  pool: Connectable,
  registry: CapabilityRegistry,
  input: { actionRunId: string; organizationId: string; workerId: string; commands?: CapabilityContext['commands'] },
): Promise<{ status: ActionRunStatus; duplicate?: boolean; reconciliation?: { effectId: string; organizationId: string } }> {
  const claimed = await transaction(pool, async (client) => {
    const result = await client.query<ActionRow>(
      `UPDATE public.action_runs run SET status = 'running', claimed_at = NOW(), claimed_by = $3, updated_at = NOW()
       FROM public.action_plan_steps step, public.action_missions mission, public.action_plans plan
       WHERE run.id = $1 AND run.organization_id = $2 AND run.status IN ('ready','queued','retry_scheduled')
         AND step.id = run.plan_step_id AND mission.id = run.mission_id AND plan.id = run.plan_id
         AND mission.status = 'active' AND plan.status = 'active'
       RETURNING run.id, run.organization_id, run.mission_id, run.plan_id, run.plan_step_id,
         run.status, run.idempotency_key, run.input, step.capability_key, step.capability_version,
         step.capability_definition_hash, plan.capability_manifest, plan.capability_manifest_hash,
         step.approval_required,
         mission.status AS mission_status, plan.status AS plan_status, run.available_at`,
      [input.actionRunId, input.organizationId, input.workerId],
    )
    const action = result.rows[0]
    if (!action) return null
    const attempt = await client.query<{ id: string; attempt_number: number }>(
      `INSERT INTO public.action_run_attempts (organization_id, run_id, attempt_number, status, input_snapshot)
       SELECT $1, $2, COALESCE(MAX(attempt_number), 0) + 1, 'running', $3
       FROM public.action_run_attempts WHERE run_id = $2 RETURNING id, attempt_number`,
      [input.organizationId, input.actionRunId, action.input],
    )
    return { action, attemptId: attempt.rows[0]?.id, attemptNumber: Number(attempt.rows[0]?.attempt_number ?? 1) }
  })
  if (!claimed) return { status: 'blocked', duplicate: true }

  const preflight = await pool.query<{ mission_status: string; run_status: string }>(
    `SELECT mission.status AS mission_status, run.status AS run_status
     FROM public.action_runs run JOIN public.action_missions mission ON mission.id = run.mission_id
     WHERE run.id = $1 AND run.organization_id = $2`, [input.actionRunId, input.organizationId],
  )
  if (preflight.rows[0]?.mission_status !== 'active' || preflight.rows[0]?.run_status !== 'running') {
    await markBlocked(pool, input.actionRunId, input.organizationId, claimed.attemptId, 'mission_not_active_at_preflight')
    return { status: 'blocked' }
  }
  try {
    await renewMissionResourceClaims(pool, claimed.action.mission_id, input.organizationId, 900)
  } catch {
    await markBlocked(pool, input.actionRunId, input.organizationId, claimed.attemptId, 'resource_claim_stale_fencing_token')
    return { status: 'blocked' }
  }

  let capability: CapabilityDefinition
  try {
    capability = registry.get(claimed.action.capability_key, Number(claimed.action.capability_version))
    const manifest = Array.isArray(claimed.action.capability_manifest) ? claimed.action.capability_manifest : []
    if (manifest.length > 0) {
      if (hashCapabilityManifest(manifest) !== claimed.action.capability_manifest_hash) {
        throw new Error('capability_catalog_drift')
      }
      const pinned = manifest.find((entry) => entry.key === capability.key && entry.version === capability.version)
      if (!pinned || claimed.action.capability_definition_hash !== pinned.definitionHash) {
        throw new Error('capability_catalog_drift')
      }
      assertPinnedCapabilityAvailable(registry, pinned)
    }
  } catch {
    await markBlocked(pool, input.actionRunId, input.organizationId, claimed.attemptId, 'capability_catalog_drift')
    return { status: 'blocked' }
  }

  let externalEffect: ExternalEffect | null = null
  if (capability.effect === 'external') {
    const reserved = await reserveExternalEffect(pool, {
      organizationId: input.organizationId,
      missionId: claimed.action.mission_id,
      planId: claimed.action.plan_id,
      runId: input.actionRunId,
      attemptId: claimed.attemptId,
      capabilityKey: capability.key,
      capabilityVersion: capability.version,
      providerKey: capability.requiredConnections[0] ?? capability.key.split('.')[0],
      providerIdempotencyKey: claimed.action.idempotency_key,
      requestHash: hashSubject(stableSerialize(claimed.action.input)),
      requestMetadata: { actionRunId: input.actionRunId, attemptNumber: claimed.attemptNumber },
      reconciliationDeadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    })
    externalEffect = reserved.effect
    if (externalEffect.status !== 'reserved') {
      if (externalEffect.status === 'dispatched') {
        externalEffect = await markExternalEffectUnknown(pool, {
          effectId: externalEffect.id,
          organizationId: input.organizationId,
          errorCode: 'worker_recovered_after_dispatch',
          nextReconcileAt: new Date(Date.now() + 15_000).toISOString(),
          evidence: { actionRunId: input.actionRunId },
        })
      }
      if (externalEffect.status === 'confirmed_created' || externalEffect.status === 'confirmed_failed') {
        const recoveredStatus = externalEffect.status === 'confirmed_created' ? 'succeeded' : 'failed'
        await finishFromConfirmedExternalEffect(pool, {
          actionRunId: input.actionRunId,
          organizationId: input.organizationId,
          missionId: claimed.action.mission_id,
          attemptId: claimed.attemptId,
          status: recoveredStatus,
          effect: externalEffect,
        })
        return { status: recoveredStatus, duplicate: true }
      }
      const unresolved = ['unknown', 'reconciling'].includes(externalEffect.status)
      await markBlocked(pool, input.actionRunId, input.organizationId, claimed.attemptId, `external_effect_${externalEffect.status}`)
      return {
        status: 'blocked',
        ...(unresolved ? { reconciliation: { effectId: externalEffect.id, organizationId: input.organizationId } } : {}),
      }
    }
    externalEffect = await markExternalEffectDispatched(pool, {
      effectId: externalEffect.id,
      organizationId: input.organizationId,
      attemptId: claimed.attemptId,
      evidence: { actionRunId: input.actionRunId, attemptNumber: claimed.attemptNumber },
    })
  }

  try {
    const result = await registry.invoke(claimed.action.capability_key, Number(claimed.action.capability_version), {
      organizationId: input.organizationId, missionId: claimed.action.mission_id, actor: { type: 'system' },
      idempotencyKey: claimed.action.idempotency_key, dryRun: false,
      query: pool.query.bind(pool), commands: input.commands,
    }, claimed.action.input)
    if (externalEffect) {
      externalEffect = await resolveExternalEffect(pool, {
        effectId: externalEffect.id,
        organizationId: input.organizationId,
        outcome: 'created',
        ...(result.sourceRecords?.[0]?.id ? { providerReference: result.sourceRecords[0].id } : {}),
        evidence: { actionRunId: input.actionRunId, sourceRecords: result.sourceRecords ?? [] },
      })
    }
    await transaction(pool, async (client) => {
      if (result.costHints?.length) {
        await recordCapabilityCosts(client, result.costHints.map((cost, index) => ({
          organizationId: input.organizationId, missionId: claimed.action.mission_id, runId: input.actionRunId,
          attemptId: claimed.attemptId, category: normalizeCostCategory(cost.category), nature: 'actual',
          sourceType: 'capability', sourceRecordId: `${claimed.action.capability_key}@${claimed.action.capability_version}`,
          sourceEventKey: `${claimed.action.idempotency_key}:cost:${index}`, idempotencyKey: `${claimed.action.idempotency_key}:cost:${index}:actual`,
          amountOriginal: cost.amount, currencyOriginal: cost.currency, exchangeRateToBrl: cost.currency === 'BRL' ? '1' : '1',
          amountBrl: cost.amount, metadata: { capabilityKey: claimed.action.capability_key },
        })))
      }
      await client.query(
        `UPDATE public.action_run_attempts SET status = 'succeeded', output_snapshot = $2, completed_at = NOW() WHERE id = $1`,
        [claimed.attemptId, result],
      )
      const waitUntil = claimed.action.capability_key === 'system.signal.wait'
        && result.output && typeof result.output === 'object' && typeof Reflect.get(result.output, 'waitUntil') === 'string'
        ? String(Reflect.get(result.output, 'waitUntil'))
        : null
      const waitsForHuman = claimed.action.capability_key === 'human.task.create'
      const remainsRunning = Boolean(waitUntil) || waitsForHuman
      await client.query(
        `UPDATE public.action_runs SET status = CASE WHEN $4::BOOLEAN THEN 'running' ELSE 'succeeded' END,
                output = $2, available_at = COALESCE($3::TIMESTAMPTZ, available_at),
                completed_at = CASE WHEN $4::BOOLEAN THEN NULL ELSE NOW() END,
                claimed_by = CASE WHEN $3::TIMESTAMPTZ IS NOT NULL THEN 'durable_wait' WHEN $5::BOOLEAN THEN 'human_task' ELSE claimed_by END,
                last_error = NULL, updated_at = NOW() WHERE id = $1`,
        [input.actionRunId, result, waitUntil, remainsRunning, waitsForHuman],
      )
      await recordDomainEvent(client, {
        eventType: remainsRunning ? 'action.waiting' : 'action.succeeded', organizationId: input.organizationId, aggregateType: 'action_run',
        aggregateId: input.actionRunId, actor: { type: 'system' },
        payload: { missionId: claimed.action.mission_id, capabilityKey: claimed.action.capability_key, ...(waitUntil ? { waitUntil } : {}), ...(waitsForHuman ? { reason: 'human_intervention_required' } : {}) },
      })
    })
    return { status: claimed.action.capability_key === 'system.signal.wait' || claimed.action.capability_key === 'human.task.create' ? 'running' : 'succeeded' }
  } catch (error) {
    if (externalEffect && isOutcomeUnknown(error)) {
      await markExternalEffectUnknown(pool, {
        effectId: externalEffect.id,
        organizationId: input.organizationId,
        errorCode: 'provider_outcome_unknown',
        nextReconcileAt: new Date(Date.now() + 15_000).toISOString(),
        evidence: { actionRunId: input.actionRunId, errorCode: safeError(error) },
      })
      await markBlocked(pool, input.actionRunId, input.organizationId, claimed.attemptId, 'provider_outcome_unknown')
      return { status: 'blocked', reconciliation: { effectId: externalEffect.id, organizationId: input.organizationId } }
    }
    if (externalEffect && externalEffect.status === 'dispatched') {
      await resolveExternalEffect(pool, {
        effectId: externalEffect.id,
        organizationId: input.organizationId,
        outcome: 'failed',
        evidence: { actionRunId: input.actionRunId, errorCode: safeError(error) },
      })
    }
    const retryable = !externalEffect && isRetryable(error) && claimed.attemptNumber < 3
    await transaction(pool, async (client) => {
      await client.query(`UPDATE public.action_run_attempts SET status = 'failed', error_code = $2, error_message = $3, completed_at = NOW() WHERE id = $1`, [claimed.attemptId, retryable ? 'transient' : 'execution_failed', safeError(error)])
      await client.query(
        `UPDATE public.action_runs SET status = $2, available_at = CASE WHEN $2 = 'retry_scheduled' THEN NOW() + INTERVAL '30 seconds' ELSE available_at END,
                last_error = $3, updated_at = NOW() WHERE id = $1`,
        [input.actionRunId, retryable ? 'retry_scheduled' : 'failed', safeError(error)],
      )
    })
    return { status: retryable ? 'retry_scheduled' : 'failed' }
  }
}

function normalizeCostCategory(value: string): 'ai' | 'provider' | 'media' | 'human' | 'external_service' | 'infrastructure_variable' {
  return (['ai','provider','media','human','external_service','infrastructure_variable'] as const).find((item) => item === value) ?? 'external_service'
}

export async function listMissionActions(client: Queryable, missionId: string, organizationId: string) {
  const result = await client.query<Record<string, unknown>>(
    `SELECT run.id, run.mission_id AS "missionId", run.plan_id AS "planId", run.status,
            run.input, run.output, run.available_at AS "availableAt", run.completed_at AS "completedAt",
            run.last_error AS "lastError", step.step_key AS "stepKey", step.capability_key AS "capabilityKey",
            step.capability_version AS "capabilityVersion", step.approval_required AS "approvalRequired"
     FROM public.action_runs run JOIN public.action_plan_steps step ON step.id = run.plan_step_id
     WHERE run.mission_id = $1 AND run.organization_id = $2 ORDER BY step.position`, [missionId, organizationId],
  )
  return result.rows
}

export async function getAction(client: Queryable, actionId: string, organizationId: string) {
  const result = await client.query<Record<string, unknown>>(
    `SELECT run.id, run.mission_id AS "missionId", run.plan_id AS "planId", run.status,
            run.input, run.output, run.available_at AS "availableAt", run.completed_at AS "completedAt",
            run.last_error AS "lastError", step.step_key AS "stepKey", step.capability_key AS "capabilityKey",
            step.capability_version AS "capabilityVersion", step.approval_required AS "approvalRequired"
     FROM public.action_runs run JOIN public.action_plan_steps step ON step.id = run.plan_step_id
     WHERE run.id = $1 AND run.organization_id = $2 LIMIT 1`, [actionId, organizationId],
  )
  return result.rows[0] ?? null
}

export function dependenciesSatisfied(statuses: ActionRunStatus[]): boolean {
  return statuses.every((status) => status === 'succeeded' || status === 'skipped')
}

export async function retryAction(pool: Connectable, input: { actionId: string; organizationId: string; reason: string }) {
  return transaction(pool, async (client) => {
    const result = await client.query<{ id: string; mission_id: string }>(
      `UPDATE public.action_runs run SET status = 'queued', available_at = NOW(), last_error = $3, updated_at = NOW()
       FROM public.action_missions mission
       WHERE run.id = $1 AND run.organization_id = $2 AND run.status IN ('failed','blocked')
         AND mission.id = run.mission_id AND mission.status = 'active'
       RETURNING run.id, run.mission_id`, [input.actionId, input.organizationId, `manual_retry:${input.reason}`],
    )
    if (!result.rows[0]) throw new Error('action_not_retryable')
    return { id: result.rows[0].id, missionId: result.rows[0].mission_id, status: 'queued' as const }
  })
}

export async function skipAction(pool: Connectable, input: { actionId: string; organizationId: string; reason: string }) {
  return transaction(pool, async (client) => {
    const result = await client.query<{ id: string }>(
      `UPDATE public.action_runs run SET status = 'skipped', output = jsonb_build_object('skipReason',$3), completed_at = NOW(), updated_at = NOW()
       FROM public.action_plan_steps step
       WHERE run.id = $1 AND run.organization_id = $2 AND run.status IN ('pending','ready','waiting_approval','failed','blocked')
         AND step.id = run.plan_step_id AND step.is_protected = FALSE RETURNING run.id`,
      [input.actionId, input.organizationId, input.reason],
    )
    if (!result.rows[0]) throw new Error('action_skip_not_allowed')
    return { id: result.rows[0].id, status: 'skipped' as const }
  })
}

export async function resolveHumanTask(pool: Connectable, input: {
  actionId: string; organizationId: string; actualMinutes: number; actorId: string; result: Record<string, unknown>
}) {
  if (!Number.isInteger(input.actualMinutes) || input.actualMinutes <= 0) throw new Error('actual_minutes_required')
  return transaction(pool, async (client) => {
    const action = await client.query<{ mission_id: string; idempotency_key: string; capability_key: string; budget: Record<string, unknown> }>(
      `SELECT run.mission_id, run.idempotency_key, step.capability_key, mission.budget
       FROM public.action_runs run JOIN public.action_plan_steps step ON step.id = run.plan_step_id
       JOIN public.action_missions mission ON mission.id = run.mission_id
       WHERE run.id = $1 AND run.organization_id = $2 AND run.status = 'running' FOR UPDATE OF run`,
      [input.actionId, input.organizationId],
    )
    const row = action.rows[0]
    if (!row || row.capability_key !== 'human.task.create') throw new Error('action_not_human_task')
    const rate = String(row.budget.humanHourlyRateBrl ?? '')
    if (!rate) throw new Error('human_cost_rate_missing')
    const { recordHumanTaskCost } = await import('./economics.js')
    await recordHumanTaskCost(client, {
      organizationId: input.organizationId, missionId: row.mission_id, runId: input.actionId,
      sourceType: 'human_task', sourceRecordId: input.actionId, sourceEventKey: `${row.idempotency_key}:human:resolved`,
      idempotencyKey: `${row.idempotency_key}:human:actual`, actualMinutes: String(input.actualMinutes), humanHourlyRateBrl: rate,
      metadata: { resolvedBy: input.actorId },
    })
    await client.query(`UPDATE public.action_runs SET status = 'succeeded', output = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`, [input.actionId, input.result])
    await recordDomainEvent(client, {
      eventType: 'action.succeeded', organizationId: input.organizationId, aggregateType: 'action_run', aggregateId: input.actionId,
      actor: { type: 'user', id: input.actorId }, payload: { missionId: row.mission_id, capabilityKey: 'human.task.create', actualMinutes: input.actualMinutes },
    })
    return { id: input.actionId, missionId: row.mission_id, status: 'succeeded' as const }
  })
}

function hashSubject(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function markBlocked(pool: Connectable, actionRunId: string, organizationId: string, attemptId: string | undefined, reason: string) {
  await transaction(pool, async (client) => {
    if (attemptId) await client.query(`UPDATE public.action_run_attempts SET status = 'failed', error_code = 'preflight_blocked', error_message = $2, completed_at = NOW() WHERE id = $1`, [attemptId, reason])
    await client.query(`UPDATE public.action_runs SET status = 'blocked', last_error = $3, updated_at = NOW() WHERE id = $1 AND organization_id = $2`, [actionRunId, organizationId, reason])
  })
}

async function finishFromConfirmedExternalEffect(pool: Connectable, input: {
  actionRunId: string
  organizationId: string
  missionId: string
  attemptId?: string
  status: 'succeeded' | 'failed'
  effect: ExternalEffect
}): Promise<void> {
  const reconciliation = {
    externalEffectId: input.effect.id,
    providerReference: input.effect.providerReference ?? null,
    evidence: input.effect.outcomeEvidence,
    recoveredFromPriorDispatch: true,
  }
  await transaction(pool, async (client) => {
    if (input.attemptId) {
      await client.query(
        `UPDATE public.action_run_attempts
         SET status = $2, output_snapshot = CASE WHEN $2 = 'succeeded' THEN $3::jsonb ELSE output_snapshot END,
             error_code = CASE WHEN $2 = 'failed' THEN 'provider_effect_confirmed_failed' ELSE NULL END,
             completed_at = NOW()
         WHERE id = $1`,
        [input.attemptId, input.status, { reconciliation }],
      )
    }
    await client.query(
      `UPDATE public.action_runs
       SET status = $3, output = CASE WHEN $3 = 'succeeded' THEN $4::jsonb ELSE output END,
           last_error = CASE WHEN $3 = 'failed' THEN 'provider_effect_confirmed_failed' ELSE NULL END,
           completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [input.actionRunId, input.organizationId, input.status, { reconciliation }],
    )
    await recordDomainEvent(client, {
      eventType: input.status === 'succeeded' ? 'action.succeeded' : 'action.failed',
      organizationId: input.organizationId,
      aggregateType: 'action_run',
      aggregateId: input.actionRunId,
      actor: { type: 'system' },
      payload: { missionId: input.missionId, reason: 'provider_effect_reused', reconciliation },
    })
  })
}

function isRetryable(error: unknown): boolean {
  const message = safeError(error)
  return /timeout|temporar|ECONN|429|502|503|504/i.test(message)
}

function isOutcomeUnknown(error: unknown): boolean {
  return /timeout|ECONN|socket|502|503|504|connection reset|network/i.test(safeError(error))
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function transaction<T>(pool: Connectable, work: (client: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result }
  catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error }
  finally { await client.release() }
}
