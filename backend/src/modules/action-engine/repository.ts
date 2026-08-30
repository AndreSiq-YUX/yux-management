import { createHash } from 'node:crypto'
import { recordDomainEvent } from '../events/repository.js'
import type { DomainEventActor } from '../events/types.js'
import { assertMissionTransition } from './state-machine.js'
import type { ActionMission, ActionPlanStep, AutonomyEnvelope, MissionContextSnapshot, MissionGoal, MissionMode, MissionStatus } from './types.js'
import type { CapabilityManifestEntry } from './capability-manifest.js'
import { recordDecisionFeedback, type DecisionReasonKey } from './decision-feedback.js'

export type Queryable = {
  query<TRow = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: TRow[]; rowCount?: number | null }>
}

export type Connectable = Queryable & {
  connect(): Promise<Queryable & { release(): void | Promise<void> }>
}

type MissionRow = {
  id: string
  organization_id: string
  contract_id: string | null
  pack_version_id: string
  status: MissionStatus
  mode: MissionMode
  title: string
  objective: string
  goal: MissionGoal | null
  autonomy_envelope: AutonomyEnvelope | null
  pack_selection: Record<string, unknown> | null
  parameters: Record<string, unknown>
  budget: Record<string, unknown>
  deadline_at: string | Date | null
  active_plan_id: string | null
  version: number
  created_by: string
  created_at: string | Date
  updated_at: string | Date
}

const MISSION_COLUMNS = `id, organization_id, contract_id, pack_version_id, status, mode,
  title, objective, goal, autonomy_envelope, pack_selection, parameters, budget, deadline_at, active_plan_id, version,
  created_by, created_at, updated_at`

export async function createMission(
  pool: Connectable,
  input: {
    organizationId: string
    contractId?: string | null
    packVersionId: string
    title: string
    objective: string
    goal?: MissionGoal
    autonomyEnvelope?: AutonomyEnvelope
    packSelection?: Record<string, unknown>
    mode?: MissionMode
    parameters?: Record<string, unknown>
    budget?: Record<string, unknown>
    deadlineAt?: string | null
    createdBy: string
    idempotencyKey: string
  },
): Promise<ActionMission> {
  return inTransaction(pool, async (client) => {
    const result = await client.query<MissionRow>(
      `INSERT INTO public.action_missions (
         organization_id, contract_id, pack_version_id, title, objective, mode,
         goal, autonomy_envelope, pack_selection, parameters, budget, deadline_at, created_by, create_idempotency_key
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (organization_id, create_idempotency_key) DO NOTHING
       RETURNING ${MISSION_COLUMNS}`,
      [input.organizationId, input.contractId ?? null, input.packVersionId, input.title.trim(),
        input.objective.trim(), input.mode ?? 'assisted', input.goal ?? {}, input.autonomyEnvelope ?? {},
        input.packSelection ?? {}, input.parameters ?? {}, input.budget ?? {}, input.deadlineAt ?? null,
        input.createdBy, input.idempotencyKey],
    )
    let row = result.rows[0]
    if (!row) {
      const existing = await client.query<MissionRow>(
        `SELECT ${MISSION_COLUMNS} FROM public.action_missions
         WHERE organization_id = $1 AND create_idempotency_key = $2 LIMIT 1`,
        [input.organizationId, input.idempotencyKey],
      )
      row = existing.rows[0]
      if (!row) throw new Error('mission_insert_failed')
      if (row.pack_version_id !== input.packVersionId || row.objective !== input.objective.trim()) {
        throw new Error('idempotency_conflict')
      }
      return mapMission(row)
    }
    const mission = mapMission(row)
    await recordDomainEvent(client, {
      eventType: 'mission.created',
      organizationId: input.organizationId,
      aggregateType: 'mission',
      aggregateId: mission.id,
      actor: { type: 'user', id: input.createdBy },
      payload: { status: mission.status, packVersionId: mission.packVersionId, mode: mission.mode },
    })
    return mission
  })
}

export async function getMission(client: Queryable, missionId: string, organizationId: string): Promise<ActionMission | null> {
  const result = await client.query<MissionRow>(
    `SELECT ${MISSION_COLUMNS} FROM public.action_missions WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [missionId, organizationId],
  )
  return result.rows[0] ? mapMission(result.rows[0]) : null
}

export async function answerMissionClarification(client: Queryable, input: {
  missionId: string
  organizationId: string
  expectedVersion: number
  answers: Record<string, unknown>
  actorId: string
}): Promise<ActionMission> {
  const current = await client.query<MissionRow>(
    `SELECT ${MISSION_COLUMNS} FROM public.action_missions
     WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [input.missionId, input.organizationId],
  )
  const row = current.rows[0]
  if (!row) throw new Error('mission_not_found')
  if (Number(row.version) !== input.expectedVersion) throw new Error('mission_version_conflict')
  if (row.status !== 'qualifying') throw new Error('mission_not_awaiting_clarification')
  const updated = await client.query<MissionRow>(
    `UPDATE public.action_missions
     SET goal = jsonb_set(
           COALESCE(goal, '{}'::jsonb),
           '{constraints,clarificationAnswers}',
           COALESCE(goal #> '{constraints,clarificationAnswers}', '{}'::jsonb) || $3::jsonb,
           TRUE
         ),
         pack_selection = (COALESCE(pack_selection, '{}'::jsonb) - 'clarification')
           || jsonb_build_object('clarificationAnswers', $3::jsonb),
         version = version + 1, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2
     RETURNING ${MISSION_COLUMNS}`,
    [input.missionId, input.organizationId, input.answers],
  )
  const mission = mapMission(updated.rows[0]!)
  await recordDomainEvent(client, {
    eventType: 'mission.clarification_answered', organizationId: input.organizationId,
    aggregateType: 'mission', aggregateId: input.missionId,
    actor: { type: 'user', id: input.actorId }, payload: { answerKeys: Object.keys(input.answers).sort() },
  })
  return mission
}

type ContextSnapshotRow = {
  id: string; organization_id: string; mission_id: string; context_hash: string; query: string;
  company_context: Record<string, unknown>; knowledge_items: Array<Record<string, unknown>>;
  strategy_items: Array<Record<string, unknown>>; live_state: Record<string, unknown>;
  capability_manifest: Array<Record<string, unknown>>; capability_catalog_hash: string;
  source_ids: string[]; created_at: string | Date;
}

export async function insertMissionContextSnapshot(client: Queryable, input: {
  organizationId: string
  missionId: string
  query: string
  companyContext: Record<string, unknown>
  knowledgeItems: Array<Record<string, unknown>>
  strategyItems: Array<Record<string, unknown>>
  liveState: Record<string, unknown>
  capabilityManifest: Array<Record<string, unknown>>
  capabilityCatalogHash: string
  sourceIds: string[]
}): Promise<MissionContextSnapshot> {
  const canonical = {
    query: input.query.trim(), companyContext: input.companyContext,
    knowledgeItems: input.knowledgeItems, strategyItems: input.strategyItems,
    liveState: input.liveState, capabilityManifest: input.capabilityManifest,
    capabilityCatalogHash: input.capabilityCatalogHash, sourceIds: [...new Set(input.sourceIds)].sort(),
  }
  const contextHash = hashCanonical(canonical)
  const inserted = await client.query<ContextSnapshotRow>(
    `INSERT INTO public.action_mission_context_snapshots (
       organization_id, mission_id, context_hash, query, company_context, knowledge_items,
       strategy_items, live_state, capability_manifest, capability_catalog_hash, source_ids
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (mission_id, context_hash) DO NOTHING RETURNING *`,
    [input.organizationId, input.missionId, contextHash, canonical.query, canonical.companyContext,
      canonical.knowledgeItems, canonical.strategyItems, canonical.liveState, canonical.capabilityManifest,
      canonical.capabilityCatalogHash, canonical.sourceIds],
  )
  let row = inserted.rows[0]
  if (!row) {
    const existing = await client.query<ContextSnapshotRow>(
      `SELECT * FROM public.action_mission_context_snapshots
       WHERE organization_id = $1 AND mission_id = $2 AND context_hash = $3 LIMIT 1`,
      [input.organizationId, input.missionId, contextHash],
    )
    row = existing.rows[0]
  }
  if (!row) throw new Error('mission_context_snapshot_insert_failed')
  return mapContextSnapshot(row)
}

export async function getMissionContextSnapshot(
  client: Queryable,
  snapshotId: string,
  organizationId: string,
): Promise<MissionContextSnapshot | null> {
  const result = await client.query<ContextSnapshotRow>(
    `SELECT * FROM public.action_mission_context_snapshots
     WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [snapshotId, organizationId],
  )
  return result.rows[0] ? mapContextSnapshot(result.rows[0]) : null
}

export async function listMissions(
  client: Queryable,
  input: { organizationId: string; statuses?: MissionStatus[]; limit?: number; offset?: number },
): Promise<ActionMission[]> {
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 25)))
  const offset = Math.max(0, Math.floor(input.offset ?? 0))
  const result = await client.query<MissionRow>(
    `SELECT ${MISSION_COLUMNS}
     FROM public.action_missions
     WHERE organization_id = $1
       AND ($2::TEXT[] IS NULL OR status = ANY($2::TEXT[]))
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [input.organizationId, input.statuses?.length ? input.statuses : null, limit, offset],
  )
  return result.rows.map(mapMission)
}

export async function updateMissionDraft(
  pool: Connectable,
  input: {
    missionId: string; organizationId: string; expectedVersion: number; actor: DomainEventActor;
    title?: string; objective?: string; deadlineAt?: string | null; budget?: Record<string, unknown>
  },
): Promise<ActionMission> {
  return inTransaction(pool, async (client) => {
    const result = await client.query<MissionRow>(
      `UPDATE public.action_missions
       SET title = COALESCE($4, title), objective = COALESCE($5, objective),
           deadline_at = CASE WHEN $6::BOOLEAN THEN $7::TIMESTAMPTZ ELSE deadline_at END,
           budget = COALESCE($8, budget), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND version = $3 AND status = 'draft'
       RETURNING ${MISSION_COLUMNS}`,
      [input.missionId, input.organizationId, input.expectedVersion, input.title?.trim() ?? null,
        input.objective?.trim() ?? null, input.deadlineAt !== undefined, input.deadlineAt ?? null,
        input.budget ?? null],
    )
    const row = result.rows[0]
    if (!row) {
      const existing = await getMission(client, input.missionId, input.organizationId)
      if (!existing) throw new Error('mission_not_found')
      if (existing.version !== input.expectedVersion) throw new Error('mission_version_conflict')
      throw new Error('mission_not_draft')
    }
    await recordDomainEvent(client, {
      eventType: 'mission.updated', organizationId: input.organizationId, aggregateType: 'mission',
      aggregateId: input.missionId, actor: input.actor,
      payload: { fields: Object.keys(input).filter((key) => ['title','objective','deadlineAt','budget'].includes(key)) },
    })
    return mapMission(row)
  })
}

export async function transitionMission(
  client: Queryable,
  input: {
    missionId: string
    organizationId: string
    expectedVersion: number
    toStatus: MissionStatus
    actor: DomainEventActor
    reason: string
  },
): Promise<ActionMission> {
  const currentResult = await client.query<MissionRow>(
    `SELECT ${MISSION_COLUMNS} FROM public.action_missions
     WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [input.missionId, input.organizationId],
  )
  const current = currentResult.rows[0]
  if (!current) throw new Error('mission_not_found')
  if (Number(current.version) !== input.expectedVersion) throw new Error('mission_version_conflict')
  assertMissionTransition(current.status, input.toStatus)

  const updated = await client.query<MissionRow>(
    `UPDATE public.action_missions
     SET status = $4, version = version + 1, updated_at = NOW(),
         started_at = CASE WHEN $4 = 'active' AND started_at IS NULL THEN NOW() ELSE started_at END,
         ended_at = CASE WHEN $4 IN ('succeeded','failed','expired','cancelled') THEN NOW() ELSE ended_at END
     WHERE id = $1 AND organization_id = $2 AND version = $3
     RETURNING ${MISSION_COLUMNS}`,
    [input.missionId, input.organizationId, input.expectedVersion, input.toStatus],
  )
  if (!updated.rows[0]) throw new Error('mission_version_conflict')

  await recordDomainEvent(client, {
    eventType: 'mission.status_changed',
    organizationId: input.organizationId,
    aggregateType: 'mission',
    aggregateId: input.missionId,
    actor: input.actor,
    payload: { fromStatus: current.status, toStatus: input.toStatus, reason: input.reason },
  })
  return mapMission(updated.rows[0])
}

export async function insertPlanRevision(
  client: Queryable,
  input: {
    organizationId: string
    missionId: string
    packVersionId: string
    packContentHash: string
    parameters: Record<string, unknown>
    deviations: Array<Record<string, unknown>>
    estimatedEconomics: Record<string, unknown>
    capabilityManifest?: CapabilityManifestEntry[]
    capabilityManifestHash?: string
    proposedPayload?: Record<string, unknown>
    compiledPayload?: Record<string, unknown>
    planHash?: string
    steps: ActionPlanStep[]
    createdBy?: string | null
  },
): Promise<{ id: string; revision: number; planHash: string }> {
  const planHash = input.planHash ?? hashCanonical({
    packContentHash: input.packContentHash,
    parameters: input.parameters,
    deviations: input.deviations,
    steps: input.steps,
  })
  await client.query(
    `SELECT id FROM public.action_missions WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [input.missionId, input.organizationId],
  )
  const next = await client.query<{ revision: number }>(
    `SELECT COALESCE(MAX(revision), 0)::INT + 1 AS revision
     FROM public.action_plans WHERE mission_id = $1`,
    [input.missionId],
  )
  const revision = Number(next.rows[0]?.revision ?? 1)
  const plan = await client.query<{ id: string }>(
    `INSERT INTO public.action_plans (
       organization_id, mission_id, revision, status, pack_version_id, pack_content_hash,
       plan_hash, parameters, deviations, proposed_payload, compiled_payload, estimated_economics,
       capability_manifest, capability_manifest_hash, created_by
     ) VALUES ($1,$2,$3,'proposed',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [input.organizationId, input.missionId, revision, input.packVersionId, input.packContentHash,
      planHash, input.parameters, input.deviations, input.proposedPayload ?? {}, input.compiledPayload ?? {},
      input.estimatedEconomics, input.capabilityManifest ?? [],
      input.capabilityManifestHash ?? '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e1694018417eb71d718210b',
      input.createdBy ?? null],
  )
  const planId = plan.rows[0]?.id
  if (!planId) throw new Error('plan_insert_failed')
  for (const [position, step] of input.steps.entries()) {
    await client.query(
      `INSERT INTO public.action_plan_steps (
         organization_id, plan_id, step_key, position, capability_key, capability_version,
         capability_definition_hash, depends_on, parameters, approval_required, is_protected, extension_point
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [input.organizationId, planId, step.stepKey, position, step.capabilityKey,
        step.capabilityVersion, step.capabilityDefinitionHash ?? null, step.dependsOn, step.parameters, step.approvalRequired,
        step.protected, step.extensionPoint ?? null],
    )
  }
  const artifactBindings = Array.isArray(input.compiledPayload?.artifactBindings) ? input.compiledPayload.artifactBindings : []
  for (const raw of artifactBindings) {
    if (!raw || typeof raw !== 'object') throw new Error('plan_artifact_binding_invalid')
    const binding = raw as Record<string, unknown>
    await client.query(
      `INSERT INTO public.action_plan_artifact_bindings (
         organization_id,plan_id,from_pack_key,artifact_key,from_step_key,output_path,to_pack_key,to_step_key,input_key,schema_version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [input.organizationId,planId,binding.fromPack,binding.artifactKey,binding.fromStepKey,binding.outputPath,binding.toPack,binding.toStepKey,binding.inputKey,binding.schemaVersion],
    )
  }
  return { id: planId, revision, planHash }
}

export async function activatePlan(
  client: Queryable,
  input: { organizationId: string; missionId: string; planId: string; approvedBy: string; subjectHash: string },
): Promise<void> {
  const result = await client.query<{ plan_hash: string }>(
    `SELECT plan_hash FROM public.action_plans
     WHERE id = $1 AND mission_id = $2 AND organization_id = $3 AND status = 'pending_approval'
     FOR UPDATE`,
    [input.planId, input.missionId, input.organizationId],
  )
  if (!result.rows[0]) throw new Error('plan_not_pending_approval')
  if (result.rows[0].plan_hash !== input.subjectHash) throw new Error('approval_subject_changed')
  await client.query(
    `UPDATE public.action_plans SET status = 'superseded', updated_at = NOW()
     WHERE mission_id = $1 AND organization_id = $2 AND status = 'active'`,
    [input.missionId, input.organizationId],
  )
  await client.query(
    `UPDATE public.action_plans SET status = 'active', approved_by = $2, approved_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [input.planId, input.approvedBy],
  )
  await client.query(
    `UPDATE public.action_missions SET active_plan_id = $2, updated_at = NOW()
     WHERE id = $1 AND organization_id = $3`,
    [input.missionId, input.planId, input.organizationId],
  )
}

export async function listMissionPlans(client: Queryable, missionId: string, organizationId: string) {
  const result = await client.query<Record<string, unknown>>(
    `SELECT id, organization_id AS "organizationId", mission_id AS "missionId", revision, status,
            pack_version_id AS "packVersionId", pack_content_hash AS "packContentHash", plan_hash AS "planHash",
            capability_manifest AS "capabilityManifest", capability_manifest_hash AS "capabilityManifestHash",
            parameters, deviations, estimated_economics AS "estimatedEconomics",
            approved_at AS "approvedAt", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM public.action_plans WHERE mission_id = $1 AND organization_id = $2 ORDER BY revision DESC`,
    [missionId, organizationId],
  )
  return result.rows
}

export async function getPlan(client: Queryable, planId: string, organizationId: string) {
  const plan = await client.query<Record<string, unknown>>(
    `SELECT id, organization_id AS "organizationId", mission_id AS "missionId", revision, status,
            pack_version_id AS "packVersionId", pack_content_hash AS "packContentHash", plan_hash AS "planHash",
            capability_manifest AS "capabilityManifest", capability_manifest_hash AS "capabilityManifestHash",
            parameters, deviations, proposed_payload AS "proposedPayload", compiled_payload AS "compiledPayload",
            estimated_economics AS "estimatedEconomics", approved_at AS "approvedAt",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM public.action_plans WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [planId, organizationId],
  )
  if (!plan.rows[0]) return null
  const steps = await client.query<Record<string, unknown>>(
    `SELECT id, step_key AS "stepKey", position, capability_key AS "capabilityKey",
            capability_version AS "capabilityVersion", capability_definition_hash AS "capabilityDefinitionHash",
            depends_on AS "dependsOn", parameters,
            approval_required AS "approvalRequired", is_protected AS "protected", extension_point AS "extensionPoint"
     FROM public.action_plan_steps WHERE plan_id = $1 AND organization_id = $2 ORDER BY position`,
    [planId, organizationId],
  )
  return { ...plan.rows[0], steps: steps.rows }
}

export async function approvePlanRevision(pool: Connectable, input: {
  organizationId: string; missionId: string; planId: string; approvalId: string;
  expectedMissionVersion: number; subjectHash: string; decidedBy: string; reason: string
}): Promise<ActionMission> {
  return inTransaction(pool, async (client) => {
    const locked = await client.query<{ plan_hash: string; approval_subject_hash: string; requested_payload: Record<string, unknown>; plan_status: string; approval_status: string; approval_type: string; mission_status: MissionStatus; mission_version: number }>(
      `SELECT plan.plan_hash, plan.status AS plan_status, approval.status AS approval_status,
              approval.subject_hash AS approval_subject_hash, approval.requested_payload,
              approval.approval_type, mission.status AS mission_status, mission.version AS mission_version
       FROM public.action_plans plan
       JOIN public.action_missions mission ON mission.id = plan.mission_id
       JOIN public.action_approvals approval ON approval.plan_id = plan.id AND approval.id = $4
       WHERE plan.id = $1 AND plan.mission_id = $2 AND plan.organization_id = $3
       FOR UPDATE OF plan, mission, approval`,
      [input.planId, input.missionId, input.organizationId, input.approvalId],
    )
    const row = locked.rows[0]
    if (!row) throw new Error('plan_or_approval_not_found')
    if (row.plan_status !== 'pending_approval' || row.approval_status !== 'pending') throw new Error('plan_not_pending_approval')
    if (row.approval_subject_hash !== input.subjectHash) throw new Error('approval_subject_changed')
    const summary = row.requested_payload?.decisionSummary
    const proofPlanHash = summary && typeof summary === 'object'
      ? Reflect.get(Reflect.get(summary, 'technicalProof') ?? {}, 'planHash')
      : row.requested_payload?.planHash
    if (proofPlanHash !== row.plan_hash) throw new Error('approval_subject_changed')
    if (Number(row.mission_version) !== input.expectedMissionVersion) throw new Error('mission_version_conflict')
    const isReplan = row.approval_type === 'replan'
    const nextMissionStatus: MissionStatus = isReplan ? 'active' : 'ready'
    assertMissionTransition(row.mission_status, nextMissionStatus)
    await client.query(
      `UPDATE public.action_approvals SET status = 'approved', decision_reason = $2,
              decided_by = $3, decided_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [input.approvalId, input.reason, input.decidedBy],
    )
    if (isReplan) {
      await client.query(
        `UPDATE public.action_runs SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
         WHERE mission_id = $1 AND organization_id = $2 AND plan_id <> $3
           AND status NOT IN ('succeeded','failed','skipped','cancelled')`,
        [input.missionId, input.organizationId, input.planId],
      )
      await client.query(
        `UPDATE public.action_plans SET status = 'superseded', updated_at = NOW()
         WHERE mission_id = $1 AND organization_id = $2 AND status = 'active'`,
        [input.missionId, input.organizationId],
      )
      await client.query(
        `UPDATE public.action_plans SET status = 'active', approved_by = $2,
                approved_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [input.planId, input.decidedBy],
      )
      await createActionRuns(client, { organizationId: input.organizationId, missionId: input.missionId, planId: input.planId })
    } else {
      await client.query(
        `UPDATE public.action_plans SET status = 'approved', approved_by = $2,
                approved_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [input.planId, input.decidedBy],
      )
    }
    const mission = await client.query<MissionRow>(
      `UPDATE public.action_missions SET status = $5, active_plan_id = $2,
              version = version + 1, updated_at = NOW()
       WHERE id = $1 AND organization_id = $3 AND version = $4 RETURNING ${MISSION_COLUMNS}`,
      [input.missionId, input.planId, input.organizationId, input.expectedMissionVersion, nextMissionStatus],
    )
    if (!mission.rows[0]) throw new Error('mission_version_conflict')
    await recordDomainEvent(client, {
      eventType: 'mission.plan_approved', organizationId: input.organizationId, aggregateType: 'mission',
      aggregateId: input.missionId, actor: { type: 'user', id: input.decidedBy },
      payload: { planId: input.planId, planHash: row.plan_hash, decisionSubjectHash: input.subjectHash, reason: input.reason, approvalType: row.approval_type },
    })
    return mapMission(mission.rows[0])
  })
}

export async function listMissionApprovals(client: Queryable, missionId: string, organizationId: string) {
  const result = await client.query<Record<string, unknown>>(
    `SELECT id, mission_id AS "missionId", plan_id AS "planId", run_id AS "runId",
            approval_type AS "approvalType", status, subject_hash AS "subjectHash",
            requested_payload AS "requestedPayload", decision_reason AS "decisionReason",
            expires_at AS "expiresAt", decided_at AS "decidedAt", created_at AS "createdAt"
     FROM public.action_approvals WHERE mission_id = $1 AND organization_id = $2 ORDER BY created_at DESC`,
    [missionId, organizationId],
  )
  return result.rows
}

export async function decideActionApproval(pool: Connectable, input: {
  approvalId: string; organizationId: string; subjectHash: string;
  decision: 'approved' | 'rejected' | 'changes_requested'; reason: string; reasonKey?: DecisionReasonKey; decidedBy: string
}) {
  return inTransaction(pool, async (client) => {
    const result = await client.query<{ id: string; run_id: string | null; plan_id: string | null; mission_id: string; approval_type: string; status: string; subject_hash: string; mission_status: MissionStatus; mission_version: number }>(
      `SELECT approval.id, approval.run_id, approval.plan_id, approval.mission_id, approval.approval_type,
              approval.status, approval.subject_hash, mission.status AS mission_status, mission.version AS mission_version
       FROM public.action_approvals approval JOIN public.action_missions mission ON mission.id = approval.mission_id
       WHERE approval.id = $1 AND approval.organization_id = $2 FOR UPDATE OF approval, mission`,
      [input.approvalId, input.organizationId],
    )
    const approval = result.rows[0]
    if (!approval) throw new Error('approval_not_found')
    if (approval.status !== 'pending') throw new Error('approval_already_decided')
    if (approval.subject_hash !== input.subjectHash) throw new Error('approval_subject_changed')
    const planDecision = approval.approval_type === 'plan' || approval.approval_type === 'replan'
    if (planDecision && input.decision === 'approved') throw new Error('plan_approval_requires_version_context')
    if (input.decision !== 'approved' && !input.reasonKey) throw new Error('decision_feedback_reason_required')
    await client.query(
      `UPDATE public.action_approvals SET status = $2, decision_reason = $3, decided_by = $4,
              decided_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [input.approvalId, input.decision, input.reason, input.decidedBy],
    )
    if (approval.run_id) {
      await client.query(
        `UPDATE public.action_runs run SET status = $2,
                output = CASE WHEN $2 = 'blocked' THEN jsonb_build_object('approvalDecision',$3,'reason',$4) ELSE output END,
                updated_at = NOW()
         WHERE run.id = $1 AND run.status = 'waiting_approval'`,
        [approval.run_id, input.decision === 'approved' ? 'queued' : 'blocked', input.decision, input.reason],
      )
    }
    if (planDecision) {
      if (approval.plan_id) {
        await client.query(`UPDATE public.action_plans SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status = 'pending_approval'`, [approval.plan_id])
      }
      const nextStatus: MissionStatus = approval.approval_type === 'replan' ? 'paused' : 'planning'
      assertMissionTransition(approval.mission_status, nextStatus)
      const updated = await client.query<{ id: string }>(
        `UPDATE public.action_missions SET status = $3, version = version + 1,
                pack_selection = pack_selection || jsonb_build_object('lastDecisionFeedbackApprovalId',$4::text), updated_at = NOW()
          WHERE id = $1 AND organization_id = $2 AND version = $5 RETURNING id`,
        [approval.mission_id, input.organizationId, nextStatus, input.approvalId, approval.mission_version],
      )
      if (!updated.rows[0]) throw new Error('mission_version_conflict')
    }
    if (input.decision !== 'approved' && input.reasonKey) {
      await recordDecisionFeedback(client as never, {
        organizationId: input.organizationId, missionId: approval.mission_id, approvalId: input.approvalId,
        reviewerType: 'authenticated', reviewerUserId: input.decidedBy,
        decision: input.decision === 'rejected' ? 'rejected' : 'changes_requested',
        reasonKey: input.reasonKey, comment: input.reason, subjectHash: input.subjectHash,
      })
    }
    await recordDomainEvent(client, {
      eventType: input.decision === 'approved' ? 'approval.approved' : 'approval.rejected',
      organizationId: input.organizationId, aggregateType: 'approval', aggregateId: input.approvalId,
      actor: { type: 'user', id: input.decidedBy }, payload: { missionId: approval.mission_id, runId: approval.run_id, decision: input.decision, reasonKey: input.reasonKey ?? null },
    })
    return { approvalId: input.approvalId, missionId: approval.mission_id, runId: approval.run_id, status: input.decision }
  })
}

export async function createActionRuns(client: Queryable, input: { organizationId: string; missionId: string; planId: string }): Promise<number> {
  const result = await client.query(
    `INSERT INTO public.action_runs (
       organization_id, mission_id, plan_id, plan_step_id, status, idempotency_key, input
     )
     SELECT step.organization_id, $1, step.plan_id, step.id,
            CASE WHEN cardinality(step.depends_on) = 0 THEN 'ready' ELSE 'pending' END,
            $1::TEXT || ':' || step.plan_id::TEXT || ':' || step.step_key,
            step.parameters
     FROM public.action_plan_steps step
     WHERE step.plan_id = $2 AND step.organization_id = $3
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [input.missionId, input.planId, input.organizationId],
  )
  return result.rowCount ?? 0
}

export async function claimActionRun(client: Queryable, workerId: string): Promise<{ id: string; missionId: string } | null> {
  const result = await client.query<{ id: string; mission_id: string }>(
    `WITH candidate AS (
       SELECT run.id FROM public.action_runs run
       JOIN public.action_missions mission ON mission.id = run.mission_id
       WHERE run.status IN ('ready','queued','retry_scheduled')
         AND run.available_at <= NOW() AND mission.status = 'active'
       ORDER BY run.available_at, run.created_at
       FOR UPDATE OF run SKIP LOCKED LIMIT 1
     )
     UPDATE public.action_runs run SET status = 'running', claimed_at = NOW(), claimed_by = $1, updated_at = NOW()
     FROM candidate WHERE run.id = candidate.id RETURNING run.id, run.mission_id`,
    [workerId],
  )
  return result.rows[0] ? { id: result.rows[0].id, missionId: result.rows[0].mission_id } : null
}

export async function recordApproval(client: Queryable, input: {
  organizationId: string; missionId: string; planId?: string; runId?: string; approvalType: string;
  subjectHash: string; requestedPayload?: Record<string, unknown>; requestedBy?: string; expiresAt?: string
}): Promise<{ id: string }> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO public.action_approvals (
       organization_id, mission_id, plan_id, run_id, approval_type, subject_hash,
       requested_payload, requested_by, expires_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [input.organizationId, input.missionId, input.planId ?? null, input.runId ?? null,
      input.approvalType, input.subjectHash, input.requestedPayload ?? {}, input.requestedBy ?? null,
      input.expiresAt ?? null],
  )
  if (!result.rows[0]) throw new Error('approval_insert_failed')
  return result.rows[0]
}

export async function recordMissionEntity(client: Queryable, input: {
  organizationId: string; missionId: string; entityType: string; entityId: string; role: string;
  ownershipMode: 'observe' | 'shared' | 'exclusive'; conflictPolicy?: 'allow_disjoint' | 'mission_wins' | 'block_new'
}): Promise<void> {
  await client.query(
    `INSERT INTO public.action_mission_entities (
       organization_id, mission_id, entity_type, entity_id, role, ownership_mode, conflict_policy
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (mission_id, entity_type, entity_id, role) DO NOTHING`,
    [input.organizationId, input.missionId, input.entityType, input.entityId, input.role,
      input.ownershipMode, input.conflictPolicy ?? 'mission_wins'],
  )
}

export async function recordCostEntry(client: Queryable, input: {
  organizationId: string; missionId: string; runId?: string; attemptId?: string;
  category: string; nature: string; sourceType: string; sourceRecordId: string; sourceEventKey: string;
  idempotencyKey: string; amountOriginal: string; currencyOriginal: string;
  exchangeRateToBrl: string; amountBrl: string; humanMinutes?: string; humanHourlyRateBrl?: string;
  reversesEntryId?: string; metadata?: Record<string, unknown>
}): Promise<{ id: string }> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO public.action_cost_entries (
       organization_id, mission_id, run_id, attempt_id, category, nature, source_type,
       source_record_id, source_event_key, idempotency_key, amount_original, currency_original,
       exchange_rate_to_brl, amount_brl, human_minutes, human_hourly_rate_brl,
       reverses_entry_id, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [input.organizationId, input.missionId, input.runId ?? null, input.attemptId ?? null,
      input.category, input.nature, input.sourceType, input.sourceRecordId, input.sourceEventKey, input.idempotencyKey,
      input.amountOriginal, input.currencyOriginal, input.exchangeRateToBrl, input.amountBrl,
      input.humanMinutes ?? null, input.humanHourlyRateBrl ?? null, input.reversesEntryId ?? null,
      input.metadata ?? {}],
  )
  if (result.rows[0]) return result.rows[0]
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM public.action_cost_entries WHERE idempotency_key = $1 LIMIT 1`,
    [input.idempotencyKey],
  )
  if (!existing.rows[0]) throw new Error('cost_entry_insert_failed')
  return existing.rows[0]
}

export async function recordObservation(client: Queryable, input: {
  organizationId: string; missionId: string; observationType: string; idempotencyKey: string;
  sourceType: string; sourceRecordId?: string; sourceEventId?: string; correlationId?: string;
  payload?: Record<string, unknown>; observedAt?: string
}): Promise<{ id: string }> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO public.action_observations (
       organization_id, mission_id, observation_type, idempotency_key, source_type,
       source_record_id, source_event_id, correlation_id, payload, observed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key RETURNING id`,
    [input.organizationId, input.missionId, input.observationType, input.idempotencyKey,
      input.sourceType, input.sourceRecordId ?? null, input.sourceEventId ?? null,
      input.correlationId ?? null, input.payload ?? {}, input.observedAt ?? new Date().toISOString()],
  )
  if (!result.rows[0]) throw new Error('observation_insert_failed')
  return result.rows[0]
}

export async function recordEvaluation(client: Queryable, input: {
  organizationId: string; missionId: string; planId?: string; checkpointKey: string;
  idempotencyKey: string; decision: string; metricSnapshot: Record<string, unknown>;
  economicsSnapshot: Record<string, unknown>; rationale?: Record<string, unknown>
}): Promise<{ id: string }> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO public.action_evaluations (
       organization_id, mission_id, plan_id, checkpoint_key, idempotency_key,
       decision, metric_snapshot, economics_snapshot, rationale
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key RETURNING id`,
    [input.organizationId, input.missionId, input.planId ?? null, input.checkpointKey,
      input.idempotencyKey, input.decision, input.metricSnapshot, input.economicsSnapshot,
      input.rationale ?? {}],
  )
  if (!result.rows[0]) throw new Error('evaluation_insert_failed')
  return result.rows[0]
}

export async function publishActionPackVersion(client: Queryable, input: {
  packKey: string; name: string; description: string; semanticVersion: string; outcomeType: string;
  definition: Record<string, unknown>; contentHash: string; createdBy?: string
}): Promise<{ id: string }> {
  const pack = await client.query<{ id: string }>(
    `INSERT INTO public.action_packs (key, name, description) VALUES ($1,$2,$3)
     ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = NOW()
     RETURNING id`,
    [input.packKey, input.name, input.description],
  )
  const result = await client.query<{ id: string }>(
    `INSERT INTO public.action_pack_versions (
       pack_id, semantic_version, outcome_type, status, definition, content_hash, published_at, created_by
     ) VALUES ($1,$2,$3,'published_for_internal_pilot',$4,$5,NOW(),$6)
     ON CONFLICT (pack_id, semantic_version) DO NOTHING RETURNING id`,
    [pack.rows[0]?.id, input.semanticVersion, input.outcomeType, input.definition, input.contentHash,
      input.createdBy ?? null],
  )
  if (result.rows[0]) return result.rows[0]
  const existing = await client.query<{ id: string; content_hash: string }>(
    `SELECT version.id, version.content_hash FROM public.action_pack_versions version
     JOIN public.action_packs pack ON pack.id = version.pack_id
     WHERE pack.key = $1 AND version.semantic_version = $2`,
    [input.packKey, input.semanticVersion],
  )
  if (!existing.rows[0]) throw new Error('action_pack_publish_failed')
  if (existing.rows[0].content_hash !== input.contentHash) throw new Error('action_pack_version_hash_conflict')
  return { id: existing.rows[0].id }
}

export async function getPublishedActionPackVersion(client: Queryable, key: string, semanticVersion: string) {
  const result = await client.query<{ id: string; definition: Record<string, unknown>; content_hash: string }>(
    `SELECT version.id, version.definition, version.content_hash
     FROM public.action_pack_versions version
     JOIN public.action_packs pack ON pack.id = version.pack_id
     WHERE pack.key = $1 AND version.semantic_version = $2
       AND version.status IN ('published_for_internal_pilot','published') LIMIT 1`,
    [key, semanticVersion],
  )
  return result.rows[0] ?? null
}

export function hashCanonical(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex')
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function mapMission(row: MissionRow): ActionMission {
  const goal = row.goal && Object.keys(row.goal).length > 0 ? row.goal : legacyGoal(row)
  const autonomyEnvelope = row.autonomy_envelope && Object.keys(row.autonomy_envelope).length > 0
    ? row.autonomy_envelope
    : legacyAutonomyEnvelope(row)
  return {
    id: row.id,
    organizationId: row.organization_id,
    ...(row.contract_id ? { contractId: row.contract_id } : {}),
    packVersionId: row.pack_version_id,
    status: row.status,
    mode: row.mode,
    title: row.title,
    objective: row.objective,
    goal,
    autonomyEnvelope,
    packSelection: row.pack_selection ?? {},
    parameters: row.parameters ?? {},
    budget: row.budget ?? {},
    ...(row.deadline_at ? { deadlineAt: toIso(row.deadline_at) } : {}),
    ...(row.active_plan_id ? { activePlanId: row.active_plan_id } : {}),
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function mapContextSnapshot(row: ContextSnapshotRow): MissionContextSnapshot {
  return {
    id: row.id, organizationId: row.organization_id, missionId: row.mission_id,
    contextHash: row.context_hash, query: row.query, companyContext: row.company_context ?? {},
    knowledgeItems: row.knowledge_items ?? [], strategyItems: row.strategy_items ?? [],
    liveState: row.live_state ?? {}, capabilityManifest: row.capability_manifest ?? [],
    capabilityCatalogHash: row.capability_catalog_hash, sourceIds: row.source_ids ?? [],
    createdAt: toIso(row.created_at),
  }
}

function legacyGoal(row: MissionRow): MissionGoal {
  return {
    statement: row.objective,
    requestedOutcome: 'recovered_revenue',
    scopeHints: ['crm'],
    constraints: {},
    acceptanceCriteria: [],
  }
}

function legacyAutonomyEnvelope(row: MissionRow): AutonomyEnvelope {
  return {
    mode: row.mode,
    allowedModules: ['crm'],
    allowedCapabilityKeys: [],
    maxTotalCostBrl: String(row.budget?.maxTotalCostBrl ?? '0'),
    maxHumanHours: String(row.budget?.maxHumanHours ?? '0'),
    ...(row.deadline_at ? { expiresAt: toIso(row.deadline_at) } : { expiresAt: new Date(0).toISOString() }),
    alwaysRequireApprovalFor: ['external','irreversible'],
  }
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

async function inTransaction<T>(pool: Connectable, work: (client: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.release()
  }
}
