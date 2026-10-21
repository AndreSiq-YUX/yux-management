import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { upsertVerifiedWhatsAppConnection } from '../src/modules/omnichannel/whatsapp-connections.js'

type QueryCall = { sql: string; params?: unknown[] }

class FakeClient {
  readonly calls: QueryCall[] = []
  released = false

  constructor(
    private readonly options: {
      active?: Array<{ id: string; organization_id: string }>
      existing?: Array<{
        id: string
        assistant_id?: string | null
        team_id?: string | null
        queue_id?: string | null
        response_mode_override?: 'automatic' | 'assisted' | 'manual' | null
      }>
      binding?: { assistant_ok: boolean; team_ok: boolean; queue_ok: boolean }
      insertError?: unknown
    } = {},
  ) {}

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    this.calls.push({ sql, params })
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] as T[] }
    if (sql.includes('FROM public.ai_assistants')) {
      return { rows: [this.options.binding || { assistant_ok: true, team_ok: true, queue_ok: true }] as T[] }
    }
    if (sql.includes('phone_number_id = $1 AND is_active = TRUE')) {
      return { rows: (this.options.active || []) as T[] }
    }
    if (sql.includes("organization_id = $1 AND channel = 'whatsapp'")) {
      return { rows: (this.options.existing || []) as T[] }
    }
    if (sql.includes('INSERT INTO public.channel_connections')) {
      if (this.options.insertError) throw this.options.insertError
      return { rows: [{ id: 'connection-new' }] as T[] }
    }
    if (sql.includes('INSERT INTO public.provider_integration_secrets')) {
      return { rows: [{ reference: 'meta_social:publishing:channel_connections:connection-new:access_token', expires_at: null, metadata: {} }] as T[] }
    }
    return { rows: [] as T[] }
  }

  release() {
    this.released = true
  }
}

class FakePool {
  readonly clients: FakeClient[] = []

  constructor(private readonly options: ConstructorParameters<typeof FakeClient>[0] = {}) {}

  async connect() {
    const client = new FakeClient(this.options)
    this.clients.push(client)
    return client
  }
}

const baseInput = {
  organizationId: 'org-a',
  userId: 'user-a',
  wabaId: 'waba-a',
  phoneNumberId: 'phone-a',
  displayPhoneNumber: '+55 43 99999-0000',
  accessToken: 'token-only-for-this-test',
  expiresAt: null,
}

const previousEncryptionKey = process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64

beforeEach(() => {
  process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = Buffer.alloc(32, 7).toString('base64')
})

afterEach(() => {
  if (previousEncryptionKey === undefined) delete process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64
  else process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = previousEncryptionKey
})

describe('upsertVerifiedWhatsAppConnection', () => {
  it('persists a verified number and returns no credential material', async () => {
    const pool = new FakePool()
    const result = await upsertVerifiedWhatsAppConnection(pool as never, baseInput)

    expect(result).toEqual({
      id: 'connection-new',
      organizationId: 'org-a',
      phoneNumberId: 'phone-a',
      state: 'connected',
    })
    expect(result).not.toHaveProperty('accessToken')
    expect(pool.clients[0].calls.some(call => call.sql.includes('INSERT INTO public.provider_integration_secrets'))).toBe(true)
    expect(pool.clients[0].calls.some(call => call.sql === 'COMMIT')).toBe(true)
    expect(pool.clients[0].calls.some(call => JSON.stringify(call.params).includes(baseInput.accessToken))).toBe(false)
  })

  it('rejects a binding that belongs to another organization before storing the number', async () => {
    const pool = new FakePool({ binding: { assistant_ok: false, team_ok: true, queue_ok: true } })

    await expect(upsertVerifiedWhatsAppConnection(pool as never, {
      ...baseInput,
      assistantId: '00000000-0000-4000-8000-000000000001',
    })).rejects.toMatchObject({
      message: 'whatsapp_connection_binding_organization_mismatch',
      statusCode: 400,
    })

    expect(pool.clients[0].calls.some(call => call.sql.includes('INSERT INTO public.channel_connections'))).toBe(false)
    expect(pool.clients[0].calls.some(call => call.sql === 'ROLLBACK')).toBe(true)
  })

  it('reconnects the same number for the same organization without inserting a duplicate', async () => {
    const pool = new FakePool({
      active: [{ id: 'connection-old', organization_id: 'org-a' }],
      existing: [{ id: 'connection-old' }],
    })

    const result = await upsertVerifiedWhatsAppConnection(pool as never, baseInput)

    expect(result.id).toBe('connection-old')
    expect(pool.clients[0].calls.some(call => call.sql.includes('INSERT INTO public.channel_connections'))).toBe(false)
    expect(pool.clients[0].calls.some(call => call.sql.includes('UPDATE public.channel_connections'))).toBe(true)
  })

  it('preserves each selected binding when reconnecting the targeted number', async () => {
    const pool = new FakePool({
      active: [{ id: 'connection-a1', organization_id: 'org-a' }],
      existing: [{
        id: 'connection-a1',
        assistant_id: 'assistant-a1',
        team_id: 'team-a1',
        queue_id: 'queue-a1',
        response_mode_override: 'assisted',
      }],
    })

    const result = await upsertVerifiedWhatsAppConnection(pool as never, {
      ...baseInput,
      expectedConnectionId: 'connection-a1',
    })
    const update = pool.clients[0].calls.find(call => call.sql.includes('UPDATE public.channel_connections'))

    expect(result.id).toBe('connection-a1')
    expect(update?.params?.slice(7, 11)).toEqual(['assistant-a1', 'team-a1', 'queue-a1', 'assisted'])
  })

  it('rejects an active number owned by another organization', async () => {
    const pool = new FakePool({ active: [{ id: 'connection-b', organization_id: 'org-b' }] })

    await expect(upsertVerifiedWhatsAppConnection(pool as never, baseInput)).rejects.toMatchObject({
      message: 'whatsapp_phone_number_already_connected',
      statusCode: 409,
    })
    expect(pool.clients[0].calls.some(call => call.sql.includes('INSERT INTO public.provider_integration_secrets'))).toBe(false)
  })

  it('turns a concurrent unique-index race into a tenant-safe conflict', async () => {
    const pool = new FakePool({
      insertError: { code: '23505', constraint: 'channel_connections_active_whatsapp_phone_unique' },
    })

    await expect(upsertVerifiedWhatsAppConnection(pool as never, baseInput)).rejects.toMatchObject({
      message: 'whatsapp_phone_number_already_connected',
      statusCode: 409,
    })
  })
})

describe('WhatsApp SaaS migration', () => {
  it('fails on active duplicates before installing the unique Phone Number ID index', () => {
    const migration = readFileSync(resolve(process.cwd(), 'src/db/migrations/0174_whatsapp_saas_connections.sql'), 'utf8')
    expect(migration).toContain('whatsapp_active_phone_number_conflict')
    expect(migration).toContain('channel_connections_active_whatsapp_phone_unique')
    expect(migration.indexOf('whatsapp_active_phone_number_conflict')).toBeLessThan(
      migration.indexOf('channel_connections_active_whatsapp_phone_unique'),
    )
    expect(migration).toContain('assistant_id UUID')
    expect(migration).toContain('response_mode_override')
    expect(migration).toContain('provider_integration_secrets_api_tenant_access')
    expect(migration).toContain("current_setting('app.service_role', true) = 'api'")
  })
})
