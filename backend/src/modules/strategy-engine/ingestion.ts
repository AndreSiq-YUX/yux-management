import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileTypeFromFile } from 'file-type'
import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { extractKnowledgeText } from '../company-intelligence/text-extraction.js'
import { embedPassages } from '../company-intelligence/openrouter-embeddings.js'
import { recordProviderUsage } from '../health/provider-usage.js'
import { recordDomainEvent } from '../events/repository.js'
import { JOB_LEASE_DURATION_MS, classifyLeaseFailure, createLeaseOwner, startLeaseHeartbeat } from '../../jobs/leases.js'
import {
  curateStrategyWithRuntime,
  strategyItemHash,
  validateStrategyEvidence,
  type StrategyCurationItem,
  type StrategyCurationResult,
  type StrategyCurationSection,
} from './curation.js'

export const STRATEGY_INGESTION_DEFAULT_LIMIT_BYTES = 150 * 1024 * 1024
export const STRATEGY_INGESTION_HARD_LIMIT_BYTES = 256 * 1024 * 1024
export const STRATEGY_INGESTION_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
] as const
const ALLOWED_MIME_TYPES = new Set<string>(STRATEGY_INGESTION_ALLOWED_MIME_TYPES)
export const STRATEGY_CURATION_PROMPT_VERSION = 'strategy-curation:v2'

type IngestionRow = {
  id: string
  pack_id: string | null
  document_id: string | null
  organization_id: string
  source_name: string
  source_kind: string
  file_name: string
  mime_type: string
  byte_size: string | number
  sha256: string | null
  storage_path: string | null
  status: string
  current_step: string
  attempt_count: number
  failure_class: 'recoverable' | 'configuration' | 'terminal' | null
  error_message: string | null
  lease_owner: string | null
  lease_until: Date | string | null
  uploaded_by: string | null
  proposed_counts: Record<string, unknown>
  created_at: Date | string
  updated_at: Date | string
}

export function effectiveStrategyIngestionLimit(maxMb?: number) {
  const configured = Number.isFinite(maxMb) ? Math.max(1, Math.floor(maxMb!)) * 1024 * 1024 : STRATEGY_INGESTION_DEFAULT_LIMIT_BYTES
  return Math.min(STRATEGY_INGESTION_HARD_LIMIT_BYTES, configured)
}

export function strategyIngestionCapabilities(env: AppEnv) {
  const maxBytes = effectiveStrategyIngestionLimit(env.STRATEGY_INGESTION_MAX_MB)
  const curationEnabled = env.KNOWLEDGE_CURATION_ENABLED !== false
  const runtimeConfigured = Boolean(env.YUX_AGENT_RUNTIME_URL && env.YUX_AGENT_RUNTIME_TOKEN)
  const embeddingConfigured = Boolean(env.OPENROUTER_API_KEY)
  return {
    maxBytes,
    maxMb: maxBytes / (1024 * 1024),
    acceptedMimeTypes: [...STRATEGY_INGESTION_ALLOWED_MIME_TYPES],
    structuredIngestion: {
      curationEnabled,
      runtimeConfigured,
      embeddingConfigured,
      ready: curationEnabled && runtimeConfigured && embeddingConfigured,
    },
  }
}

export async function createStrategyIngestion(pool: pg.Pool, input: {
  packId: string
  fileName: string
  mimeType: string
  byteSize: number
  sourceName?: string
  sourceKind?: string
  uploadedBy: string
  organizationIds: string[]
  maxBytes: number
}) {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) throw domainError(400, 'unsupported_strategy_file_type')
  if (input.byteSize < 1 || input.byteSize > input.maxBytes) throw domainError(413, 'strategy_file_size_exceeded')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const pack = (await client.query<{ id: string; owner_organization_id: string | null }>(
      `SELECT id,owner_organization_id FROM public.yux_strategy_packs WHERE id=$1 FOR SHARE`,
      [input.packId],
    )).rows[0]
    if (!pack) throw domainError(404, 'strategy_pack_not_found')
    let organizationId = pack.owner_organization_id ?? input.organizationIds[0]
    if (!organizationId) {
      organizationId = (await client.query<{ id: string }>(
        `SELECT id FROM public.organizations WHERE is_internal_growth_workspace=true ORDER BY created_at LIMIT 1`,
      )).rows[0]?.id
    }
    if (!organizationId) throw domainError(409, 'strategy_ingestion_organization_required')
    const row = (await client.query<IngestionRow>(
      `INSERT INTO public.yux_strategy_ingestion_jobs (
         pack_id,organization_id,source_name,source_kind,file_name,mime_type,byte_size,
         status,current_step,uploaded_by,metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'awaiting_upload','upload',$8,$9::jsonb)
       RETURNING *`,
      [
        pack.id,
        organizationId,
        input.sourceName?.trim() || input.fileName,
        input.sourceKind?.trim() || 'document',
        input.fileName,
        input.mimeType,
        input.byteSize,
        input.uploadedBy,
        JSON.stringify({ intendedOutput: ['concept_cards', 'playbooks', 'chunks', 'rubrics'] }),
      ],
    )).rows[0]!
    await client.query('COMMIT')
    return ingestionView(row)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function getStrategyIngestion(pool: Pick<pg.Pool, 'query'>, ingestionId: string) {
  const row = (await pool.query<IngestionRow>(
    `SELECT * FROM public.yux_strategy_ingestion_jobs WHERE id=$1`,
    [ingestionId],
  )).rows[0]
  return row ? ingestionView(row) : null
}

export async function retryStrategyIngestion(pool: Pick<pg.Pool, 'query'>, ingestionId: string) {
  const retried = (await pool.query<IngestionRow>(
    `UPDATE public.yux_strategy_ingestion_jobs
     SET status='queued',
         current_step=CASE WHEN status='completed' THEN 'curation' ELSE current_step END,
         proposed_counts=CASE WHEN status='completed'
           THEN (proposed_counts - 'items' - 'curationWarnings' - 'curationWarningCount')
             || '{"curationBatchesCompleted":0}'::jsonb
           ELSE proposed_counts END,
         completed_at=NULL,error_message=NULL,failure_class=NULL,lease_owner=NULL,lease_until=NULL,updated_at=NOW()
     WHERE id=$1 AND document_id IS NOT NULL AND sha256 IS NOT NULL AND storage_path IS NOT NULL
       AND (status IN ('failed','curation_unavailable')
         OR (status='completed' AND COALESCE(proposed_counts->>'items','0')='0'))
       AND (lease_until IS NULL OR lease_until < NOW())
     RETURNING *`,
    [ingestionId],
  )).rows[0]
  if (retried) return ingestionView(retried)
  const existing = await getStrategyIngestion(pool, ingestionId)
  if (!existing) throw domainError(404, 'strategy_ingestion_not_found')
  if (!existing.documentId || !existing.sha256) throw domainError(409, 'strategy_ingestion_reupload_required')
  throw domainError(409, 'strategy_ingestion_not_retryable')
}

export async function uploadStrategyIngestion(pool: pg.Pool, input: {
  ingestionId: string
  payload: Readable
  expectedSha256?: string
  storageRoot?: string
  maxBytes: number
}) {
  const claimed = (await pool.query<IngestionRow>(
    `UPDATE public.yux_strategy_ingestion_jobs
     SET status='uploading',current_step='upload',upload_started_at=NOW(),error_message=NULL,failure_class=NULL
     WHERE id=$1 AND (status IN ('awaiting_upload','failed') OR (status='uploading' AND updated_at < NOW()-INTERVAL '15 minutes'))
     RETURNING *`,
    [input.ingestionId],
  )).rows[0]
  if (!claimed) {
    const existing = await getStrategyIngestion(pool, input.ingestionId)
    if (!existing) throw domainError(404, 'strategy_ingestion_not_found')
    if (['queued', 'extracting', 'completed', 'extraction_requires_ocr'].includes(existing.status)) {
      return { documentId: existing.documentId, sha256: existing.sha256, status: existing.status, duplicate: true }
    }
    throw domainError(409, 'strategy_ingestion_upload_in_progress')
  }

  const root = strategyStorageRoot(input.storageRoot)
  const quarantine = path.join(root, '.quarantine')
  const tempPath = path.join(quarantine, `${claimed.id}-${randomUUID()}.part`)
  try {
    await mkdir(quarantine, { recursive: true })
    const streamed = await streamToTemporaryFile(input.payload, tempPath, Math.min(input.maxBytes, Number(claimed.byte_size)))
    if (streamed.byteSize !== Number(claimed.byte_size)) throw domainError(400, 'strategy_file_size_mismatch')
    if (input.expectedSha256 && input.expectedSha256.toLowerCase() !== streamed.sha256) throw domainError(400, 'strategy_file_hash_mismatch')
    await validateUploadedFile(tempPath, claimed.mime_type)
    const committed = await commitUploadedFile(pool, claimed, tempPath, streamed, root)
    return { documentId: committed.documentId, sha256: streamed.sha256, status: 'queued' as const, duplicate: committed.duplicate }
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    await pool.query(
      `UPDATE public.yux_strategy_ingestion_jobs
       SET status='failed',current_step='upload',error_message=$2,failure_class='recoverable',lease_owner=NULL,lease_until=NULL
       WHERE id=$1`,
      [claimed.id, messageOf(error)],
    ).catch(() => undefined)
    throw error
  }
}

async function commitUploadedFile(
  pool: pg.Pool,
  ingestion: IngestionRow,
  tempPath: string,
  uploaded: { sha256: string; byteSize: number },
  root: string,
) {
  const client = await pool.connect()
  let finalizedPath: string | null = null
  let duplicate = false
  try {
    await client.query('BEGIN')
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${ingestion.organization_id}:${uploaded.sha256}`])
    const existing = (await client.query<{ id: string; storage_path: string | null }>(
      `SELECT id,storage_path FROM public.yux_strategy_source_documents
       WHERE owner_organization_id=$1 AND source_hash=$2 FOR UPDATE`,
      [ingestion.organization_id, uploaded.sha256],
    )).rows[0]
    let documentId = existing?.id ?? randomUUID()
    let relativePath = existing?.storage_path ?? strategyRelativePath(ingestion.organization_id, documentId, uploaded.sha256, ingestion.mime_type)
    const absolutePath = resolveStrategyStoragePath(root, relativePath)
    const existingIntact = existing?.storage_path ? await fileMatches(absolutePath, uploaded.sha256, uploaded.byteSize) : false
    if (!existingIntact) {
      await mkdir(path.dirname(absolutePath), { recursive: true })
      await rename(tempPath, absolutePath)
      finalizedPath = absolutePath
      if (!(await fileMatches(absolutePath, uploaded.sha256, uploaded.byteSize))) {
        throw new Error('strategy_ingestion_file_not_intact')
      }
    } else {
      duplicate = true
      await unlink(tempPath).catch(() => undefined)
    }
    if (existing) {
      await client.query(
        `UPDATE public.yux_strategy_source_documents
         SET storage_path=$2,original_filename=COALESCE(original_filename,$3),updated_at=NOW(),
             metadata=metadata || $4::jsonb
         WHERE id=$1`,
        [existing.id, relativePath, ingestion.file_name, JSON.stringify({ mimeType: ingestion.mime_type, byteSize: uploaded.byteSize })],
      )
    } else {
      await client.query(
        `INSERT INTO public.yux_strategy_source_documents (
           id,organization_id,owner_organization_id,source_scope,visibility,document_type,source_title,
           source_hash,original_filename,storage_path,human_review_status,source_origin,created_by,metadata
         ) VALUES ($1,$2,$2,'internal','internal_only',$3,$4,$5,$6,$7,'pending','document_extracted',$8,$9::jsonb)`,
        [
          documentId,
          ingestion.organization_id,
          documentType(ingestion.mime_type),
          ingestion.source_name,
          uploaded.sha256,
          ingestion.file_name,
          relativePath,
          ingestion.uploaded_by,
          JSON.stringify({ mimeType: ingestion.mime_type, byteSize: uploaded.byteSize, ingestionId: ingestion.id }),
        ],
      )
    }
    await client.query(
      `UPDATE public.yux_strategy_ingestion_jobs
       SET document_id=$2,sha256=$3,storage_path=$4,status='queued',current_step='extraction',
           upload_completed_at=NOW(),error_message=NULL,failure_class=NULL
       WHERE id=$1`,
      [ingestion.id, documentId, uploaded.sha256, relativePath],
    )
    await recordDomainEvent(client, {
      eventType: 'strategy.ingestion.queued',
      organizationId: ingestion.organization_id,
      aggregateType: 'task',
      aggregateId: ingestion.id,
      actor: { type: 'user' },
      payload: { ingestionId: ingestion.id, documentId, packId: ingestion.pack_id },
    })
    await client.query('COMMIT')
    return { documentId, duplicate }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    if (finalizedPath) {
      const recoveryPath = path.join(root, '.quarantine', `${ingestion.id}-${randomUUID()}.orphan`)
      await mkdir(path.dirname(recoveryPath), { recursive: true }).catch(() => undefined)
      await rename(finalizedPath, recoveryPath).catch(() => undefined)
    }
    throw error
  } finally {
    client.release()
  }
}

export async function handleStrategyIndexKnowledge(
  pool: pg.Pool,
  env: AppEnv,
  data: Record<string, unknown>,
  options: {
    storageRoot?: string
    signal?: AbortSignal
    curate?: typeof curateStrategyWithRuntime
    embed?: typeof embedPassages
    afterEmbeddingCheckpoint?: () => Promise<void> | void
  } = {},
) {
  const ingestionId = typeof data.ingestionId === 'string' ? data.ingestionId : ''
  const documentId = typeof data.documentId === 'string' ? data.documentId : ''
  if (!ingestionId || !documentId) throw new Error('strategy_ingestion_context_required')
  const owner = createLeaseOwner('strategy-ingestion')
  const claimed = (await pool.query<IngestionRow>(
    `UPDATE public.yux_strategy_ingestion_jobs
     SET status='extracting',attempt_count=attempt_count+1,
         lease_owner=$3,lease_until=NOW()+($4::text || ' milliseconds')::interval,error_message=NULL
     WHERE id=$1 AND document_id=$2 AND (
       status='queued' OR (status='failed' AND failure_class='recoverable')
       OR (status='extracting' AND lease_until < NOW())
     ) RETURNING *`,
    [ingestionId, documentId, owner, JOB_LEASE_DURATION_MS],
  )).rows[0]
  if (!claimed) return { duplicate: true, ingestionId, documentId }
  const attempt = Number(claimed.attempt_count)
  const stopHeartbeat = startLeaseHeartbeat(async () => {
    const renewed = await pool.query(
      `UPDATE public.yux_strategy_ingestion_jobs SET lease_until=NOW()+($4::text || ' milliseconds')::interval
       WHERE id=$1 AND lease_owner=$2 AND attempt_count=$3 AND status='extracting'`,
      [ingestionId, owner, attempt, JOB_LEASE_DURATION_MS],
    )
    return renewed.rowCount === 1
  })
  let failureStep = claimed.current_step
  try {
    if (options.signal?.aborted) throw options.signal.reason
    if (!claimed.storage_path || !claimed.sha256) throw new Error('strategy_ingestion_file_context_required')
    const absolutePath = resolveStrategyStoragePath(strategyStorageRoot(options.storageRoot ?? env.KNOWLEDGE_STORAGE_DIR), claimed.storage_path)
    if (!(await fileMatches(absolutePath, claimed.sha256, Number(claimed.byte_size)))) throw new Error('strategy_ingestion_file_not_intact')
    if (claimed.current_step === 'extraction') await extractAndCheckpoint(pool, claimed, absolutePath, owner, attempt)
    failureStep = 'curation'
    if (env.KNOWLEDGE_CURATION_ENABLED === false) {
      await finishWithoutCuration(pool, ingestionId, owner, attempt)
      return { ingestionId, documentId, curationUnavailable: true }
    }
    const sections = await loadStrategySections(pool, claimed)
    const results = await curateCheckpointedBatches(pool, env, claimed, sections, options)
    const items = deduplicateCuratedItems(results.flatMap(result => result.items))
    const warningSummary = summarizeCurationWarnings(results)
    if (!items.length) {
      await finishWithoutArtifacts(pool, claimed, owner, attempt, sections.length, warningSummary)
      return { ingestionId, documentId, chunks: sections.length, proposals: 0, curationEmpty: true }
    }
    const proposed = await persistStrategyProposals(pool, claimed, items, sections, results[0]?.promptVersion)
    await pool.query(
      `UPDATE public.yux_strategy_ingestion_jobs SET current_step='embedding' WHERE id=$1 AND lease_owner=$2 AND attempt_count=$3`,
      [ingestionId, owner, attempt],
    )
    failureStep = 'embedding'
    if (proposed.length) {
      const embedded = await embedCheckpointed(pool, env, claimed, proposed, options)
      for (const [index, item] of proposed.entries()) {
        await pool.query(
          `UPDATE public.yux_strategy_pack_items
           SET payload=payload || $2::jsonb,updated_at=NOW() WHERE id=$1`,
          [item.id, JSON.stringify({ embedding: embedded.vectors[index], embeddingModel: embedded.model, embeddingDimensions: embedded.dimensions, embeddingStatus: 'ready' })],
        )
      }
    }
    const completed = await pool.query(
      `UPDATE public.yux_strategy_ingestion_jobs
       SET status='completed',current_step='review',proposed_counts=proposed_counts || $4::jsonb,completed_at=NOW(),
           lease_owner=NULL,lease_until=NULL,error_message=NULL,failure_class=NULL,
           curation_prompt_version=$5,curation_provider=$6,curation_model=$7
       WHERE id=$1 AND lease_owner=$2 AND attempt_count=$3`,
      [
        ingestionId, owner, attempt,
        JSON.stringify({ chunks: sections.length, items: proposed.length, ...warningSummary }),
        results[0]?.promptVersion || null, results[0]?.provider || null, results[0]?.model || null,
      ],
    )
    if (completed.rowCount !== 1) throw new Error('strategy_ingestion_claim_lost')
    return { ingestionId, documentId, chunks: sections.length, proposals: proposed.length }
  } catch (error) {
    const requiresOcr = claimed.mime_type === 'application/pdf' && messageOf(error).includes('knowledge_text_extraction_empty')
    await pool.query(
      `UPDATE public.yux_strategy_ingestion_jobs
       SET status=$4,current_step=$5,error_message=$6,failure_class=$7,lease_owner=NULL,lease_until=NULL
       WHERE id=$1 AND lease_owner=$2 AND attempt_count=$3`,
      [
        ingestionId,
        owner,
        attempt,
        requiresOcr ? 'extraction_requires_ocr' : 'failed',
        requiresOcr ? 'ocr' : failureStep,
        requiresOcr ? 'extraction_requires_ocr' : messageOf(error),
        requiresOcr ? 'configuration' : classifyLeaseFailure(error),
      ],
    )
    if (requiresOcr) return { ingestionId, documentId, requiresOcr: true }
    throw error
  } finally {
    await stopHeartbeat()
  }
}

export function hasMeaningfulPdfText(value: string) {
  return value.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '').replace(/\s+/g, '').length >= 10
}

async function extractAndCheckpoint(pool: pg.Pool, ingestion: IngestionRow, absolutePath: string, owner: string, attempt: number) {
  const extracted = await extractKnowledgeText({ content: await readFile(absolutePath), mimeType: ingestion.mime_type, title: ingestion.source_name })
  if (ingestion.mime_type === 'application/pdf' && !hasMeaningfulPdfText(extracted.body)) {
    throw Object.assign(new Error('knowledge_text_extraction_empty'), { statusCode: 422 })
  }
  const extractionHash = createHash('sha256').update(extracted.body).digest('hex')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM public.yux_strategy_source_chunks WHERE document_id=$1`, [ingestion.document_id])
    for (const [index, chunk] of extracted.chunks.entries()) {
      const chunkHash = createHash('sha256').update(`${ingestion.document_id}:${index}:${chunk.body}`).digest('hex')
      await client.query(
        `INSERT INTO public.yux_strategy_source_chunks (
           document_id,section_key,chunk_index,chunk_hash,chunk_text,token_estimate,source_scope,
           visibility,human_review_status,metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,'internal','internal_only','pending',$7::jsonb)`,
        [ingestion.document_id, chunk.title || 'section', index, chunkHash, chunk.body, chunk.tokenCount, JSON.stringify({ sourceLocator: chunk.sourceLocator, ingestionId: ingestion.id })],
      )
    }
    const checkpoint = await client.query(
      `UPDATE public.yux_strategy_ingestion_jobs
       SET current_step='curation',extraction_hash=$4,proposed_counts=$5::jsonb
       WHERE id=$1 AND lease_owner=$2 AND attempt_count=$3`,
      [ingestion.id, owner, attempt, extractionHash, JSON.stringify({ chunks: extracted.chunks.length })],
    )
    if (checkpoint.rowCount !== 1) throw new Error('strategy_ingestion_claim_lost')
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}

async function finishWithoutCuration(pool: pg.Pool, ingestionId: string, owner: string, attempt: number) {
  await pool.query(
    `UPDATE public.yux_strategy_ingestion_jobs
     SET status='curation_unavailable',current_step='curation',error_message='knowledge_curation_disabled',
         failure_class='configuration',lease_owner=NULL,lease_until=NULL
     WHERE id=$1 AND lease_owner=$2 AND attempt_count=$3`,
    [ingestionId, owner, attempt],
  )
}

async function finishWithoutArtifacts(
  pool: pg.Pool,
  ingestion: IngestionRow,
  owner: string,
  attempt: number,
  chunks: number,
  warningSummary: { curationWarnings: string[]; curationWarningCount: number },
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE public.yux_strategy_curation_batches
       SET status='failed',error_message='strategy_curation_no_artifacts'
       WHERE ingestion_id=$1 AND status='completed'`,
      [ingestion.id],
    )
    const updated = await client.query(
      `UPDATE public.yux_strategy_ingestion_jobs
       SET status='failed',current_step='curation',
           proposed_counts=proposed_counts || $4::jsonb,
           error_message='strategy_curation_no_artifacts',failure_class='recoverable',
           lease_owner=NULL,lease_until=NULL
       WHERE id=$1 AND lease_owner=$2 AND attempt_count=$3`,
      [ingestion.id, owner, attempt, JSON.stringify({ chunks, items: 0, ...warningSummary })],
    )
    if (updated.rowCount !== 1) throw new Error('strategy_ingestion_claim_lost')
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function loadStrategySections(pool: pg.Pool, ingestion: IngestionRow): Promise<StrategyCurationSection[]> {
  if (!ingestion.document_id || !ingestion.sha256) throw new Error('strategy_ingestion_document_required')
  const result = await pool.query<{ section_key: string; chunk_text: string; metadata: Record<string, unknown> }>(
    `SELECT section_key,chunk_text,metadata FROM public.yux_strategy_source_chunks WHERE document_id=$1 ORDER BY chunk_index,id`,
    [ingestion.document_id],
  )
  return result.rows.map((row, index) => {
    const locator = typeof row.metadata?.sourceLocator === 'string' ? row.metadata.sourceLocator : `section:${index + 1}`
    const pageMatch = /^page:(\d+)/.exec(locator)
    return {
      locator,
      documentId: ingestion.document_id!,
      documentHash: ingestion.sha256!,
      ...(pageMatch ? { page: Number(pageMatch[1]) } : { section: locator }),
      heading: row.section_key,
      body: row.chunk_text,
    }
  })
}

async function curateCheckpointedBatches(
  pool: pg.Pool,
  env: AppEnv,
  ingestion: IngestionRow,
  sections: StrategyCurationSection[],
  options: { signal?: AbortSignal; curate?: typeof curateStrategyWithRuntime },
) {
  const batches = batchStrategySections(sections, env.KNOWLEDGE_CURATION_MAX_BATCH_CHARS || 12_000)
  const results: StrategyCurationResult[] = []
  const curate = options.curate || curateStrategyWithRuntime
  let completedBatches = 0
  await updateCurationProgress(pool, ingestion.id, completedBatches, batches.length)
  for (const [batchIndex, batch] of batches.entries()) {
    if (options.signal?.aborted) throw options.signal.reason
    const inputHash = strategyCurationCheckpointHash(batch)
    const saved = (await pool.query<{ status: string; input_hash: string; output: unknown }>(
      `INSERT INTO public.yux_strategy_curation_batches (ingestion_id,batch_index,input_hash,status,attempt_count,started_at)
       VALUES ($1,$2,$3,'running',1,NOW())
       ON CONFLICT (ingestion_id,batch_index) DO UPDATE SET
         input_hash=EXCLUDED.input_hash,status=CASE WHEN yux_strategy_curation_batches.input_hash=EXCLUDED.input_hash AND yux_strategy_curation_batches.status='completed' THEN 'completed' ELSE 'running' END,
         attempt_count=CASE WHEN yux_strategy_curation_batches.input_hash=EXCLUDED.input_hash THEN yux_strategy_curation_batches.attempt_count+1 ELSE 1 END,
         output=CASE WHEN yux_strategy_curation_batches.input_hash=EXCLUDED.input_hash THEN yux_strategy_curation_batches.output ELSE NULL END,
         started_at=NOW(),error_message=NULL
       RETURNING status,input_hash,output`,
      [ingestion.id, batchIndex, inputHash],
    )).rows[0]!
    if (saved.status === 'completed' && saved.input_hash === inputHash && saved.output) {
      results.push(saved.output as StrategyCurationResult)
      completedBatches += 1
      await updateCurationProgress(pool, ingestion.id, completedBatches, batches.length)
      continue
    }
    try {
      const result = await curate(env, { organizationId: ingestion.organization_id, sections: batch })
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `UPDATE public.yux_strategy_curation_batches SET status='completed',output=$4::jsonb,provider=$5,model=$6,
             prompt_version=$7,prompt_hash=$8,input_tokens=$9,output_tokens=$10,completed_at=NOW()
           WHERE ingestion_id=$1 AND batch_index=$2 AND input_hash=$3`,
          [ingestion.id, batchIndex, inputHash, JSON.stringify(result), result.provider, result.model, result.promptVersion, result.promptHash || null, result.usage.inputTokens, result.usage.outputTokens],
        )
        await recordProviderUsage(client, {
          organizationId: ingestion.organization_id, providerKey: result.provider, model: result.model,
          correlationId: ingestion.id,
          reportedUsage: { ...result.usage, operation: 'strategy_curation', batchIndex },
          measurementStatus: 'unavailable', measurementReason: 'provider_price_not_reported',
        })
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally { client.release() }
      results.push(result)
      completedBatches += 1
      await updateCurationProgress(pool, ingestion.id, completedBatches, batches.length)
    } catch (error) {
      await pool.query(
        `UPDATE public.yux_strategy_curation_batches SET status='failed',error_message=$4 WHERE ingestion_id=$1 AND batch_index=$2 AND input_hash=$3`,
        [ingestion.id, batchIndex, inputHash, messageOf(error)],
      ).catch(() => undefined)
      throw error
    }
  }
  await pool.query(
    `UPDATE public.yux_strategy_ingestion_jobs SET curation_input_hash=$2,curation_output=$3::jsonb WHERE id=$1`,
    [ingestion.id, createHash('sha256').update(JSON.stringify(sections)).digest('hex'), JSON.stringify(results)],
  )
  return results
}

async function updateCurationProgress(pool: Pick<pg.Pool, 'query'>, ingestionId: string, completed: number, total: number) {
  await pool.query(
    `UPDATE public.yux_strategy_ingestion_jobs
     SET current_step='curation',proposed_counts=proposed_counts || $2::jsonb,updated_at=NOW()
     WHERE id=$1`,
    [ingestionId, JSON.stringify({ curationBatchesCompleted: completed, curationBatchesTotal: total })],
  )
}

type EmbeddingCheckpoint = Awaited<ReturnType<typeof embedPassages>>

async function embedCheckpointed(
  pool: pg.Pool,
  env: AppEnv,
  ingestion: IngestionRow,
  proposed: Array<{ id: string; body: string }>,
  options: { signal?: AbortSignal; embed?: typeof embedPassages; afterEmbeddingCheckpoint?: () => Promise<void> | void },
): Promise<EmbeddingCheckpoint> {
  const inputHash = createHash('sha256').update(JSON.stringify({
    model: env.OPENROUTER_EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b',
    dimensions: env.OPENROUTER_EMBEDDING_DIMENSIONS || 1024,
    proposed,
  })).digest('hex')
  const checkpoint = (await pool.query<{ embedding_input_hash: string | null; embedding_output: unknown }>(
    `SELECT embedding_input_hash,embedding_output FROM public.yux_strategy_ingestion_jobs WHERE id=$1`,
    [ingestion.id],
  )).rows[0]
  if (checkpoint?.embedding_input_hash === inputHash && checkpoint.embedding_output) {
    return validateEmbeddingCheckpoint(checkpoint.embedding_output, proposed.length)
  }
  const embed = options.embed || embedPassages
  const embedded = validateEmbeddingCheckpoint(
    await embed(env, proposed.map(item => item.body), undefined, options.signal),
    proposed.length,
  )
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE public.yux_strategy_ingestion_jobs SET embedding_input_hash=$2,embedding_output=$3::jsonb,
         embedding_model=$4,embedding_dimensions=$5,embedding_tokens=$6 WHERE id=$1`,
      [ingestion.id, inputHash, JSON.stringify(embedded), embedded.model, embedded.dimensions, embedded.tokens],
    )
    await recordProviderUsage(client, {
      organizationId: ingestion.organization_id, providerKey: 'openrouter', model: embedded.model, correlationId: ingestion.id,
      reportedUsage: { tokens: embedded.tokens, items: proposed.length, dimensions: embedded.dimensions, operation: 'strategy_embedding' },
      measurementStatus: 'unavailable', measurementReason: 'provider_price_not_reported',
    })
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
  await options.afterEmbeddingCheckpoint?.()
  return embedded
}

function validateEmbeddingCheckpoint(value: unknown, expectedCount: number): EmbeddingCheckpoint {
  if (!value || typeof value !== 'object') throw new Error('invalid_strategy_embedding_checkpoint')
  const output = value as Partial<EmbeddingCheckpoint>
  if (typeof output.model !== 'string' || !Number.isInteger(output.dimensions) || !Array.isArray(output.vectors)
    || output.vectors.length !== expectedCount || typeof output.tokens !== 'number'
    || output.vectors.some(vector => !Array.isArray(vector) || vector.length !== output.dimensions || vector.some(entry => typeof entry !== 'number'))) {
    throw new Error('invalid_strategy_embedding_checkpoint')
  }
  return output as EmbeddingCheckpoint
}

function batchStrategySections(sections: StrategyCurationSection[], maxChars = 12_000) {
  const batches: StrategyCurationSection[][] = []
  let current: StrategyCurationSection[] = []
  let size = 0
  for (const section of sections) {
    if (current.length && size + section.body.length > maxChars) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(section)
    size += section.body.length
  }
  if (current.length) batches.push(current)
  return batches
}

export function strategyCurationCheckpointHash(
  sections: StrategyCurationSection[],
  promptVersion = STRATEGY_CURATION_PROMPT_VERSION,
) {
  return createHash('sha256').update(JSON.stringify({ promptVersion, sections })).digest('hex')
}

function summarizeCurationWarnings(results: StrategyCurationResult[]) {
  const warnings = results.flatMap(result => result.warnings)
  return {
    curationWarnings: [...new Set(warnings.map(warning => warning.trim()).filter(Boolean))]
      .slice(0, 12)
      .map(warning => warning.slice(0, 300)),
    curationWarningCount: warnings.length,
  }
}

function deduplicateCuratedItems(items: StrategyCurationItem[]) {
  const selected = new Map<string, StrategyCurationItem>()
  for (const item of items) {
    const hash = strategyItemHash(item)
    const existing = selected.get(hash)
    if (!existing || item.confidence > existing.confidence) selected.set(hash, item)
  }
  return [...selected.values()]
}

async function persistStrategyProposals(
  pool: pg.Pool,
  ingestion: IngestionRow,
  items: StrategyCurationItem[],
  sections: StrategyCurationSection[],
  promptVersion = STRATEGY_CURATION_PROMPT_VERSION,
) {
  if (!ingestion.pack_id || !ingestion.document_id) throw new Error('strategy_ingestion_pack_required')
  const persisted: Array<{ id: string; body: string }> = []
  for (const item of items) {
    if (!validateStrategyEvidence(item, sections)) throw new Error('strategy_curation_evidence_mismatch')
    const contentHash = strategyItemHash(item)
    const existing = (await pool.query<{ id: string }>(
      `SELECT id FROM public.yux_strategy_pack_items WHERE pack_id=$1 AND content_hash=$2`,
      [ingestion.pack_id, contentHash],
    )).rows[0]
    if (existing) {
      persisted.push({ id: existing.id, body: item.principle })
      continue
    }
    const peers = (await pool.query<{ id: string; title: string; body: string }>(
      `SELECT id,title,body FROM public.yux_strategy_pack_items WHERE pack_id=$1 AND item_type=$2 AND status IN ('proposed','review','approved')`,
      [ingestion.pack_id, item.kind],
    )).rows
    const conflicts = peers
      .map(peer => ({ ...peer, similarity: textSimilarity(item.principle, peer.body) }))
      .filter(peer => peer.similarity >= 0.72)
      .map(peer => ({ itemId: peer.id, title: peer.title, similarity: peer.similarity, disposition: 'review_merge_or_conflict' }))
    const payload = { ...item, conflicts: [...item.conflicts, ...conflicts], curationPromptVersion: promptVersion, sourceOrigin: 'document_extracted' }
    const row = (await pool.query<{ id: string }>(
      `INSERT INTO public.yux_strategy_pack_items (
         pack_id,item_type,title,summary,body,source_reference,status,priority,payload,source_origin,
         source_document_id,content_hash,confidence
       ) VALUES ($1,$2,$3,$4,$5,$6,'proposed',100,$7::jsonb,'document_extracted',$8,$9,$10)
       RETURNING id`,
      [ingestion.pack_id, item.kind, item.title, item.problem, item.principle, item.evidence[0]?.locator, JSON.stringify(payload), ingestion.document_id, contentHash, item.confidence],
    )).rows[0]!
    persisted.push({ id: row.id, body: item.principle })
  }
  return persisted
}

function textSimilarity(left: string, right: string) {
  const a = new Set(left.normalize('NFKC').toLocaleLowerCase('pt-BR').split(/[^\p{L}\p{N}]+/u).filter(Boolean))
  const b = new Set(right.normalize('NFKC').toLocaleLowerCase('pt-BR').split(/[^\p{L}\p{N}]+/u).filter(Boolean))
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection += 1
  return intersection / new Set([...a, ...b]).size
}

function ingestionView(row: IngestionRow) {
  return {
    ingestionId: row.id,
    packId: row.pack_id,
    documentId: row.document_id,
    organizationId: row.organization_id,
    sourceName: row.source_name,
    sourceKind: row.source_kind,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    sha256: row.sha256,
    status: row.status,
    stage: row.current_step,
    attempt: Number(row.attempt_count),
    proposedCounts: row.proposed_counts || {},
    recoverableError: row.error_message ? { message: row.error_message, recoverable: row.failure_class === 'recoverable' } : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

async function streamToTemporaryFile(payload: Readable, target: string, maxBytes: number) {
  const hash = createHash('sha256')
  let byteSize = 0
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      byteSize += chunk.length
      if (byteSize > maxBytes) return callback(domainError(413, 'strategy_file_size_exceeded'))
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  await pipeline(payload, meter, createWriteStream(target, { flags: 'wx' }))
  return { sha256: hash.digest('hex'), byteSize }
}

async function validateUploadedFile(filePath: string, declaredMimeType: string) {
  if (!ALLOWED_MIME_TYPES.has(declaredMimeType)) throw domainError(400, 'unsupported_strategy_file_type')
  if (declaredMimeType === 'text/plain' || declaredMimeType === 'text/markdown') {
    const content = await readFile(filePath)
    if (content.includes(0)) throw domainError(400, 'invalid_strategy_text_file')
    try { new TextDecoder('utf-8', { fatal: true }).decode(content) } catch { throw domainError(400, 'invalid_strategy_text_encoding') }
    return
  }
  const detected = await fileTypeFromFile(filePath)
  if (!detected || detected.mime !== declaredMimeType) throw domainError(400, 'strategy_file_mime_mismatch')
}

async function fileMatches(filePath: string, expectedHash: string, expectedSize: number) {
  try {
    const details = await stat(filePath)
    if (!details.isFile() || details.size !== expectedSize) return false
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer)
    return hash.digest('hex') === expectedHash
  } catch { return false }
}

function strategyStorageRoot(configured?: string) {
  return path.resolve(configured ?? process.env.KNOWLEDGE_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'company-knowledge'))
}

function resolveStrategyStoragePath(root: string, relativePath: string) {
  const resolved = path.resolve(root, relativePath)
  if (!resolved.startsWith(`${root}${path.sep}`)) throw domainError(400, 'invalid_strategy_storage_path')
  return resolved
}

function strategyRelativePath(organizationId: string, documentId: string, hash: string, mimeType: string) {
  const extension = mimeType === 'application/pdf' ? '.pdf'
    : mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? '.docx'
      : mimeType === 'text/markdown' ? '.md' : '.txt'
  return path.join('strategy', organizationId, `${documentId}-${hash}${extension}`)
}

function documentType(mimeType: string) {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  if (mimeType === 'text/markdown') return 'markdown'
  return 'text'
}

function messageOf(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000)
}

function domainError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode })
}
