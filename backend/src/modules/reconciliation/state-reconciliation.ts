import { createHash } from 'node:crypto'
import type pg from 'pg'
import { readKnowledgeFile } from '../company-intelligence/file-storage.js'

export const RECONCILIATION_SCHEMA_VERSION = 1 as const
export const RECONCILIATION_MAX_BATCH = 20
const RECONCILIATION_SCAN_LIMIT = 5_000

export type ReconciliationEntityType =
  | 'strategy_ingestion'
  | 'knowledge_run'
  | 'agent_execution_run'
  | 'mission_conversation'
  | 'mission'
  | 'external_effect'
  | 'queue_job'

export type ReconciliationAction =
  | 'request_reupload'
  | 'resume_knowledge_indexing'
  | 'review_degraded_knowledge'
  | 'preserve_failed_agent_run'
  | 'await_user_decision'
  | 'preserve_cancelled_mission'
  | 'provider_reconciliation_required'
  | 'retry_learning_job'
  | 'retry_campaign_checkpoint'
  | 'preserve_failed_queue_job'

const ENTITY_TYPES = new Set<ReconciliationEntityType>([
  'strategy_ingestion','knowledge_run','agent_execution_run','mission_conversation','mission','external_effect','queue_job',
])
const ACTIONS = new Set<ReconciliationAction>([
  'request_reupload','resume_knowledge_indexing','review_degraded_knowledge','preserve_failed_agent_run',
  'await_user_decision','preserve_cancelled_mission','provider_reconciliation_required','retry_learning_job',
  'retry_campaign_checkpoint','preserve_failed_queue_job',
])
const CURRENT_STATE_KEYS: Record<ReconciliationEntityType, Set<string>> = {
  strategy_ingestion: new Set(['status','currentStep','hasDocument','hasStoredBytes']),
  knowledge_run: new Set(['status','stage','runKind','sourceId','documentId','sourceType','originalIntact','checksumSha256','byteSize']),
  agent_execution_run: new Set(['status','runSource','profileKey','workflowKey']),
  mission_conversation: new Set(['status','version','missionId']),
  mission: new Set(['status','version','mode']),
  external_effect: new Set(['status','missionId','capabilityKey','providerKey','requestHash']),
  queue_job: new Set(['queueName','queueClass','jobName','attemptsMade','dataHash','missionId']),
}
const ENTITY_ACTIONS: Record<ReconciliationEntityType, Set<ReconciliationAction>> = {
  strategy_ingestion: new Set(['request_reupload']),
  knowledge_run: new Set(['resume_knowledge_indexing','review_degraded_knowledge']),
  agent_execution_run: new Set(['preserve_failed_agent_run']),
  mission_conversation: new Set(['await_user_decision']),
  mission: new Set(['preserve_cancelled_mission']),
  external_effect: new Set(['provider_reconciliation_required']),
  queue_job: new Set(['retry_learning_job','retry_campaign_checkpoint','preserve_failed_queue_job']),
}

export type ReconciliationItem = {
  id: string
  entityType: ReconciliationEntityType
  entityId: string
  organizationId?: string
  reason: string
  currentState: Record<string, unknown>
  proposedAction: ReconciliationAction
  expectedVersion: string
  payloadHash: string
  externalEffectRisk: 'none' | 'possible' | 'unknown'
}

export type ReconciliationManifest = {
  schemaVersion: typeof RECONCILIATION_SCHEMA_VERSION
  generatedAt: string
  cutoffAt: string
  databaseFingerprint: string
  items: ReconciliationItem[]
  manifestHash: string
}

export type FailedQueueJob = {
  queueName: string
  queueClass: string
  id: string
  name: string
  data: Record<string, unknown>
  attemptsMade: number
  finishedOn?: number
  failedReason?: string
}

export type ReconciliationQueueAccess = {
  scanFailed(limit: number): Promise<FailedQueueJob[]>
  getFailed(queueName: string, id: string): Promise<FailedQueueJob | null>
  enqueue(name: string, data: Record<string, unknown>, jobId: string): Promise<{ id?: string | number }>
}

type Queryable = Pick<pg.Pool, 'query'>
type ReconciliationPool = Pick<pg.Pool, 'query' | 'connect'>

export async function buildReconciliationManifest(
  pool: Queryable,
  options: { limit?: number; cutoffAt?: Date; queue?: ReconciliationQueueAccess; now?: Date } = {},
): Promise<ReconciliationManifest> {
  const limit = boundedLimit(options.limit)
  const now = options.now ?? new Date()
  const cutoffAt = options.cutoffAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1_000)
  const database = await pool.query<{ fingerprint: string }>(
    `SELECT encode(digest(current_database() || ':' || COALESCE(inet_server_addr()::TEXT,'local'),'sha256'),'hex') AS fingerprint`,
  )
  const items: ReconciliationItem[] = []

  await appendRows(pool, items, limit, 'strategy_ingestion',
    `SELECT id,organization_id,status,current_step,document_id,storage_path,sha256,updated_at
       FROM public.yux_strategy_ingestion_jobs
      WHERE status='uploaded' AND document_id IS NULL AND storage_path IS NULL AND updated_at < $1
      ORDER BY updated_at,id LIMIT $2`, [cutoffAt.toISOString(), limit], row => ({
      id: `strategy_ingestion:${row.id}`,
      entityType: 'strategy_ingestion', entityId: row.id, organizationId: row.organization_id,
      reason: 'uploaded_record_has_no_document_or_bytes',
      currentState: { status: row.status, currentStep: row.current_step, hasDocument: false, hasStoredBytes: false },
      proposedAction: 'request_reupload', expectedVersion: iso(row.updated_at), externalEffectRisk: 'none',
    }))

  await appendRows(pool, items, limit, 'knowledge_run',
    `SELECT run.id,run.organization_id,run.status,run.stage,run.run_kind,run.source_id,run.document_id,run.updated_at,
            source.source_type,source.storage_path,source.checksum_sha256,source.byte_size,source.source_url,
            EXISTS(SELECT 1 FROM public.knowledge_entries entry WHERE entry.source_id=run.source_id AND BTRIM(entry.body)<>'') AS has_manual_body
       FROM public.knowledge_intelligence_runs run
       LEFT JOIN public.knowledge_sources source ON source.id=run.source_id
      WHERE run.status IN ('queued','running') AND run.updated_at < $1
      ORDER BY run.updated_at,run.id LIMIT $2`, [cutoffAt.toISOString(), limit], row => {
      const sourceType = stringOr(row.source_type, 'unknown')
      const originalIntact = sourceType === 'url' ? Boolean(row.source_url)
        : sourceType === 'manual' ? Boolean(row.has_manual_body)
          : Boolean(row.storage_path && row.checksum_sha256 && Number(row.byte_size) > 0)
      return {
        id: `knowledge_run:${row.id}`, entityType: 'knowledge_run', entityId: row.id,
        organizationId: row.organization_id, reason: originalIntact ? 'orphaned_run_with_intact_source' : 'orphaned_run_source_integrity_unproven',
        currentState: {
          status: row.status, stage: row.stage, runKind: row.run_kind, sourceId: row.source_id,
          documentId: row.document_id, sourceType, originalIntact,
          ...(row.checksum_sha256 ? { checksumSha256: row.checksum_sha256 } : {}),
          ...(row.byte_size ? { byteSize: Number(row.byte_size) } : {}),
        },
        proposedAction: originalIntact && row.run_kind === 'document_curation' && row.source_id && row.document_id
          ? 'resume_knowledge_indexing' : 'review_degraded_knowledge',
        expectedVersion: iso(row.updated_at), externalEffectRisk: 'none',
      }
    })

  await appendRows(pool, items, limit, 'knowledge_run',
    `SELECT id,organization_id,status,stage,run_kind,source_id,document_id,updated_at
       FROM public.knowledge_intelligence_runs
      WHERE status IN ('degraded','failed') AND updated_at < $1
      ORDER BY updated_at,id LIMIT $2`, [cutoffAt.toISOString(), limit], row => ({
      id: `knowledge_run:${row.id}`, entityType: 'knowledge_run', entityId: row.id, organizationId: row.organization_id,
      reason: row.status === 'degraded' ? 'degraded_output_requires_review' : 'failed_run_requires_business_decision',
      currentState: { status: row.status, stage: row.stage, runKind: row.run_kind, sourceId: row.source_id, documentId: row.document_id },
      proposedAction: 'review_degraded_knowledge', expectedVersion: iso(row.updated_at), externalEffectRisk: 'none',
    }))

  await appendRows(pool, items, limit, 'agent_execution_run',
    `SELECT id,organization_id,status,run_source,profile_key,workflow_key,updated_at
       FROM public.agent_execution_runs
      WHERE status='failed' AND updated_at < $1
      ORDER BY updated_at,id LIMIT $2`, [cutoffAt.toISOString(), limit], row => ({
      id: `agent_execution_run:${row.id}`, entityType: 'agent_execution_run', entityId: row.id,
      ...(row.organization_id ? { organizationId: row.organization_id } : {}), reason: 'failed_agent_run_has_no_proven_safe_replay',
      currentState: { status: row.status, runSource: row.run_source, profileKey: row.profile_key, workflowKey: row.workflow_key },
      proposedAction: 'preserve_failed_agent_run', expectedVersion: iso(row.updated_at), externalEffectRisk: 'unknown',
    }))

  await appendRows(pool, items, limit, 'mission_conversation',
    `SELECT id,organization_id,status,version,mission_id,updated_at
       FROM public.action_mission_conversations
      WHERE status='awaiting_user' AND updated_at < $1
      ORDER BY updated_at,id LIMIT $2`, [cutoffAt.toISOString(), limit], row => ({
      id: `mission_conversation:${row.id}`, entityType: 'mission_conversation', entityId: row.id, organizationId: row.organization_id,
      reason: 'conversation_is_waiting_for_user_input', currentState: { status: row.status, version: row.version, missionId: row.mission_id },
      proposedAction: 'await_user_decision', expectedVersion: String(row.version), externalEffectRisk: 'none',
    }))

  await appendRows(pool, items, limit, 'mission',
    `SELECT id,organization_id,status,version,mode,updated_at
       FROM public.action_missions
      WHERE status='cancelled' AND updated_at < $1
      ORDER BY updated_at,id LIMIT $2`, [cutoffAt.toISOString(), limit], row => ({
      id: `mission:${row.id}`, entityType: 'mission', entityId: row.id, organizationId: row.organization_id,
      reason: 'cancelled_mission_must_not_be_reopened_implicitly', currentState: { status: row.status, version: row.version, mode: row.mode },
      proposedAction: 'preserve_cancelled_mission', expectedVersion: String(row.version), externalEffectRisk: 'possible',
    }))

  await appendRows(pool, items, limit, 'external_effect',
    `SELECT id,organization_id,mission_id,status,capability_key,provider_key,request_hash,updated_at
       FROM public.action_external_effects
      WHERE status IN ('unknown','reconciling','manual_review') AND updated_at < $1
      ORDER BY updated_at,id LIMIT $2`, [cutoffAt.toISOString(), limit], row => ({
      id: `external_effect:${row.id}`, entityType: 'external_effect', entityId: row.id, organizationId: row.organization_id,
      reason: 'external_effect_outcome_requires_provider_reconciliation',
      currentState: { status: row.status, missionId: row.mission_id, capabilityKey: row.capability_key, providerKey: row.provider_key, requestHash: row.request_hash },
      proposedAction: 'provider_reconciliation_required', expectedVersion: iso(row.updated_at), externalEffectRisk: 'unknown',
    }))

  if (options.queue && items.length < limit) {
    const failedJobs = await options.queue.scanFailed(RECONCILIATION_SCAN_LIMIT)
    for (const job of failedJobs) {
      if (items.length >= limit) break
      const candidate = await queueJobItem(pool, job)
      if (await wasReconciled(pool, candidate)) continue
      items.push(candidate)
    }
  }

  const body = {
    schemaVersion: RECONCILIATION_SCHEMA_VERSION,
    generatedAt: now.toISOString(), cutoffAt: cutoffAt.toISOString(),
    databaseFingerprint: database.rows[0]?.fingerprint ?? hashCanonical('database-unavailable'), items,
  }
  return { ...body, manifestHash: hashCanonical(body) }
}

export function verifyReconciliationManifest(value: unknown): ReconciliationManifest {
  if (!value || typeof value !== 'object') throw new Error('reconciliation_manifest_invalid')
  const manifest = value as ReconciliationManifest
  if (manifest.schemaVersion !== RECONCILIATION_SCHEMA_VERSION || !Array.isArray(manifest.items)) throw new Error('reconciliation_manifest_schema_invalid')
  if (!isIso(manifest.generatedAt) || !isIso(manifest.cutoffAt) || !isHash(manifest.databaseFingerprint) || !isHash(manifest.manifestHash)) {
    throw new Error('reconciliation_manifest_identity_invalid')
  }
  const ids = new Set<string>()
  const entities = new Set<string>()
  for (const item of manifest.items) {
    if (!item || typeof item !== 'object' || !item.id || ids.has(item.id) || !item.entityType || !item.entityId
      || !item.reason || !item.proposedAction || !item.expectedVersion || !isHash(item.payloadHash)
      || !ENTITY_TYPES.has(item.entityType) || !ACTIONS.has(item.proposedAction)
      || !item.currentState || typeof item.currentState !== 'object' || Array.isArray(item.currentState)
      || !['none','possible','unknown'].includes(item.externalEffectRisk)) throw new Error('reconciliation_manifest_item_invalid')
    if (Object.keys(item.currentState).some(key => !CURRENT_STATE_KEYS[item.entityType].has(key))) {
      throw new Error(`reconciliation_manifest_identifiable_data_forbidden:${item.id}`)
    }
    if (!ENTITY_ACTIONS[item.entityType].has(item.proposedAction)) throw new Error('reconciliation_manifest_action_invalid')
    const entityKey = `${item.entityType}:${item.entityId}`
    if (entities.has(entityKey)) throw new Error('reconciliation_manifest_entity_duplicate')
    ids.add(item.id)
    entities.add(entityKey)
    const { payloadHash: _payloadHash, ...identity } = item
    if (hashCanonical(identity) !== item.payloadHash) throw new Error(`reconciliation_manifest_item_hash_mismatch:${item.id}`)
  }
  const { manifestHash: _manifestHash, ...body } = manifest
  if (hashCanonical(body) !== manifest.manifestHash) throw new Error('reconciliation_manifest_hash_mismatch')
  return manifest
}

export async function applyReconciliationManifest(
  pool: ReconciliationPool,
  manifestInput: unknown,
  options: { approvedHash: string; limit: number; queue?: ReconciliationQueueAccess; appliedBy?: string },
) {
  const manifest = verifyReconciliationManifest(manifestInput)
  const limit = boundedLimit(options.limit)
  if (options.approvedHash !== manifest.manifestHash) throw new Error('reconciliation_manifest_not_approved')
  const currentFingerprint = (await pool.query<{ fingerprint: string }>(
    `SELECT encode(digest(current_database() || ':' || COALESCE(inet_server_addr()::TEXT,'local'),'sha256'),'hex') AS fingerprint`,
  )).rows[0]?.fingerprint
  if (currentFingerprint !== manifest.databaseFingerprint) throw new Error('reconciliation_database_fingerprint_mismatch')
  await registerManifest(pool, manifest, options.appliedBy ?? 'operator')

  let handled = 0
  const results: Array<{ id: string; status: string; result: Record<string, unknown> }> = []
  const audits = new Map<string, Awaited<ReturnType<typeof registerItem>>>()
  for (const item of manifest.items) audits.set(item.id, await registerItem(pool, manifest.manifestHash, item))
  for (const item of manifest.items) {
    if (handled >= limit) break
    const audit = audits.get(item.id)!
    if (audit.status !== 'pending') {
      results.push({ id: item.id, status: audit.status, result: audit.result })
      continue
    }
    handled += 1
    try {
      const outcome = await applyItem(pool, manifest.manifestHash, item, options.queue)
      await finishItem(pool, manifest.manifestHash, item.id, outcome.status, outcome.result)
      results.push({ id: item.id, ...outcome })
    } catch (error) {
      const result = { error: errorCode(error) }
      await finishItem(pool, manifest.manifestHash, item.id, 'failed', result)
      results.push({ id: item.id, status: 'failed', result })
    }
  }
  const counts = (await pool.query<{ pending: number; failed: number }>(
    `SELECT COUNT(*) FILTER(WHERE status='pending')::INT AS pending,COUNT(*) FILTER(WHERE status='failed')::INT AS failed
       FROM public.state_reconciliation_items WHERE manifest_hash=$1`, [manifest.manifestHash],
  )).rows[0] ?? { pending: 0, failed: 0 }
  const status = Number(counts.pending) === 0 && Number(counts.failed) === 0 ? 'applied' : 'partially_applied'
  await pool.query(
    `UPDATE public.state_reconciliation_manifests
        SET status=$2,completed_at=CASE WHEN $2='applied' THEN COALESCE(completed_at,NOW()) ELSE NULL END
      WHERE manifest_hash=$1`, [manifest.manifestHash, status],
  )
  return { manifestHash: manifest.manifestHash, status, handled, results }
}

async function applyItem(pool: ReconciliationPool, manifestHash: string, item: ReconciliationItem, queue?: ReconciliationQueueAccess) {
  if (item.proposedAction === 'request_reupload') {
    const result = await pool.query(
      `UPDATE public.yux_strategy_ingestion_jobs
          SET status='failed',current_step='upload',failure_class='recoverable',
              error_message='reconciliation_reupload_required',lease_owner=NULL,lease_until=NULL,
              metadata=metadata || jsonb_build_object('reconciliationOriginIngestionId',id::TEXT,'reconciliationManifestHash',$3::TEXT)
        WHERE id=$1 AND updated_at=$2::TIMESTAMPTZ AND status='uploaded' AND document_id IS NULL AND storage_path IS NULL
        RETURNING id`, [item.entityId, item.expectedVersion, manifestHash],
    )
    if (result.rowCount === 1) return { status: 'applied', result: { destination: 'awaiting_reupload', originIngestionId: item.entityId } }
    const recovered = await pool.query(
      `SELECT 1 FROM public.yux_strategy_ingestion_jobs
        WHERE id=$1 AND metadata->>'reconciliationManifestHash'=$2`, [item.entityId, manifestHash],
    )
    return recovered.rowCount === 1
      ? { status: 'applied', result: { destination: 'awaiting_reupload', originIngestionId: item.entityId } }
      : { status: 'skipped', result: { reason: 'state_or_version_changed' } }
  }
  if (item.proposedAction === 'resume_knowledge_indexing') {
    if (!queue) throw new Error('reconciliation_queue_required')
    const live = (await pool.query<Record<string, unknown>>(
      `SELECT run.status,run.updated_at,run.output_payload,run.source_id,run.document_id,run.run_kind,
              source.source_type,source.storage_path,source.checksum_sha256,source.byte_size,source.source_url,
              EXISTS(SELECT 1 FROM public.knowledge_entries entry WHERE entry.source_id=run.source_id AND BTRIM(entry.body)<>'') AS has_manual_body
         FROM public.knowledge_intelligence_runs run
         JOIN public.knowledge_sources source ON source.id=run.source_id
        WHERE run.id=$1`, [item.entityId],
    )).rows[0]
    if (!live) return { status: 'skipped', result: { reason: 'entity_missing' } }
    const marker = (live.output_payload as Record<string, unknown> | undefined)?.reconciliationManifestHash
    if (marker !== manifestHash && (iso(live.updated_at) !== item.expectedVersion || !['queued','running'].includes(String(live.status)))) {
      return { status: 'skipped', result: { reason: 'state_or_version_changed' } }
    }
    if (marker !== manifestHash) await assertKnowledgeSourceIntegrity(live)
    if (marker !== manifestHash) {
      const changed = await pool.query(
        `UPDATE public.knowledge_intelligence_runs
            SET status='cancelled',stage='failed',progress=100,completed_at=NOW(),
                error_message='reconciled_orphaned_run',
                output_payload=output_payload || jsonb_build_object('reconciliationManifestHash',$3::TEXT,'reconciliationAction','resume_knowledge_indexing')
          WHERE id=$1 AND updated_at=$2::TIMESTAMPTZ AND status IN ('queued','running')
          RETURNING id`, [item.entityId, item.expectedVersion, manifestHash],
      )
      if (changed.rowCount !== 1) return { status: 'skipped', result: { reason: 'concurrent_state_change' } }
    }
    const sourceId = String(live.source_id)
    const documentId = String(live.document_id)
    const jobId = `reconcile-knowledge-${item.entityId}`
    await queue.enqueue('company-intelligence.indexKnowledge', { sourceId, documentId, reconciliationManifestHash: manifestHash }, jobId)
    return { status: 'applied', result: { destination: 'ingestion_queue', jobId, sourceId, documentId } }
  }
  if (item.proposedAction === 'retry_learning_job' || item.proposedAction === 'retry_campaign_checkpoint') {
    if (!queue) throw new Error('reconciliation_queue_required')
    const queueName = String(item.currentState.queueName ?? '')
    const job = await queue.getFailed(queueName, item.entityId)
    if (!job) return { status: 'skipped', result: { reason: 'failed_job_missing' } }
    const expected = queueExpectedVersion(job)
    if (expected !== item.expectedVersion || hashCanonical(job.data) !== item.currentState.dataHash) {
      return { status: 'skipped', result: { reason: 'queue_job_changed' } }
    }
    if (item.proposedAction === 'retry_learning_job' && !(await hasLearningCandidates(pool))) {
      return { status: 'skipped', result: { reason: 'no_current_learning_candidate' } }
    }
    if (item.proposedAction === 'retry_campaign_checkpoint') {
      const missionId = typeof job.data.missionId === 'string' ? job.data.missionId : ''
      if (!missionId || !(await campaignMissionEligible(pool, missionId))) {
        return { status: 'skipped', result: { reason: 'mission_no_longer_eligible' } }
      }
    }
    const jobId = `reconcile-${hashCanonical({ queueName, sourceJobId: job.id }).slice(0, 32)}`
    await queue.enqueue(job.name, { ...job.data, reconciliationManifestHash: manifestHash }, jobId)
    return { status: 'applied', result: { destination: 'maintenance_queue', jobId, sourceJobId: job.id } }
  }
  if (!(await manualItemIsCurrent(pool, item, queue))) {
    return { status: 'skipped', result: { reason: 'state_or_version_changed' } }
  }
  return {
    status: 'manual_review',
    result: { destination: manualDestination(item.proposedAction), reason: item.reason, sourceStatePreserved: true },
  }
}

async function manualItemIsCurrent(pool: Queryable, item: ReconciliationItem, queue?: ReconciliationQueueAccess) {
  if (item.entityType === 'queue_job') {
    if (!queue) return false
    const job = await queue.getFailed(String(item.currentState.queueName ?? ''), item.entityId)
    return Boolean(job && queueExpectedVersion(job) === item.expectedVersion && hashCanonical(job.data) === item.currentState.dataHash)
  }
  const definitions: Partial<Record<ReconciliationEntityType, { table: string; versionPredicate: string }>> = {
    knowledge_run: { table: 'knowledge_intelligence_runs', versionPredicate: 'updated_at=$2::TIMESTAMPTZ' },
    agent_execution_run: { table: 'agent_execution_runs', versionPredicate: 'updated_at=$2::TIMESTAMPTZ' },
    mission_conversation: { table: 'action_mission_conversations', versionPredicate: 'version::TEXT=$2' },
    mission: { table: 'action_missions', versionPredicate: 'version::TEXT=$2' },
    external_effect: { table: 'action_external_effects', versionPredicate: 'updated_at=$2::TIMESTAMPTZ' },
  }
  const definition = definitions[item.entityType]
  if (!definition) return false
  const result = await pool.query(
    `SELECT 1 FROM public.${definition.table} WHERE id=$1 AND ${definition.versionPredicate} LIMIT 1`,
    [item.entityId, item.expectedVersion],
  )
  return Boolean(result.rowCount)
}

async function appendRows(
  pool: Queryable,
  items: ReconciliationItem[],
  limit: number,
  _entityType: ReconciliationEntityType,
  sql: string,
  values: unknown[],
  map: (row: Record<string, any>) => Omit<ReconciliationItem, 'payloadHash'>,
) {
  if (items.length >= limit) return
  const rows = (await pool.query(sql, [values[0], RECONCILIATION_SCAN_LIMIT])).rows as Array<Record<string, any>>
  for (const row of rows) {
    if (items.length >= limit) break
    const candidate = withPayloadHash(map(row))
    if (items.some(item => item.id === candidate.id) || await wasReconciled(pool, candidate)) continue
    items.push(candidate)
  }
}

async function wasReconciled(pool: Queryable, item: ReconciliationItem) {
  const result = await pool.query(
    `SELECT 1 FROM public.state_reconciliation_items
      WHERE entity_type=$1 AND entity_id=$2 AND expected_version=$3 AND status IN ('applied','manual_review','skipped') LIMIT 1`,
    [item.entityType, item.entityId, item.expectedVersion],
  )
  return Boolean(result.rowCount)
}

async function queueJobItem(pool: Queryable, job: FailedQueueJob): Promise<ReconciliationItem> {
  const dataHash = hashCanonical(job.data)
  let proposedAction: ReconciliationAction = 'preserve_failed_queue_job'
  let reason = 'failed_queue_job_has_no_safe_domain_replay'
  let risk: ReconciliationItem['externalEffectRisk'] = 'unknown'
  if (job.name === 'action-engine.generateLearning' && await hasLearningCandidates(pool)) {
    proposedAction = 'retry_learning_job'; reason = 'learning_query_fixed_and_current_candidate_exists'; risk = 'none'
  } else if (job.name === 'action-engine.campaignOptimizationCheckpoint') {
    const missionId = typeof job.data.missionId === 'string' ? job.data.missionId : ''
    if (missionId && await campaignMissionEligible(pool, missionId)) {
      proposedAction = 'retry_campaign_checkpoint'; reason = 'checkpoint_query_fixed_and_mission_remains_eligible'; risk = 'none'
    } else {
      reason = 'checkpoint_job_lacks_a_current_eligible_mission'
    }
  } else if (job.name === 'action-engine.processMissionConversation') {
    reason = 'old_conversation_job_must_not_resend_a_message'
    risk = 'possible'
  }
  return withPayloadHash({
    id: `queue_job:${job.queueName}:${job.id}`, entityType: 'queue_job', entityId: job.id,
    reason, currentState: {
      queueName: job.queueName, queueClass: job.queueClass, jobName: job.name,
      attemptsMade: job.attemptsMade, dataHash,
      ...(typeof job.data.missionId === 'string' ? { missionId: job.data.missionId } : {}),
    }, proposedAction, expectedVersion: queueExpectedVersion(job), externalEffectRisk: risk,
  })
}

async function hasLearningCandidates(pool: Queryable) {
  const result = await pool.query(
    `SELECT 1 FROM public.action_missions mission
      WHERE mission.status IN ('succeeded','failed','expired','cancelled')
        AND NOT EXISTS (SELECT 1 FROM public.action_mission_memory_summaries memory
                         WHERE memory.mission_id=mission.id AND memory.organization_id=mission.organization_id)
      LIMIT 1`,
  )
  return Boolean(result.rowCount)
}

async function campaignMissionEligible(pool: Queryable, missionId: string) {
  const result = await pool.query(
    `SELECT 1 FROM public.action_missions mission
      WHERE mission.id=$1 AND mission.status='active' AND mission.mode='autonomous'
        AND EXISTS (
          SELECT 1 FROM public.action_autonomy_grants autonomy_grant
          WHERE autonomy_grant.mission_id=mission.id AND autonomy_grant.organization_id=mission.organization_id
            AND autonomy_grant.starts_at<=NOW() AND autonomy_grant.expires_at>NOW()
            AND EXISTS(SELECT 1 FROM public.action_autonomy_grant_events event WHERE event.grant_id=autonomy_grant.id AND event.event_type='activated')
            AND NOT EXISTS(SELECT 1 FROM public.action_autonomy_grant_events event WHERE event.grant_id=autonomy_grant.id AND event.event_type='revoked')
        ) LIMIT 1`, [missionId],
  )
  return Boolean(result.rowCount)
}

async function assertKnowledgeSourceIntegrity(row: Record<string, unknown>) {
  const sourceType = String(row.source_type)
  if (sourceType === 'url') {
    if (!row.source_url) throw new Error('knowledge_source_url_missing')
    return
  }
  if (sourceType === 'manual') {
    if (row.has_manual_body !== true) throw new Error('knowledge_manual_body_missing')
    return
  }
  if (!row.storage_path || !row.checksum_sha256 || Number(row.byte_size) < 1) throw new Error('knowledge_file_integrity_metadata_missing')
  const bytes = await readKnowledgeFile(String(row.storage_path))
  if (bytes.byteLength !== Number(row.byte_size)) throw new Error('knowledge_file_size_mismatch')
  if (createHash('sha256').update(bytes).digest('hex') !== row.checksum_sha256) throw new Error('knowledge_file_checksum_mismatch')
}

async function registerManifest(pool: Queryable, manifest: ReconciliationManifest, appliedBy: string) {
  await pool.query(
    `INSERT INTO public.state_reconciliation_manifests
       (manifest_hash,schema_version,generated_at,cutoff_at,database_fingerprint,item_count,status,applied_by)
     VALUES ($1,$2,$3,$4,$5,$6,'applying',$7)
     ON CONFLICT(manifest_hash) DO NOTHING`,
    [manifest.manifestHash, manifest.schemaVersion, manifest.generatedAt, manifest.cutoffAt,
      manifest.databaseFingerprint, manifest.items.length, appliedBy],
  )
  const stored = (await pool.query<{ item_count: number; database_fingerprint: string }>(
    `SELECT item_count,database_fingerprint FROM public.state_reconciliation_manifests WHERE manifest_hash=$1`, [manifest.manifestHash],
  )).rows[0]
  if (!stored || Number(stored.item_count) !== manifest.items.length || stored.database_fingerprint !== manifest.databaseFingerprint) {
    throw new Error('reconciliation_manifest_audit_conflict')
  }
}

async function registerItem(pool: Queryable, manifestHash: string, item: ReconciliationItem) {
  await pool.query(
    `INSERT INTO public.state_reconciliation_items
       (manifest_hash,item_id,entity_type,entity_id,organization_id,reason,current_state,proposed_action,expected_version,payload_hash,external_effect_risk)
     VALUES ($1,$2,$3,$4,$5,$6,$7::JSONB,$8,$9,$10,$11)
     ON CONFLICT(manifest_hash,item_id) DO NOTHING`,
    [manifestHash,item.id,item.entityType,item.entityId,item.organizationId ?? null,item.reason,
      JSON.stringify(item.currentState),item.proposedAction,item.expectedVersion,item.payloadHash,item.externalEffectRisk],
  )
  const stored = (await pool.query<{ status: string; result: Record<string, unknown>; payload_hash: string }>(
    `SELECT status,result,payload_hash FROM public.state_reconciliation_items WHERE manifest_hash=$1 AND item_id=$2`,
    [manifestHash,item.id],
  )).rows[0]
  if (!stored || stored.payload_hash !== item.payloadHash) throw new Error('reconciliation_item_audit_conflict')
  return stored
}

async function finishItem(pool: Queryable, manifestHash: string, itemId: string, status: string, result: Record<string, unknown>) {
  await pool.query(
    `UPDATE public.state_reconciliation_items
        SET status=$3,result=$4::JSONB,applied_at=NOW()
      WHERE manifest_hash=$1 AND item_id=$2 AND status='pending'`,
    [manifestHash,itemId,status,JSON.stringify(result)],
  )
}

function manualDestination(action: ReconciliationAction) {
  if (action === 'await_user_decision') return 'user_input'
  if (action === 'provider_reconciliation_required') return 'provider_reconciliation'
  if (action === 'request_reupload') return 'awaiting_reupload'
  return 'business_review'
}

function withPayloadHash(item: Omit<ReconciliationItem, 'payloadHash'>): ReconciliationItem {
  return { ...item, payloadHash: hashCanonical(item) }
}

export function hashCanonical(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex')
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b))
      .map(([key,item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function boundedLimit(value = RECONCILIATION_MAX_BATCH) {
  if (!Number.isInteger(value) || value < 1 || value > RECONCILIATION_MAX_BATCH) throw new Error('reconciliation_limit_must_be_between_1_and_20')
  return value
}

function queueExpectedVersion(job: FailedQueueJob) {
  return `${job.attemptsMade}:${job.finishedOn ?? 0}`
}

function iso(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value))
  if (!Number.isFinite(date.getTime())) throw new Error('reconciliation_version_invalid')
  return date.toISOString()
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function stringOr(value: unknown, fallback: string) {
  return typeof value === 'string' && value ? value : fallback
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 160)
}
