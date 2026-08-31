import { createHash } from 'node:crypto'
import type { AppJobQueue } from '../../server.js'
import type { CapabilityContext, CapabilityDefinition, CapabilityRegistry } from './capability-registry.js'
import { createActionRuns, getMission, recordApproval, recordEvaluation, transitionMission, type Connectable, type Queryable } from './repository.js'
import type { ActionRunStatus } from './types.js'
import { recordDomainEvent } from '../events/repository.js'
import {
  collectAutonomyUsage,
  recordCapabilityCosts,
  releaseAutonomyUsageReservations,
  reserveAutonomyUsage,
} from './economics.js'
import {
  markExternalEffectDispatched,
  markExternalEffectUnknown,
  reserveExternalEffectInTransaction,
  resolveExternalEffect,
  type ExternalEffect,
} from './external-effects.js'
import { assertPinnedCapabilityAvailable, hashCapabilityManifest, type CapabilityManifestEntry } from './capability-manifest.js'
import { acquireResourceClaim, getMissionFencingToken, renewMissionResourceClaims } from './resource-claims.js'
import { consumeMutationLease, issueMutationLease } from './mutation-leases.js'
import { loadKillSwitchState, resolveCapabilityDecision } from './capability-policy.js'
import { resolvePlanInputBindings } from './plan-input-bindings.js'
import { resolveCompositeActionInput } from './composite-execution.js'
import { getActiveAutonomyGrant } from './autonomy-grants.js'
import { estimateAutonomousEffectUsage, evaluateAutonomousPreflight, type AutonomyUsageSnapshot } from './autonomous-preflight.js'

type ActionRow = {
  id: string; organization_id: string; mission_id: string; plan_id: string; plan_step_id: string;
  status: ActionRunStatus; idempotency_key: string; input: Record<string, unknown>;
  capability_key: string; capability_version: number; approval_required: boolean;
  capability_definition_hash: string | null; capability_manifest: CapabilityManifestEntry[];
  capability_manifest_hash: string;
  pack_key: string; pack_version: string;
  compiled_payload: Record<string, unknown>; step_key: string;
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
    const plan = await client.query<{ id: string; status: string; pack_key: string; parameters: Record<string, unknown>; compiled_payload: Record<string, unknown> }>(
      `SELECT plan.id,plan.status,plan.parameters,plan.compiled_payload,pack.key AS pack_key FROM public.action_plans plan
       JOIN public.action_pack_versions version ON version.id=plan.pack_version_id
       JOIN public.action_packs pack ON pack.id=version.pack_id
       WHERE plan.id = $1 AND plan.mission_id = $2 AND plan.organization_id = $3 FOR UPDATE OF plan`,
      [mission.activePlanId, input.missionId, input.organizationId],
    )
    if (plan.rows[0]?.status !== 'approved') throw new Error('mission_plan_not_approved')
    const compositePacks = Array.isArray(plan.rows[0]?.compiled_payload.packs)
      ? plan.rows[0]!.compiled_payload.packs.map(item => item && typeof item === 'object' ? Reflect.get(item, 'key') : null) : []
    const funnelNurture = plan.rows[0]?.pack_key === 'funnel_nurture' || compositePacks.includes('funnel_nurture')
    const campaignLaunch = plan.rows[0]?.pack_key === 'campaign_launch' || compositePacks.includes('campaign_launch')
    const campaignArtifacts = campaignLaunch && plan.rows[0]?.parameters.campaignLaunchArtifacts
      && typeof plan.rows[0].parameters.campaignLaunchArtifacts === 'object'
      ? plan.rows[0].parameters.campaignLaunchArtifacts as Record<string, unknown> : {}
    const campaignBrief = campaignArtifacts.brief && typeof campaignArtifacts.brief === 'object'
      ? campaignArtifacts.brief as Record<string, unknown> : {}
    const providerConnectionId = typeof campaignBrief.providerConnectionId === 'string' ? campaignBrief.providerConnectionId : 'organization'
    const claimTargets = [
      ...(funnelNurture ? [{ resourceKey: 'crm.funnel_nurture_configuration', scope: 'organization_funnel_nurture' }] : []),
      ...(campaignLaunch ? [{ resourceKey: 'campaign.provider_account', scope: providerConnectionId }] : []),
      ...(!funnelNurture && !campaignLaunch ? [{ resourceKey: 'crm.lead_population', scope: 'inactive_revenue_recovery' }] : []),
    ]
    for (const target of claimTargets) await acquireResourceClaim(client, { organizationId: input.organizationId, missionId: input.missionId, missionLabel: mission.title, ...target, mode: 'exclusive', ttlSeconds: 900 })
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
  input: { actionRunId: string; organizationId: string; workerId: string; commands?: CapabilityContext['commands']; mutationLeaseSecret?: string },
): Promise<{
  status: ActionRunStatus
  duplicate?: boolean
  reconciliation?: { effectId: string; organizationId: string }
  containment?: { reason: string }
}> {
  const claimed = await transaction(pool, async (client) => {
    const result = await client.query<ActionRow>(
      `UPDATE public.action_runs run SET status = 'running', claimed_at = NOW(), claimed_by = $3, updated_at = NOW()
       FROM public.action_plan_steps step, public.action_missions mission, public.action_plans plan,
            public.action_pack_versions pack_version, public.action_packs pack
       WHERE run.id = $1 AND run.organization_id = $2 AND run.status IN ('ready','queued','retry_scheduled')
         AND step.id = run.plan_step_id AND mission.id = run.mission_id AND plan.id = run.plan_id
         AND pack_version.id = plan.pack_version_id AND pack.id = pack_version.pack_id
         AND mission.status = 'active' AND plan.status = 'active'
       RETURNING run.id, run.organization_id, run.mission_id, run.plan_id, run.plan_step_id,
         run.status, run.idempotency_key, run.input, step.capability_key, step.capability_version,
         step.capability_definition_hash, plan.capability_manifest, plan.capability_manifest_hash,
         pack.key AS pack_key, pack_version.semantic_version AS pack_version,plan.compiled_payload,step.step_key,step.approval_required,
         mission.status AS mission_status, plan.status AS plan_status, run.available_at`,
      [input.actionRunId, input.organizationId, input.workerId],
    )
    const action = result.rows[0]
    if (!action) return null
    const [planParameters, dependencyOutputs] = await Promise.all([
      client.query<{ parameters: Record<string, unknown> }>(`SELECT parameters FROM public.action_plans WHERE id = $1 AND organization_id = $2`, [action.plan_id, input.organizationId]),
      client.query<{ step_key: string; output: Record<string, unknown> }>(
        `SELECT step.step_key, run.output FROM public.action_runs run
         JOIN public.action_plan_steps step ON step.id = run.plan_step_id
         WHERE run.plan_id = $1 AND run.organization_id = $2 AND run.status = 'succeeded'`,
        [action.plan_id, input.organizationId],
      ),
    ])
    action.input = resolvePlanInputBindings(action.input, {
      resolvedParameters: planParameters.rows[0]?.parameters ?? {},
      outputsByStep: Object.fromEntries(dependencyOutputs.rows.map(row => [row.step_key, row.output ?? {}])),
    }) as Record<string, unknown>
    if (Array.isArray(action.compiled_payload?.packs) && action.compiled_payload.packs.length > 1) {
      action.input = await resolveCompositeActionInput(client, { organizationId: input.organizationId, planId: action.plan_id, targetStepKey: action.step_key, currentInput: action.input })
    }
    await client.query(`UPDATE public.action_runs SET input = $3, updated_at = NOW() WHERE id = $1 AND organization_id = $2`, [action.id, input.organizationId, action.input])
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

  let mutationLease: string | undefined
  let fencingToken: string | undefined
  let executionActorId: string | undefined
  let issuedExternalEffect: ExternalEffect | null = null
  let dryRun = false
  try {
    const issued = await transaction(pool, async (client) => {
      await client.query(
        `SELECT id FROM public.action_missions WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [claimed.action.mission_id, input.organizationId],
      )
      const currentMission = await getMission(client, claimed.action.mission_id, input.organizationId)
      if (!currentMission) throw new Error('mission_not_found')
      const consentChannel = capability.key === 'email.message.queue' ? 'email'
        : capability.key === 'whatsapp.template.queue' ? 'whatsapp' : null
      const consentEvidenceId = typeof claimed.action.input.consentEvidenceId === 'string' ? claimed.action.input.consentEvidenceId : null
      const leadId = typeof claimed.action.input.leadId === 'string' ? claimed.action.input.leadId : null
      const destination = typeof claimed.action.input.to === 'string' ? claimed.action.input.to : null
      const [switches, approval, costs, connections, consent, contractModules, packEntitlement] = await Promise.all([
        loadKillSwitchState(client, {
          organizationId: input.organizationId, packKey: claimed.action.pack_key,
          packVersion: claimed.action.pack_version, capabilityKey: capability.key, capabilityVersion: capability.version,
        }),
        client.query<{ approved: boolean; approved_scope_grant_ids: string[]; decided_by: string | null }>(
          `SELECT EXISTS (SELECT 1 FROM public.action_approvals
             WHERE run_id = $1 AND organization_id = $2 AND status = 'approved') AS approved,
             COALESCE((SELECT ARRAY_AGG(requested_payload->>'grantId')
               FROM public.action_approvals WHERE run_id = $1 AND organization_id = $2
                 AND status = 'approved' AND approval_type = 'scope_change'),ARRAY[]::TEXT[]) AS approved_scope_grant_ids,
             (SELECT decided_by FROM public.action_approvals
               WHERE run_id = $1 AND organization_id = $2 AND status = 'approved'
               ORDER BY decided_at DESC LIMIT 1) AS decided_by`,
          [input.actionRunId, input.organizationId],
        ),
        client.query<{ total: string }>(
          `SELECT COALESCE(SUM(amount_brl),0)::TEXT AS total FROM public.action_cost_entries
           WHERE mission_id = $1 AND organization_id = $2 AND nature IN ('reserved','actual','reversal')`,
          [claimed.action.mission_id, input.organizationId],
        ),
        capability.requiredConnections.length === 0
          ? Promise.resolve({ rows: [{ healthy: true }] })
          : client.query<{ healthy: boolean }>(
            `SELECT COUNT(DISTINCT connection_key)::INT >= $2::INT AS healthy FROM (
               SELECT channel AS connection_key FROM public.channel_connections
               WHERE organization_id=$1 AND is_active=TRUE AND channel=ANY($3::TEXT[])
               UNION ALL
               SELECT 'ads_provider' AS connection_key WHERE 'ads_provider'=ANY($3::TEXT[]) AND EXISTS (
                 SELECT 1 FROM public.ad_provider_connections WHERE organization_id=$1 AND status='connected'
               )
             ) connections`,
            [input.organizationId, capability.requiredConnections.length, capability.requiredConnections],
          ),
        !consentChannel
          ? Promise.resolve({ rows: [{ allowed: true }] })
          : client.query<{ allowed: boolean }>(
            `SELECT EXISTS (
               SELECT 1 FROM public.lead_channel_permissions
               WHERE id = $1 AND organization_id = $2 AND lead_id = $3
                 AND channel = $4 AND address = $5 AND status = 'granted' AND revoked_at IS NULL
             ) AS allowed`,
            [consentEvidenceId, input.organizationId, leadId, consentChannel, destination],
          ),
        capability.requiredModules.length === 0
          ? Promise.resolve({ rows: [{ allowed: true }] })
          : client.query<{ allowed: boolean }>(
            `SELECT organization.kind = 'yux' OR COUNT(DISTINCT module.module_key)::INT = $3::INT AS allowed
             FROM public.organizations organization
             LEFT JOIN public.contracts contract ON contract.client_id = organization.client_id
               AND contract.status = 'active' AND ($2::UUID IS NULL OR contract.id = $2)
             LEFT JOIN public.contract_modules module ON module.contract_id = contract.id
               AND module.enabled = TRUE AND module.module_key = ANY($4::TEXT[])
             WHERE organization.id = $1 GROUP BY organization.kind`,
            [input.organizationId, currentMission?.contractId ?? null, capability.requiredModules.length, capability.requiredModules],
          ),
        claimed.action.pack_key !== 'funnel_nurture'
          ? Promise.resolve({ rows: [{ allowed: true }] })
          : client.query<{ allowed: boolean }>(
            `SELECT organization.kind = 'yux' OR EXISTS (
               SELECT 1 FROM public.contracts contract
               JOIN public.contract_modules module ON module.contract_id = contract.id
               WHERE contract.client_id = organization.client_id AND contract.status = 'active'
                 AND ($2::UUID IS NULL OR contract.id = $2)
                 AND module.module_key = 'funnel_nurture_agent' AND module.enabled = TRUE
             ) AS allowed FROM public.organizations organization WHERE organization.id = $1`,
            [input.organizationId, currentMission?.contractId ?? null],
          ),
      ])
      const envelope = currentMission.autonomyEnvelope
      const allowedCapabilityKeys = envelope?.allowedCapabilityKeys ?? []
      const approved = approval.rows[0]?.approved === true
      let autonomousGrantExpiresAt: string | undefined
      let projectedAutonomyUsage = { costBrl: '0', humanMinutes: '0', externalContacts: 0 }
      if (currentMission.mode === 'autonomous') {
        const [grant, usage] = await Promise.all([
          getActiveAutonomyGrant(client, claimed.action.mission_id, input.organizationId),
          collectAutonomyUsage(client, claimed.action.mission_id, input.organizationId, input.actionRunId),
        ])
        projectedAutonomyUsage = estimateAutonomousEffectUsage(capability.key, claimed.action.input)
        const autonomousDecision = evaluateAutonomousPreflight({
          missionMode: currentMission.mode,
          grant,
          usage,
          capability: { key: capability.key, effect: capability.effect, requiredModules: capability.requiredModules },
          projected: projectedAutonomyUsage,
          scopeExpansionApproved: Boolean(grant?.id && approval.rows[0]?.approved_scope_grant_ids?.includes(grant.id)),
        })
        autonomousGrantExpiresAt = grant?.expiresAt
        if (autonomousDecision.outcome === 'pause') {
          await containAutonomousExecution(client, {
            organizationId: input.organizationId, missionId: claimed.action.mission_id,
            planId: claimed.action.plan_id, actionRunId: input.actionRunId,
            attemptId: claimed.attemptId, reason: autonomousDecision.reason, usage,
          })
          return { outcome: 'contained' as const, reason: autonomousDecision.reason }
        }
        if (autonomousDecision.outcome === 'approval') {
          await requestAutonomousScopeApproval(client, {
            organizationId: input.organizationId, missionId: claimed.action.mission_id,
            actionRunId: input.actionRunId, attemptId: claimed.attemptId,
            capabilityKey: capability.key, grantId: grant?.id,
          })
          return { outcome: 'approval' as const, reason: autonomousDecision.reason }
        }
        if (autonomousDecision.outcome === 'deny') throw new Error(autonomousDecision.reason)
      }
      const decision = resolveCapabilityDecision({
        capability: {
          key: capability.key, approval: capability.approval, effect: capability.effect,
          supportsModes: capability.supportsModes,
          requiredPermissions: capability.requiredPermissions,
        },
        globalKillSwitch: switches.global, organizationKillSwitch: switches.organization,
        packKillSwitch: switches.pack, capabilityKillSwitch: switches.capability,
        requiredConnectionsHealthy: connections.rows[0]?.healthy === true,
        legalOrConsentAllowed: consent.rows[0]?.allowed === true,
        budgetAvailable: Number(costs.rows[0]?.total ?? 0) <= Number(envelope?.maxTotalCostBrl ?? 0),
        missionMode: currentMission.mode, missionActive: currentMission.status === 'active',
        autonomyGrantRequired: currentMission.mode === 'autonomous',
        autonomyGrantActive: currentMission.mode !== 'autonomous' || Boolean(autonomousGrantExpiresAt),
        autonomyGrantExpiresAt: autonomousGrantExpiresAt,
        envelopeExpiresAt: envelope?.expiresAt,
        actorPermissions: capability.requiredPermissions ?? [],
        capabilityAllowedByEnvelope: (allowedCapabilityKeys.length === 0 || allowedCapabilityKeys.includes(capability.key))
          && capability.requiredModules.every((moduleKey) => envelope?.allowedModules.includes(moduleKey))
          && contractModules.rows[0]?.allowed === true && packEntitlement.rows[0]?.allowed === true,
        alwaysRequireApprovalFor: envelope?.alwaysRequireApprovalFor,
      })
      if (decision.outcome !== 'allow') throw new Error(decision.reason)
      if (decision.requiresApproval && !approved) throw new Error('capability_approval_required')
      const actorId = approval.rows[0]?.decided_by ?? currentMission.createdBy
      if (decision.dryRun || capability.effect === 'none') {
        return { outcome: 'issued' as const, decision, actorId, externalEffect: undefined }
      }
      if (!input.mutationLeaseSecret || !claimed.attemptId || !claimed.action.capability_definition_hash) {
        throw new Error('mutation_lease_signing_unavailable')
      }
      if (currentMission.mode === 'autonomous') {
        await reserveAutonomyUsage(client, {
          organizationId: input.organizationId, missionId: claimed.action.mission_id,
          runId: input.actionRunId, attemptId: claimed.attemptId, capabilityKey: capability.key,
          costBrl: projectedAutonomyUsage.costBrl, humanMinutes: projectedAutonomyUsage.humanMinutes,
        })
      }
      const currentFencingToken = await getMissionFencingToken(client, claimed.action.mission_id, input.organizationId)
      const lease = await issueMutationLease(client, input.mutationLeaseSecret, {
        organizationId: input.organizationId, missionId: claimed.action.mission_id,
        actionRunId: input.actionRunId, attemptId: claimed.attemptId, capabilityKey: capability.key,
        capabilityVersion: capability.version, capabilityDefinitionHash: claimed.action.capability_definition_hash,
        fencingToken: currentFencingToken,
        effect: capability.effect === 'external' || capability.effect === 'destructive' ? 'external' : 'internal', ttlSeconds: 30,
      })
      await consumeMutationLease(client, {
        token: lease.token, secret: input.mutationLeaseSecret, expected: lease.claims,
        organizationId: input.organizationId,
      })
      const reservedEffect = capability.effect === 'external' || capability.effect === 'destructive'
        ? await reserveExternalEffectInTransaction(client, {
          organizationId: input.organizationId,
          missionId: claimed.action.mission_id,
          planId: claimed.action.plan_id,
          runId: input.actionRunId,
          attemptId: claimed.attemptId,
          capabilityKey: capability.key,
          capabilityVersion: capability.version,
          providerKey: capability.requiredConnections[0] ?? capability.key.split('.')[0]!,
          providerIdempotencyKey: claimed.action.idempotency_key,
          requestHash: hashSubject(stableSerialize(claimed.action.input)),
          requestMetadata: { actionRunId: input.actionRunId, attemptNumber: claimed.attemptNumber },
          reconciliationDeadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        })
        : null
      return {
        outcome: 'issued' as const, decision, token: lease.token, fencingToken: currentFencingToken, actorId,
        externalEffect: reservedEffect?.effect,
      }
    })
    if (issued.outcome === 'contained') return { status: 'blocked', containment: { reason: issued.reason } }
    if (issued.outcome === 'approval') return { status: 'blocked' }
    dryRun = issued.decision.dryRun
    mutationLease = issued.token
    fencingToken = issued.fencingToken
    executionActorId = issued.actorId
    issuedExternalEffect = issued.externalEffect ?? null
  } catch (error) {
    await markBlocked(pool, input.actionRunId, input.organizationId, claimed.attemptId, safeError(error))
    return { status: 'blocked' }
  }

  let externalEffect: ExternalEffect | null = null
  if ((capability.effect === 'external' || capability.effect === 'destructive') && !dryRun) {
    externalEffect = issuedExternalEffect
    if (!externalEffect) {
      await markBlocked(pool, input.actionRunId, input.organizationId, claimed.attemptId, 'external_effect_reservation_missing')
      return { status: 'blocked' }
    }
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
        await releaseRunAutonomyReservations(pool, input.actionRunId, input.organizationId, 'provider_effect_recovered')
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
      organizationId: input.organizationId, missionId: claimed.action.mission_id,
      actionRunId: input.actionRunId, actor: executionActorId ? { type: 'user', id: executionActorId } : { type: 'system' },
      idempotencyKey: claimed.action.idempotency_key, dryRun,
      ...(mutationLease ? { mutationLease } : {}), ...(fencingToken ? { fencingToken } : {}),
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
      if (claimed.action.capability_key !== 'human.task.create') {
        await releaseAutonomyUsageReservations(client, {
          organizationId: input.organizationId, runId: input.actionRunId, reason: 'capability_completed',
        })
      }
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
      await releaseAutonomyUsageReservations(client, {
        organizationId: input.organizationId, runId: input.actionRunId, reason: 'capability_failed',
      })
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
    await releaseAutonomyUsageReservations(client, {
      organizationId: input.organizationId, runId: input.actionId, reason: 'human_task_resolved', actorId: input.actorId,
    })
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

async function releaseRunAutonomyReservations(
  pool: Connectable,
  actionRunId: string,
  organizationId: string,
  reason: string,
) {
  return transaction(pool, (client) => releaseAutonomyUsageReservations(client, {
    organizationId, runId: actionRunId, reason,
  }))
}

async function containAutonomousExecution(client: Queryable, input: {
  organizationId: string
  missionId: string
  planId: string
  actionRunId: string
  attemptId?: string
  reason: string
  usage: AutonomyUsageSnapshot
}) {
  if (input.attemptId) {
    await client.query(
      `UPDATE public.action_run_attempts SET status = 'failed', error_code = 'autonomy_preflight_contained',
              error_message = $2, completed_at = NOW() WHERE id = $1`,
      [input.attemptId, input.reason],
    )
  }
  await client.query(
    `UPDATE public.action_runs SET status = 'blocked', last_error = $3, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [input.actionRunId, input.organizationId, input.reason],
  )
  await client.query(
    `UPDATE public.action_missions SET status = 'paused', version = version + 1, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 AND status = 'active'`,
    [input.missionId, input.organizationId],
  )
  await recordEvaluation(client, {
    organizationId: input.organizationId,
    missionId: input.missionId,
    planId: input.planId,
    checkpointKey: `autonomy-preflight:${input.actionRunId}`,
    idempotencyKey: `autonomy-preflight:${input.actionRunId}:${input.reason}`,
    decision: 'pause',
    metricSnapshot: {
      externalContacts: input.usage.externalContacts,
      capabilityCounts: input.usage.capabilityCounts,
      unresolvedExternalEffects: input.usage.unresolvedExternalEffects,
    },
    economicsSnapshot: { costBrl: input.usage.costBrl, humanMinutes: input.usage.humanMinutes },
    rationale: { reason: input.reason, finalPreflight: true },
  })
  await recordDomainEvent(client, {
    eventType: 'mission.paused', organizationId: input.organizationId,
    aggregateType: 'mission', aggregateId: input.missionId, actor: { type: 'system' },
    payload: { reason: input.reason, actionRunId: input.actionRunId, finalPreflight: true },
  })
}

async function requestAutonomousScopeApproval(client: Queryable, input: {
  organizationId: string
  missionId: string
  actionRunId: string
  attemptId?: string
  capabilityKey: string
  grantId?: string
}) {
  const subjectHash = hashSubject(stableSerialize({
    missionId: input.missionId,
    actionRunId: input.actionRunId,
    capabilityKey: input.capabilityKey,
    grantId: input.grantId ?? null,
    exception: 'autonomy_scope_expansion',
  }))
  if (input.attemptId) {
    await client.query(
      `UPDATE public.action_run_attempts SET status = 'cancelled', error_code = 'autonomy_scope_approval_required',
              error_message = 'autonomy_scope_expansion_requires_approval', completed_at = NOW() WHERE id = $1`,
      [input.attemptId],
    )
  }
  await client.query(
    `UPDATE public.action_runs SET status = 'waiting_approval', last_error = 'autonomy_scope_expansion_requires_approval',
            updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
    [input.actionRunId, input.organizationId],
  )
  await recordApproval(client, {
    organizationId: input.organizationId,
    missionId: input.missionId,
    runId: input.actionRunId,
    approvalType: 'scope_change',
    subjectHash,
    requestedPayload: {
      actionRunId: input.actionRunId,
      capabilityKey: input.capabilityKey,
      grantId: input.grantId ?? null,
      reason: 'autonomy_scope_expansion_requires_approval',
    },
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
