import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import type pg from 'pg'
import { registerCrmRoutes } from '../src/modules/crm/routes.js'
import { validateProfileValues, fieldInputSchema, getProfileConfiguration, createProfileField, saveLeadProfile, inProfileTransaction } from '../src/modules/crm/record-profile.js'

const definition = (fieldType: string, required = false) => ({
  stableKey: 'quantity', label: 'Quantidade', fieldType, required, options: ['A', 'B'],
})

const ids = {
  instance: '00000000-0000-4000-8000-000000000001',
  lead: '00000000-0000-4000-8000-000000000002',
  kitchen: '00000000-0000-4000-8000-000000000003',
  market: '00000000-0000-4000-8000-000000000004',
  org: '00000000-0000-4000-8000-000000000005',
  user: '00000000-0000-4000-8000-000000000006',
  pipeline: '00000000-0000-4000-8000-000000000007',
  stage: '00000000-0000-4000-8000-000000000008',
}
const admin = { id: ids.user, name: 'Admin', email: 'admin@test.com', role: 'yux_admin' }

class ProfilePool {
  statements: string[] = []
  upserts: unknown[][] = []
  typeExists = true
  leadExists = true
  instanceExists = true
  limit = 20
  count = 0
  memberRole = 'client_admin'
  memberStatus = 'active'
  allowCustomization = true
  recordTypeId: string | null = ids.kitchen
  values: Record<string, unknown> = { kitchens: 2, stores: 5 }
  fields = [
    { id: 'field-k', crm_instance_id: ids.instance, stable_key: 'kitchens', label: 'Cozinhas', field_type: 'number', required: true, record_type_id: ids.kitchen, options: [], is_active: true, version_number: 1, order_index: 0 },
    { id: 'field-m', crm_instance_id: ids.instance, stable_key: 'stores', label: 'Lojas', field_type: 'number', required: false, record_type_id: ids.market, options: [], is_active: true, version_number: 1, order_index: 1 },
    { id: 'field-c', crm_instance_id: ids.instance, stable_key: 'contact', label: 'Contato', field_type: 'text', required: false, record_type_id: null, options: [], is_active: true, version_number: 1, order_index: 2 },
  ]
  async connect() { return this }
  release() {}
  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.statements.push(sql)
    if (sql.includes('FROM public.leads l JOIN')) return { rows: this.leadExists ? [{
      id: ids.lead, organization_id: ids.org, crm_instance_id: ids.instance, record_type_id: this.recordTypeId,
    }] : [] }
    if (sql.includes('FROM public.crm_instances ci')) return { rows: this.instanceExists ? [{
      id: ids.instance, organization_id: ids.org, max_custom_field_count: this.limit,
      allow_client_field_customization: this.allowCustomization, member_role: this.memberRole, member_status: this.memberStatus,
    }] : [] }
    if (sql.includes('FROM public.crm_record_types')) return { rows: this.typeExists ? [{ id: params[0], crm_instance_id: ids.instance, name: 'Cozinha industrial', is_active: true }] : [] }
    if (sql.includes('COUNT(DISTINCT stable_key)')) return { rows: [{ count: this.count }] }
    if (sql.includes('FROM public.crm_custom_field_definitions')) return { rows: this.fields }
    if (sql.includes('FROM public.lead_custom_field_values')) return { rows: Object.entries(this.values).map(([field_key, value]) => ({ field_key, value })) }
    if (sql.includes('INSERT INTO public.lead_custom_field_values')) { this.upserts.push(params); return { rows: [] } }
    if (sql.includes('INSERT INTO public.leads')) return { rows: [{ id: ids.lead, organization_id: ids.org, crm_instance_id: ids.instance, name: 'Novo lead' }] }
    return { rows: [] }
  }
  asPool() { return this as unknown as pg.Pool }
}

describe('CRM record profile persistence and isolation', () => {
  it('preserves answers for other types when switching a lead', async () => {
    const pool = new ProfilePool()
    const result = await saveLeadProfile(pool.asPool(), admin, ids.lead, { recordTypeId: ids.market, values: { stores: 8 } })
    expect(result.values).toEqual({ kitchens: 2, stores: 8 })
    expect(pool.upserts.map(params => params[2])).toEqual(['stores'])
    expect(pool.statements.some(sql => sql.includes('DELETE'))).toBe(false)
  })

  it('rejects fields from another record type without writing values', async () => {
    const pool = new ProfilePool()
    await expect(saveLeadProfile(pool.asPool(), admin, ids.lead, { recordTypeId: ids.kitchen, values: { stores: 4 } })).rejects.toThrow('não pertence')
    expect(pool.upserts).toHaveLength(0)
  })

  it('rejects record types that are not in the CRM', async () => {
    const pool = new ProfilePool(); pool.typeExists = false
    await expect(saveLeadProfile(pool.asPool(), admin, ids.lead, { recordTypeId: ids.market, values: {} })).rejects.toThrow('Tipo de cliente inválido')
  })

  it('rejects inaccessible leads and instances', async () => {
    const pool = new ProfilePool(); pool.leadExists = false
    await expect(saveLeadProfile(pool.asPool(), admin, ids.lead, { recordTypeId: null, values: {} })).rejects.toThrow('sem acesso')
    pool.instanceExists = false
    await expect(getProfileConfiguration(pool.asPool(), admin, ids.instance)).rejects.toThrow('sem acesso')
  })

  it('does not authorize invited members or sellers to configure fields', async () => {
    const pool = new ProfilePool()
    const client = { ...admin, role: 'client' }
    pool.memberRole = 'seller'
    expect((await getProfileConfiguration(pool.asPool(), client, ids.instance)).canConfigure).toBe(false)
    await expect(createProfileField(pool.asPool(), client, fieldInputSchema.parse({ crmInstanceId: ids.instance, label: 'A', fieldType: 'text' }))).rejects.toThrow('administrador')
    pool.memberStatus = 'invited'
    await expect(getProfileConfiguration(pool.asPool(), client, ids.instance)).rejects.toThrow('acesso ativo')
  })

  it('honors customization permissions and the contracted field limit', async () => {
    const pool = new ProfilePool(); pool.allowCustomization = false
    expect((await getProfileConfiguration(pool.asPool(), { ...admin, role: 'client' }, ids.instance)).canConfigure).toBe(false)
    pool.count = pool.limit
    await expect(createProfileField(pool.asPool(), admin, fieldInputSchema.parse({ crmInstanceId: ids.instance, label: 'A', fieldType: 'text' }))).rejects.toThrow('Limite')
    expect(pool.statements).toContain('ROLLBACK')
  })

  it('uses only common fields for a legacy lead without a type', async () => {
    const pool = new ProfilePool(); pool.recordTypeId = null
    const result = await saveLeadProfile(pool.asPool(), admin, ids.lead, { recordTypeId: null, values: { contact: 'Ana' } })
    expect(result.recordTypeId).toBeNull()
    expect(result.values).toEqual({ kitchens: 2, stores: 5, contact: 'Ana' })
  })

  it('rolls back and releases the client when validation fails', async () => {
    const pool = new ProfilePool(); pool.values = {}
    await expect(inProfileTransaction(pool.asPool(), db => saveLeadProfile(db, admin, ids.lead, { recordTypeId: ids.kitchen, values: {} }))).rejects.toThrow('Cozinhas')
    expect(pool.statements[0]).toBe('BEGIN')
    expect(pool.statements.at(-1)).toBe('ROLLBACK')
    expect(pool.statements).not.toContain('COMMIT')
  })
})

describe('CRM profile HTTP routes', () => {
  async function appFor(pool: ProfilePool, authenticated = true) {
    const app = Fastify()
    await app.register(cookie)
    app.decorate('pg', pool.asPool())
    app.decorate('config', { SESSION_COOKIE_NAME: 'yux_session' } as never)
    app.decorate('authStore', { findUserBySession: async () => authenticated ? admin : null } as never)
    await app.register(registerCrmRoutes, { prefix: '/crm' })
    return app
  }

  it('requires authentication on configuration endpoints', async () => {
    const app = await appFor(new ProfilePool(), false)
    try {
      const response = await app.inject({ url: `/crm/record-profile/configuration?crmInstanceId=${ids.instance}` })
      expect(response.statusCode).toBe(401)
    } finally { await app.close() }
  })

  it('rejects invalid numeric profile values before writing answers', async () => {
    const pool = new ProfilePool(); const app = await appFor(pool)
    try {
      const response = await app.inject({ method: 'PUT', url: `/crm/leads/${ids.lead}/profile`, cookies: { yux_session: 'token' },
        payload: { recordTypeId: ids.kitchen, values: { kitchens: 'a lot' } } })
      expect(response.statusCode).toBe(422)
      expect(response.json().message).toContain('Cozinhas')
      expect(pool.upserts).toHaveLength(0)
    } finally { await app.close() }
  })

  it('rolls back lead creation when its profile fails validation', async () => {
    const pool = new ProfilePool(); pool.values = {}; const app = await appFor(pool)
    try {
      const response = await app.inject({ method: 'POST', url: '/crm/leads', cookies: { yux_session: 'token' }, payload: {
        organizationId: ids.org, crmInstanceId: ids.instance, pipelineId: ids.pipeline, stageId: ids.stage,
        name: 'Nova cozinha', email: 'nova@test.com', source: 'manual', profile: { recordTypeId: ids.kitchen, values: {} },
      } })
      expect(response.statusCode).toBe(422)
      expect(pool.statements.some(sql => sql.includes('INSERT INTO public.leads'))).toBe(true)
      expect(pool.statements.at(-1)).toBe('ROLLBACK')
      expect(pool.statements).not.toContain('COMMIT')
    } finally { await app.close() }
  })
})

describe('CRM record profile validation', () => {
  it('accepts zero and false as required answers', () => {
    expect(validateProfileValues([definition('number', true)], { quantity: 0 })).toEqual({ quantity: 0 })
    expect(validateProfileValues([definition('boolean', true)], { quantity: false })).toEqual({ quantity: false })
  })

  it('rejects missing required answers and unknown or inapplicable fields', () => {
    expect(() => validateProfileValues([definition('text', true)], { quantity: '  ' })).toThrow('Quantidade')
    expect(() => validateProfileValues([], { other_client_field: 'value' })).toThrow('não pertence')
  })

  it.each([
    ['number', '12'], ['number', Infinity], ['boolean', 'false'],
    ['date', '2026-02-30'], ['date', '29/10/2026'], ['select', 'C'], ['text', {}],
  ])('rejects invalid %s values (%s)', (fieldType, value) => {
    expect(() => validateProfileValues([definition(fieldType)], { quantity: value })).toThrow()
  })

  it('accepts valid dates and trims text', () => {
    expect(validateProfileValues([definition('date')], { quantity: '2028-02-29' })).toEqual({ quantity: '2028-02-29' })
    expect(validateProfileValues([definition('text')], { quantity: '  Cozinha  ' })).toEqual({ quantity: 'Cozinha' })
  })

  it('allows explicitly clearing optional answers', () => {
    expect(validateProfileValues([definition('number')], { quantity: null })).toEqual({ quantity: null })
  })

  it('requires unique, nonempty options for selection fields', () => {
    const base = { crmInstanceId: '00000000-0000-4000-8000-000000000001', label: 'Porte', fieldType: 'select' }
    expect(fieldInputSchema.safeParse({ ...base, options: [] }).success).toBe(false)
    expect(fieldInputSchema.safeParse({ ...base, options: ['A', 'A'] }).success).toBe(false)
    expect(fieldInputSchema.safeParse({ ...base, options: ['A', 'B'] }).success).toBe(true)
  })
})
