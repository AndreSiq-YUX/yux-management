import { createHash } from 'node:crypto'
import { z } from 'zod'
import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'

const evidenceSchema = z.object({
  documentId: z.string().uuid(),
  documentHash: z.string().regex(/^[a-f0-9]{64}$/),
  locator: z.string().min(1),
  page: z.number().int().positive().nullable().optional(),
  section: z.string().nullable().optional(),
  excerpt: z.string().min(1).max(1200),
  claimType: z.enum(['literal', 'derived']),
})

export const strategyCurationItemSchema = z.object({
  kind: z.enum(['concept_card', 'playbook', 'rubric', 'prompt_rule']),
  title: z.string().min(1).max(300),
  principle: z.string().min(1).max(4000),
  problem: z.string().max(2000),
  diagnosticQuestions: z.array(z.string()).max(20),
  applicability: z.array(z.string()).max(20),
  contraindications: z.array(z.string()).max(20),
  decisionRules: z.array(z.string()).max(20),
  recommendedActions: z.array(z.string()).max(20),
  successCriteria: z.array(z.string()).max(20),
  evidence: z.array(evidenceSchema).min(1).max(20),
  confidence: z.number().min(0).max(1),
  conflicts: z.array(z.union([
    z.string(),
    z.object({ itemId: z.string().uuid(), title: z.string(), similarity: z.number(), disposition: z.string() }),
  ])).max(40),
})

const strategyCurationResultSchema = z.object({
  items: z.array(strategyCurationItemSchema),
  warnings: z.array(z.string()).default([]),
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string().min(1),
  promptHash: z.string(),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative() }),
})

export type StrategyCurationItem = z.infer<typeof strategyCurationItemSchema>
export type StrategyCurationResult = z.infer<typeof strategyCurationResultSchema>
export type StrategyCurationSection = {
  locator: string
  documentId: string
  documentHash: string
  page?: number
  section?: string
  heading?: string
  body: string
}

export async function curateStrategyWithRuntime(env: AppEnv, input: { organizationId: string; sections: StrategyCurationSection[] }) {
  const result = await invokeAgentRuntime<unknown>(env, '/strategy/curate', {
    organization_id: input.organizationId,
    sections: input.sections.map(section => ({
      locator: section.locator,
      document_id: section.documentId,
      document_hash: section.documentHash,
      page: section.page,
      section: section.section,
      heading: section.heading,
      body: section.body,
    })),
  })
  return strategyCurationResultSchema.parse(result)
}

export function validateStrategyEvidence(item: StrategyCurationItem, sections: StrategyCurationSection[]) {
  const sources = new Map(sections.map(section => [section.locator, section]))
  return item.evidence.every(evidence => {
    const source = sources.get(evidence.locator)
    return source
      && source.documentId === evidence.documentId
      && source.documentHash === evidence.documentHash
      && normalize(source.body).includes(normalize(evidence.excerpt))
  })
}

export function strategyItemHash(item: StrategyCurationItem) {
  return createHash('sha256').update(JSON.stringify({
    kind: item.kind,
    title: item.title,
    principle: item.principle,
    evidence: item.evidence,
  })).digest('hex')
}

function normalize(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export async function reviewStrategyProposal(pool: pg.Pool, input: {
  itemId: string
  status: 'approved' | 'rejected' | 'proposed'
  reason: string
  reviewedBy: string
  changes?: Partial<Pick<StrategyCurationItem, 'title' | 'principle' | 'problem' | 'diagnosticQuestions' | 'applicability' | 'contraindications' | 'decisionRules' | 'recommendedActions' | 'successCriteria' | 'confidence'>>
}) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const row = (await client.query<{
      id: string; pack_id: string; source_document_id: string | null; payload: Record<string, unknown>; status: string
    }>(`SELECT id,pack_id,source_document_id,payload,status FROM public.yux_strategy_pack_items WHERE id=$1 FOR UPDATE`, [input.itemId])).rows[0]
    if (!row) throw reviewError(404, 'strategy_proposal_not_found')
    if (row.status === 'archived') throw reviewError(409, 'strategy_proposal_archived')
    const parsed = strategyCurationItemSchema.safeParse({ ...row.payload, ...input.changes })
    if (!parsed.success) throw reviewError(400, 'invalid_strategy_proposal')
    if (!input.reason.trim()) throw reviewError(400, 'strategy_review_reason_required')
    if (input.status === 'approved') {
      if (!row.source_document_id) throw reviewError(409, 'strategy_proposal_source_required')
      const document = (await client.query<{ source_hash: string }>(
        `SELECT source_hash FROM public.yux_strategy_source_documents WHERE id=$1`, [row.source_document_id],
      )).rows[0]
      const chunks = (await client.query<{ chunk_text: string; metadata: Record<string, unknown> }>(
        `SELECT chunk_text,metadata FROM public.yux_strategy_source_chunks WHERE document_id=$1`, [row.source_document_id],
      )).rows.map((chunk, index) => ({
        locator: typeof chunk.metadata?.sourceLocator === 'string' ? chunk.metadata.sourceLocator : `section:${index + 1}`,
        documentId: row.source_document_id!, documentHash: document?.source_hash || '', body: chunk.chunk_text,
      }))
      if (!document || !validateStrategyEvidence(parsed.data, chunks)) throw reviewError(409, 'strategy_proposal_evidence_invalid')
    }
    const contentHash = strategyItemHash(parsed.data)
    const updatedPayload = { ...row.payload, ...parsed.data }
    const updated = (await client.query(
      `UPDATE public.yux_strategy_pack_items SET title=$2,summary=$3,body=$4,payload=$5::jsonb,
         confidence=$6,content_hash=$7,status=$8,review_reason=$9,reviewed_by=$10,reviewed_at=NOW(),updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [row.id, parsed.data.title, parsed.data.problem, parsed.data.principle, JSON.stringify(updatedPayload), parsed.data.confidence, contentHash, input.status, input.reason.trim(), input.reviewedBy],
    )).rows[0]
    await client.query('COMMIT')
    return updated
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    if (error && typeof error === 'object' && Reflect.get(error, 'code') === '23505') throw reviewError(409, 'strategy_proposal_duplicate')
    throw error
  } finally { client.release() }
}

function reviewError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode })
}
