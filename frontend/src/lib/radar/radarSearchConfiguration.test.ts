import { describe, expect, it } from 'vitest'
import { defaultRadarSearchConfiguration, parseRadarCities, splitRadarTerms } from './radarSearchConfiguration'
describe('Radar configuration inputs', () => {
  it('parses multiple cities and rejects cities outside selected regions', () => {
    expect(parseRadarCities('Salvador/ba\nFlorianópolis/SC',['BA','SC'])).toEqual([{city:'Salvador',state:'BA'},{city:'Florianópolis',state:'SC'}])
    expect(() => parseRadarCities('Salvador',['BA','SC'])).toThrow('Cidade/UF')
    expect(() => parseRadarCities('Salvador/BA',['PR'])).toThrow('Selecione a UF BA')
  })
  it('inherits the single selected state for a whole city list',()=>{
    expect(parseRadarCities('Bauru\nPresidente Prudente\nMarília\nAssis',['SP'])).toEqual([
      {city:'Bauru',state:'SP'},{city:'Presidente Prudente',state:'SP'},{city:'Marília',state:'SP'},{city:'Assis',state:'SP'},
    ])
    expect(parseRadarCities(' Bauru / sp \nMarília',['SP'])).toEqual([{city:'Bauru',state:'SP'},{city:'Marília',state:'SP'}])
  })
  it.each(['Bauru/','/SP','Bauru/SP/RJ'])('rejects malformed city suffixes instead of inheriting over them: %s',value=>expect(()=>parseRadarCities(value,['SP'])).toThrow('Cidade/UF'))
  it('does not guess when a city has no selected state',()=>expect(()=>parseRadarCities('Bauru',[])).toThrow('UF'))
  it('returns independent configurations and trims/deduplicates list inputs', () => {
    const first = defaultRadarSearchConfiguration()
    first.qualification.includeAnyTerms.push('Software')
    expect(defaultRadarSearchConfiguration().qualification.includeAnyTerms).toEqual([])
    expect(splitRadarTerms('software, consultoria\nsoftware; ')).toEqual(['software','consultoria'])
  })
})
