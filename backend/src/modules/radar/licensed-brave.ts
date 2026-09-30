import type { RadarPlacePreview } from './place-providers.js'

export type LicensedBraveConfig = Record<string, unknown>

export function assertLicensedBraveRetention(config: LicensedBraveConfig) {
  if (config.retentionLicensed !== true || config.credentialPurpose !== 'licensed_retention'
    || typeof config.licenseReference !== 'string' || !config.licenseReference.trim()) {
    throw Object.assign(new Error('radar_brave_retention_license_required'), { statusCode: 409 })
  }
}

export function selectBraveBusinessMatch(
  candidate: { name: string; city: string; state: string },
  places: RadarPlacePreview[],
): RadarPlacePreview | null {
  const normalizedName = normalizeBusinessName(candidate.name)
  const matches = places.filter(place => {
    if (!place.sourceUrl || !place.address || normalizeBusinessName(place.name) !== normalizedName) return false
    return bravePlaceMatchesLocation(candidate.city, candidate.state, place.address)
  })
  return matches.length === 1 ? matches[0] : null
}

function normalizeBusinessName(value: string) {
  return normalize(value).replace(/\b(?:ltda|eireli|s a|sa|me|epp)\b/g, '').replace(/\s+/g, ' ').trim()
}

export function bravePlaceMatchesLocation(city: string, state: string, address: string) {
  const stateNames: Record<string, string> = { MG: 'minas gerais', SP: 'sao paulo', PR: 'parana' }
  const normalizedCity = normalize(city)
  const normalizedAddress = normalize(address)
  const uf = state.toUpperCase()
  if (!normalizedCity || !stateNames[uf] || !normalizedAddress.includes(normalizedCity)) return false
  const region = normalizedAddress.slice(normalizedAddress.lastIndexOf(normalizedCity) + normalizedCity.length).trim()
  return region.split(' ').includes(uf.toLowerCase())
    || (normalizedCity !== stateNames[uf] && region.includes(stateNames[uf]))
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim()
}
