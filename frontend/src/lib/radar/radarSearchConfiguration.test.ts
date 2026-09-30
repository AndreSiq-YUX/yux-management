import { describe, expect, it } from 'vitest'
import { defaultRadarSearchConfiguration, parseRadarCities, splitRadarTerms } from './radarSearchConfiguration'
describe('Radar configuration inputs', () => {
  it('parses multiple cities and rejects cities outside selected regions', () => {
    expect(parseRadarCities('Salvador/ba\nFlorianópolis/SC',['BA','SC'])).toEqual([{city:'Salvador',state:'BA'},{city:'Florianópolis',state:'SC'}])
    expect(() => parseRadarCities('Salvador',['BA'])).toThrow('Cidade/UF')
    expect(() => parseRadarCities('Salvador/BA',['PR'])).toThrow('Selecione a UF BA')
  })
  it('returns independent configurations and trims/deduplicates list inputs', () => {
    const first = defaultRadarSearchConfiguration()
    first.qualification.includeAnyTerms.push('Software')
    expect(defaultRadarSearchConfiguration().qualification.includeAnyTerms).toEqual([])
    expect(splitRadarTerms('software, consultoria\nsoftware; ')).toEqual(['software','consultoria'])
  })
})
