import { describe, expect, it } from 'vitest'
import { canUseRadarSource, getCsvPreviewRows, getRadarSourceBlockedReason, isSmallBatch, splitLines } from './radarSourceRules'

describe('radarSourceRules', () => {
  it('allows manual and csv while blocking disabled governed providers', () => {
    expect(canUseRadarSource({ sourceType: 'manual', enabled: false })).toBe(true)
    expect(canUseRadarSource({ sourceType: 'csv', enabled: false })).toBe(true)
    expect(canUseRadarSource({ sourceType: 'jina_reader', enabled: false })).toBe(false)
    expect(getRadarSourceBlockedReason({ sourceType: 'jina_reader', enabled: false, requiresSecret: false })).toBe('Fonte desabilitada no catalogo do Radar.')
    expect(getRadarSourceBlockedReason({ sourceType: 'web_search', enabled: false, requiresSecret: true })).toBe('Configure as credenciais antes de usar esta fonte.')
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
})
