export class ApiClientError extends Error {
  status: number
  statusText: string
  body: unknown

  constructor(response: Response, body: unknown) {
    super(extractErrorMessage(body) || response.statusText || 'API request failed')
    this.name = 'ApiClientError'
    this.status = response.status
    this.statusText = response.statusText
    this.body = body
  }
}

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || '/api')

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '') || '/api'
}

function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}

function extractErrorMessage(body: unknown) {
  if (!body || typeof body !== 'object') return null
  const value = body as { error?: unknown; message?: unknown }

  if (typeof value.message === 'string') return value.message
  if (typeof value.error === 'string') return value.error
  if (value.error && typeof value.error === 'object') {
    const error = value.error as { message?: unknown; code?: unknown }
    if (typeof error.message === 'string') return error.message
    if (typeof error.code === 'string') return error.code
  }

  return null
}

async function readJson(response: Response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  let body: BodyInit | undefined

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers,
    body,
    credentials: 'include',
  })
  const responseBody = await readJson(response)

  if (!response.ok) {
    throw new ApiClientError(response, responseBody)
  }

  return responseBody as T
}
