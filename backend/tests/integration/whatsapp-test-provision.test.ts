import { afterEach, expect, it, vi } from 'vitest'
import { createIntegrationRig } from './support/rig.js'

const phoneNumberId = '345678901234567'
const wabaId = '234567890123456'
const previousKey = process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64
afterEach(() => { vi.unstubAllGlobals(); if (previousKey === undefined) delete process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64; else process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = previousKey })

it('provisiona o número de homologação somente para administrador interno e organização/número autorizados, sem retornar token', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub', metaOAuth: true, metaTestPhoneNumberId: phoneNumberId })
  process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = Buffer.alloc(32, 7).toString('base64')
  let valid = false
  let connectionId: string | undefined
  const network: Array<{ path: string; method: string }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    network.push({ path, method: init?.method || 'GET' })
    const body = path.endsWith('/debug_token') ? { data: { is_valid: valid, app_id: '123456789012345', scopes: ['whatsapp_business_messaging', 'whatsapp_business_management'], expires_at: Math.floor(Date.now() / 1000) + 3600 } }
      : path.endsWith('/phone_numbers') ? { data: [{ id: phoneNumberId, display_phone_number: '+1 555 123 4567', verified_name: 'Test Number' }] }
        : path.endsWith('/subscribed_apps') ? { data: [{ whatsapp_business_api_data: { id: '123456789012345' } }] } : { id: wabaId }
    return new Response(JSON.stringify(body), { status: 200 })
  }))
  const body = { organizationId: rig.ids.internalOrg, phoneNumberId, wabaId, accessToken: 'temporary-token-only-in-protected-request' }
  const provision = (payload = body, role: 'yux_admin' | 'client_admin_A' = 'yux_admin') =>
    rig.request(role, 'POST', '/api/functions/provision-whatsapp-test-number', { body: payload })
  try {
    expect((await provision(body, 'client_admin_A')).statusCode).toBe(403)
    expect((await provision({ ...body, organizationId: rig.ids.organizationA })).statusCode).toBe(403)
    expect((await provision({ ...body, phoneNumberId: '456789012345678' })).statusCode).toBe(403)
    expect(network).toHaveLength(0)
    expect((await provision()).statusCode).toBe(400)
    expect((await rig.sql(`SELECT id FROM public.channel_connections WHERE phone_number_id=$1`, [phoneNumberId])).rows).toHaveLength(0)
    valid = true
    const response = await provision()
    expect(response.statusCode).toBe(200)
    expect(response.body).toMatchObject({ state: 'connected', organizationId: rig.ids.internalOrg, phoneNumberId })
    expect(JSON.stringify(response.body)).not.toContain(body.accessToken)
    connectionId = response.body.id
    const stored = (await rig.sql(`SELECT ciphertext, expires_at FROM public.provider_integration_secrets WHERE connection_id=$1`, [connectionId])).rows[0]
    expect(stored.ciphertext).not.toContain(body.accessToken)
    expect(stored.expires_at).toBeTruthy()
    expect(network.every(call => call.method === 'GET')).toBe(true)
  } finally {
    if (connectionId) {
      await rig.sql(`DELETE FROM public.provider_integration_secrets WHERE connection_id=$1`, [connectionId])
      await rig.sql(`DELETE FROM public.channel_connections WHERE id=$1`, [connectionId])
    }
    await rig.close()
  }
})
