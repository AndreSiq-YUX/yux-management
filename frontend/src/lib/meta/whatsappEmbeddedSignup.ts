export const META_EMBEDDED_SIGNUP_ORIGIN = 'https://www.facebook.com'
const sdkScriptId = 'facebook-jssdk'

export type WhatsAppEmbeddedSignupResult = {
  code: string
  wabaId: string
  phoneNumberIds: string[]
}

type EmbeddedSignupMessage =
  | { event: 'FINISH'; wabaId: string; phoneNumberIds: string[] }
  | { event: 'CANCEL' }
  | { event: 'ERROR' }
  | null

type FacebookLoginResponse = {
  status?: string
  authResponse?: { code?: string }
}

type FacebookSdk = {
  init: (options: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: {
      config_id: string
      response_type: 'code'
      override_default_response_type: true
      extras: { sessionInfoVersion: '3'; setup: Record<string, never> }
    },
  ) => void
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

let sdkPromise: Promise<FacebookSdk> | undefined
let initializedConfig: string | undefined

function required(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}_missing`)
  return value.trim()
}

function readSignupPayload(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function parseWhatsAppEmbeddedSignupMessage(origin: string, value: unknown): EmbeddedSignupMessage {
  if (origin !== META_EMBEDDED_SIGNUP_ORIGIN) return null
  const message = readSignupPayload(value)
  if (message?.type !== 'WA_EMBEDDED_SIGNUP') return null
  if (message.event === 'CANCEL') return { event: 'CANCEL' }
  if (message.event === 'ERROR') return { event: 'ERROR' }
  if (message.event !== 'FINISH' || !message.data || typeof message.data !== 'object' || Array.isArray(message.data)) return null

  const data = message.data as Record<string, unknown>
  const wabaId = typeof data.waba_id === 'string' ? data.waba_id.trim() : ''
  const phoneNumberIds = Array.isArray(data.phone_number_ids)
    ? data.phone_number_ids.filter((id): id is string => typeof id === 'string').map(id => id.trim()).filter(Boolean)
    : typeof data.phone_number_id === 'string' && data.phone_number_id.trim()
      ? [data.phone_number_id.trim()]
      : []
  if (!/^\d{5,30}$/.test(wabaId) || phoneNumberIds.length === 0 || phoneNumberIds.some(id => !/^\d{5,30}$/.test(id))) return null
  return { event: 'FINISH', wabaId, phoneNumberIds: [...new Set(phoneNumberIds)] }
}

function initializeFacebookSdk(appId: string, graphVersion: string, sdk: FacebookSdk) {
  const key = `${appId}:${graphVersion}`
  if (initializedConfig && initializedConfig !== key) throw new Error('facebook_sdk_app_mismatch')
  if (!initializedConfig) {
    sdk.init({ appId, cookie: true, xfbml: false, version: graphVersion })
    initializedConfig = key
  }
  return sdk
}

export function preloadWhatsAppEmbeddedSignupSdk(appId: string, graphVersion: string) {
  const safeAppId = required(appId, 'meta_app_id')
  const safeVersion = required(graphVersion, 'meta_graph_version')
  if (!/^v\d+\.\d+$/.test(safeVersion)) throw new Error('meta_graph_version_invalid')

  if (window.FB) return Promise.resolve(initializeFacebookSdk(safeAppId, safeVersion, window.FB))
  if (!sdkPromise) {
    sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
      const scriptAlreadyExists = document.getElementById(sdkScriptId)
      const script = scriptAlreadyExists instanceof HTMLScriptElement
        ? scriptAlreadyExists
        : document.createElement('script')
      const timeout = window.setTimeout(() => reject(new Error('facebook_sdk_load_timeout')), 15_000)
      const settle = () => {
        window.clearTimeout(timeout)
        if (window.FB) resolve(window.FB)
        else reject(new Error('facebook_sdk_unavailable'))
      }
      script.addEventListener('load', settle, { once: true })
      script.addEventListener('error', () => {
        window.clearTimeout(timeout)
        reject(new Error('facebook_sdk_load_failed'))
      }, { once: true })
      window.fbAsyncInit = settle
      if (!scriptAlreadyExists) {
        script.id = sdkScriptId
        script.async = true
        script.defer = true
        script.src = 'https://connect.facebook.net/en_US/sdk.js'
        document.head.appendChild(script)
      }
    }).catch(error => {
      sdkPromise = undefined
      throw error
    })
  }
  return sdkPromise.then(sdk => initializeFacebookSdk(safeAppId, safeVersion, sdk))
}

export async function launchWhatsAppEmbeddedSignup(input: {
  appId: string
  graphVersion: string
  configId: string
  expiresAt: string
}): Promise<WhatsAppEmbeddedSignupResult> {
  const sdk = await preloadWhatsAppEmbeddedSignupSdk(input.appId, input.graphVersion)
  const configId = required(input.configId, 'meta_embedded_signup_config_id')
  const expiresAt = Date.parse(input.expiresAt)
  const timeoutMs = Math.max(1_000, Math.min(10 * 60_000, expiresAt - Date.now()))

  return new Promise((resolve, reject) => {
    let code: string | undefined
    let signup: Extract<EmbeddedSignupMessage, { event: 'FINISH' }> | undefined
    let settled = false

    const cleanup = () => {
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
    }
    const finish = () => {
      if (settled || !code || !signup) return
      settled = true
      cleanup()
      resolve({ code, wabaId: signup.wabaId, phoneNumberIds: signup.phoneNumberIds })
    }
    const fail = (reason: string) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(reason))
    }
    const onMessage = (event: MessageEvent) => {
      const message = parseWhatsAppEmbeddedSignupMessage(event.origin, event.data)
      if (!message) return
      if (message.event === 'CANCEL') return fail('whatsapp_embedded_signup_cancelled')
      if (message.event === 'ERROR') return fail('whatsapp_embedded_signup_failed')
      signup = message
      finish()
    }
    const timeout = window.setTimeout(() => fail('whatsapp_embedded_signup_expired'), timeoutMs)

    window.addEventListener('message', onMessage)
    try {
      sdk.login(response => {
        const responseCode = response.authResponse?.code
        if (response.status !== 'connected' || typeof responseCode !== 'string' || !responseCode.trim()) {
          return fail('whatsapp_embedded_signup_cancelled')
        }
        code = responseCode.trim()
        finish()
      }, {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { sessionInfoVersion: '3', setup: {} },
      })
    } catch {
      fail('whatsapp_embedded_signup_launch_failed')
    }
  })
}
