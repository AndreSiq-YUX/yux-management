import type { FastifyInstance } from 'fastify'
import { forbidden } from '../../http/errors.js'
import type { RequestContext } from '../../http/request-context.js'
import { executeDataQuery, type DataQuery } from './routes.js'

type DataOperation = DataQuery['operation']

export type ScopedTableRule = {
  orgColumn: string | null
  clientOps: DataOperation[]
}

export type ScopedTableRules = Record<string, ScopedTableRule>

const clientDataOperations: DataOperation[] = ['select', 'insert', 'update', 'delete']

export function createScopedTableRules(directOrganizationTables: string[], internalOnlyTables: string[]): ScopedTableRules {
  return Object.fromEntries([
    ...directOrganizationTables.map((table) => [table, { orgColumn: 'organization_id', clientOps: clientDataOperations }]),
    ...internalOnlyTables.map((table) => [table, { orgColumn: null, clientOps: [] }]),
  ])
}

export async function executeScopedDataQuery(
  app: FastifyInstance,
  ctx: RequestContext,
  query: DataQuery,
  tables: ScopedTableRules,
) {
  const rule = tables[query.table]
  if (!rule) throw forbidden()

  if (ctx.role === 'yux_admin' || ctx.role === 'yux_operator') {
    return executeDataQuery(app, query)
  }

  if (!rule.orgColumn || !rule.clientOps.includes(query.operation)) throw forbidden()

  const scopedQuery: DataQuery = {
    ...query,
    filters: query.filters.filter((filter) => filter.column !== rule.orgColumn),
  }
  scopedQuery.filters.push({ op: 'in', column: rule.orgColumn, value: ctx.organizationIds })

  if (query.operation === 'insert' || query.operation === 'upsert' || query.operation === 'update') {
    for (const row of normalizeRows(query.values)) {
      const organizationId = row[rule.orgColumn]
      if (organizationId !== undefined && (!isString(organizationId) || !ctx.organizationIds.includes(organizationId))) {
        throw forbidden()
      }
      if ((query.operation === 'insert' || query.operation === 'upsert') && organizationId === undefined) throw forbidden()
    }
  }

  return executeDataQuery(app, scopedQuery)
}

function normalizeRows(value: unknown) {
  const rows = Array.isArray(value) ? value : [value]
  return rows.map((row) => (row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : {}))
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
