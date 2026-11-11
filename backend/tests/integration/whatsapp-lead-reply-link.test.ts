import { createHmac, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createIntegrationRig } from './support/rig.js'

const metaSecret = 'integration-meta-app-secret'
type Rig = Awaited<ReturnType<typeof createIntegrationRig>>

function brazilianMobile() {
  const suffix = String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')
  const local = `9${suffix}` // 8-digit mobile subscriber number
  return {
    typed: `(47) 9${local.slice(0, 4)}-${local.slice(4)}`,
    // Meta delivers some Brazilian mobiles without the ninth digit.
    legacyWaId: `5547${local}`,
  }
}

it('links a reply to the lead the CRM already contacted, even when Meta omits the ninth digit', async () => {
  const rig = await createIntegrationRig()
  const phoneNumberId = `phone-${randomUUID()}`
  const phone = brazilianMobile()
  try {
    const connectionId = await insertWhatsAppConnection(rig, phoneNumberId)
    const leadId = randomUUID()
    await rig.sql(
      `INSERT INTO public.leads (id, organization_id, name, email, phone, source)
       VALUES ($1,$2,'Lead contatado',$3,$4,'integration')`,
      [leadId, rig.ids.organizationA, `${leadId}@integration.test`, phone.typed],
    )
    // What the CRM sequence creates before the first reply: phone, lead, no provider identity.
    const contactId = (await rig.sql(
      `INSERT INTO public.omnichannel_contacts (organization_id, display_name, phone, lead_id, external_identities)
       VALUES ($1,'Lead contatado',$2,$3,jsonb_build_object('source','crm_sequence')) RETURNING id`,
      [rig.ids.organizationA, phone.typed, leadId],
    )).rows[0].id
    const conversationId = (await rig.sql(
      `INSERT INTO public.conversations (organization_id, contact_id, connection_id, channel, status, response_mode, lead_id, last_message_at)
       VALUES ($1,$2,$3,'whatsapp','open','assisted',$4,NOW()) RETURNING id`,
      [rig.ids.organizationA, contactId, connectionId, leadId],
    )).rows[0].id

    const stopping = (await rig.sql(
      `INSERT INTO public.crm_sequences (organization_id, name, is_active) VALUES ($1,$2,TRUE) RETURNING id`,
      [rig.ids.organizationA, `Para ao responder ${randomUUID()}`],
    )).rows[0].id
    const continuing = (await rig.sql(
      `INSERT INTO public.crm_sequences (organization_id, name, is_active, exit_on_reply) VALUES ($1,$2,TRUE,FALSE) RETURNING id`,
      [rig.ids.organizationA, `Continua ${randomUUID()}`],
    )).rows[0].id
    for (const sequenceId of [stopping, continuing]) {
      await rig.sql(
        `INSERT INTO public.crm_sequence_enrollments (organization_id, sequence_id, lead_id, status, next_execution_at)
         VALUES ($1,$2,$3,'active',NOW() + INTERVAL '1 day')`,
        [rig.ids.organizationA, sequenceId, leadId],
      )
    }

    const externalMessageId = `wamid.${randomUUID()}`
    const rawBody = whatsappPayload(phoneNumberId, externalMessageId, phone.legacyWaId)
    const response = await rig.rawRequest('POST', '/api/webhooks/meta/channel-event', rawBody, signedHeaders(rawBody))
    expect(response.statusCode).toBe(200)
    await rig.workerTick()

    const message = (await rig.sql(
      `SELECT conversation_id FROM public.messages WHERE connection_id = $1 AND external_message_id = $2`,
      [connectionId, externalMessageId],
    )).rows[0]
    expect(message.conversation_id).toBe(conversationId)
    const contact = (await rig.sql(
      `SELECT external_identities->>'providerExternalId' AS provider_id, lead_id FROM public.omnichannel_contacts WHERE id = $1`,
      [contactId],
    )).rows[0]
    expect(contact).toEqual({ provider_id: phone.legacyWaId, lead_id: leadId })
    const enrollments = (await rig.sql(
      `SELECT sequence_id, status, exit_reason, next_execution_at FROM public.crm_sequence_enrollments WHERE lead_id = $1`,
      [leadId],
    )).rows
    expect(enrollments.find((e: any) => e.sequence_id === stopping)).toMatchObject({ status: 'manual', exit_reason: 'lead_replied', next_execution_at: null })
    expect(enrollments.find((e: any) => e.sequence_id === continuing)).toMatchObject({ status: 'active', exit_reason: null })
    expect((await rig.sql(
      `SELECT count(*)::int AS n FROM public.omnichannel_contacts WHERE organization_id = $1 AND phone = $2 OR external_identities->>'providerExternalId' = $3`,
      [rig.ids.organizationA, phone.typed, phone.legacyWaId],
    )).rows[0].n).toBe(1)
  } finally {
    await rig.sql(`UPDATE public.channel_connections SET is_active=FALSE WHERE phone_number_id=$1`, [phoneNumberId])
    await rig.close()
  }
})

it('links a first inbound message to the single matching lead and never to an ambiguous one', async () => {
  const rig = await createIntegrationRig()
  const phoneNumberId = `phone-${randomUUID()}`
  const unique = brazilianMobile()
  const shared = brazilianMobile()
  try {
    const connectionId = await insertWhatsAppConnection(rig, phoneNumberId)
    const leadId = randomUUID()
    await rig.sql(
      `INSERT INTO public.leads (id, organization_id, name, email, whatsapp_phone, source)
       VALUES ($1,$2,'Lead pelo WhatsApp',$3,$4,'integration')`,
      [leadId, rig.ids.organizationA, `${leadId}@integration.test`, unique.typed],
    )
    for (const name of ['Duplicado A', 'Duplicado B']) {
      const id = randomUUID()
      await rig.sql(
        `INSERT INTO public.leads (id, organization_id, name, email, phone, source) VALUES ($1,$2,$3,$4,$5,'integration')`,
        [id, rig.ids.organizationA, name, `${id}@integration.test`, shared.typed],
      )
    }

    const linkedMessage = `wamid.${randomUUID()}`
    const linkedBody = whatsappPayload(phoneNumberId, linkedMessage, unique.legacyWaId)
    expect((await rig.rawRequest('POST', '/api/webhooks/meta/channel-event', linkedBody, signedHeaders(linkedBody))).statusCode).toBe(200)
    const ambiguousMessage = `wamid.${randomUUID()}`
    const ambiguousBody = whatsappPayload(phoneNumberId, ambiguousMessage, shared.legacyWaId)
    expect((await rig.rawRequest('POST', '/api/webhooks/meta/channel-event', ambiguousBody, signedHeaders(ambiguousBody))).statusCode).toBe(200)
    await rig.workerTick()

    const linked = (await rig.sql(
      `SELECT c.lead_id, contact.lead_id AS contact_lead_id FROM public.messages m
         JOIN public.conversations c ON c.id = m.conversation_id
         JOIN public.omnichannel_contacts contact ON contact.id = c.contact_id
        WHERE m.connection_id = $1 AND m.external_message_id = $2`,
      [connectionId, linkedMessage],
    )).rows[0]
    expect(linked).toEqual({ lead_id: leadId, contact_lead_id: leadId })

    const ambiguous = (await rig.sql(
      `SELECT c.lead_id FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id
        WHERE m.connection_id = $1 AND m.external_message_id = $2`,
      [connectionId, ambiguousMessage],
    )).rows[0]
    expect(ambiguous.lead_id).toBeNull()
  } finally {
    await rig.sql(`UPDATE public.channel_connections SET is_active=FALSE WHERE phone_number_id=$1`, [phoneNumberId])
    await rig.close()
  }
})

async function insertWhatsAppConnection(rig: Rig, phoneNumberId: string) {
  const connectionId = randomUUID()
  await rig.sql(
    `INSERT INTO public.channel_connections (
       id, organization_id, channel, name, is_active, adapter_key,
       inbound_token_hash, phone_number_id, provider_verify_state, token_state
     ) VALUES ($1,$2,'whatsapp',$3,TRUE,'meta_whatsapp',$4,$5,'verified','connected')`,
    [connectionId, rig.ids.organizationA, `WhatsApp ${connectionId}`, `hash-${connectionId}`, phoneNumberId],
  )
  return connectionId
}

function whatsappPayload(phoneNumberId: string, externalMessageId: string, waId: string) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-integration',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: phoneNumberId, display_phone_number: '5511000000000' },
          contacts: [{ wa_id: waId, profile: { name: 'Contato do lead' } }],
          messages: [{
            id: externalMessageId,
            from: waId,
            timestamp: String(Math.floor(Date.now() / 1_000)),
            type: 'text',
            text: { body: 'Tenho interesse, pode me ligar?' },
          }],
        },
      }],
    }],
  })
}

function signedHeaders(rawBody: string) {
  const signature = createHmac('sha256', metaSecret).update(rawBody).digest('hex')
  return { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${signature}` }
}
