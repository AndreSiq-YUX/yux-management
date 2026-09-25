import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterEach, expect, it } from 'vitest'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { loadProviderSecretFromPool } from '../../src/lib/edge-compat/providerSecrets.js'
import { upsertVerifiedWhatsAppConnection } from '../../src/modules/omnichannel/whatsapp-connections.js'
import { createIntegrationRig } from './support/rig.js'
import { fixtureUsers } from './support/fixtures.js'

const testEncryptionKey = Buffer.alloc(32, 7).toString('base64')
const previousEncryptionKey = process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64

afterEach(() => {
  if (previousEncryptionKey === undefined) delete process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64
  else process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = previousEncryptionKey
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
    expect(organizationA.body.map((row: { id: string }) => row.id).sort()).toEqual([first.id, second.id].sort())
    expect(organizationB.body.map((row: { id: string }) => row.id)).toEqual([third.id])
    expect(JSON.stringify(organizationA.body)).not.toContain('integration-token')

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
