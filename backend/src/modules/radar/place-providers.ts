import { assertSmallBatchLimit } from './sourceRules.js'

export type RadarPlaceProvider = 'serper_places' | 'brave_place_search'

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
    throw Object.assign(new Error(`radar_place_provider_http_${response.status}`), { statusCode: 502 })
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
    const match = error instanceof Error ? /^radar_place_provider_http_(\d+)$/.exec(error.message) : null
    return { ok: false, message: match ? `Provedor retornou HTTP ${match[1]}.` : 'Falha ao consultar o provedor.' }
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
  url.searchParams.set('q', input.query.trim())
  url.searchParams.set('location', `${input.city.trim()} ${input.state.trim().toUpperCase()} Brazil`)
  url.searchParams.set('country', 'BR')
  url.searchParams.set('search_lang', 'pt')
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
