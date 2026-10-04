import { assertSmallBatchLimit } from './sourceRules.js'

export type RadarPlaceProvider = 'serper_places' | 'brave_place_search'

class RadarPlaceProviderError extends Error {
  readonly statusCode = 502
  constructor(readonly providerStatus: number, readonly invalidFields: string[] = []) {
    super(`radar_place_provider_http_${providerStatus}`)
  }
}

function getInvalidQueryFields(payload: unknown): string[] {
  const meta = asRecord(asRecord(asRecord(payload)?.error)?.meta)
  const allowed = new Set(['q', 'location', 'country', 'search_lang', 'ui_lang', 'count'])
  const errors = Array.isArray(meta?.errors) ? meta.errors : []
  return [...new Set(errors.flatMap(value => {
    const loc = asRecord(value)?.loc
    return Array.isArray(loc) && loc[0] === 'query' && typeof loc[1] === 'string' && allowed.has(loc[1])
      ? [loc[1]] : []
  }))]
}

export type RadarPlacePreview = {
  provider: RadarPlaceProvider
  name: string
  address?: string
  websiteUrl?: string
  websiteStatus: 'unknown' | 'unverified'
  phone?: string
  email?: string
  instagramUrl?: string
  rating?: number
  reviewCount?: number
  sourceUrl?: string
  observedAt: string
  storagePolicy: 'transient_only'
}

export type RadarPlaceSearchInput = {
  provider: RadarPlaceProvider
  apiKey: string
  query: string
  city: string
  state: string
  limit: number
  fetchImpl?: typeof fetch
}

export async function searchRadarPlaces(input: RadarPlaceSearchInput): Promise<RadarPlacePreview[]> {
  assertSmallBatchLimit(input.limit)
  if (!input.apiKey.trim()) throw Object.assign(new Error('radar_place_api_key_missing'), { statusCode: 400 })
  if (!input.query.trim() || !input.city.trim() || !/^[A-Z]{2}$/.test(input.state.trim().toUpperCase())) {
    throw Object.assign(new Error('radar_place_search_requires_query_and_location'), { statusCode: 400 })
  }

  const request = input.provider === 'serper_places' ? buildSerperRequest(input) : buildBraveRequest(input)
  const response = await (input.fetchImpl ?? fetch)(request.url, { ...request.options, signal: AbortSignal.timeout(8000) })
  if (!response.ok) {
    const invalidFields = response.status === 422
      ? getInvalidQueryFields(await response.json().catch(() => null)) : []
    throw new RadarPlaceProviderError(response.status, invalidFields)
  }
  const payload: unknown = await response.json()
  const record = asRecord(payload)
  const items = input.provider === 'serper_places' ? record?.places : record?.results
  if (!Array.isArray(items)) return []
  const observedAt = new Date().toISOString()
  return items.slice(0, input.limit).map(item => normalizePlace(input.provider, item, observedAt))
    .filter((item): item is RadarPlacePreview => item !== null)
}

export async function testRadarPlaceProvider(provider: RadarPlaceProvider, apiKey: string | null,
  fetchImpl?: typeof fetch): Promise<{ ok: boolean; message: string }> {
  if (!apiKey) return { ok: false, message: 'API key não está salva no servidor.' }
  try {
    await searchRadarPlaces({ provider, apiKey, query: 'empresa', city: 'Curitiba', state: 'PR', limit: 1, fetchImpl })
    return { ok: true, message: 'Conexão validada. O teste consumiu uma consulta do provedor.' }
  } catch (error) {
    const detail = error instanceof RadarPlaceProviderError && error.invalidFields.length
      ? ` Parâmetros inválidos: ${error.invalidFields.join(', ')}.` : ''
    return { ok: false, message: error instanceof RadarPlaceProviderError
      ? `Provedor retornou HTTP ${error.providerStatus}.${detail}` : 'Falha ao consultar o provedor.' }
  }
}

function buildSerperRequest(input: RadarPlaceSearchInput) {
  return {
    url: 'https://google.serper.dev/places',
    options: {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-KEY': input.apiKey },
      body: JSON.stringify({ q: `${input.query.trim()} em ${input.city.trim()} ${input.state.trim().toUpperCase()} Brasil`,
        gl: 'br', hl: 'pt-br', num: input.limit }),
    } satisfies RequestInit,
  }
}

function buildBraveRequest(input: RadarPlaceSearchInput) {
  const url = new URL('https://api.search.brave.com/res/v1/local/place_search')
  // Brave's non-US location format is city + country; preserve the UF in the query.
  url.searchParams.set('q', `${input.query.trim()} ${input.city.trim()} ${input.state.trim().toUpperCase()} Brasil`)
  url.searchParams.set('location', `${input.city.trim()} Brazil`)
  url.searchParams.set('country', 'BR')
  url.searchParams.set('search_lang', 'pt-br')
  url.searchParams.set('ui_lang', 'pt-BR')
  url.searchParams.set('count', String(input.limit))
  return {
    url: url.toString(),
    options: { headers: { Accept: 'application/json', 'X-Subscription-Token': input.apiKey } } satisfies RequestInit,
  }
}

function normalizePlace(provider: RadarPlaceProvider, value: unknown, observedAt: string): RadarPlacePreview | null {
  const place = asRecord(value)
  const name = text(place?.title)
  if (!name) return null
  const address = asRecord(place?.postal_address)
  const contact = asRecord(place?.contact)
  const rating = asRecord(place?.rating)
  const profiles = Array.isArray(place?.profiles) ? place.profiles : []
  const instagram = profiles.map(asRecord).find(profile =>
    text(profile?.name)?.toLowerCase().includes('instagram') || safeUrl(profile?.url)?.includes('instagram.com/'))
  const websiteUrl = safeUrl(provider === 'serper_places' ? place?.website : place?.url)
  return {
    provider,
    name,
    address: text(provider === 'serper_places' ? place?.address : address?.displayAddress),
    websiteUrl,
    websiteStatus: websiteUrl ? 'unverified' : 'unknown',
    phone: text(provider === 'serper_places' ? place?.phoneNumber : contact?.telephone),
    email: text(contact?.email),
    instagramUrl: safeUrl(instagram?.url),
    rating: number(provider === 'serper_places' ? place?.rating : rating?.ratingValue),
    reviewCount: number(provider === 'serper_places' ? place?.ratingCount : rating?.reviewCount),
    sourceUrl: safeUrl(provider === 'serper_places' ? place?.link : place?.provider_url),
    observedAt,
    storagePolicy: 'transient_only',
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function safeUrl(value: unknown) {
  const raw = text(value)
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}
