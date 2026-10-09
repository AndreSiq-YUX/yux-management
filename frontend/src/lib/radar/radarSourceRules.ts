import type { RadarDataSource } from '@/types/radar'

export const RADAR_SMALL_BATCH_LIMIT = 10

export function canUseRadarSource(source: Pick<RadarDataSource, 'sourceType' | 'enabled'>) {
  return source.sourceType === 'manual' || source.sourceType === 'csv' || source.enabled
}

export function getRadarSourceBlockedReason(source: Pick<RadarDataSource, 'sourceType' | 'enabled' | 'requiresSecret'>
  & Partial<Pick<RadarDataSource, 'isPaid' | 'defaultCostPerUnit'>>) {
  if (source.isPaid && (source.defaultCostPerUnit ?? 0) <= 0) {
    return 'Custo por consulta ainda não definido. Configure em Admin → Integrações e ative a fonte.'
  }
  if (canUseRadarSource(source)) return undefined
  if (!['cnpja_advanced_search', 'cnpja_office_lookup', 'brave_place_search', 'brave_web_search', 'serper_places', 'osm_extract'].includes(source.sourceType)) {
    return 'Fonte fora do catálogo de ativação do Admin. Esta integração permanece desativada.'
  }
  return 'Fonte desativada no catálogo. Ativação e limites são configurados em Admin → Integrações.'
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

export function buildRadarPlaceSearchDefaults(campaign: { targetSegment: string; targetCity: string; targetState: string }) {
  return { query: campaign.targetSegment, city: campaign.targetCity, state: campaign.targetState,
    sourceType: 'serper_places' as const, limit: 5 }
}
