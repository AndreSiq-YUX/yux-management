import { apiRequest } from '@/lib/apiClient'

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

class MarketingStudioQueryBuilder<T = any[]> implements PromiseLike<QueryResult<T>> {
  private operation: DataOperation = 'select'
  private selected = '*'
  private selectedOptions: { count?: 'exact'; head?: boolean } = {}
  private values: unknown
  private filters: Filter[] = []
  private orders: Order[] = []
  private limitValue?: number
  private rangeValue?: { from: number; to: number }
  private singleValue = false
  private maybeSingleValue = false
  private onConflict?: string

  constructor(private readonly table: string) {}

  select(columns = '*', options: { count?: 'exact'; head?: boolean } = {}) {
    this.selected = columns
    this.selectedOptions = options
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

  upsert(values: unknown, options: { onConflict?: string } = {}) {
    this.operation = 'upsert'
    this.values = values
    this.onConflict = options.onConflict
    return this
  }

  eq(column: string, value: unknown) {
    return this.addFilter('eq', column, value)
  }

  is(column: string, value: unknown) {
    return this.addFilter('is', column, value)
  }

  in(column: string, value: unknown[]) {
    return this.addFilter('in', column, value)
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending ?? true })
    return this
  }

  limit(value: number) {
    this.limitValue = value
    return this
  }

  range(from: number, to: number) {
    this.rangeValue = { from, to }
    return this
  }

  single() {
    this.singleValue = true
    return this as unknown as MarketingStudioQueryBuilder<any>
  }

  maybeSingle() {
    this.maybeSingleValue = true
    return this as unknown as MarketingStudioQueryBuilder<any>
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
      const response = await apiRequest<QueryResult<T>>('/marketing-studio/query', {
        method: 'POST',
        body: {
          table: this.table,
          operation: this.operation,
          select: this.selected,
          values: this.values,
          filters: this.filters,
          orders: this.orders,
          limit: this.limitValue,
          range: this.rangeValue,
          single: this.singleValue,
          maybeSingle: this.maybeSingleValue,
          head: this.selectedOptions.head,
          count: this.selectedOptions.count,
          onConflict: this.onConflict,
        },
      })
      return response
    } catch (error) {
      return { data: null as T, error, count: null }
    }
  }
}

export const marketingStudioDataClient = {
  from<T = any>(table: string) {
    return new MarketingStudioQueryBuilder<T[]>(table)
  },

  async rpc<T = any[]>(name: string, args: Record<string, unknown> = {}) {
    try {
      const data = await apiRequest<QueryResult<T>>('/marketing-studio/rpc', {
        method: 'POST',
        body: { name, args },
      })
      return data
    } catch (error) {
      return { data: null as T, error, count: null }
    }
  },
}
