import type { AppEnv } from '../config/env.js'

const graphVersionPattern = /^v\d+\.\d+$/
const metaIdPattern = /^\d{5,30}$/
const graphRequestTimeoutMs = 15_000

export type WhatsAppGraphPhone = {
  id: string
  displayPhoneNumber: string
  verifiedName: string | null
}

export type WhatsAppSignupToken = {
  accessToken: string
  expiresAt: string | null
}

export type WhatsAppHealthReport = {
  healthStatus: 'connected' | 'needs_reauth' | 'failed' | 'disconnected'
  summary: string
  expiresAt?: string | null
  checks: Record<'credential' | 'permissions' | 'phoneNumber' | 'subscription' | 'outbound' | 'inbound', 'passed' | 'failed' | 'not_checked'>
}

export async function inspectWhatsAppConnection(input: {
  env: AppEnv; accessToken: string; wabaId: string; phoneNumberId: string; fetcher?: typeof fetch
}): Promise<WhatsAppHealthReport> {
  const checks: WhatsAppHealthReport['checks'] = {
    credential: 'not_checked', permissions: 'not_checked', phoneNumber: 'not_checked', subscription: 'not_checked',
    outbound: 'not_checked', inbound: 'not_checked',
  }
  let stage: 'credential' | 'permissions' | 'phoneNumber' | 'subscription' = 'credential'
  const fetcher = input.fetcher || fetch
  try {
    const appId = assertMetaId(input.env.META_APP_ID, 'meta_app_id')
    const appSecret = required(input.env.META_APP_SECRET, 'meta_app_secret')
    const debug = await graphRequest(input.env, 'debug_token', `${appId}|${appSecret}`, {
      params: { input_token: input.accessToken },
    }, 'whatsapp_token_check_failed', fetcher)
    const data = debug.data && typeof debug.data === 'object' ? debug.data as Record<string, unknown> : {}
    const expiresAt = Number(data.expires_at)
    if (data.is_valid !== true || data.app_id !== appId || (expiresAt > 0 && expiresAt * 1000 <= Date.now())) {
      checks.credential = 'failed'
      return { healthStatus: 'needs_reauth', summary: 'A Meta não confirmou esta credencial. Reconecte o número.', checks }
    }
    checks.credential = 'passed'
    stage = 'permissions'
    const scopes = Array.isArray(data.scopes) ? data.scopes : []
    if (!['whatsapp_business_messaging', 'whatsapp_business_management'].every(scope => scopes.includes(scope))) {
      checks.permissions = 'failed'
      return { healthStatus: 'needs_reauth', summary: 'A credencial precisa das permissões de mensagens e gerenciamento do WhatsApp.', checks }
    }
    checks.permissions = 'passed'
    stage = 'phoneNumber'
    await verifyWhatsAppSignupAssets({ ...input, phoneNumberIds: [input.phoneNumberId], fetcher })
    checks.phoneNumber = 'passed'
    stage = 'subscription'
    const subscriptions = await graphRequest(input.env, `${assertMetaId(input.wabaId, 'waba_id')}/subscribed_apps`, input.accessToken, {
      params: { fields: 'whatsapp_business_api_data' },
    }, 'whatsapp_waba_subscription_check_failed', fetcher)
    const subscribed = Array.isArray(subscriptions.data) && subscriptions.data.some(item =>
      item && typeof item === 'object' && (item as { whatsapp_business_api_data?: { id?: string } }).whatsapp_business_api_data?.id === appId)
    checks.subscription = subscribed ? 'passed' : 'failed'
    return {
      healthStatus: subscribed ? 'connected' : 'failed',
      expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? new Date(expiresAt * 1000).toISOString() : null,
      summary: subscribed ? 'Credencial, permissões, número e inscrição confirmados na Meta. Envio e recebimento ainda precisam de teste real.'
        : 'O aplicativo ainda não está inscrito para receber eventos desta conta WhatsApp.',
      checks,
    }
  } catch (error) {
    checks[stage] = 'failed'
    const denied = error instanceof Error && (/(?:_400|_401|_403)$/.test(error.message)
      || error.message === 'whatsapp_phone_number_not_authorized_for_waba' || error.message === 'whatsapp_waba_not_authorized')
    return {
      healthStatus: denied ? 'needs_reauth' : 'failed',
      summary: denied ? 'A Meta não autorizou o acesso desta conexão. Reconecte o número.' : 'Não foi possível concluir a consulta à Meta. Confira a configuração do aplicativo e tente novamente.',
      checks,
    }
  }
}

function required(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}_required`)
  return value.trim()
}

function invalidOnboardingInput(code: string) {
  return Object.assign(new Error(code), { statusCode: 400 })
}

function assertMetaId(value: unknown, label: string) {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id) throw invalidOnboardingInput(`${label}_required`)
  if (!metaIdPattern.test(id)) throw invalidOnboardingInput(`${label}_invalid`)
  return id
}

function graphBaseUrl(env: AppEnv) {
  const value = env.META_GRAPH_BASE_URL || 'https://graph.facebook.com'
  const url = new URL(value)
  const localTestHttp = env.NODE_ENV === 'test'
    && url.protocol === 'http:'
    && ['127.0.0.1', 'localhost'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !localTestHttp) || url.username || url.password || url.search || url.hash) {
    throw new Error('meta_graph_base_url_invalid')
  }
  return url
}

function graphUrl(env: AppEnv, path: string, params?: Record<string, string>) {
  const version = env.META_GRAPH_VERSION || 'v25.0'
  if (!graphVersionPattern.test(version)) throw new Error('meta_graph_version_invalid')
  const base = graphBaseUrl(env)
  const prefix = base.pathname.replace(/\/+$/, '')
  const url = new URL(`${prefix}/${version}/${path.replace(/^\/+/, '')}`, base.origin)
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value)
  return url
}

async function responseBody(response: Response, failureCode: string) {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(`${failureCode}_${response.status}`)
  return payload
}

export async function exchangeWhatsAppSignupCode(input: {
  env: AppEnv
  code: string
  redirectUri: string
  appId: string
  appSecret: string
  fetcher?: typeof fetch
}): Promise<WhatsAppSignupToken> {
  const url = graphUrl(input.env, 'oauth/access_token', {
    client_id: required(input.appId, 'app_id'),
    client_secret: required(input.appSecret, 'app_secret'),
    code: required(input.code, 'oauth_code'),
    redirect_uri: required(input.redirectUri, 'redirect_uri'),
  })
  const response = await (input.fetcher || fetch)(url.toString(), {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(graphRequestTimeoutMs),
  })
  const payload = await responseBody(response, 'whatsapp_code_exchange_failed')
  const accessToken = required(payload.access_token, 'whatsapp_access_token')
  const expiresIn = Number(payload.expires_in)
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null
  return { accessToken, expiresAt }
}

async function graphRequest(
  env: AppEnv,
  path: string,
  accessToken: string,
  options: { method?: 'GET' | 'POST'; params?: Record<string, string>; body?: Record<string, unknown> },
  failureCode: string,
  fetcher: typeof fetch,
) {
  const response = await fetcher(graphUrl(env, path, options.params).toString(), {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${required(accessToken, 'whatsapp_access_token')}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(graphRequestTimeoutMs),
  })
  return responseBody(response, failureCode)
}

export async function verifyWhatsAppSignupAssets(input: {
  env: AppEnv
  accessToken: string
  wabaId: string
  phoneNumberIds: string[]
  fetcher?: typeof fetch
}): Promise<WhatsAppGraphPhone[]> {
  const wabaId = assertMetaId(input.wabaId, 'waba_id')
  const requestedIds = [...new Set(input.phoneNumberIds.map(id => assertMetaId(id, 'phone_number_id')))]
  if (requestedIds.length === 0 || requestedIds.length > 20) throw invalidOnboardingInput('whatsapp_phone_number_ids_invalid')
  const fetcher = input.fetcher || fetch

  const waba = await graphRequest(input.env, wabaId, input.accessToken, {
    params: { fields: 'id' },
  }, 'whatsapp_waba_verification_failed', fetcher)
  if (waba.id !== wabaId) throw invalidOnboardingInput('whatsapp_waba_not_authorized')

  const found = new Map<string, WhatsAppGraphPhone>()
  let after: string | undefined
  for (let page = 0; page < 20 && found.size < requestedIds.length; page += 1) {
    const payload = await graphRequest(input.env, `${wabaId}/phone_numbers`, input.accessToken, {
      params: {
        fields: 'id,display_phone_number,verified_name',
        limit: '100',
        ...(after ? { after } : {}),
      },
    }, 'whatsapp_phone_numbers_verification_failed', fetcher)
    const data = Array.isArray(payload.data) ? payload.data : []
    for (const item of data) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      if (typeof row.id !== 'string' || !requestedIds.includes(row.id)) continue
      if (typeof row.display_phone_number !== 'string' || !row.display_phone_number.trim()) {
        throw new Error('whatsapp_phone_number_metadata_missing')
      }
      found.set(row.id, {
        id: row.id,
        displayPhoneNumber: row.display_phone_number,
        verifiedName: typeof row.verified_name === 'string' ? row.verified_name : null,
      })
    }
    const paging = payload.paging && typeof payload.paging === 'object'
      ? payload.paging as Record<string, unknown>
      : {}
    const cursors = paging.cursors && typeof paging.cursors === 'object'
      ? paging.cursors as Record<string, unknown>
      : {}
    const next = typeof cursors.after === 'string' ? cursors.after : ''
    if (!next || next === after) break
    after = next
  }

  if (found.size !== requestedIds.length) throw invalidOnboardingInput('whatsapp_phone_number_not_authorized_for_waba')
  return requestedIds.map(id => found.get(id)!)
}

export async function ensureWhatsAppPhoneRegistered(input: {
  env: AppEnv
  accessToken: string
  phoneNumberId: string
  registrationPin: string
  fetcher?: typeof fetch
}) {
  const phoneNumberId = assertMetaId(input.phoneNumberId, 'phone_number_id')
  const fetcher = input.fetcher || fetch
  const current = await graphRequest(input.env, phoneNumberId, input.accessToken, {
    params: { fields: 'id,status' },
  }, 'whatsapp_phone_registration_check_failed', fetcher)
  if (current.id !== phoneNumberId) throw new Error('whatsapp_phone_registration_check_failed')
  if (typeof current.status === 'string' && current.status.toUpperCase() === 'CONNECTED') return

  const pin = typeof input.registrationPin === 'string' ? input.registrationPin.trim() : ''
  if (!pin) throw invalidOnboardingInput('whatsapp_registration_pin_required')
  if (!/^\d{6}$/.test(pin)) throw invalidOnboardingInput('whatsapp_registration_pin_invalid')

  const result = await graphRequest(input.env, `${phoneNumberId}/register`, input.accessToken, {
    method: 'POST',
    body: { messaging_product: 'whatsapp', pin },
  }, 'whatsapp_phone_registration_failed', fetcher)
  if (result.success !== true && result.success !== 'true') throw new Error('whatsapp_phone_registration_failed')
}

export async function ensureWhatsAppWabaSubscribed(input: {
  env: AppEnv
  accessToken: string
  wabaId: string
  appId: string
  fetcher?: typeof fetch
}) {
  const wabaId = assertMetaId(input.wabaId, 'waba_id')
  const appId = assertMetaId(input.appId, 'app_id')
  const fetcher = input.fetcher || fetch
  const subscriptions = await graphRequest(input.env, `${wabaId}/subscribed_apps`, input.accessToken, {
    params: { fields: 'whatsapp_business_api_data' },
  }, 'whatsapp_waba_subscription_check_failed', fetcher)
  const data = Array.isArray(subscriptions.data) ? subscriptions.data : []
  const subscribed = data.some(item => {
    if (!item || typeof item !== 'object') return false
    const row = item as Record<string, unknown>
    const app = row.whatsapp_business_api_data
    return Boolean(app && typeof app === 'object' && (app as Record<string, unknown>).id === appId)
  })
  if (subscribed) return

  const result = await graphRequest(input.env, `${wabaId}/subscribed_apps`, input.accessToken, {
    method: 'POST',
  }, 'whatsapp_waba_subscription_failed', fetcher)
  if (result.success !== true && result.success !== 'true') throw new Error('whatsapp_waba_subscription_failed')
}
