import { describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../src/config/env.js'
import { inspectWhatsAppConnection } from '../src/lib/whatsapp-graph.js'

const appId = '123456789012345'
const wabaId = '234567890123456'
const phoneNumberId = '345678901234567'
const env = loadEnv({ DATABASE_URL: 'postgresql://localhost/yux_test', SESSION_SECRET: 'test-session-secret-long-enough-for-health', META_APP_ID: appId, META_APP_SECRET: 'private-app-secret', META_GRAPH_VERSION: 'v25.0' })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function graph(options: { revoked?: boolean; missingPermission?: boolean; wrongApp?: boolean; missingPhone?: boolean; unsubscribed?: boolean; unavailable?: boolean } = {}) {
  return vi.fn(async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname
    if (options.unavailable) throw new Error('network failure with sensitive provider context')
    if (path.endsWith('/debug_token')) return json({ data: {
      is_valid: !options.revoked, app_id: options.wrongApp ? '999999999999999' : appId, expires_at: 0,
      scopes: options.missingPermission ? ['whatsapp_business_messaging'] : ['whatsapp_business_management', 'whatsapp_business_messaging'],
    } })
    if (path.endsWith('/phone_numbers')) return json({ data: options.missingPhone ? [] : [{ id: phoneNumberId, display_phone_number: '+1 555 123 4567' }] })
    if (path.endsWith('/subscribed_apps')) return json({ data: options.unsubscribed ? [] : [{ whatsapp_business_api_data: { id: appId } }] })
    return json({ id: wabaId })
  })
}

describe('diagnóstico remoto WhatsApp', () => {
  it('comprova token, permissões, número e inscrição sem declarar entrega ou retorno comprovados', async () => {
    const fetcher = graph()
    const result = await inspectWhatsAppConnection({ env, accessToken: 'private-channel-token', wabaId, phoneNumberId, fetcher: fetcher as typeof fetch })
    expect(result).toMatchObject({ healthStatus: 'connected', checks: {
      credential: 'passed', permissions: 'passed', phoneNumber: 'passed', subscription: 'passed', outbound: 'not_checked', inbound: 'not_checked',
    } })
    expect(JSON.stringify(result)).not.toMatch(/private-channel-token|private-app-secret/)
    expect(fetcher.mock.calls.some(([url]) => new URL(String(url)).pathname.endsWith('/debug_token'))).toBe(true)
  })

  it.each([
    { revoked: true }, { missingPermission: true }, { wrongApp: true }, { missingPhone: true },
  ])('exige reconexão quando a Meta nega credencial, permissão ou ativo: %j', async options => {
    const result = await inspectWhatsAppConnection({ env, accessToken: 'private-channel-token', wabaId, phoneNumberId, fetcher: graph(options) as typeof fetch })
    expect(result.healthStatus).toBe('needs_reauth')
    expect(Object.values(result.checks)).toContain('failed')
  })

  it('identifica WABA sem inscrição e não a inscreve durante diagnóstico', async () => {
    const result = await inspectWhatsAppConnection({ env, accessToken: 'private-channel-token', wabaId, phoneNumberId, fetcher: graph({ unsubscribed: true }) as typeof fetch })
    expect(result).toMatchObject({ healthStatus: 'failed', checks: { credential: 'passed', subscription: 'failed' } })
  })

  it('não trata indisponibilidade remota como validação nem expõe a exceção do provedor', async () => {
    const result = await inspectWhatsAppConnection({ env, accessToken: 'private-channel-token', wabaId, phoneNumberId, fetcher: graph({ unavailable: true }) as typeof fetch })
    expect(result.healthStatus).toBe('failed')
    expect(result.checks.credential).not.toBe('passed')
    expect(JSON.stringify(result)).not.toContain('sensitive provider context')
  })
})
