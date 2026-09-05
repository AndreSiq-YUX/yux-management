import { forbidden } from './errors.js'
import type { RequestContext } from './request-context.js'

export type PlatformOperation =
  | 'knowledge.read'
  | 'knowledge.configure'
  | 'knowledge.review'
  | 'knowledge.publish'
  | 'brand.configure'
  | 'strategy.publish'

const governedKnowledgeTables = new Set([
  'knowledge_sources',
  'knowledge_entries',
  'knowledge_publications',
  'marketing_knowledge_documents',
  'marketing_knowledge_chunks',
])

const protectedMutationFields = new Set([
  'status', 'published_at', 'published_by', 'approved_at', 'approved_by',
  'review_status', 'reviewed_at', 'reviewed_by', 'publication_id', 'content_hash',
])

export function requirePlatformOperation(ctx: RequestContext, operation: PlatformOperation, moduleKey?: string) {
  if (ctx.role === 'yux_admin' || ctx.role === 'yux_operator') return
  if (moduleKey && !ctx.enabledModuleKeys.includes(moduleKey)) throw forbidden()
  if (operation === 'knowledge.read') return
  if ((operation === 'knowledge.configure' || operation === 'knowledge.review' || operation === 'brand.configure') && ctx.role === 'client_admin') return
  throw forbidden()
}

export function assertClientGenericMutationAllowed(
  ctx: RequestContext,
  table: string,
  operation: 'select'|'insert'|'update'|'delete'|'upsert',
  values: unknown,
  moduleKey: string,
) {
  if (ctx.role === 'yux_admin' || ctx.role === 'yux_operator' || operation === 'select') return
  if (ctx.role !== 'client_admin' || !ctx.enabledModuleKeys.includes(moduleKey)) throw forbidden()
  if (governedKnowledgeTables.has(table)) throw forbidden()
  for (const row of normalizeRows(values)) {
    if (Object.keys(row).some((field) => protectedMutationFields.has(field))) throw forbidden()
  }
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(value) ? value : [value]
  return rows.map((row) => row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : {})
}
