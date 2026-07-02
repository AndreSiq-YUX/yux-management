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
  city?: string
  state?: string
  email?: string
  phone?: string
  openingDate?: string
  sourceUrl?: string
  rawPayload: Record<string, unknown>
}

const DEFAULT_CONFIG: Required<CnpjaProviderConfig> = {
  baseUrl: 'https://api.cnpja.com',
  advancedSearchPath: '/office/search',
  advancedSearchMethod: 'POST',
  officeLookupPath: '/office/:taxId',
  defaultStrategy: 'CACHE_IF_FRESH',
  maxAgeDays: 7,
  maxStaleDays: 30,
  defaultResultLimit: 10,
}

export async function searchCnpjaAdvanced(input: CnpjaAdvancedSearchInput) {
  if (!input.apiKey) throw Object.assign(new Error('cnpja_api_key_missing'), { statusCode: 400 })
  const config = resolveConfig(input.config)
  const limit = Math.min(Math.max(input.limit ?? config.defaultResultLimit, 1), 10)
  const url = buildAdvancedSearchUrl(config, input, limit)
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(url, {
    method: config.advancedSearchMethod,
    headers: {
      Accept: 'application/json',
      Authorization: input.apiKey,
      ...(config.advancedSearchMethod === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: config.advancedSearchMethod === 'POST' ? JSON.stringify(buildAdvancedSearchPayload(input, limit)) : undefined,
  })
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw Object.assign(new Error(extractCnpjaError(body) || `CNPJa retornou HTTP ${response.status}.`), {
      statusCode: response.status,
    })
  }

  return extractCnpjaItems(body)
    .map(normalizeCnpjaCandidate)
    .filter(candidate => candidate.taxId || candidate.tradeName || candidate.legalName)
    .slice(0, limit)
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
    candidate.openingDate ? `abertura ${candidate.openingDate}` : undefined,
    [candidate.city, candidate.state].filter(Boolean).join('/'),
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

function buildAdvancedSearchUrl(config: Required<CnpjaProviderConfig>, input: CnpjaAdvancedSearchInput, limit: number) {
  const path = config.advancedSearchPath.startsWith('/') ? config.advancedSearchPath : `/${config.advancedSearchPath}`
  const url = new URL(`${config.baseUrl}${path}`)
  url.searchParams.set('limit', String(limit))
  if (config.advancedSearchMethod === 'GET') {
    if (input.query) url.searchParams.set('query', input.query)
    if (input.city) url.searchParams.set('city', input.city)
    if (input.state) url.searchParams.set('state', input.state)
    if (input.openingFrom) url.searchParams.set('openingFrom', input.openingFrom)
    if (input.openingTo) url.searchParams.set('openingTo', input.openingTo)
    if (input.cnaes?.length) url.searchParams.set('cnaes', input.cnaes.join(','))
  }
  return url.toString()
}

function buildAdvancedSearchPayload(input: CnpjaAdvancedSearchInput, limit: number) {
  return {
    limit,
    offset: 0,
    query: input.query || undefined,
    filters: {
      address: {
        city: input.city || undefined,
        state: input.state || undefined,
      },
      openingDate: {
        from: input.openingFrom || undefined,
        to: input.openingTo || undefined,
      },
      mainActivity: input.cnaes?.length ? { ids: input.cnaes.map(value => value.replace(/\D/g, '')).filter(Boolean) } : undefined,
      status: 'active',
    },
  }
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
  const phone = firstContact(phones)
  const cleanedTaxId = taxId ? taxId.replace(/\D/g, '') : undefined

  return {
    taxId: cleanedTaxId,
    legalName,
    tradeName,
    cnaeMain,
    city,
    state,
    email,
    phone,
    openingDate,
    sourceUrl: cleanedTaxId ? `https://cnpja.com/office/${cleanedTaxId}` : undefined,
    rawPayload: record,
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
