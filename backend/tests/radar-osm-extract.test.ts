import { describe, expect, it } from 'vitest'
import { collectRadarOsmPlaces, parseRadarOsmBoundary, pointInRadarOsmBoundary, validateRadarOsmLocality } from '../src/modules/radar/osm-extract.js'

const feature = {
  type: 'Feature',
  properties: { CD_MUN: '4113700', NM_MUN: 'Londrina', SIGLA_UF: 'PR' },
  geometry: { type: 'Polygon', coordinates: [[[-51.5, -23.5], [-51, -23.5], [-51, -23], [-51.5, -23], [-51.5, -23.5]]] },
}

const selector = { municipalityCode: '4113700', city: 'Londrina', state: 'PR', source: 'IBGE fixture' }
const stream = async function* <T>(values: T[]) { for (const value of values) yield value }

describe('Radar OSM municipal extract', () => {
  it('requires the exact municipality code, city and state', () => {
    const locality = { id: 4113700, nome: 'Londrina', microrregiao: { mesorregiao: { UF: { sigla: 'PR' } } } }
    expect(() => validateRadarOsmLocality(locality, selector)).not.toThrow()
    expect(() => validateRadarOsmLocality(locality, { ...selector, city: 'Curitiba' })).toThrow('locality_identity_mismatch')
    expect(() => parseRadarOsmBoundary(feature, { ...selector, municipalityCode: '4106902' })).toThrow('boundary_not_found')
    expect(() => parseRadarOsmBoundary(feature, { ...selector, city: 'Curitiba' })).toThrow('city_mismatch')
    expect(() => parseRadarOsmBoundary(feature, { ...selector, state: 'SP' })).toThrow('invalid_municipality_code')
    const boundary = parseRadarOsmBoundary(feature, selector)
    expect(parseRadarOsmBoundary({ ...feature, properties: { codarea: '4113700' } }, selector).municipalityCode).toBe('4113700')
    expect(pointInRadarOsmBoundary(-51.2, -23.3, boundary)).toBe(true)
    expect(pointInRadarOsmBoundary(-50.8, -23.3, boundary)).toBe(false)
  })

  it('keeps only mapped establishments inside the boundary, without inferring missing sites', async () => {
    const boundary = parseRadarOsmBoundary(feature, selector)
    const firstPass: Array<{ type: string; id: number; lat?: number; lon?: number; refs?: number[]; tags: Record<string, string> }> = [
      { type: 'node', id: 10, lat: -23.3, lon: -51.2, tags: { amenity: 'clinic', name: 'Clínica A', phone: '4300000000' } },
      { type: 'node', id: 11, lat: -23.3, lon: -50.8, tags: { healthcare: 'clinic', name: 'Fora do município' } },
      { type: 'node', id: 12, lat: -23.3, lon: -51.2, tags: { shop: 'beauty', name: 'Outro segmento' } },
      { type: 'way', id: 20, refs: [100, 101, 102, 100], tags: { amenity: 'doctors', name: 'Consultório B', website: 'consultorio.example' } },
      { type: 'relation', id: 21, tags: { amenity: 'clinic', name: 'Relação não suportada' } },
    ]
    const secondPass: Array<{ type: string; id: number; lat: number; lon: number }> = [
      { type: 'node', id: 100, lat: -23.2, lon: -51.2 },
      { type: 'node', id: 101, lat: -23.2, lon: -51.1 },
      { type: 'node', id: 102, lat: -23.1, lon: -51.1 },
    ]
    const result = await collectRadarOsmPlaces(stream(firstPass), stream(secondPass), boundary)
    expect(result.places.map(place => place.name)).toEqual(['Clínica A', 'Consultório B'])
    expect(result.places[0]).toMatchObject({ website: null, sourceUrl: 'https://www.openstreetmap.org/node/10' })
    expect(result.places[1]).toMatchObject({ website: 'https://consultorio.example/', sourceUrl: 'https://www.openstreetmap.org/way/20' })
    expect(result.skippedRelations).toBe(1)
  })
})
