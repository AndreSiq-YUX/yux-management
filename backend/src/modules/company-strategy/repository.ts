import type pg from 'pg'
import { ApiError } from '../../http/errors.js'
import { hashCanonical } from '../action-engine/repository.js'
import { recordDomainEvent } from '../events/repository.js'
import { companyStrategyContentSchema, type CompanyStrategy, type CompanyStrategyAccess, type CompanyStrategyContentV1, type CompanyStrategyRevision } from './schemas.js'

type Queryable = Pick<pg.PoolClient, 'query'>
type Row = Record<string, any>
export function canConfigureCompanyStrategy(role: string) { return ['yux_admin', 'yux_operator', 'client_admin'].includes(role) }
export function assertCompanyStrategyWrite(access: CompanyStrategyAccess) {
  if (!canConfigureCompanyStrategy(access.role)) throw new ApiError(403, 'company_strategy_write_forbidden')
}
export async function withCompanyStrategyTransaction<T>(db: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect()
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result }
  catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error }
  finally { client.release() }
}
export async function lockStrategyOrganization(db: Queryable, access: CompanyStrategyAccess) {
  const row = (await db.query<Row>('SELECT id,client_id FROM public.organizations WHERE id=$1 FOR UPDATE', [access.organizationId])).rows[0]
  if (!row) throw new ApiError(404, 'organization_not_found')
  return row
}
export async function getCompanyStrategy(db: Queryable, access: CompanyStrategyAccess, strategyId: string): Promise<CompanyStrategy> {
  const row = (await db.query<Row>(`SELECT strategy.*,to_jsonb(draft) AS draft,to_jsonb(published) AS published
    FROM public.company_strategies strategy
    LEFT JOIN public.company_strategy_revisions draft ON draft.id=strategy.draft_revision_id AND draft.organization_id=strategy.organization_id
    LEFT JOIN public.company_strategy_revisions published ON published.id=strategy.published_revision_id AND published.organization_id=strategy.organization_id
    WHERE strategy.organization_id=$1 AND strategy.id=$2`, [access.organizationId, strategyId])).rows[0]
  if (!row || (!canConfigureCompanyStrategy(access.role) && !row.published)) throw new ApiError(404, 'company_strategy_not_found')
  return { id: row.id, organizationId: row.organization_id, clientId: row.client_id, version: row.version, isPrimary: row.is_primary,
    archivedAt: iso(row.archived_at), draftRevision: canConfigureCompanyStrategy(access.role) ? mapRevision(row.draft) : null,
    publishedRevision: mapRevision(row.published), createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! }
}
export async function listCompanyStrategies(db: pg.Pool, access: CompanyStrategyAccess, options = { includeDrafts: true }): Promise<CompanyStrategy[]> {
  const rows = (await db.query<{ id: string }>(`SELECT id FROM public.company_strategies WHERE organization_id=$1
    AND ($2 OR published_revision_id IS NOT NULL) ORDER BY archived_at NULLS FIRST,is_primary DESC,updated_at DESC,id`, [access.organizationId, options.includeDrafts && canConfigureCompanyStrategy(access.role)])).rows
  return Promise.all(rows.map(row => getCompanyStrategy(db, access, row.id)))
}
export async function listCompanyStrategyRevisions(db: pg.Pool, access: CompanyStrategyAccess, strategyId: string): Promise<CompanyStrategyRevision[]> {
  const strategy = await getCompanyStrategy(db, access, strategyId)
  const rows = (await db.query<Row>(`SELECT * FROM public.company_strategy_revisions WHERE organization_id=$1 AND strategy_id=$2
    AND ($3 OR id=$4) ORDER BY revision_number DESC`, [access.organizationId, strategyId, canConfigureCompanyStrategy(access.role), strategy.publishedRevision?.id ?? null])).rows
  return rows.map(row => mapRevision(row)!)
}
function mapRevision(row: Row | null): CompanyStrategyRevision | null {
  if (!row) return null
  return { id: row.id, strategyId: row.strategy_id, revisionNumber: row.revision_number, content: row.content,
    contentHash: row.content_hash, origin: row.origin, createdBy: row.created_by, createdAt: iso(row.created_at)! }
}
function iso(value: Date | string | null) { return value == null ? null : value instanceof Date ? value.toISOString() : String(value) }
export async function lockCompanyStrategy(db: Queryable, access: CompanyStrategyAccess, id: string, expectedVersion: number) {
  const row = (await db.query<Row>('SELECT * FROM public.company_strategies WHERE organization_id=$1 AND id=$2 FOR UPDATE', [access.organizationId, id])).rows[0]
  if (!row) throw new ApiError(404, 'company_strategy_not_found')
  if (row.version !== expectedVersion) throw new ApiError(409, 'company_strategy_version_conflict')
  return row
}
async function validateReferences(db: Queryable, access: CompanyStrategyAccess, content: CompanyStrategyContentV1) {
  for (const [ids, table, published] of [[content.references.productIds, 'marketing_products_services', false], [content.references.documentIds, 'marketing_knowledge_documents', true]] as const) {
    if (!ids.length) continue
    const result = await db.query<{ id: string }>(`SELECT id FROM public.${table} WHERE organization_id=$1 AND id=ANY($2::uuid[])${published ? " AND status='published'" : ''}`, [access.organizationId, ids])
    if (result.rows.length !== ids.length) throw new ApiError(404, 'company_strategy_reference_not_found')
  }
}
export type SaveStrategyDraftInput = { strategyId?: string; expectedVersion: number | null; content: CompanyStrategyContentV1; idempotencyKey: string; origin: { kind: 'manual' | 'mission'; proposalId?: string } }
export async function saveCompanyStrategyDraftInTransaction(db: pg.PoolClient, access: CompanyStrategyAccess, input: SaveStrategyDraftInput): Promise<CompanyStrategy> {
  assertCompanyStrategyWrite(access)
  const content = companyStrategyContentSchema.parse(input.content)
  const organization = await lockStrategyOrganization(db, access)
  const requestHash = hashCanonical({ ...input, content })
  const prior = (await db.query<Row>('SELECT strategy_id,request_hash FROM public.company_strategy_revisions WHERE organization_id=$1 AND idempotency_key=$2', [access.organizationId, input.idempotencyKey])).rows[0]
  if (prior) {
    if (prior.request_hash !== requestHash) throw new ApiError(409, 'company_strategy_idempotency_conflict')
    return getCompanyStrategy(db, access, prior.strategy_id)
  }
  await validateReferences(db, access, content)
  let strategy: Row
  if (input.strategyId) {
    if (input.expectedVersion == null) throw new ApiError(409, 'company_strategy_version_required')
    strategy = await lockCompanyStrategy(db, access, input.strategyId, input.expectedVersion)
    if (strategy.archived_at) throw new ApiError(409, 'company_strategy_archived')
  } else {
    if (input.expectedVersion != null) throw new ApiError(409, 'company_strategy_create_version_invalid')
    strategy = (await db.query<Row>('INSERT INTO public.company_strategies(organization_id,client_id,created_by) VALUES($1,$2,$3) RETURNING *', [access.organizationId, organization.client_id, access.actorId])).rows[0]!
  }
  const revision = (await db.query<{ id: string }>(`INSERT INTO public.company_strategy_revisions
    (organization_id,strategy_id,revision_number,content,content_hash,origin,idempotency_key,request_hash,created_by)
    VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7,$8,$9) RETURNING id`, [access.organizationId, strategy.id, strategy.last_revision_number + 1, JSON.stringify(content), hashCanonical(content), JSON.stringify(input.origin), input.idempotencyKey, requestHash, access.actorId])).rows[0]!
  await db.query('UPDATE public.company_strategies SET draft_revision_id=$3,last_revision_number=last_revision_number+1,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2', [access.organizationId, strategy.id, revision.id])
  await strategyEvent(db, access, strategy.id, 'draft_saved', { revisionId: revision.id })
  return getCompanyStrategy(db, access, strategy.id)
}
export async function saveCompanyStrategyDraft(db: pg.Pool, access: CompanyStrategyAccess, input: SaveStrategyDraftInput) {
  return withCompanyStrategyTransaction(db, client => saveCompanyStrategyDraftInTransaction(client, access, input))
}
export async function publishCompanyStrategy(db: pg.Pool, access: CompanyStrategyAccess, input: { strategyId: string; revisionId: string; expectedVersion: number; expectedContentHash: string; idempotencyKey: string }) {
  assertCompanyStrategyWrite(access)
  return withCompanyStrategyTransaction(db, async client => {
    await lockStrategyOrganization(client, access)
    const requestHash = hashCanonical(input)
    const prior = (await client.query<Row>('SELECT strategy_id,request_hash FROM public.company_strategy_publications WHERE organization_id=$1 AND idempotency_key=$2', [access.organizationId, input.idempotencyKey])).rows[0]
    if (prior) {
      if (prior.request_hash !== requestHash) throw new ApiError(409, 'company_strategy_idempotency_conflict')
      return getCompanyStrategy(client, access, prior.strategy_id)
    }
    const current = await lockCompanyStrategy(client, access, input.strategyId, input.expectedVersion)
    if (current.archived_at || current.draft_revision_id !== input.revisionId) throw new ApiError(409, 'company_strategy_draft_changed')
    const revision = (await client.query<Row>('SELECT content,content_hash FROM public.company_strategy_revisions WHERE organization_id=$1 AND strategy_id=$2 AND id=$3', [access.organizationId, input.strategyId, input.revisionId])).rows[0]
    if (!revision || revision.content_hash !== input.expectedContentHash) throw new ApiError(409, 'company_strategy_content_changed')
    await validateReferences(client, access, companyStrategyContentSchema.parse(revision.content))
    await client.query(`INSERT INTO public.company_strategy_publications(organization_id,strategy_id,revision_id,publisher_user_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6)`, [access.organizationId, input.strategyId, input.revisionId, access.actorId, input.idempotencyKey, requestHash])
    await client.query('UPDATE public.company_strategies SET published_revision_id=$3,draft_revision_id=NULL,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2', [access.organizationId, input.strategyId, input.revisionId])
    await strategyEvent(client, access, input.strategyId, 'published', { revisionId: input.revisionId, contentHash: input.expectedContentHash })
    return getCompanyStrategy(client, access, input.strategyId)
  })
}
export async function setPrimaryCompanyStrategy(db: pg.Pool, access: CompanyStrategyAccess, input: { strategyId: string; expectedVersion: number }) {
  assertCompanyStrategyWrite(access)
  return withCompanyStrategyTransaction(db, async client => {
    await lockStrategyOrganization(client, access)
    const current = await lockCompanyStrategy(client, access, input.strategyId, input.expectedVersion)
    if (current.archived_at) throw new ApiError(409, 'company_strategy_archived')
    await client.query('UPDATE public.company_strategies SET is_primary=false,version=version+1,updated_at=now() WHERE organization_id=$1 AND is_primary AND id<>$2', [access.organizationId, input.strategyId])
    await client.query('UPDATE public.company_strategies SET is_primary=true,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2', [access.organizationId, input.strategyId])
    await strategyEvent(client, access, input.strategyId, 'primary_changed', {})
    return getCompanyStrategy(client, access, input.strategyId)
  })
}
export async function setCompanyStrategyArchived(db: pg.Pool, access: CompanyStrategyAccess, input: { strategyId: string; expectedVersion: number; archived: boolean }) {
  assertCompanyStrategyWrite(access)
  return withCompanyStrategyTransaction(db, async client => {
    await lockStrategyOrganization(client, access)
    const current = await lockCompanyStrategy(client, access, input.strategyId, input.expectedVersion)
    if (!input.archived && current.archived_at) {
      const previous = await getCompanyStrategy(client, access, input.strategyId)
      const content = previous.draftRevision?.content ?? previous.publishedRevision?.content
      if (!content) throw new ApiError(409, 'company_strategy_revision_missing')
      await client.query('UPDATE public.company_strategies SET archived_at=NULL WHERE organization_id=$1 AND id=$2', [access.organizationId, input.strategyId])
      await saveCompanyStrategyDraftInTransaction(client, access, { strategyId: input.strategyId, expectedVersion: input.expectedVersion, content, idempotencyKey: `restore:${input.strategyId}:${input.expectedVersion}`, origin: { kind: 'manual' } })
    }
    await client.query(`UPDATE public.company_strategies SET archived_at=CASE WHEN $3 THEN now() ELSE NULL END,
      is_primary=false,draft_revision_id=CASE WHEN $3 THEN draft_revision_id ELSE COALESCE(draft_revision_id,published_revision_id) END,
      published_revision_id=CASE WHEN $3 THEN published_revision_id ELSE NULL END,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2`, [access.organizationId, input.strategyId, input.archived])
    await strategyEvent(client, access, input.strategyId, input.archived ? 'archived' : 'restored', {})
    return getCompanyStrategy(client, access, input.strategyId)
  })
}
async function strategyEvent(db: Queryable, access: CompanyStrategyAccess, strategyId: string, event: string, payload: Record<string, unknown>) {
  await recordDomainEvent(db, { eventType: `company.strategy_${event}`, organizationId: access.organizationId, aggregateType: 'company_strategy', aggregateId: strategyId, actor: { type: 'user', id: access.actorId }, payload })
}
