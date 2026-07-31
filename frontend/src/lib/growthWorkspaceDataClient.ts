import { apiRequest, rethrowAuthorizationError } from '@/lib/apiClient'

type QueryResult<T = any> = {
  data: T
  error: any
  count?: number | null
}

type Filter = {
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in' | 'contains' | 'overlaps' | 'ilike' | 'like' | 'or'
  column?: string
  value: unknown
}

type Order = {
  column: string
  ascending: boolean
}

type DataOperation = 'select' | 'insert' | 'update' | 'delete' | 'upsert'

class GrowthWorkspaceQueryBuilder<T = any[]> implements PromiseLike<QueryResult<T>> {
  private operation: DataOperation = 'select'
  private selected = '*'
  private values: unknown
  private filters: Filter[] = []
  private orders: Order[] = []
  private singleValue = false

  constructor(private readonly table: string) {}

  select(columns = '*') {
    this.selected = columns
    return this
  }

  insert(values: unknown) {
    this.operation = 'insert'
    this.values = values
    return this
  }

  update(values: unknown) {
    this.operation = 'update'
    this.values = values
    return this
  }

  eq(column: string, value: unknown) {
    return this.addFilter('eq', column, value)
  }

  in(column: string, value: unknown[]) {
    return this.addFilter('in', column, value)
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending ?? true })
    return this
  }

  single() {
    this.singleValue = true
    return this as unknown as GrowthWorkspaceQueryBuilder<any>
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected)
  }

  private addFilter(op: Filter['op'], column: string, value: unknown) {
    this.filters.push({ op, column, value })
    return this
  }

  private async execute(): Promise<QueryResult<T>> {
    try {
      return await apiRequest<QueryResult<T>>('/workspace/growth-query', {
        method: 'POST',
        body: {
          table: this.table,
          operation: this.operation,
          select: this.selected,
          values: this.values,
          filters: this.filters,
          orders: this.orders,
          single: this.singleValue,
        },
      })
    } catch (error) {
      rethrowAuthorizationError(error)
      return { data: null as T, error, count: null }
    }
  }
}

export const growthWorkspaceDataClient = {
  from<T = any>(table: string) {
    return new GrowthWorkspaceQueryBuilder<T[]>(table)
  },
}
