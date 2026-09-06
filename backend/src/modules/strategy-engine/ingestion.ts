import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileTypeFromFile } from 'file-type'
import type pg from 'pg'
import { extractKnowledgeText } from '../company-intelligence/text-extraction.js'
import { recordDomainEvent } from '../events/repository.js'
import { JOB_LEASE_DURATION_MS, classifyLeaseFailure, createLeaseOwner, startLeaseHeartbeat } from '../../jobs/leases.js'

export const STRATEGY_INGESTION_HARD_LIMIT_BYTES = 50 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
])

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
  const configured = Number.isFinite(maxMb) ? Math.max(1, Math.floor(maxMb!)) * 1024 * 1024 : STRATEGY_INGESTION_HARD_LIMIT_BYTES
  return Math.min(STRATEGY_INGESTION_HARD_LIMIT_BYTES, configured)
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
  await mkdir(quarantine, { recursive: true })
  try {
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

export async function handleStrategyIndexKnowledge(pool: pg.Pool, data: Record<string, unknown>, options: { storageRoot?: string; signal?: AbortSignal } = {}) {
  const ingestionId = typeof data.ingestionId === 'string' ? data.ingestionId : ''
  const documentId = typeof data.documentId === 'string' ? data.documentId : ''
  if (!ingestionId || !documentId) throw new Error('strategy_ingestion_context_required')
  const owner = createLeaseOwner('strategy-ingestion')
  const claimed = (await pool.query<IngestionRow>(
    `UPDATE public.yux_strategy_ingestion_jobs
     SET status='extracting',current_step='extraction',attempt_count=attempt_count+1,
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
  try {
    if (options.signal?.aborted) throw options.signal.reason
    if (!claimed.storage_path || !claimed.sha256) throw new Error('strategy_ingestion_file_context_required')
    const absolutePath = resolveStrategyStoragePath(strategyStorageRoot(options.storageRoot), claimed.storage_path)
    if (!(await fileMatches(absolutePath, claimed.sha256, Number(claimed.byte_size)))) throw new Error('strategy_ingestion_file_not_intact')
    const extracted = await extractKnowledgeText({ content: await readFile(absolutePath), mimeType: claimed.mime_type, title: claimed.source_name })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM public.yux_strategy_source_chunks WHERE document_id=$1`, [documentId])
      for (const [index, chunk] of extracted.chunks.entries()) {
        const chunkHash = createHash('sha256').update(`${documentId}:${index}:${chunk.body}`).digest('hex')
        await client.query(
          `INSERT INTO public.yux_strategy_source_chunks (
             document_id,section_key,chunk_index,chunk_hash,chunk_text,token_estimate,source_scope,
             visibility,human_review_status,metadata
           ) VALUES ($1,$2,$3,$4,$5,$6,'internal','internal_only','pending',$7::jsonb)`,
          [documentId, chunk.title || 'section', index, chunkHash, chunk.body, chunk.tokenCount, JSON.stringify({ sourceLocator: chunk.sourceLocator, ingestionId })],
        )
      }
      const completed = await client.query(
        `UPDATE public.yux_strategy_ingestion_jobs
         SET status='completed',current_step='proposals',proposed_counts=$4::jsonb,completed_at=NOW(),
             lease_owner=NULL,lease_until=NULL,error_message=NULL,failure_class=NULL
         WHERE id=$1 AND lease_owner=$2 AND attempt_count=$3`,
        [ingestionId, owner, attempt, JSON.stringify({ chunks: extracted.chunks.length })],
      )
      if (completed.rowCount !== 1) throw new Error('strategy_ingestion_claim_lost')
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
    return { ingestionId, documentId, chunks: extracted.chunks.length }
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
        requiresOcr ? 'ocr' : 'extraction',
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
