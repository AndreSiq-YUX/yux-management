import type { RadarDataSource } from '@/types/radar'

export const RADAR_SMALL_BATCH_LIMIT = 10

export function canUseRadarSource(source: Pick<RadarDataSource, 'sourceType' | 'enabled'>) {
  return source.sourceType === 'manual' || source.sourceType === 'csv' || source.enabled
}

export function getRadarSourceBlockedReason(source: Pick<RadarDataSource, 'sourceType' | 'enabled' | 'requiresSecret'>) {
  if (canUseRadarSource(source)) return undefined
  if (source.requiresSecret) return 'Configure as credenciais antes de usar esta fonte.'
  return 'Fonte desabilitada no catalogo do Radar.'
}

export function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

export function getCsvPreviewRows(value: string, maxRows = 3) {
  return splitLines(value).slice(0, maxRows)
}

export function isSmallBatch(size: number) {
  return Number.isInteger(size) && size >= 1 && size <= RADAR_SMALL_BATCH_LIMIT
}
