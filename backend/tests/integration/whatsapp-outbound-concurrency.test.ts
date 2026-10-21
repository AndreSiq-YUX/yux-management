import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { handleOutboundMessage } from '../../src/jobs/handlers/omnichannel.js'
import { storeProviderSecretToPool } from '../../src/lib/edge-compat/providerSecrets.js'
import { createIntegrationRig } from './support/rig.js'

it('adquire atomicamente uma tentativa quando despacho e retry leem juntos uma mensagem sem tentativa anterior', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const connectionId = randomUUID(), conversationId = randomUUID(), contactId = randomUUID(), messageId = randomUUID()
  const workerPool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_worker'), max: 4 }), 'worker')
  const query = workerPool.query.bind(workerPool)
  let initialReads = 0, inserts = 0
  let releaseReads!: () => void, releaseInsert!: () => void
  const bothRead = new Promise<void>(resolve => { releaseReads = resolve })
  const firstInserted = new Promise<void>(resolve => { releaseInsert = resolve })
  const interleavedPool = Object.create(workerPool) as pg.Pool
  interleavedPool.connect = workerPool.connect.bind(workerPool)
  interleavedPool.query = (async (sql: string, params: unknown[]) => {
    if (sql.includes('SELECT id, status, created_at FROM public.outbound_message_runs')) {
      const result = await query(sql, params)
      initialReads += 1
      if (initialReads === 2) releaseReads()
      await bothRead
      return result
    }
    // Force the previously vulnerable ordering: both empty reads finish, then
    // the second insert sees the first committed run and could choose MAX+1.
    if (sql.includes('INSERT INTO public.outbound_message_runs')) {
      inserts += 1
      if (inserts === 2) await firstInserted
      const result = await query(sql, params)
      releaseInsert()
      return result
    }
    return query(sql, params)
  }) as pg.Pool['query']
  try {
    await rig.sql(`INSERT INTO public.channel_connections (id,organization_id,channel,name,is_active,adapter_key,inbound_token_hash,phone_number_id,token_state)
      VALUES ($1::uuid,$2,'whatsapp',$1::uuid::text,TRUE,'meta_whatsapp',$1::uuid::text,$1::uuid::text,'connected')`, [connectionId, rig.ids.organizationA])
    const secret = await storeProviderSecretToPool({ query: rig.sql } as never, {
      organizationId: rig.ids.organizationA, provider: 'meta_social', targetKind: 'publishing', connectionTable: 'channel_connections',
      connectionId, secretKind: 'access_token', value: 'simulated-token-not-valid-at-meta',
    }, Buffer.alloc(32, 7))
    await rig.sql(`UPDATE public.channel_connections SET protected_metadata_references=$2::jsonb WHERE id=$1`, [connectionId, JSON.stringify({ accessTokenReference: secret.reference })])
    await rig.sql(`INSERT INTO public.omnichannel_contacts (id,organization_id,display_name,phone) VALUES ($1,$2,'Contato concorrente','+5511999990000')`, [contactId, rig.ids.organizationA])
    await rig.sql(`INSERT INTO public.conversations (id,organization_id,contact_id,connection_id,channel,status,response_mode) VALUES ($1,$2,$3,$4,'whatsapp','open','manual')`, [conversationId, rig.ids.organizationA, contactId, connectionId])
    await rig.sql(`INSERT INTO public.messages (conversation_id,connection_id,direction,author_type,content_type,body,delivery_status) VALUES ($1,$2,'inbound','contact','text','Olá','delivered')`, [conversationId, connectionId])
    await rig.sql(`INSERT INTO public.messages (id,conversation_id,connection_id,direction,author_type,content_type,body,delivery_status) VALUES ($1,$2,$3,'outbound','agent','text','Resposta única','queued')`, [messageId, conversationId, connectionId])
    const execute = () => runWithDatabaseRequestContext({ role: 'yux_operator', organizationIds: [rig.ids.organizationA], serviceRole: 'worker' }, () =>
      handleOutboundMessage(interleavedPool, { messageId }, { graphBaseUrl: rig.providerBaseUrl, providerSecretEncryptionKey: Buffer.alloc(32, 7).toString('base64') }))
    await Promise.all([execute(), execute()])
    expect((await rig.providerCalls()).filter(call => call.intentId === messageId)).toHaveLength(1)
    expect((await rig.sql(`SELECT count(*)::int AS n FROM public.outbound_message_runs WHERE message_id=$1`, [messageId])).rows[0].n).toBe(1)
  } finally {
    await workerPool.end()
    await rig.sql('DELETE FROM public.conversations WHERE id=$1', [conversationId])
    await rig.sql('DELETE FROM public.omnichannel_contacts WHERE id=$1', [contactId])
    await rig.sql('DELETE FROM public.provider_integration_secrets WHERE connection_id=$1', [connectionId])
    await rig.sql('DELETE FROM public.channel_connections WHERE id=$1', [connectionId])
    await rig.close()
  }
})
