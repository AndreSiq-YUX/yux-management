export type CnpjaProviderConfig = {
  baseUrl?: string
  advancedSearchPath?: string
  advancedSearchMethod?: 'GET' | 'POST'
  officeLookupPath?: string
  defaultStrategy?: string
  maxAgeDays?: number
  maxStaleDays?: number
  defaultResultLimit?: number
}

export type CnpjaAdvancedSearchInput = {
  apiKey: string
  config?: CnpjaProviderConfig
  query?: string
  city?: string
  state?: string
  cnaes?: string[]
  includeSecondaryActivities?: boolean
  token?: string
  openingFrom?: string
  openingTo?: string
  limit?: number
  fetchImpl?: typeof fetch
}

export type CnpjaOfficeLookupInput = {
  apiKey: string
  config?: CnpjaProviderConfig
  taxId: string
  fetchImpl?: typeof fetch
}

export type CnpjaCandidate = {
  taxId?: string
  legalName?: string
  tradeName?: string
  cnaeMain?: string
  cnaes: string[]
  registrationStatus?: string
  address?: string
  city?: string
  state?: string
  email?: string
  phone?: string
  openingDate?: string
  websiteStatus: 'unknown'
  sourceUrl?: string
  rawPayload: Record<string, unknown>
}

const DEFAULT_CONFIG: Required<CnpjaProviderConfig> = {
  baseUrl: 'https://api.cnpja.com',
  advancedSearchPath: '/office',
  advancedSearchMethod: 'GET',
  officeLookupPath: '/office/:taxId',
  defaultStrategy: 'CACHE_IF_FRESH',
  maxAgeDays: 7,
  maxStaleDays: 30,
  defaultResultLimit: 10,
}

const municipalityCache = new Map<string, { expiresAt: number; items: Array<{ id: number; nome: string }> }>()

export async function searchCnpjaAdvanced(input: CnpjaAdvancedSearchInput) {
  return (await searchCnpjaAdvancedPage(input)).candidates
}

export async function searchCnpjaAdvancedPage(input: CnpjaAdvancedSearchInput): Promise<{ candidates: CnpjaCandidate[]; nextToken?: string }> {
  if (!input.apiKey) throw Object.assign(new Error('cnpja_api_key_missing'), { statusCode: 400 })
  if (input.token && !/^[\w-]{1,256}$/.test(input.token)) throw Object.assign(new Error('cnpja_invalid_page_token'), { statusCode: 400 })
  const config = resolveConfig(input.config)
  const limit = Math.min(Math.max(input.limit ?? config.defaultResultLimit, 1), 10)
  const fetchImpl = input.fetchImpl ?? fetch
  const municipalityCode = input.city && !input.token ? await resolveMunicipalityCode(input.city, input.state, fetchImpl, !input.fetchImpl) : undefined
  const url = buildAdvancedSearchUrl(config, input, limit, municipalityCode)
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: input.apiKey,
    },
  })
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw Object.assign(new Error(extractCnpjaError(body) || `CNPJa retornou HTTP ${response.status}.`), {
      statusCode: response.status,
    })
  }

  const candidates = extractCnpjaItems(body)
    .map(normalizeCnpjaCandidate)
    .filter(candidate => candidate.taxId || candidate.tradeName || candidate.legalName)
    .slice(0, limit)
  const record = isRecord(body) ? body : {}
  const next = stringValue(record.next) || stringValue(record.nextToken)
  return { candidates, nextToken: next && /^[\w-]{1,256}$/.test(next) ? next : undefined }
}

export async function lookupCnpjaOffice(input: CnpjaOfficeLookupInput) {
  if (!input.apiKey) throw Object.assign(new Error('cnpja_api_key_missing'), { statusCode: 400 })
  const config = resolveConfig(input.config)
  const fetchImpl = input.fetchImpl ?? fetch
  const taxId = input.taxId.replace(/\D/g, '')
  const path = config.officeLookupPath.replace(':taxId', taxId)
  const url = new URL(`${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`)
  url.searchParams.set('strategy', config.defaultStrategy)
  url.searchParams.set('maxAge', String(config.maxAgeDays))
  url.searchParams.set('maxStale', String(config.maxStaleDays))
  url.searchParams.set('sync', 'false')

  const response = await fetchImpl(url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: input.apiKey,
    },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw Object.assign(new Error(extractCnpjaError(body) || `CNPJa retornou HTTP ${response.status}.`), {
      statusCode: response.status,
    })
  }
  return body
}

export async function testCnpjaProvider(apiKey?: string | null, config?: CnpjaProviderConfig, fetchImpl?: typeof fetch) {
  if (!apiKey) {
    return {
      ok: false,
      message: 'Credencial CNPJa nao esta disponivel no backend.',
    }
  }

  try {
    await lookupCnpjaOffice({ apiKey, config, taxId: '37335118000180', fetchImpl })
    return {
      ok: true,
      message: 'Conexao validada pela API do CNPJa.',
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Nao foi possivel conectar ao CNPJa.',
    }
  }
}

export function buildCnpjaCandidateSnippet(candidate: CnpjaCandidate) {
  return [
    candidate.taxId ? `CNPJ ${candidate.taxId}` : undefined,
    candidate.registrationStatus,
    candidate.openingDate ? `abertura ${candidate.openingDate}` : undefined,
    candidate.address || [candidate.city, candidate.state].filter(Boolean).join('/'),
    candidate.cnaeMain,
  ].filter(Boolean).join(' - ')
}

function resolveConfig(config?: CnpjaProviderConfig) {
  return {
    baseUrl: config?.baseUrl || DEFAULT_CONFIG.baseUrl,
    advancedSearchPath: config?.advancedSearchPath || DEFAULT_CONFIG.advancedSearchPath,
    advancedSearchMethod: config?.advancedSearchMethod || DEFAULT_CONFIG.advancedSearchMethod,
    officeLookupPath: config?.officeLookupPath || DEFAULT_CONFIG.officeLookupPath,
    defaultStrategy: config?.defaultStrategy || DEFAULT_CONFIG.defaultStrategy,
    maxAgeDays: config?.maxAgeDays ?? DEFAULT_CONFIG.maxAgeDays,
    maxStaleDays: config?.maxStaleDays ?? DEFAULT_CONFIG.maxStaleDays,
    defaultResultLimit: config?.defaultResultLimit ?? DEFAULT_CONFIG.defaultResultLimit,
  } satisfies Required<CnpjaProviderConfig>
}

function buildAdvancedSearchUrl(config: Required<CnpjaProviderConfig>, input: CnpjaAdvancedSearchInput, limit: number, municipalityCode?: number) {
  // The official CNPJá search contract is GET /office with flat, dotted query keys.
  // Ignore legacy provider path/method settings that pointed to the nonexistent POST /office/search.
  const path = '/office'
  const url = new URL(`${config.baseUrl}${path}`)
  url.searchParams.set('limit', String(limit))
  if (input.token) {
    url.searchParams.set('token', input.token)
    return url.toString()
  }
  url.searchParams.set('status.id.in', '2')
  if (input.query?.trim()) url.searchParams.set('names.in', input.query.trim())
  if (municipalityCode) url.searchParams.set('address.municipality.in', String(municipalityCode))
  if (input.state?.trim()) url.searchParams.set('address.state.in', input.state.trim().toUpperCase())
  if (input.openingFrom) url.searchParams.set('founded.gte', input.openingFrom)
  if (input.openingTo) url.searchParams.set('founded.lte', input.openingTo)
  const cnaes = input.cnaes?.map(value => value.replace(/\D/g, '')).filter(Boolean)
  if (cnaes?.length) url.searchParams.set(input.includeSecondaryActivities ? 'activities.id.in' : 'mainActivity.id.in', cnaes.join(','))
  return url.toString()
}

async function resolveMunicipalityCode(city: string, state: string | undefined, fetchImpl: typeof fetch, useCache: boolean) {
  const uf = state?.trim().toUpperCase()
  if (!uf || !/^[A-Z]{2}$/.test(uf)) throw new Error('cnpja_city_requires_state')
  let cached = useCache ? municipalityCache.get(uf) : undefined
  if (!cached || cached.expiresAt < Date.now()) {
    const response = await fetchImpl(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('cnpja_municipality_lookup_failed')
    const body: unknown = await response.json().catch(() => null)
    if (!Array.isArray(body)) throw new Error('cnpja_municipality_lookup_failed')
    cached = {
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      items: body.filter((item): item is { id: number; nome: string } =>
        isRecord(item) && typeof item.id === 'number' && typeof item.nome === 'string'),
    }
    if (useCache) municipalityCache.set(uf, cached)
  }
  const normalized = normalizeCity(city)
  const matches = cached.items.filter(item => normalizeCity(item.nome) === normalized)
  if (matches.length !== 1) throw new Error('cnpja_municipality_not_found')
  return matches[0].id
}

function normalizeCity(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')
}

function extractCnpjaItems(body: unknown): unknown[] {
  if (Array.isArray(body)) return body
  if (!isRecord(body)) return []
  const candidates = [body.data, body.results, body.items, body.offices, body.records]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
    if (isRecord(candidate)) {
      const nested = [candidate.data, candidate.results, candidate.items, candidate.offices]
      const array = nested.find(Array.isArray)
      if (Array.isArray(array)) return array
    }
  }
  return []
}

function normalizeCnpjaCandidate(value: unknown): CnpjaCandidate {
  const record = isRecord(value) ? value : {}
  const company = objectValue(record.company) ?? {}
  const address = objectValue(record.address) ?? {}
  const mainActivity = objectValue(record.mainActivity) || objectValue(record.main_activity) || {}
  const phones = arrayValue(record.phones) || arrayValue(record.phone) || arrayValue(record.telephones)
  const emails = arrayValue(record.emails) || arrayValue(record.email)

  const taxId = stringValue(record.taxId) || stringValue(record.tax_id) || stringValue(record.cnpj)
  const legalName = stringValue(company.name) || stringValue(record.companyName) || stringValue(record.legalName) || stringValue(record.name)
  const tradeName = stringValue(record.alias) || stringValue(record.tradeName) || stringValue(record.fantasyName) || legalName
  const city = stringValue(address.city) || stringValue(record.city)
  const state = stringValue(address.state) || stringValue(address.uf) || stringValue(record.state) || stringValue(record.uf)
  const cnaeMain = stringValue(mainActivity.text) || stringValue(mainActivity.description) || stringValue(mainActivity.id) || stringValue(record.cnae)
  const openingDate = stringValue(record.founded) || stringValue(record.openingDate) || stringValue(record.dataAbertura)
  const email = firstContact(emails)
  const phone = firstPhone(phones)
  const cleanedTaxId = taxId ? taxId.replace(/\D/g, '') : undefined
  const sideActivities = arrayValue(record.sideActivities) || arrayValue(record.secondaryActivities) || []
  const cnaes = [mainActivity, ...sideActivities]
    .map(activity => objectValue(activity))
    .map(activity => stringValue(activity?.id) || stringValue(activity?.code))
    .filter((activity): activity is string => Boolean(activity))
  const status = objectValue(record.status)
  const registrationStatus = stringValue(status?.text) || stringValue(record.registrationStatus)
  const addressParts = [
    stringValue(address.street), stringValue(address.number), stringValue(address.district),
    [city, state].filter(Boolean).join('/'), stringValue(address.zip) || stringValue(address.zipCode),
  ].filter(Boolean)
  const formattedAddress = addressParts.join(', ') || undefined

  return {
    taxId: cleanedTaxId,
    legalName,
    tradeName,
    cnaeMain,
    cnaes,
    registrationStatus,
    address: formattedAddress,
    city,
    state,
    email,
    phone,
    openingDate,
    websiteStatus: 'unknown',
    sourceUrl: cleanedTaxId ? `https://cnpja.com/office/${cleanedTaxId}` : undefined,
    rawPayload: {
      taxId: cleanedTaxId, legalName, tradeName, cnaeMain, cnaes,
      registrationStatus, address: formattedAddress, city, state, email, phone,
      openingDate, websiteStatus: 'unknown',
    },
  }
}

function extractCnpjaError(body: unknown) {
  if (!isRecord(body)) return null
  const value = body as { error?: unknown; message?: unknown; errors?: unknown }
  if (typeof value.message === 'string') return value.message
  if (typeof value.error === 'string') return value.error
  if (Array.isArray(value.errors)) {
    const first = value.errors.find(item => typeof item === 'string' || isRecord(item))
    if (typeof first === 'string') return first
    if (isRecord(first) && typeof first.message === 'string') return first.message
  }
  return null
}

function firstContact(values?: unknown[]) {
  if (!values) return undefined
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (isRecord(value)) {
      const formatted = stringValue(value.value) || stringValue(value.address) || stringValue(value.number)
      if (formatted) return formatted
    }
  }
  return undefined
}

function firstPhone(values?: unknown[]) {
  if (!values) return undefined
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (isRecord(value)) {
      const number = stringValue(value.number)
      if (number) return `${stringValue(value.area) ?? ''}${number}`
    }
  }
  return undefined
}

function arrayValue(value: unknown) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) return [value]
  return undefined
}

function objectValue(value: unknown) {
  return isRecord(value) ? value : undefined
}

function stringValue(value: unknown) {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number') return String(value)
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
