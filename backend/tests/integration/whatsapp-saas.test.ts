import { createHash, randomInt, randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterEach, expect, it, vi } from 'vitest'
import type { AppEnv } from '../../src/config/env.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { normalizeWhatsAppBatch, normalizeWhatsAppInbound } from '../../src/lib/edge-compat/whatsappProvider.js'
import { loadProviderSecretFromPool } from '../../src/lib/edge-compat/providerSecrets.js'
import { handleInboundMessage } from '../../src/jobs/handlers/omnichannel.js'
import { upsertVerifiedWhatsAppConnection } from '../../src/modules/omnichannel/whatsapp-connections.js'
import { createIntegrationRig } from './support/rig.js'
import { fixtureUsers } from './support/fixtures.js'

const testEncryptionKey = Buffer.alloc(32, 7).toString('base64')
const previousEncryptionKey = process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64

afterEach(() => {
  vi.unstubAllGlobals()
  if (previousEncryptionKey === undefined) delete process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64
  else process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = previousEncryptionKey
})

it('valida o Embedded Signup, recupera falha parcial sem reusar o code e consome state uma única vez', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub', metaOAuth: true })
  const suffix = String(randomInt(100_000, 999_999))
  const wabaId = `${Date.now()}${suffix}`
  const phoneNumberId = `${Date.now() - 1}${suffix}`
  const nonAuthorizedPhoneId = `${Date.now() - 2}${suffix}`
  const reconnectDifferentPhoneId = `${Date.now() - 3}${suffix}`
  const stateHashes: string[] = []
  const connectionIds: string[] = []
  process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = testEncryptionKey
  let listAuthorizedPhone = false
  let authorizedPhoneId = phoneNumberId
  let phoneStatus = 'PENDING'
  const graphCalls: Array<{ path: string; method: string }> = []
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method || 'GET'
    graphCalls.push({ path: url.pathname, method })
    if (url.pathname.endsWith('/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: 'integration-whatsapp-oauth-token', expires_in: 3600 }), { status: 200 })
    }
    if (url.pathname.endsWith(`/${wabaId}`)) return new Response(JSON.stringify({ id: wabaId }), { status: 200 })
    if (url.pathname.endsWith('/phone_numbers')) {
      const id = listAuthorizedPhone ? authorizedPhoneId : nonAuthorizedPhoneId
      return new Response(JSON.stringify({ data: [{ id, display_phone_number: '+55 43 99917-3440', verified_name: 'YUX' }] }), { status: 200 })
    }
    if (url.pathname.endsWith(`/${phoneNumberId}`)) {
      return new Response(JSON.stringify({ id: phoneNumberId, status: phoneStatus }), { status: 200 })
    }
    if (url.pathname.endsWith(`/${phoneNumberId}/register`) && method === 'POST') {
      phoneStatus = 'CONNECTED'
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    if (url.pathname.endsWith(`/${wabaId}/subscribed_apps`)) {
      return new Response(JSON.stringify(method === 'GET' ? { data: [] } : { success: true }), { status: 200 })
    }
    throw new Error(`unexpected_meta_graph_request:${url.pathname}`)
  })
  vi.stubGlobal('fetch', fetcher)
  const completeThroughRoute = (role: 'client_admin_A' | 'client_admin_B', body: Record<string, unknown>) =>
    rig.request(role, 'POST', '/api/functions/complete-meta-channel-connect', { body })

  try {
    const startResponse = await rig.request('client_admin_A', 'POST', '/api/functions/start-meta-channel-connect', {
      body: { organizationId: rig.ids.organizationA, channel: 'whatsapp' },
    })
    expect(startResponse.statusCode).toBe(200)
    const started = startResponse.body
    stateHashes.push(createHash('sha256').update(started.state).digest('hex'))
    expect(started.graphVersion).toBe('v25.0')

    const input = {
      organizationId: rig.ids.organizationA,
      userId: fixtureUsers.client_admin_A.id,
      channel: 'whatsapp',
      state: started.state,
      code: 'single-use-meta-code',
      wabaId,
      phoneNumberIds: [phoneNumberId],
      registrationPin: '',
    }

    const wrongOrganization = await completeThroughRoute('client_admin_B', { ...input, organizationId: rig.ids.organizationB })
    expect(wrongOrganization.statusCode).toBe(400)
    expect(wrongOrganization.body).toEqual({ error: 'oauth_state_invalid_or_expired' })
    const wrongUser = await completeThroughRoute('client_admin_B', input)
    expect(wrongUser.statusCode).toBe(403)

    const unauthorizedPhone = await completeThroughRoute('client_admin_A', input)
    expect(unauthorizedPhone.statusCode).toBe(400)
    expect(unauthorizedPhone.body).toEqual({ error: 'whatsapp_phone_number_not_authorized_for_waba' })
    const staged = (await rig.sql(
      `SELECT status, processing_stage, protected_payload FROM public.provider_oauth_sessions WHERE state_hash = $1`,
      [stateHashes[0]],
    )).rows[0]
    expect(staged).toMatchObject({ status: 'started', processing_stage: 'token_exchanged' })
    expect(JSON.stringify(staged.protected_payload)).not.toContain('integration-whatsapp-oauth-token')
    expect((await rig.sql(
      `SELECT count(*)::int AS count FROM public.channel_connections WHERE phone_number_id = $1`,
      [phoneNumberId],
    )).rows[0].count).toBe(0)

    listAuthorizedPhone = true
    const needsPin = await completeThroughRoute('client_admin_A', input)
    expect(needsPin.statusCode).toBe(400)
    expect(needsPin.body).toEqual({ error: 'whatsapp_registration_pin_required' })
    const waitingForPin = (await rig.sql(
      `SELECT status, processing_stage, protected_payload FROM public.provider_oauth_sessions WHERE state_hash = $1`,
      [stateHashes[0]],
    )).rows[0]
    expect(waitingForPin).toMatchObject({ status: 'started', processing_stage: 'assets_verified' })
    expect(JSON.stringify(waitingForPin.protected_payload)).not.toContain('123456')

    const completions = await Promise.all([
      completeThroughRoute('client_admin_A', { ...input, code: 'code-is-not-exchanged-twice', registrationPin: '123456' }),
      completeThroughRoute('client_admin_A', { ...input, code: 'racing-second-code', registrationPin: '123456' }),
    ])
    const successfulCompletions = completions.filter(result => result.statusCode === 200)
    const rejectedCompletions = completions.filter(result => result.statusCode !== 200)
    expect(successfulCompletions).toHaveLength(1)
    expect(rejectedCompletions).toHaveLength(1)
    expect(rejectedCompletions[0]?.body).toEqual({ error: 'oauth_state_invalid_or_expired' })
    const completed = successfulCompletions[0]!.body
    connectionIds.push(...completed.connections.map((connection: { id: string }) => connection.id))
    const originalConnectionId = completed.connections[0].id
    expect(completed.connections).toHaveLength(1)
    expect(graphCalls.filter(call => call.path.endsWith('/oauth/access_token'))).toHaveLength(1)
    expect(graphCalls.filter(call => call.path.endsWith(`/${phoneNumberId}/register`) && call.method === 'POST')).toHaveLength(1)
    expect(graphCalls.some(call => call.path.endsWith(`/${wabaId}/subscribed_apps`) && call.method === 'POST')).toBe(true)

    const finished = (await rig.sql(
      `SELECT status, processing_stage, protected_payload FROM public.provider_oauth_sessions WHERE state_hash = $1`,
      [stateHashes[0]],
    )).rows[0]
    expect(finished).toMatchObject({ status: 'completed', processing_stage: null, protected_payload: {} })
    const reusedState = await completeThroughRoute('client_admin_A', input)
    expect(reusedState.statusCode).toBe(400)
    expect(reusedState.body).toEqual({ error: 'oauth_state_invalid_or_expired' })
    expect((await rig.sql(
      `SELECT count(*)::int AS count FROM public.channel_connections WHERE phone_number_id = $1`,
      [phoneNumberId],
    )).rows[0].count).toBe(1)

    await rig.sql(
      `UPDATE public.channel_connections SET response_mode_override = 'assisted' WHERE id = $1`,
      [originalConnectionId],
    )
    const reconnectStart = await rig.request('client_admin_A', 'POST', '/api/functions/start-meta-channel-connect', {
      body: { organizationId: rig.ids.organizationA, channel: 'whatsapp', connectionId: originalConnectionId },
    })
    expect(reconnectStart.statusCode).toBe(200)
    const reconnectStateHash = createHash('sha256').update(reconnectStart.body.state).digest('hex')
    stateHashes.push(reconnectStateHash)
    const reconnectSession = (await rig.sql(
      `SELECT protected_payload FROM public.provider_oauth_sessions WHERE state_hash = $1`,
      [reconnectStateHash],
    )).rows[0]
    expect(reconnectSession.protected_payload).toMatchObject({ targetConnectionId: originalConnectionId })

    authorizedPhoneId = reconnectDifferentPhoneId
    const wrongReconnectAsset = await completeThroughRoute('client_admin_A', {
      ...input,
      state: reconnectStart.body.state,
      code: 'reconnect-code-used-once',
      phoneNumberIds: [reconnectDifferentPhoneId],
    })
    expect(wrongReconnectAsset.statusCode).toBe(400)
    expect(wrongReconnectAsset.body).toEqual({ error: 'whatsapp_reconnect_asset_mismatch' })
    expect((await rig.sql(
      `SELECT count(*)::int AS count FROM public.channel_connections WHERE phone_number_id = $1`,
      [reconnectDifferentPhoneId],
    )).rows[0].count).toBe(0)

    authorizedPhoneId = phoneNumberId
    const reconnected = await completeThroughRoute('client_admin_A', {
      ...input,
      state: reconnectStart.body.state,
      code: 'code-must-not-be-exchanged-again',
    })
    expect(reconnected.statusCode).toBe(200)
    expect(reconnected.body.connections).toHaveLength(1)
    expect(reconnected.body.connections[0].id).toBe(originalConnectionId)
    expect((await rig.sql(
      `SELECT count(*)::int AS count, max(response_mode_override) AS response_mode_override
         FROM public.channel_connections WHERE phone_number_id = $1`,
      [phoneNumberId],
    )).rows[0]).toMatchObject({ count: 1, response_mode_override: 'assisted' })
    expect(graphCalls.filter(call => call.path.endsWith('/oauth/access_token'))).toHaveLength(2)
    connectionIds.push(originalConnectionId)

    const expiredStart = await rig.request('client_admin_A', 'POST', '/api/functions/start-meta-channel-connect', {
      body: { organizationId: rig.ids.organizationA, channel: 'whatsapp' },
    })
    const expired = expiredStart.body
    const expiredHash = createHash('sha256').update(expired.state).digest('hex')
    stateHashes.push(expiredHash)
    await rig.sql("UPDATE public.provider_oauth_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE state_hash = $1", [expiredHash])
    const expiredCompletion = await completeThroughRoute('client_admin_A', {
      organizationId: rig.ids.organizationA,
      channel: 'whatsapp',
      state: expired.state,
      code: 'expired-code',
      wabaId,
      phoneNumberIds: [phoneNumberId],
    })
    expect(expiredCompletion.statusCode).toBe(400)
    expect(expiredCompletion.body).toEqual({ error: 'oauth_state_invalid_or_expired' })
    const expiredRow = (await rig.sql(
      `SELECT status, processing_stage, protected_payload FROM public.provider_oauth_sessions WHERE state_hash = $1`,
      [expiredHash],
    )).rows[0]
    expect(expiredRow).toMatchObject({ status: 'expired', processing_stage: null, protected_payload: {} })
    expect(graphCalls.filter(call => call.path.endsWith('/oauth/access_token'))).toHaveLength(2)
  } finally {
    if (stateHashes.length) await rig.sql('DELETE FROM public.provider_oauth_sessions WHERE state_hash = ANY($1::text[])', [stateHashes])
    if (connectionIds.length) {
      await rig.sql('DELETE FROM public.provider_integration_secrets WHERE connection_id = ANY($1::uuid[])', [connectionIds])
      await rig.sql('DELETE FROM public.channel_connections WHERE id = ANY($1::uuid[])', [connectionIds])
    }
    await rig.close()
  }
})

it('isola números por organização, mantém vários números e reconecta sem duplicar', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const pool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_api'), max: 3 }), 'api')
  const phoneNumbers = [`phone-${randomUUID()}`, `phone-${randomUUID()}`, `phone-${randomUUID()}`]
  const connectionIds: string[] = []
  const contactId = randomUUID()
  const conversationId = randomUUID()
  process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = testEncryptionKey
  const inOrganization = <T>(organizationId: string, operation: () => Promise<T>) => runWithDatabaseRequestContext({
    role: 'client_admin', organizationIds: [organizationId], serviceRole: 'api',
  }, operation)

  try {
    const first = await inOrganization(rig.ids.organizationA, () => upsertVerifiedWhatsAppConnection(pool, {
      organizationId: rig.ids.organizationA,
      userId: fixtureUsers.client_admin_A.id,
      wabaId: `waba-${randomUUID()}`,
      phoneNumberId: phoneNumbers[0]!,
      displayPhoneNumber: '+55 43 99999-1001',
      accessToken: 'integration-token-a1',
      expiresAt: null,
    }))
    connectionIds.push(first.id)
    const second = await inOrganization(rig.ids.organizationA, () => upsertVerifiedWhatsAppConnection(pool, {
      organizationId: rig.ids.organizationA,
      userId: fixtureUsers.client_admin_A.id,
      wabaId: `waba-${randomUUID()}`,
      phoneNumberId: phoneNumbers[1]!,
      displayPhoneNumber: '+55 43 99999-1002',
      accessToken: 'integration-token-a2',
      expiresAt: null,
    }))
    connectionIds.push(second.id)
    const third = await inOrganization(rig.ids.organizationB, () => upsertVerifiedWhatsAppConnection(pool, {
      organizationId: rig.ids.organizationB,
      userId: fixtureUsers.client_admin_B.id,
      wabaId: `waba-${randomUUID()}`,
      phoneNumberId: phoneNumbers[2]!,
      displayPhoneNumber: '+55 43 99999-2001',
      accessToken: 'integration-token-b1',
      expiresAt: null,
    }))
    connectionIds.push(third.id)

    const reconnect = await inOrganization(rig.ids.organizationA, () => upsertVerifiedWhatsAppConnection(pool, {
      organizationId: rig.ids.organizationA,
      userId: fixtureUsers.client_admin_A.id,
      wabaId: `waba-${randomUUID()}`,
      phoneNumberId: phoneNumbers[0]!,
      displayPhoneNumber: '+55 43 99999-1001',
      accessToken: 'integration-token-a1-rotated',
      expiresAt: null,
    }))
    expect(reconnect.id).toBe(first.id)

    const secretReference = (await rig.sql(
      `SELECT protected_metadata_references->>'accessTokenReference' AS reference
         FROM public.channel_connections WHERE id = $1`,
      [first.id],
    )).rows[0].reference as string
    await expect(inOrganization(rig.ids.organizationA, () => loadProviderSecretFromPool(pool, secretReference))).resolves.toMatchObject({
      value: 'integration-token-a1-rotated',
      expired: false,
    })
    const secretBReference = (await rig.sql(
      `SELECT protected_metadata_references->>'accessTokenReference' AS reference
         FROM public.channel_connections WHERE id = $1`,
      [third.id],
    )).rows[0].reference as string
    await expect(inOrganization(rig.ids.organizationA, () => loadProviderSecretFromPool(pool, secretBReference)))
      .rejects.toThrow('provider_secret_not_found')

    const organizationA = await rig.request(
      'client_admin_A', 'GET',
      `/api/omnichannel/channel-connections?organizationId=${rig.ids.organizationA}&channels=whatsapp`,
    )
    const organizationB = await rig.request(
      'client_admin_B', 'GET',
      `/api/omnichannel/channel-connections?organizationId=${rig.ids.organizationB}&channels=whatsapp`,
    )
    expect(organizationA.statusCode).toBe(200)
    expect(organizationB.statusCode).toBe(200)
    expect(organizationA.body.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining([first.id, second.id]))
    expect(organizationB.body.map((row: { id: string }) => row.id)).toContain(third.id)
    expect(organizationA.body.every((row: { organization_id: string }) => row.organization_id === rig.ids.organizationA)).toBe(true)
    expect(organizationB.body.every((row: { organization_id: string }) => row.organization_id === rig.ids.organizationB)).toBe(true)
    expect(JSON.stringify(organizationA.body)).not.toContain('integration-token')

    const settingsPath = `/api/omnichannel/channel-connections/${first.id}/settings`
    const settingsResponse = await rig.request('client_admin_A', 'PATCH', settingsPath, {
      organizationId: rig.ids.organizationA,
      assistantId: null,
      teamId: null,
      queueId: null,
      responseModeOverride: 'assisted',
    })
    expect(settingsResponse.statusCode).toBe(200)
    expect(settingsResponse.body).toMatchObject({ id: first.id, responseModeOverride: 'assisted' })
    const reconnectAfterSettings = await inOrganization(rig.ids.organizationA, () => upsertVerifiedWhatsAppConnection(pool, {
      organizationId: rig.ids.organizationA,
      userId: fixtureUsers.client_admin_A.id,
      wabaId: `waba-${randomUUID()}`,
      phoneNumberId: phoneNumbers[0]!,
      displayPhoneNumber: '+55 43 99999-1001',
      accessToken: 'integration-token-a1-reconnected',
      expiresAt: null,
    }))
    expect(reconnectAfterSettings.id).toBe(first.id)
    expect((await rig.sql('SELECT response_mode_override FROM public.channel_connections WHERE id = $1', [first.id])).rows[0].response_mode_override).toBe('assisted')
    expect((await rig.sql('SELECT response_mode_override FROM public.channel_connections WHERE id = $1', [second.id])).rows[0].response_mode_override).toBeNull()
    const readOnlyUpdate = await rig.request('client_member_A', 'PATCH', settingsPath, {
      organizationId: rig.ids.organizationA,
      assistantId: null,
      teamId: null,
      queueId: null,
      responseModeOverride: null,
    })
    expect(readOnlyUpdate.statusCode).toBe(403)
    const crossOrganizationUpdate = await rig.request('client_admin_A', 'PATCH', settingsPath, {
      organizationId: rig.ids.organizationB,
      assistantId: null,
      teamId: null,
      queueId: null,
      responseModeOverride: null,
    })
    expect(crossOrganizationUpdate.statusCode).toBe(403)
    const invalidBinding = await rig.request('client_admin_A', 'PATCH', settingsPath, {
      organizationId: rig.ids.organizationA,
      assistantId: randomUUID(),
      teamId: null,
      queueId: null,
      responseModeOverride: 'manual',
    })
    expect(invalidBinding.statusCode).toBe(400)
    expect((await rig.sql('SELECT response_mode_override FROM public.channel_connections WHERE id = $1', [first.id])).rows[0].response_mode_override).toBe('assisted')

    await rig.sql(
      `INSERT INTO public.omnichannel_contacts (id, organization_id, display_name, phone)
       VALUES ($1,$2,'Contato isolamento', '+5543999991000')`,
      [contactId, rig.ids.organizationA],
    )
    await rig.sql(
      `INSERT INTO public.conversations (id, organization_id, contact_id, connection_id, channel)
       VALUES ($1,$2,$3,$4,'whatsapp')`,
      [conversationId, rig.ids.organizationA, contactId, first.id],
    )

    const crossConnectionReply = await rig.request('client_admin_A', 'POST', '/api/omnichannel/messages/human-reply', {
      conversationId,
      connectionId: third.id,
      body: 'Não deve ser enviado por outro número',
    })
    expect(crossConnectionReply.statusCode).toBe(409)
    expect(crossConnectionReply.body).toEqual({ error: 'conversation_connection_mismatch' })

    await expect(inOrganization(rig.ids.organizationA, () => upsertVerifiedWhatsAppConnection(pool, {
      organizationId: rig.ids.organizationB,
      userId: fixtureUsers.client_admin_B.id,
      wabaId: `waba-${randomUUID()}`,
      phoneNumberId: `phone-${randomUUID()}`,
      displayPhoneNumber: '+55 43 99999-2999',
      accessToken: 'integration-token-organization-spoof',
      expiresAt: null,
    }))).rejects.toThrow()
    expect((await rig.sql(
      `SELECT count(*)::int AS count FROM public.channel_connections
        WHERE organization_id = $1 AND phone_number_id LIKE 'phone-%' AND display_phone_number = '+55 43 99999-2999'`,
      [rig.ids.organizationB],
    )).rows[0].count).toBe(0)

    await expect(inOrganization(rig.ids.organizationB, () => upsertVerifiedWhatsAppConnection(pool, {
      organizationId: rig.ids.organizationB,
      userId: fixtureUsers.client_admin_B.id,
      wabaId: `waba-${randomUUID()}`,
      phoneNumberId: phoneNumbers[0]!,
      displayPhoneNumber: '+55 43 99999-1001',
      accessToken: 'integration-token-cross-tenant',
      expiresAt: null,
    }))).rejects.toMatchObject({ message: 'whatsapp_phone_number_already_connected', statusCode: 409 })
  } finally {
    await rig.sql('DELETE FROM public.conversations WHERE id = $1', [conversationId])
    await rig.sql('DELETE FROM public.omnichannel_contacts WHERE id = $1', [contactId])
    if (connectionIds.length) {
      await rig.sql('DELETE FROM public.provider_integration_secrets WHERE connection_id = ANY($1::uuid[])', [connectionIds])
      await rig.sql('DELETE FROM public.channel_connections WHERE id = ANY($1::uuid[])', [connectionIds])
    }
    await pool.end()
    await rig.close()
  }
})

it('aceita apenas uma empresa quando duas tentam associar o mesmo número ao mesmo tempo', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const pool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_api'), max: 4 }), 'api')
  const phoneNumberId = `phone-${randomUUID()}`
  const connectionIds: string[] = []
  process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = testEncryptionKey
  const inOrganization = <T>(organizationId: string, operation: () => Promise<T>) => runWithDatabaseRequestContext({
    role: 'client_admin', organizationIds: [organizationId], serviceRole: 'api',
  }, operation)

  try {
    const attempts = await Promise.allSettled([
      inOrganization(rig.ids.organizationA, () => upsertVerifiedWhatsAppConnection(pool, {
        organizationId: rig.ids.organizationA,
        userId: fixtureUsers.client_admin_A.id,
        wabaId: `waba-${randomUUID()}`,
        phoneNumberId,
        displayPhoneNumber: '+55 43 99999-3001',
        accessToken: 'integration-token-race-a',
        expiresAt: null,
      })),
      inOrganization(rig.ids.organizationB, () => upsertVerifiedWhatsAppConnection(pool, {
        organizationId: rig.ids.organizationB,
        userId: fixtureUsers.client_admin_B.id,
        wabaId: `waba-${randomUUID()}`,
        phoneNumberId,
        displayPhoneNumber: '+55 43 99999-3001',
        accessToken: 'integration-token-race-b',
        expiresAt: null,
      })),
    ])
    const succeeded = attempts.filter((attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof upsertVerifiedWhatsAppConnection>>> => attempt.status === 'fulfilled')
    const rejected = attempts.filter((attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected')
    connectionIds.push(...succeeded.map(attempt => attempt.value.id))

    expect(succeeded).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toMatchObject({ message: 'whatsapp_phone_number_already_connected', statusCode: 409 })
    expect((await rig.sql(
      `SELECT count(*)::int AS count FROM public.channel_connections
        WHERE channel = 'whatsapp' AND phone_number_id = $1 AND is_active = TRUE`,
      [phoneNumberId],
    )).rows[0].count).toBe(1)
  } finally {
    if (connectionIds.length) {
      await rig.sql('DELETE FROM public.provider_integration_secrets WHERE connection_id = ANY($1::uuid[])', [connectionIds])
      await rig.sql('DELETE FROM public.channel_connections WHERE id = ANY($1::uuid[])', [connectionIds])
    }
    await pool.end()
    await rig.close()
  }
})

it('serializa mensagens concorrentes por contato/número e aplica recibos fora de ordem sem regressão', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const apiPool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_api'), max: 3 }), 'api')
  const workerPool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_worker'), max: 6 }), 'worker')
  const phoneNumberId = `phone-${randomUUID()}`
  const connectionIds: string[] = []
  const webhookEventIds: string[] = []
  const externalContactId = `55${randomInt(10_000_000_000, 99_999_999_999)}`
  process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = testEncryptionKey
  const asWorker = <T>(operation: () => Promise<T>) => runWithDatabaseRequestContext({
    role: 'yux_operator', organizationIds: [rig.ids.organizationA], serviceRole: 'worker',
  }, operation)

  try {
    const connection = await runWithDatabaseRequestContext({
      role: 'client_admin', organizationIds: [rig.ids.organizationA], serviceRole: 'api',
    }, () => upsertVerifiedWhatsAppConnection(apiPool, {
      organizationId: rig.ids.organizationA,
      userId: fixtureUsers.client_admin_A.id,
      wabaId: `waba-${randomUUID()}`,
      phoneNumberId,
      displayPhoneNumber: '+55 43 99999-5011',
      accessToken: 'integration-token-inbound-race',
      expiresAt: null,
    }))
    connectionIds.push(connection.id)

    const timestamp = String(Math.floor(Date.now() / 1_000))
    const messagePayload = (externalMessageId: string) => normalizeWhatsAppInbound({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-race', changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp',
        metadata: { phone_number_id: phoneNumberId, display_phone_number: '+5543999995011' },
        contacts: [{ wa_id: externalContactId, profile: { name: 'Contato concorrente' } }],
        messages: [{ id: externalMessageId, from: externalContactId, timestamp, type: 'text', text: { body: `Mensagem ${externalMessageId}` } }],
      } }] }],
    }, { connectionId: connection.id })
    const inboundEvents = [messagePayload(`wamid-${randomUUID()}`), messagePayload(`wamid-${randomUUID()}`)]
    for (const event of inboundEvents) {
      const inserted = await rig.sql(
        `INSERT INTO public.channel_webhook_events (
           connection_id, external_event_id, event_type, idempotency_key, sanitized_payload
         ) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id`,
        [connection.id, event.externalEventId, event.eventType, event.idempotencyKey, JSON.stringify(event.sanitizedPayload)],
      )
      webhookEventIds.push(inserted.rows[0].id)
    }

    const runtimeFetch = vi.fn(async () => new Response(JSON.stringify({
      synthesis: { reply: { body: '' }, classification: {}, qualification: {} },
      policy: { should_send: false, should_handoff: false, blocked: false },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', runtimeFetch)
    const env = { YUX_AGENT_RUNTIME_URL: 'http://agent-runtime.test', YUX_AGENT_RUNTIME_TOKEN: 'integration-runtime-token' } as AppEnv
    await Promise.all(webhookEventIds.map(eventId => asWorker(() => handleInboundMessage(workerPool, env, { eventId }))))

    const contact = await rig.sql(
      `SELECT id FROM public.omnichannel_contacts
        WHERE organization_id = $1 AND external_identities->>'providerExternalId' = $2`,
      [rig.ids.organizationA, externalContactId],
    )
    expect(contact.rows).toHaveLength(1)
    const conversations = await rig.sql(
      `SELECT id FROM public.conversations
        WHERE organization_id = $1 AND contact_id = $2 AND connection_id = $3
          AND status NOT IN ('resolved','archived')`,
      [rig.ids.organizationA, contact.rows[0].id, connection.id],
    )
    expect(conversations.rows).toHaveLength(1)
    const persistedMessages = await rig.sql(
      `SELECT count(*)::int AS count FROM public.messages
        WHERE conversation_id = $1 AND direction = 'inbound'`,
      [conversations.rows[0].id],
    )
    expect(persistedMessages.rows[0].count).toBe(2)

    const outboundMessageId = randomUUID()
    const externalOutboundId = `wamid-out-${randomUUID()}`
    await rig.sql(
      `INSERT INTO public.messages (
         id, conversation_id, connection_id, direction, author_type, content_type,
         body, external_message_id, delivery_status, metadata
       ) VALUES ($1,$2,$3,'outbound','agent','text','Resposta', $4,'sent','{}'::jsonb)`,
      [outboundMessageId, conversations.rows[0].id, connection.id, externalOutboundId],
    )
    await rig.sql('UPDATE public.channel_connections SET is_active = FALSE WHERE id = $1', [connection.id])
    const receiptPayload = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-race', changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp', metadata: { phone_number_id: phoneNumberId },
        statuses: [
          { id: externalOutboundId, recipient_id: externalContactId, timestamp: String(Number(timestamp) + 3), status: 'read' },
          { id: externalOutboundId, recipient_id: externalContactId, timestamp: String(Number(timestamp) + 1), status: 'sent' },
          { id: externalOutboundId, recipient_id: externalContactId, timestamp: String(Number(timestamp) + 2), status: 'delivered' },
        ],
      } }] }],
    }
    const receipts = normalizeWhatsAppBatch(receiptPayload, { connectionId: connection.id })
    expect(receipts.events).toHaveLength(3)
    expect(new Set(receipts.events.map(event => event.idempotencyKey)).size).toBe(3)
    for (const event of receipts.events) {
      const inserted = await rig.sql(
        `INSERT INTO public.channel_webhook_events (
           connection_id, external_event_id, event_type, idempotency_key, sanitized_payload
         ) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id`,
        [connection.id, event.externalEventId, event.eventType, event.idempotencyKey, JSON.stringify(event.sanitizedPayload)],
      )
      webhookEventIds.push(inserted.rows[0].id)
      await asWorker(() => handleInboundMessage(workerPool, env, { eventId: inserted.rows[0].id }))
    }
    const finalReceipt = await rig.sql(
      `SELECT delivery_status, metadata->>'whatsappReceiptStatus' AS receipt_status
         FROM public.messages WHERE id = $1`,
      [outboundMessageId],
    )
    expect(finalReceipt.rows[0]).toEqual({ delivery_status: 'read', receipt_status: 'read' })

    const failedOutboundId = randomUUID()
    const failedProviderMessageId = `wamid-failed-${randomUUID()}`
    await rig.sql(
      `INSERT INTO public.messages (
         id, conversation_id, connection_id, direction, author_type, content_type,
         body, external_message_id, delivery_status, metadata
       ) VALUES ($1,$2,$3,'outbound','agent','text','Falha', $4,'sent','{}'::jsonb)`,
      [failedOutboundId, conversations.rows[0].id, connection.id, failedProviderMessageId],
    )
    const failedReceiptPayload = normalizeWhatsAppBatch({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-race', changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp', metadata: { phone_number_id: phoneNumberId },
        statuses: [{
          id: failedProviderMessageId,
          recipient_id: externalContactId,
          timestamp: String(Number(timestamp) + 4),
          status: 'failed',
          errors: [{ code: 131026, title: 'Recipient unreachable' }],
        }],
      } }] }],
    }, { connectionId: connection.id })
    const failedReceipt = failedReceiptPayload.events[0]!
    const failedEvent = await rig.sql(
      `INSERT INTO public.channel_webhook_events (
         connection_id, external_event_id, event_type, idempotency_key, sanitized_payload
       ) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id`,
      [connection.id, failedReceipt.externalEventId, failedReceipt.eventType, failedReceipt.idempotencyKey, JSON.stringify(failedReceipt.sanitizedPayload)],
    )
    webhookEventIds.push(failedEvent.rows[0].id)
    await asWorker(() => handleInboundMessage(workerPool, env, { eventId: failedEvent.rows[0].id }))
    const failedStatus = await rig.sql(
      `SELECT delivery_status, metadata->'whatsappReceiptFailure' AS failure
         FROM public.messages WHERE id = $1`,
      [failedOutboundId],
    )
    expect(failedStatus.rows[0].delivery_status).toBe('failed')
    expect(failedStatus.rows[0].failure).toMatchObject({ errors: [{ code: 131026, title: 'Recipient unreachable' }] })

    const inactiveInbound = messagePayload(`wamid-after-disconnect-${randomUUID()}`)
    const inactiveEvent = await rig.sql(
      `INSERT INTO public.channel_webhook_events (
         connection_id, external_event_id, event_type, idempotency_key, sanitized_payload
       ) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id`,
      [connection.id, inactiveInbound.externalEventId, inactiveInbound.eventType, inactiveInbound.idempotencyKey, JSON.stringify(inactiveInbound.sanitizedPayload)],
    )
    webhookEventIds.push(inactiveEvent.rows[0].id)
    await asWorker(() => handleInboundMessage(workerPool, env, { eventId: inactiveEvent.rows[0].id }))
    const inactiveResult = await rig.sql(
      `SELECT status, protected_error_text FROM public.channel_webhook_events WHERE id = $1`,
      [inactiveEvent.rows[0].id],
    )
    expect(inactiveResult.rows[0]).toEqual({ status: 'ignored', protected_error_text: 'connection_inactive' })
    const inboundAfterDisconnect = await rig.sql(
      `SELECT count(*)::int AS count FROM public.messages
        WHERE conversation_id = $1 AND direction = 'inbound'`,
      [conversations.rows[0].id],
    )
    expect(inboundAfterDisconnect.rows[0].count).toBe(2)
  } finally {
    if (webhookEventIds.length) await rig.sql('DELETE FROM public.channel_webhook_events WHERE id = ANY($1::uuid[])', [webhookEventIds])
    if (connectionIds.length) {
      await rig.sql('DELETE FROM public.conversations WHERE connection_id = ANY($1::uuid[])', [connectionIds])
      await rig.sql('DELETE FROM public.omnichannel_contacts WHERE external_identities->>\'providerExternalId\' = $1', [externalContactId])
      await rig.sql('DELETE FROM public.provider_integration_secrets WHERE connection_id = ANY($1::uuid[])', [connectionIds])
      await rig.sql('DELETE FROM public.channel_connections WHERE id = ANY($1::uuid[])', [connectionIds])
    }
    await apiPool.end()
    await workerPool.end()
    await rig.close()
  }
})
