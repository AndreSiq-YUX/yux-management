import type { MockRoute } from './types'

/**
 * Banco em memoria para os "data clients" (POST /dominio/query e /dominio/xxx-query).
 * As linhas ficam em snake_case, exatamente como o backend devolve. Cada arquivo de fixture
 * registra suas tabelas com `registerTable`. Filtros por coluna ausente na linha sao ignorados
 * (comportamento leniente), entao basta preencher as colunas que importam.
 */
const tables = new Map<string, any[]>()
const rpcs = new Map<string, (args: Record<string, unknown>) => unknown>()

export function registerTable(name: string, rows: any[]) {
  tables.set(name, [...(tables.get(name) ?? []), ...rows])
}

export function registerRpc(name: string, handler: (args: Record<string, unknown>) => unknown) {
  rpcs.set(name, handler)
}

interface Filter { op: string; column?: string; value: unknown }

function passes(row: any, filter: Filter) {
  const { column, op, value } = filter
  if (!column || !(column in row)) return true
  const current = row[column]
  switch (op) {
    case 'eq': return current === value
    case 'neq': return current !== value
    case 'in': return Array.isArray(value) ? value.includes(current) : true
    case 'is': return value === null ? current == null : current === value
    case 'gt': return current > (value as any)
    case 'gte': return current >= (value as any)
    case 'lt': return current < (value as any)
    case 'lte': return current <= (value as any)
    default: return true
  }
}

export const queryRoutes: MockRoute[] = [
  {
    method: 'POST',
    path: /^\/[a-z-]+\/(?:[a-z-]+-)?query$/,
    respond: ({ body }) => {
      const request = (body ?? {}) as any
      const rows = tables.get(request.table) ?? []
      const operation = request.operation ?? 'select'

      if (operation !== 'select') {
        const values = request.values
        const withIds = Array.isArray(values) ? values : values ? [values] : []
        const data = request.single || request.maybeSingle ? (withIds[0] ?? null) : withIds
        return { data, error: null, count: null }
      }

      let result = rows.filter(row => (request.filters ?? []).every((filter: Filter) => passes(row, filter)))
      for (const order of [...(request.orders ?? [])].reverse()) {
        result = [...result].sort((a, b) => {
          const left = a[order.column]
          const right = b[order.column]
          if (left === right) return 0
          if (left == null) return 1
          if (right == null) return -1
          return (left < right ? -1 : 1) * (order.ascending ? 1 : -1)
        })
      }
      const count = result.length
      if (request.limit) result = result.slice(0, request.limit)
      if (request.head) return { data: null, error: null, count }
      if (request.single || request.maybeSingle) {
        return { data: result[0] ?? null, error: null, count }
      }
      return { data: result, error: null, count }
    },
  },
  {
    method: 'POST',
    path: /^\/[a-z-]+\/rpc$/,
    respond: ({ body }) => {
      const { name, args } = (body ?? {}) as { name?: string; args?: Record<string, unknown> }
      const handler = name ? rpcs.get(name) : undefined
      return { data: handler ? handler(args ?? {}) : [], error: null }
    },
  },
]
