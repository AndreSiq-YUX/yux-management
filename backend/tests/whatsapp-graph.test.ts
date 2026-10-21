import { describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../src/config/env.js'
import {
  ensureWhatsAppPhoneRegistered,
  ensureWhatsAppWabaSubscribed,
  exchangeWhatsAppSignupCode,
  verifyWhatsAppSignupAssets,
} from '../src/lib/whatsapp-graph.js'

const env = loadEnv({
  DATABASE_URL: 'postgres://localhost/yux_test',
  SESSION_SECRET: 'test-session-secret-that-is-long-enough',
  META_GRAPH_VERSION: 'v25.0',
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('WhatsApp Graph onboarding', () => {
  it('exchanges the Embedded Signup code on the configured Graph version', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => json({ access_token: 'server-only-token', expires_in: 3600 }))
    const token = await exchangeWhatsAppSignupCode({
      env,
      code: 'one-time-code',
      redirectUri: 'https://hub.yux.com.br/oauth/meta/callback',
      appId: '123456789012345',
      appSecret: 'private-app-secret',
      fetcher: fetcher as typeof fetch,
    })

    const requestUrl = new URL(String(fetcher.mock.calls[0]![0]))
    expect(requestUrl.pathname).toBe('/v25.0/oauth/access_token')
    expect(requestUrl.searchParams.get('code')).toBe('one-time-code')
    expect(requestUrl.searchParams.get('client_secret')).toBe('private-app-secret')
    expect(fetcher.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal)
    expect(token).toMatchObject({ accessToken: 'server-only-token' })
    expect(token.expiresAt).toBeTruthy()
  })

  it('persists only phone numbers actually returned under the authorized WABA', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = []
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), authorization: new Headers(init?.headers).get('Authorization') })
      return String(url).includes('/phone_numbers')
        ? json({ data: [{ id: '234567890123456', display_phone_number: '+55 43 99917-3440', verified_name: 'YUX' }] })
        : json({ id: '123456789012345' })
    })

    const phones = await verifyWhatsAppSignupAssets({
      env,
      accessToken: 'server-only-token',
      wabaId: '123456789012345',
      phoneNumberIds: ['234567890123456'],
      fetcher: fetcher as typeof fetch,
    })

    expect(phones).toEqual([{
      id: '234567890123456',
      displayPhoneNumber: '+55 43 99917-3440',
      verifiedName: 'YUX',
    }])
    expect(calls).toHaveLength(2)
    expect(calls.every(call => call.authorization === 'Bearer server-only-token')).toBe(true)
    expect(calls.every(call => !call.url.includes('server-only-token'))).toBe(true)
    expect(fetcher.mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(true)
  })

  it('rejects a phone number not returned by the WABA', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes('/phone_numbers')
      ? json({ data: [{ id: '234567890123456', display_phone_number: '+55 43 99917-3440' }] })
      : json({ id: '123456789012345' }))

    await expect(verifyWhatsAppSignupAssets({
      env,
      accessToken: 'server-only-token',
      wabaId: '123456789012345',
      phoneNumberIds: ['345678901234567'],
      fetcher: fetcher as typeof fetch,
    })).rejects.toThrow('whatsapp_phone_number_not_authorized_for_waba')
  })

  it('does not repeat phone registration when Meta already reports CONNECTED', async () => {
    const fetcher = vi.fn(async () => json({ id: '234567890123456', status: 'CONNECTED' }))
    await ensureWhatsAppPhoneRegistered({
      env,
      accessToken: 'server-only-token',
      phoneNumberId: '234567890123456',
      registrationPin: '',
      fetcher: fetcher as typeof fetch,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('registers an unregistered phone with the user-provided two-step PIN', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ id: '234567890123456', status: 'PENDING' }))
      .mockResolvedValueOnce(json({ success: true }))
    await ensureWhatsAppPhoneRegistered({
      env,
      accessToken: 'server-only-token',
      phoneNumberId: '234567890123456',
      registrationPin: '123456',
      fetcher: fetcher as typeof fetch,
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1]![1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', pin: '123456' }),
    })
  })

  it('requests a PIN only after Meta confirms the phone is not yet connected', async () => {
    const fetcher = vi.fn(async () => json({ id: '234567890123456', status: 'PENDING' }))
    await expect(ensureWhatsAppPhoneRegistered({
      env,
      accessToken: 'server-only-token',
      phoneNumberId: '234567890123456',
      registrationPin: '',
      fetcher: fetcher as typeof fetch,
    })).rejects.toThrow('whatsapp_registration_pin_required')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('avoids repeating a WABA subscription that already exists', async () => {
    const fetcher = vi.fn(async () => json({ data: [{ whatsapp_business_api_data: { id: '123456789012345' } }] }))
    await ensureWhatsAppWabaSubscribed({
      env,
      accessToken: 'server-only-token',
      wabaId: '345678901234567',
      appId: '123456789012345',
      fetcher: fetcher as typeof fetch,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
