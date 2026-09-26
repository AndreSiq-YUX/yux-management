export const RADAR_OSM_SEGMENT_MAP_VERSION = '1.0.0'

export type RadarOsmSegmentKey = 'medical_clinics'

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export function resolveRadarOsmSegment(segment: string): RadarOsmSegmentKey | null {
  const normalized = normalizeText(segment)
  if (/\b(clinica|clinicas|consultorio|consultorios)\b/.test(normalized)
    && /\b(medic|medico|medica|medicos|medicas|saude)\b/.test(normalized)) {
    return 'medical_clinics'
  }
  return null
}

export function matchRadarOsmSegment(tags: Record<string, string>, segmentKey: RadarOsmSegmentKey): boolean {
  if (segmentKey !== 'medical_clinics') return false
  return tags.amenity === 'clinic'
    || tags.amenity === 'doctors'
    || tags.healthcare === 'clinic'
    || tags.healthcare === 'doctor'
    || tags.healthcare === 'doctors'
}
