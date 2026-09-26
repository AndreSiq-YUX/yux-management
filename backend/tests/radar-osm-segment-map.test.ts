import { describe, expect, it } from 'vitest'
import { matchRadarOsmSegment, resolveRadarOsmSegment } from '../src/modules/radar/osm-segment-map.js'

describe('Radar OSM segment map', () => {
  it('recognizes medical clinics without treating unrelated businesses as clinics', () => {
    expect(resolveRadarOsmSegment('Clinicas médicas')).toBe('medical_clinics')
    expect(resolveRadarOsmSegment('Consultórios médicos')).toBe('medical_clinics')
    expect(resolveRadarOsmSegment('Revendas de carros')).toBeNull()
    expect(matchRadarOsmSegment({ amenity: 'clinic' }, 'medical_clinics')).toBe(true)
    expect(matchRadarOsmSegment({ healthcare: 'clinic' }, 'medical_clinics')).toBe(true)
    expect(matchRadarOsmSegment({ amenity: 'doctors' }, 'medical_clinics')).toBe(true)
    expect(matchRadarOsmSegment({ amenity: 'dentist' }, 'medical_clinics')).toBe(false)
  })
})
