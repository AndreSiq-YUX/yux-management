import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { requireAdminRole, requireMembership } from '../../http/guards.js'

export const INTERNAL_QUERY_TABLES = new Set([
  'organizations',
  'clients',
  'contracts',
  'contract_modules',
  'packages',
  'package_modules',
  'platform_modules',
  'platform_provider_connections',
  'platform_admin_audit_events',
  'platform_module_limits',
  'platform_usage_counters',
  'smtp2go_subaccounts',
])

const restrictedTableName = /(hash|token|secret)/i

const filterSchema = z.object({
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is', 'in', 'contains', 'overlaps', 'ilike', 'like', 'or']),
  column: z.string().optional(),
  value: z.unknown(),
})

const orderSchema = z.object({
  column: z.string(),
  ascending: z.boolean().default(true),
})

export const dataQuerySchema = z.object({
  table: z.string().min(1),
  operation: z.enum(['select', 'insert', 'update', 'delete', 'upsert']),
  select: z.string().optional(),
  values: z.unknown().optional(),
  filters: z.array(filterSchema).default([]),
  orders: z.array(orderSchema).default([]),
  limit: z.number().int().positive().optional(),
  range: z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative() }).optional(),
  single: z.boolean().optional(),
  maybeSingle: z.boolean().optional(),
  head: z.boolean().optional(),
  count: z.enum(['exact']).optional(),
  onConflict: z.string().optional(),
})

export type DataQuery = z.infer<typeof dataQuerySchema>
type Filter = z.infer<typeof filterSchema>
type SqlState = { values: unknown[] }

async function getAuthenticatedUser(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[request.server.config.SESSION_COOKIE_NAME]
  if (!token) {
    void reply.code(401).send({ error: 'not_authenticated' })
    return null
  }

  const user = await request.server.authStore.findUserBySession(hashSessionToken(token), new Date())
  if (!user) {
    void reply.code(401).send({ error: 'not_authenticated' })
    return null
  }

  return user
}

export async function registerDataRoutes(app: FastifyInstance) {
  app.post('/query', async (request, reply) => {
    requireAdminRole(request)

    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !isIdentifier(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_data_query' })
    }
    if (!isInternalQueryTable(parsed.data.table)) {
      return reply.code(403).send({ error: 'data_query_table_forbidden' })
    }

    return executeDataQuery(app, parsed.data)
  })

  app.post('/rpc', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = z.object({
      name: z.string().min(1),
      args: z.record(z.string(), z.unknown()).default({}),
    }).safeParse(request.body)
    if (!parsed.success || !isIdentifier(parsed.data.name)) {
      return reply.code(400).send({ error: 'invalid_rpc_query' })
    }

    if (parsed.data.name === 'match_marketing_knowledge') {
      const args = z.object({
        target_contract_id: z.string().uuid(),
        query_text: z.string().max(10_000).default(''),
        match_limit: z.coerce.number().int().min(1).max(20).default(8),
      }).safeParse(parsed.data.args)
      if (!args.success) return reply.code(400).send({ error: 'invalid_marketing_knowledge_query' })
      const contract = await app.pg.query<{ organization_id: string }>(
        'SELECT organization_id FROM public.contracts WHERE id = $1 LIMIT 1',
        [args.data.target_contract_id],
      )
      if (!contract.rows[0]) return reply.code(404).send({ error: 'contract_not_found' })
      requireMembership(request, contract.rows[0].organization_id)
      const result = await app.pg.query(
        'SELECT * FROM public.match_marketing_knowledge($1, $2, $3)',
        [args.data.target_contract_id, args.data.query_text, args.data.match_limit],
      )
      return { data: result.rows, error: null, count: result.rows.length }
    }

    return reply.code(404).send({ error: 'rpc_not_implemented' })
  })
}

function isInternalQueryTable(table: string) {
  return INTERNAL_QUERY_TABLES.has(table) && !restrictedTableName.test(table)
}

export async function executeDataQuery(app: FastifyInstance, query: DataQuery) {
  if (query.operation === 'select') return executeSelect(app, query)
  if (query.operation === 'insert') return executeInsert(app, query)
  if (query.operation === 'update') return executeUpdate(app, query)
  if (query.operation === 'delete') return executeDelete(app, query)
  return executeUpsert(app, query)
}

async function executeSelect(app: FastifyInstance, query: DataQuery) {
  const state: SqlState = { values: [] }
  const where = buildWhere(query.filters, state)
  const whereValues = [...where.values]
  const order = buildOrder(query.orders)
  const pagination = buildPagination(query, state)
  const table = tableSql(query.table)
  const projection = projectionSql(query.select)

  let count: number | null = null
  if (query.count === 'exact' || query.head) {
    const countResult = await app.pg.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ${table}${where.sql}`,
      whereValues,
    )
    count = Number(countResult.rows[0]?.total || 0)
  }

  if (query.head) return { data: null, error: null, count }

  const result = await app.pg.query(
    `SELECT ${projection} FROM ${table}${where.sql}${order}${pagination.sql}`,
    state.values,
  )
  return formatRows(result.rows, query, count)
}

async function executeInsert(app: FastifyInstance, query: DataQuery) {
  const rows = normalizeRows(query.values)
  if (rows.length === 0) return { data: query.single || query.maybeSingle ? null : [], error: null, count: 0 }
  const result = await app.pg.query(
    `INSERT INTO ${tableSql(query.table)} ${insertColumnsSql(rows)}
     VALUES ${insertValuesSql(rows)}
     RETURNING *`,
    flattenRows(rows),
  )
  return formatRows(result.rows, query, null)
}

async function executeUpdate(app: FastifyInstance, query: DataQuery) {
  const values = asRecord(query.values)
  const keys = Object.keys(values).filter(isIdentifier)
  if (keys.length === 0) return { data: query.single || query.maybeSingle ? null : [], error: null, count: 0 }
  const state: SqlState = { values: [] }
  const setSql = keys.map((key) => `${quoteIdent(key)} = $${pushValue(state, values[key])}`).join(', ')
  const where = buildWhere(query.filters, state)
  const result = await app.pg.query(
    `UPDATE ${tableSql(query.table)} SET ${setSql}${where.sql} RETURNING *`,
    state.values,
  )
  return formatRows(result.rows, query, null)
}

async function executeDelete(app: FastifyInstance, query: DataQuery) {
  const state: SqlState = { values: [] }
  const where = buildWhere(query.filters, state)
  const result = await app.pg.query(`DELETE FROM ${tableSql(query.table)}${where.sql} RETURNING *`, state.values)
  return formatRows(result.rows, query, null)
}

async function executeUpsert(app: FastifyInstance, query: DataQuery) {
  const rows = normalizeRows(query.values)
  if (rows.length === 0) return { data: query.single || query.maybeSingle ? null : [], error: null, count: 0 }
  const keys = Object.keys(rows[0]).filter(isIdentifier)
  const conflictKeys = (query.onConflict || 'id').split(',').map((key) => key.trim()).filter(isIdentifier)
  if (conflictKeys.length === 0) throw Object.assign(new Error('invalid_on_conflict'), { statusCode: 400 })
  const updates = keys
    .filter((key) => !conflictKeys.includes(key))
    .map((key) => `${quoteIdent(key)} = EXCLUDED.${quoteIdent(key)}`)
  const result = await app.pg.query(
    `INSERT INTO ${tableSql(query.table)} (${keys.map(quoteIdent).join(', ')})
     VALUES ${insertValuesSql(rows, keys)}
     ON CONFLICT (${conflictKeys.map(quoteIdent).join(', ')}) DO ${updates.length ? `UPDATE SET ${updates.join(', ')}` : 'NOTHING'}
     RETURNING *`,
    flattenRows(rows, keys),
  )
  return formatRows(result.rows, query, null)
}

function buildWhere(filters: DataQuery['filters'], state: SqlState) {
  const clauses: string[] = []
  for (const filter of filters) {
    if (filter.op === 'or') {
      const clause = buildOrClause(String(filter.value || ''), state)
      if (clause) clauses.push(clause)
      continue
    }
    if (!filter.column || !isIdentifier(filter.column)) continue
    const column = quoteIdent(filter.column)
    if (filter.op === 'is') {
      clauses.push(filter.value === null ? `${column} IS NULL` : `${column} IS NOT DISTINCT FROM $${pushValue(state, filter.value)}`)
    } else if (filter.op === 'in' && Array.isArray(filter.value)) {
      clauses.push(`${column} = ANY($${pushValue(state, filter.value)})`)
    } else if (filter.op === 'contains') {
      clauses.push(`${column} @> $${pushValue(state, filter.value)}`)
    } else if (filter.op === 'overlaps') {
      clauses.push(`${column} && $${pushValue(state, filter.value)}`)
    } else if (filter.op === 'ilike') {
      clauses.push(`${column} ILIKE $${pushValue(state, filter.value)}`)
    } else if (filter.op === 'like') {
      clauses.push(`${column} LIKE $${pushValue(state, filter.value)}`)
    } else {
      const operator = ({ eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' } as Partial<Record<Filter['op'], string>>)[filter.op]
      if (!operator) continue
      clauses.push(`${column} ${operator} $${pushValue(state, filter.value)}`)
    }
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', values: state.values }
}

function buildOrClause(raw: string, state: SqlState) {
  const clauses = raw.split(',').map((part) => {
    const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(ilike|like|eq)\.(.+)$/)
    if (!match) return null
    const [, column, op, value] = match
    const sqlOp = op === 'eq' ? '=' : op.toUpperCase()
    return `${quoteIdent(column)} ${sqlOp} $${pushValue(state, value)}`
  }).filter(Boolean)
  return clauses.length ? `(${clauses.join(' OR ')})` : ''
}

function buildOrder(orders: DataQuery['orders']) {
  const clauses = orders
    .filter((order) => isIdentifier(order.column))
    .map((order) => `${quoteIdent(order.column)} ${order.ascending ? 'ASC' : 'DESC'}`)
  return clauses.length ? ` ORDER BY ${clauses.join(', ')}` : ''
}

function buildPagination(query: DataQuery, state: SqlState) {
  if (query.range) {
    const limit = Math.max(0, query.range.to - query.range.from + 1)
    const limitIndex = pushValue(state, limit)
    const offsetIndex = pushValue(state, query.range.from)
    return { sql: ` LIMIT $${limitIndex} OFFSET $${offsetIndex}`, values: state.values.slice(-2) }
  }
  if (query.limit) {
    return { sql: ` LIMIT $${pushValue(state, query.limit)}`, values: state.values.slice(-1) }
  }
  return { sql: '', values: [] }
}

function projectionSql(select?: string) {
  if (!select || select.trim() === '*') return '*'
  const columns = select.split(',').map((column) => column.trim()).filter(isIdentifier)
  return columns.length ? columns.map(quoteIdent).join(', ') : '*'
}

function formatRows(rows: Record<string, unknown>[], query: DataQuery, count: number | null) {
  if (query.single) {
    if (rows.length !== 1) return { data: null, error: { message: 'single row not found' }, count }
    return { data: rows[0], error: null, count }
  }
  if (query.maybeSingle) return { data: rows[0] ?? null, error: null, count }
  return { data: rows, error: null, count }
}

function insertColumnsSql(rows: Record<string, unknown>[]) {
  return `(${Object.keys(rows[0]).filter(isIdentifier).map(quoteIdent).join(', ')})`
}

function insertValuesSql(rows: Record<string, unknown>[], keys = Object.keys(rows[0]).filter(isIdentifier)) {
  return rows.map((_, rowIndex) => `(${keys.map((__, columnIndex) => `$${rowIndex * keys.length + columnIndex + 1}`).join(', ')})`).join(', ')
}

function flattenRows(rows: Record<string, unknown>[], keys = Object.keys(rows[0]).filter(isIdentifier)) {
  return rows.flatMap((row) => keys.map((key) => row[key]))
}

function normalizeRows(value: unknown) {
  if (Array.isArray(value)) return value.map(asRecord)
  return [asRecord(value)]
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function pushValue(state: SqlState, value: unknown) {
  state.values.push(value)
  return state.values.length
}

function tableSql(table: string) {
  return `public.${quoteIdent(table)}`
}

function quoteIdent(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`
}

function isIdentifier(value: string) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)
}
