import { apiRequest } from '@/lib/apiClient'

type QueryResult<T = any> = {
  data: T
  error: any
  count?: number | null
}

type Filter = {
  op: 'eq'
  column: string
  value: unknown
}

type DataOperation = 'select' | 'insert' | 'update' | 'delete' | 'upsert'

class OmnichannelQueryBuilder<T = any[]> implements PromiseLike<QueryResult<T>> {
  private operation: DataOperation = 'select'
  private selected = '*'
  private values: unknown
  private filters: Filter[] = []

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

  delete() {
    this.operation = 'delete'
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: 'eq', column, value })
    return this
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<QueryResult<T>> {
    try {
      return await apiRequest<QueryResult<T>>('/omnichannel/query', {
        method: 'POST',
        body: {
          table: this.table,
          operation: this.operation,
          select: this.selected,
          values: this.values,
          filters: this.filters,
        },
      })
    } catch (error) {
      return { data: null as T, error, count: null }
    }
  }
}

export const omnichannelDataClient = {
  from<T = any>(table: string) {
    return new OmnichannelQueryBuilder<T[]>(table)
  },
}
