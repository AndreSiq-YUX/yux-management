import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  META_EMBEDDED_SIGNUP_ORIGIN,
  launchWhatsAppEmbeddedSignup,
  parseWhatsAppEmbeddedSignupMessage,
} from './whatsappEmbeddedSignup'

const signupConfig = {
  appId: '123456789012345',
  graphVersion: 'v25.0',
  configId: '234567890123456',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
}

afterEach(() => {
  vi.useRealTimers()
  delete window.FB
})

describe('WhatsApp Embedded Signup message parsing', () => {
  it('accepts a completed session only from the exact Meta origin', () => {
    expect(parseWhatsAppEmbeddedSignupMessage(META_EMBEDDED_SIGNUP_ORIGIN, JSON.stringify({
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'FINISH',
      data: { waba_id: '123456789012345', phone_number_id: '234567890123456' },
    }))).toEqual({
      event: 'FINISH',
      wabaId: '123456789012345',
      phoneNumberIds: ['234567890123456'],
    })
  })

  it('rejects lookalike origins, malformed payloads, and invalid asset ids', () => {
    const message = {
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'FINISH',
      data: { waba_id: '123456789012345', phone_number_id: 'phone-id' },
    }
    expect(parseWhatsAppEmbeddedSignupMessage('https://evilfacebook.com', message)).toBeNull()
    expect(parseWhatsAppEmbeddedSignupMessage('https://sub.facebook.com', message)).toBeNull()
    expect(parseWhatsAppEmbeddedSignupMessage(META_EMBEDDED_SIGNUP_ORIGIN, 'cb=opaque')).toBeNull()
    expect(parseWhatsAppEmbeddedSignupMessage(META_EMBEDDED_SIGNUP_ORIGIN, message)).toBeNull()
  })

  it('distinguishes cancel and error events without treating them as success', () => {
    expect(parseWhatsAppEmbeddedSignupMessage(META_EMBEDDED_SIGNUP_ORIGIN, {
      type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { current_step: 'PHONE' },
    })).toEqual({ event: 'CANCEL' })
    expect(parseWhatsAppEmbeddedSignupMessage(META_EMBEDDED_SIGNUP_ORIGIN, {
      type: 'WA_EMBEDDED_SIGNUP', event: 'ERROR', data: { error_message: 'private message' },
    })).toEqual({ event: 'ERROR' })
  })

  it('pairs the OAuth code with the exact-origin Embedded Signup completion event', async () => {
    const login = vi.fn((callback: (response: { status?: string; authResponse?: { code?: string } }) => void) => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://evilfacebook.com',
        data: JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '123456789012345', phone_number_id: '234567890123456' } }),
      }))
      window.dispatchEvent(new MessageEvent('message', {
        origin: META_EMBEDDED_SIGNUP_ORIGIN,
        data: JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '123456789012345', phone_number_id: '234567890123456' } }),
      }))
      callback({ status: 'connected', authResponse: { code: 'one-time-code' } })
    })
    const sdk = { init: vi.fn(), login }
    window.FB = sdk

    await expect(launchWhatsAppEmbeddedSignup(signupConfig)).resolves.toEqual({
      code: 'one-time-code',
      wabaId: '123456789012345',
      phoneNumberIds: ['234567890123456'],
    })
    expect(sdk.init).toHaveBeenCalledWith({ appId: signupConfig.appId, cookie: true, xfbml: false, version: signupConfig.graphVersion })
    expect(login).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      config_id: signupConfig.configId,
      response_type: 'code',
      override_default_response_type: true,
    }))
  })

  it('treats Meta cancellation as failure and removes the active listener', async () => {
    const login = vi.fn(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: META_EMBEDDED_SIGNUP_ORIGIN,
        data: JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { current_step: 'PHONE' } }),
      }))
    })
    window.FB = { init: vi.fn(), login }
    const removeListener = vi.spyOn(window, 'removeEventListener')

    await expect(launchWhatsAppEmbeddedSignup(signupConfig)).rejects.toThrow('whatsapp_embedded_signup_cancelled')
    expect(removeListener).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('expires an incomplete Embedded Signup without reporting success', async () => {
    vi.useFakeTimers()
    window.FB = { init: vi.fn(), login: vi.fn() }
    const pending = launchWhatsAppEmbeddedSignup({ ...signupConfig, expiresAt: new Date(Date.now() + 1_000).toISOString() })
    const failure = expect(pending).rejects.toThrow('whatsapp_embedded_signup_expired')
    await vi.advanceTimersByTimeAsync(1_000)
    await failure
  })
})
