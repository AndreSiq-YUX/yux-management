export const RADAR_SMALL_BATCH_LIMIT = 10

export const radarSourceLabels: Record<string, string> = {
  manual: 'Cadastro manual',
  csv: 'Importacao CSV',
  jina_reader: 'URL/site com Jina Reader',
  jina_search: 'Busca assistida com Jina Search',
  web_search: 'Busca web assistida',
  public_registry: 'Fonte publica',
}

export function assertSmallBatchLimit(count: number, limit = RADAR_SMALL_BATCH_LIMIT) {
  if (!Number.isInteger(count) || count < 1) {
    throw Object.assign(new Error('radar_batch_empty'), { statusCode: 400 })
  }
  if (count > limit) {
    throw Object.assign(new Error('radar_batch_limit_exceeded'), { statusCode: 400, limit })
  }
}

export function normalizeRadarSourceKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
}

export function sourceRequiresEnabledCatalog(sourceType: string) {
  return sourceType !== 'manual' && sourceType !== 'csv'
}

export function estimateRadarCost(units: number, defaultCostPerUnit: number) {
  return Number((Math.max(0, units) * Math.max(0, defaultCostPerUnit)).toFixed(6))
}
