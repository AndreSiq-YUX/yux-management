import { afterEach, expect, it, vi } from 'vitest'
import { createCipheriv } from 'node:crypto'
import Fastify from 'fastify'
import { sendSmtp2GoEmail } from '../src/email/smtp2go.js'
import { sendConfiguredSmtp2GoEmail } from '../src/email/smtp2goConfigured.js'
import { registerCommercialEmailRoutes, registerPublicEmailRoutes } from '../src/modules/email-delivery/commercial-routes.js'
import { contactAllowedByPolicy, DEFAULT_CONTACT_POLICY } from '../src/email/contact-policy.js'
import { consumersForEvent } from '../src/modules/events/dispatcher.js'

const organizationId = '00000000-0000-4000-8000-000000000001'
const leadId = '00000000-0000-4000-8000-000000000002'
const revision = '00000000-0000-4000-8000-000000000003'
const requestId = '00000000-0000-4000-8000-000000000004'
const actorId = '00000000-0000-4000-8000-000000000005'
const sender = { revision, from_email: 'sales@example.com', from_name: 'Equipe Comercial',
  reply_to: 'inbox@example.com', mode: 'professional', approved_at: new Date() }

afterEach(() => vi.unstubAllGlobals())

it('reports a recipient rejection even when SMTP2GO returns HTTP 200', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ data: { failed: 1, failures: ['Sender not verified'] } }))
  const result = await sendSmtp2GoEmail({
    apiKey: 'test', senderEmail: 'sales@example.com', to: 'lead@example.com',
    subject: 'Follow-up', textBody: 'Hello', htmlBody: '<p>Hello</p>',
  })
  expect(result).toMatchObject({ sent: false, reason: 'smtp2go_rejected' })
})

it.each([
  { mode: 'professional', email: 'sales@example.com' },
  { mode: 'managed', email: 'client@comercial.yux.com.br' },
])('uses the $mode sender for commercial mail and the global sender for access mail', async ({ mode, email }) => {
  const key = Buffer.alloc(32, 1)
  const nonce = Buffer.alloc(12, 2)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update('test-key'), cipher.final()]).toString('base64')
  const secret = { ciphertext, nonce: nonce.toString('base64'), auth_tag: cipher.getAuthTag().toString('base64') }
  const pool = {
    async query(sql: string) {
      if (sql.includes('FROM public.commercial_email_senders')) return { rows: [{ ...sender, mode, from_email: email }] }
      if (sql.includes('FROM public.platform_provider_connections')) {
        return { rows: [{ id: organizationId, status: 'active',
          public_config: { invitationFromEmail: 'no-reply@yux.com.br', invitationFromName: 'YUX Hub' } }] }
      }
      if (sql.includes('FROM public.platform_provider_secrets')) return { rows: [secret] }
      return { rows: [] }
    },
  }
  const requests: Array<Record<string, unknown>> = []
  vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
    requests.push(JSON.parse(String(options.body)))
    return Response.json({ data: { email_id: 'provider-message' } })
  })
  const message = { to: sender.reply_to, subject: 'Teste', textBody: 'Mensagem', htmlBody: '<p>Mensagem</p>' }
  const keyMaterial = `provider-key:${key.toString('base64')}`
  await expect(sendConfiguredSmtp2GoEmail(pool as never, keyMaterial, {
    ...message, organizationId, commercialSender: { organizationId, revision, leadId: null },
  })).resolves.toMatchObject({ sent: true })
  await expect(sendConfiguredSmtp2GoEmail(pool as never, keyMaterial, message)).resolves.toMatchObject({ sent: true })
  await expect(sendConfiguredSmtp2GoEmail(pool as never, keyMaterial, {
    ...message, organizationId, commercialSender: { organizationId, revision: requestId, leadId: null },
  })).resolves.toMatchObject({ sent: false, error: 'commercial_sender_not_ready' })
  expect(requests).toHaveLength(2)
  expect(requests[0]).toMatchObject({
    sender: `Equipe Comercial <${email}>`,
    custom_headers: [{ header: 'Reply-To', value: 'inbox@example.com' }],
  })
  expect(requests[1]).toMatchObject({ sender: 'YUX Hub <no-reply@yux.com.br>' })
  expect(requests[1]).not.toHaveProperty('custom_headers')
})

it('adds the opt-out footer and one-click headers, and lets sequences fall back to the platform sender', async () => {
  const key = Buffer.alloc(32, 1)
  const nonce = Buffer.alloc(12, 2)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update('test-key'), cipher.final()]).toString('base64')
  const secret = { ciphertext, nonce: nonce.toString('base64'), auth_tag: cipher.getAuthTag().toString('base64') }
  let approved = true
  const pool = {
    async query(sql: string) {
      if (sql.includes('FROM public.commercial_email_senders')) return { rows: approved ? [sender] : [] }
      if (sql.includes('FROM public.leads l')) return { rows: [{ revoked: false }] }
      if (sql.includes('FROM public.platform_provider_connections')) {
        return { rows: [{ id: organizationId, status: 'active',
          public_config: { invitationFromEmail: 'no-reply@yux.com.br', invitationFromName: 'YUX Hub' } }] }
      }
      if (sql.includes('FROM public.platform_provider_secrets')) return { rows: [secret] }
      return { rows: [] }
    },
  }
  const requests: Array<Record<string, any>> = []
  vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
    requests.push(JSON.parse(String(options.body)))
    return Response.json({ data: { email_id: 'provider-message' } })
  })
  const keyMaterial = `provider-key:${key.toString('base64')}`
  const optOutUrl = 'https://hub.example/api/public/email/unsubscribe/token-abcdefghijklmnopqrstuv'
  const message = { to: 'lead@example.com', subject: 'Proposta', textBody: 'Olá', htmlBody: '<p>Olá</p>', organizationId, optOutUrl }
  await expect(sendConfiguredSmtp2GoEmail(pool as never, keyMaterial, {
    ...message, commercialSender: { organizationId, revision: null, leadId, optional: true },
  })).resolves.toMatchObject({ sent: true })
  expect(requests[0].sender).toBe('Equipe Comercial <sales@example.com>')
  expect(requests[0].text_body).toContain(optOutUrl)
  expect(requests[0].html_body).toContain(optOutUrl)
  expect(requests[0].custom_headers).toEqual(expect.arrayContaining([
    { header: 'Reply-To', value: 'inbox@example.com' },
    { header: 'List-Unsubscribe', value: `<${optOutUrl}>` },
    { header: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
  ]))
  expect(requests[0]).not.toHaveProperty('optOutUrl')
  approved = false
  await expect(sendConfiguredSmtp2GoEmail(pool as never, keyMaterial, {
    ...message, commercialSender: { organizationId, revision: null, leadId, optional: true },
  })).resolves.toMatchObject({ sent: true })
  expect(requests[1].sender).toBe('YUX Hub <no-reply@yux.com.br>')
  await expect(sendConfiguredSmtp2GoEmail(pool as never, keyMaterial, {
    ...message, commercialSender: { organizationId, revision: null, leadId },
  })).resolves.toMatchObject({ sent: false, error: 'commercial_sender_not_ready' })
  expect(requests).toHaveLength(2)
})

it('treats a published business contact as allowed only when the policy says so', () => {
  expect(DEFAULT_CONTACT_POLICY).toMatchObject({ emailBasis: 'published_business_contact', whatsappBasis: 'explicit_opt_in' })
  expect(contactAllowedByPolicy('published_business_contact', false)).toBe(true)
  expect(contactAllowedByPolicy('explicit_opt_in', false)).toBe(false)
  expect(contactAllowedByPolicy('explicit_opt_in', true)).toBe(true)
})

it('lets only account admins change the contact policy and rejects stale revisions', async () => {
  let isOrganizationAdmin = true
  let stored: Record<string, unknown> | null = null
  const app = Fastify()
  app.decorateRequest('ctx', null)
  app.addHook('preHandler', async request => {
    request.ctx = { role: 'client_admin', userId: actorId, organizationIds: [organizationId], enabledModuleKeys: ['crm'] }
  })
  const pool = {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes('FROM public.memberships')) return { rows: isOrganizationAdmin ? [{ ok: 1 }] : [] }
      if (sql.includes('SELECT email_basis')) return { rows: stored ? [stored] : [] }
      if (sql.includes('INSERT INTO public.organization_contact_policies')) {
        if (values[4] !== null || stored) return { rows: [] }
        stored = { email_basis: values[1], whatsapp_basis: values[2], revision, updated_at: new Date() }
        return { rows: [stored] }
      }
      if (sql.includes('UPDATE public.organization_contact_policies')) {
        if (!stored || stored.revision !== values[4]) return { rows: [] }
        stored = { ...stored, email_basis: values[1], whatsapp_basis: values[2], revision: requestId }
        return { rows: [stored] }
      }
      throw new Error(sql)
    },
  }
  app.decorate('pg', pool as never)
  await app.register(registerCommercialEmailRoutes)
  try {
    const url = `/organizations/${organizationId}/contact-policy`
    const initial = await app.inject({ method: 'GET', url })
    expect(initial.json()).toMatchObject({ canManage: true, policy: { emailBasis: 'published_business_contact', revision: null } })
    const crossTenant = await app.inject({ method: 'GET', url: url.replace(organizationId, revision) })
    expect(crossTenant.statusCode).toBe(403)
    const payload = { emailBasis: 'explicit_opt_in', whatsappBasis: 'explicit_opt_in', revision: null }
    isOrganizationAdmin = false
    expect((await app.inject({ method: 'PUT', url, payload })).statusCode).toBe(403)
    isOrganizationAdmin = true
    const saved = await app.inject({ method: 'PUT', url, payload })
    expect(saved.statusCode, saved.body).toBe(200)
    expect(saved.json()).toMatchObject({ policy: { emailBasis: 'explicit_opt_in', revision } })
    const stale = await app.inject({ method: 'PUT', url, payload: { ...payload, revision: leadId } })
    expect(stale.statusCode).toBe(409)
  } finally {
    await app.close()
  }
})

it('confirms on GET and only unsubscribes on POST', async () => {
  const writes: string[] = []
  const token = 'abcdefghijklmnopqrstuvwxyz012345'
  const target = { id: requestId, organization_id: organizationId, lead_id: leadId,
    recipient_email: 'lead@example.com', sender_name: 'Villeman <Comercial>' }
  const handle = async (sql: string, values: unknown[] = []) => {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] }
    if (sql.includes('WHERE r.unsubscribe_token')) return { rows: values[0] === token ? [target] : [] }
    writes.push(sql.trim().split(/\s+/).slice(0, 3).join(' '))
    return { rows: [] }
  }
  const app = Fastify()
  app.decorate('pg', { query: handle, connect: async () => ({ query: handle, release() {} }) } as never)
  await app.register(registerPublicEmailRoutes)
  try {
    const view = await app.inject({ method: 'GET', url: `/unsubscribe/${token}` })
    expect(view.statusCode).toBe(200)
    expect(view.body).toContain('Villeman &lt;Comercial&gt;')
    expect(writes).toEqual([])
    const done = await app.inject({ method: 'POST', url: `/unsubscribe/${token}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'List-Unsubscribe=One-Click' })
    expect(done.statusCode).toBe(200)
    expect(done.body).toContain('não receberá novas mensagens')
    expect(writes).toEqual([
      'INSERT INTO public.email_suppression_entries',
      'INSERT INTO public.lead_channel_permissions',
      'UPDATE public.crm_sequence_enrollments SET',
      'INSERT INTO public.interactions',
    ])
    const unknown = await app.inject({ method: 'POST', url: '/unsubscribe/zzzzzzzzzzzzzzzzzzzzzzzzzzzz' })
    expect(unknown.body).toContain('não é mais válido')
    expect(consumersForEvent({ eventType: 'email.commercial.requested' })).toEqual(['crm_dispatch'])
  } finally {
    await app.close()
  }
})
