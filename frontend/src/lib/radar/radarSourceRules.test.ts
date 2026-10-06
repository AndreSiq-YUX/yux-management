import { describe, expect, it } from 'vitest'
import { canUseRadarSource, getCsvPreviewRows, getRadarSourceBlockedReason, isSmallBatch, splitLines, buildRadarPlaceSearchDefaults } from './radarSourceRules'

describe('radarSourceRules', () => {
  it('allows manual and csv while blocking disabled governed providers', () => {
    expect(canUseRadarSource({ sourceType: 'manual', enabled: false })).toBe(true)
    expect(canUseRadarSource({ sourceType: 'csv', enabled: false })).toBe(true)
    expect(canUseRadarSource({ sourceType: 'jina_reader', enabled: false })).toBe(false)
    expect(getRadarSourceBlockedReason({ sourceType: 'jina_reader', enabled: false, requiresSecret: false })).toBe('Fonte fora do catálogo de ativação do Admin. Esta integração permanece desativada.')
    expect(getRadarSourceBlockedReason({ sourceType: 'web_search', enabled: false, requiresSecret: true })).toBe('Fonte fora do catálogo de ativação do Admin. Esta integração permanece desativada.')
    expect(getRadarSourceBlockedReason({ sourceType: 'cnpja_advanced_search', enabled: false, requiresSecret: true })).toBe('Fonte desativada no catálogo. Ativação e limites são configurados em Admin → Integrações.')
  })

  it('reports missing cost approval without incorrectly claiming a key is missing', () => {
    const source = { sourceType: 'brave_place_search' as const, enabled: false,
      requiresSecret: true, isPaid: true, defaultCostPerUnit: 0 }
    expect(getRadarSourceBlockedReason(source)).toBe('Custo por consulta ainda não definido. Configure em Admin → Integrações e ative a fonte.')
    expect(getRadarSourceBlockedReason({ ...source, enabled: true })).toBeTruthy()
    expect(getRadarSourceBlockedReason({ ...source, enabled: true, defaultCostPerUnit: 0.03 })).toBeUndefined()
  })

  it('splits batch text and enforces small batch size', () => {
    expect(splitLines('https://a.com\n\nhttps://b.com')).toEqual(['https://a.com', 'https://b.com'])
    expect(isSmallBatch(1)).toBe(true)
    expect(isSmallBatch(10)).toBe(true)
    expect(isSmallBatch(0)).toBe(false)
    expect(isSmallBatch(11)).toBe(false)
  })

  it('builds a compact csv preview without parsing on the client', () => {
    expect(getCsvPreviewRows('trade_name,city\nA,Londrina\nB,Maringa\nC,Curitiba', 2)).toEqual([
      'trade_name,city',
      'A,Londrina',
    ])
  })

  it('starts local searches from the selected campaign instead of a fixed city', () => {
    expect(buildRadarPlaceSearchDefaults({ targetSegment: 'Revendas', targetCity: 'Maringá', targetState: 'PR' }))
      .toEqual({ query: 'Revendas', city: 'Maringá', state: 'PR', sourceType: 'serper_places', limit: 5 })
  })
})
