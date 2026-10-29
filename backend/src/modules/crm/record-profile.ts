import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import { z } from 'zod'

export type ProfileDb = Pick<pg.Pool, 'query'>
export type ProfileValue = string | number | boolean | null
export type ProfileDefinition = {
  stableKey: string; label: string; fieldType: string; required: boolean; options: string[]
}
type DefinitionRow = {
  id: string; crm_instance_id: string; stable_key: string; label: string; field_type: string
  record_type_id: string | null; required: boolean; options: string[]; order_index: number; is_active: boolean; version_number: number
}
type TypeRow = { id: string; name: string; crm_instance_id: string; is_active: boolean }
type InstanceAccess = {
  id: string; organization_id: string; max_custom_field_count: number
  allow_client_field_customization: boolean; member_role: string | null; member_status: string | null
}
type LeadAccess = {
  id: string; organization_id: string; crm_instance_id: string | null; record_type_id: string | null
  owner_member_id: string | null; assigned_to: string | null; owner_id: string | null; team_id: string | null
}

const fieldTypeSchema = z.enum(['text', 'textarea', 'number', 'date', 'select', 'boolean'])
export const profileInputSchema = z.object({
  recordTypeId: z.string().uuid().nullable(),
  values: z.record(z.string().min(1).max(150), z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()])),
}).strict()
export type ProfileInput = z.infer<typeof profileInputSchema>
export const recordTypeInputSchema = z.object({
  crmInstanceId: z.string().uuid(), name: z.string().trim().min(1).max(100),
}).strict()
export const recordTypePatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(), isActive: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0)
export const fieldInputSchema = z.object({
  crmInstanceId: z.string().uuid(), recordTypeId: z.string().uuid().nullable().default(null),
  label: z.string().trim().min(1).max(120), fieldType: fieldTypeSchema,
  required: z.boolean().default(false), options: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  orderIndex: z.number().int().min(0).max(10000).default(0),
}).strict().refine(value => value.fieldType !== 'select' || (value.options.length > 0 && new Set(value.options).size === value.options.length), {
  message: 'Informe opções diferentes para o campo de seleção.', path: ['options'],
})
// Data types and scope are immutable: existing answers must keep their meaning.
export const fieldPatchSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(), required: z.boolean().optional(),
  isActive: z.boolean().optional(), orderIndex: z.number().int().min(0).max(10000).optional(),
}).strict().refine(value => Object.keys(value).length > 0)

export function validateProfileValues(definitions: ProfileDefinition[], values: Record<string, unknown>) {
  const byKey = new Map(definitions.map(field => [field.stableKey, field]))
  const result: Record<string, ProfileValue> = {}
  for (const key of Object.keys(values)) {
    if (!byKey.has(key)) throw profileError(422, 'O campo informado não pertence a este tipo de cliente.')
  }
  for (const field of definitions) {
    const value = values[field.stableKey]
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
      if (field.required) throw profileError(422, `Preencha o campo obrigatório: ${field.label}.`)
      if (value !== undefined) result[field.stableKey] = null
      continue
    }
    let valid = false
    if (['text', 'textarea'].includes(field.fieldType)) valid = typeof value === 'string' && value.length <= 10000
    if (field.fieldType === 'number') valid = typeof value === 'number' && Number.isFinite(value)
    if (field.fieldType === 'boolean') valid = typeof value === 'boolean'
    if (field.fieldType === 'select') valid = typeof value === 'string' && Array.isArray(field.options) && field.options.includes(value)
    if (field.fieldType === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(`${value}T00:00:00Z`)
      valid = Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    }
    if (!valid) throw profileError(422, `Valor inválido para o campo: ${field.label}.`)
    result[field.stableKey] = typeof value === 'string' ? value.trim() : value as ProfileValue
  }
  return result
}

export async function getProfileConfiguration(db: ProfileDb, user: AuthUser, instanceId: string) {
  const access = await getInstanceAccess(db, user, instanceId)
  const [types, fields] = await Promise.all([
    db.query<TypeRow>('SELECT * FROM public.crm_record_types WHERE crm_instance_id = $1 ORDER BY name, id', [instanceId]),
    db.query<DefinitionRow>(`SELECT * FROM public.crm_custom_field_definitions
      WHERE crm_instance_id = $1 ORDER BY order_index, version_number DESC, created_at`, [instanceId]),
  ])
  // Historical versions share a stable key. Only the most recent definition applies.
  const latest = new Map<string, DefinitionRow>()
  for (const field of [...fields.rows].sort((a, b) => b.version_number - a.version_number)) {
    if (!latest.has(field.stable_key)) latest.set(field.stable_key, field)
  }
  return {
    recordTypes: types.rows.map(mapRecordType),
    fields: [...latest.values()].sort((a, b) => a.order_index - b.order_index).map(mapField),
    canConfigure: canConfigure(access, user), maxFieldCount: access.max_custom_field_count,
  }
}

export async function createRecordType(db: ProfileDb, user: AuthUser, input: z.infer<typeof recordTypeInputSchema>) {
  const access = await getInstanceAccess(db, user, input.crmInstanceId, true)
  try {
    const result = await db.query<TypeRow>(`INSERT INTO public.crm_record_types (organization_id, crm_instance_id, name)
      VALUES ($1, $2, $3) RETURNING *`, [access.organization_id, input.crmInstanceId, input.name])
    return mapRecordType(result.rows[0])
  } catch (error) { throw mapConflict(error) }
}

export async function patchRecordType(db: ProfileDb, user: AuthUser, id: string, patch: z.infer<typeof recordTypePatchSchema>) {
  const found = await db.query<TypeRow>('SELECT * FROM public.crm_record_types WHERE id = $1', [id])
  if (!found.rows[0]) throw profileError(404, 'Tipo de cliente não encontrado.')
  await getInstanceAccess(db, user, found.rows[0].crm_instance_id, true)
  try {
    const result = await db.query<TypeRow>(`UPDATE public.crm_record_types
      SET name = COALESCE($2, name), is_active = COALESCE($3, is_active), updated_at = NOW()
      WHERE id = $1 RETURNING *`, [id, patch.name ?? null, patch.isActive ?? null])
    return mapRecordType(result.rows[0])
  } catch (error) { throw mapConflict(error) }
}

export async function createProfileField(pool: pg.Pool, user: AuthUser, input: z.infer<typeof fieldInputSchema>) {
  return inProfileTransaction(pool, async db => {
    const access = await getInstanceAccess(db, user, input.crmInstanceId, true)
    await db.query('SELECT id FROM public.crm_instances WHERE id = $1 FOR UPDATE', [input.crmInstanceId])
    if (input.recordTypeId) await requireRecordType(db, input.crmInstanceId, input.recordTypeId)
    await assertFieldLimit(db, access)
    const result = await db.query<DefinitionRow>(`INSERT INTO public.crm_custom_field_definitions
      (crm_instance_id, stable_key, label, field_type, options, required, record_type_id, order_index)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8) RETURNING *`,
    [input.crmInstanceId, `custom_${randomUUID()}`, input.label, input.fieldType,
      JSON.stringify(input.fieldType === 'select' ? input.options : []), input.required, input.recordTypeId, input.orderIndex])
    return mapField(result.rows[0])
  })
}

export async function patchProfileField(pool: pg.Pool, user: AuthUser, id: string, patch: z.infer<typeof fieldPatchSchema>) {
  return inProfileTransaction(pool, async db => {
    const found = await db.query<DefinitionRow>('SELECT * FROM public.crm_custom_field_definitions WHERE id = $1', [id])
    const field = found.rows[0]
    if (!field) throw profileError(404, 'Campo personalizado não encontrado.')
    const access = await getInstanceAccess(db, user, field.crm_instance_id, true)
    await db.query('SELECT id FROM public.crm_instances WHERE id = $1 FOR UPDATE', [field.crm_instance_id])
    if (!field.is_active && patch.isActive) await assertFieldLimit(db, access)
    const result = await db.query<DefinitionRow>(`UPDATE public.crm_custom_field_definitions
      SET label = COALESCE($2, label), required = COALESCE($3, required),
          is_active = COALESCE($4, is_active), order_index = COALESCE($5, order_index), updated_at = NOW()
      WHERE id = $1 RETURNING *`, [id, patch.label ?? null, patch.required ?? null, patch.isActive ?? null, patch.orderIndex ?? null])
    return mapField(result.rows[0])
  })
}

export async function getLeadProfile(db: ProfileDb, user: AuthUser, leadId: string) {
  const lead = await getLeadAccess(db, user, leadId)
  const configuration = await getProfileConfiguration(db, user, lead.crm_instance_id!)
  const values = await readValues(db, lead.id)
  return { ...configuration, recordTypeId: lead.record_type_id, values }
}

// Caller owns the transaction, including when this is part of creating a lead.
export async function saveLeadProfile(db: ProfileDb, user: AuthUser, leadId: string, input: ProfileInput, newlyCreated = false) {
  const lead = await getLeadAccess(db, user, leadId, true, newlyCreated)
  const instanceId = lead.crm_instance_id!
  await getInstanceAccess(db, user, instanceId)
  if (input.recordTypeId) await requireRecordType(db, instanceId, input.recordTypeId, input.recordTypeId === lead.record_type_id)
  const definitions = await db.query<DefinitionRow>(`SELECT DISTINCT ON (stable_key) *
    FROM public.crm_custom_field_definitions WHERE crm_instance_id = $1
    ORDER BY stable_key, version_number DESC`, [instanceId])
  const applicable = definitions.rows.filter(field => field.is_active && (!field.record_type_id || field.record_type_id === input.recordTypeId))
  const previous = await readValues(db, leadId)
  const merged = Object.fromEntries(applicable.map(field => [field.stable_key, previous[field.stable_key]]))
  const validated = validateProfileValues(applicable.map(mapField), { ...merged, ...input.values })
  for (const field of applicable) {
    if (!(field.stable_key in validated)) continue
    await db.query(`INSERT INTO public.lead_custom_field_values (organization_id, lead_id, field_key, field_label, value)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (lead_id, field_key) DO UPDATE SET field_label = EXCLUDED.field_label, value = EXCLUDED.value, updated_at = NOW()`,
    [lead.organization_id, lead.id, field.stable_key, field.label, JSON.stringify(validated[field.stable_key])])
  }
  await db.query(`UPDATE public.leads SET record_type_id = $2, crm_instance_id = $3, updated_at = NOW() WHERE id = $1`,
    [lead.id, input.recordTypeId, instanceId])
  return { recordTypeId: input.recordTypeId, values: { ...previous, ...validated } }
}

export async function inProfileTransaction<T>(pool: pg.Pool, work: (db: ProfileDb) => Promise<T>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}

async function readValues(db: ProfileDb, leadId: string) {
  const result = await db.query<{ field_key: string; value: ProfileValue }>(
    'SELECT field_key, value FROM public.lead_custom_field_values WHERE lead_id = $1', [leadId])
  return Object.fromEntries(result.rows.map(row => [row.field_key, row.value])) as Record<string, ProfileValue>
}

async function getInstanceAccess(db: ProfileDb, user: AuthUser, instanceId: string, configure = false) {
  const result = await db.query<InstanceAccess>(`SELECT ci.id, ci.organization_id, ci.max_custom_field_count,
      ci.allow_client_field_customization, member.role::text AS member_role, member.status::text AS member_status
    FROM public.crm_instances ci
    LEFT JOIN public.crm_instance_members member ON member.crm_instance_id = ci.id AND member.user_id = $2
    WHERE ci.id = $1 AND ci.status = 'active' AND ($3::boolean OR EXISTS (
      SELECT 1 FROM public.memberships m WHERE m.user_id = $2 AND m.organization_id = ci.organization_id
    ))`, [instanceId, user.id, isInternal(user)])
  const access = result.rows[0]
  if (!access) throw profileError(404, 'CRM não encontrado ou sem acesso.')
  if (!isInternal(user) && (access.member_status !== 'active' || !access.member_role)) throw profileError(403, 'Você não tem acesso ativo a este CRM.')
  if (configure && !canConfigure(access, user)) throw profileError(403, 'A configuração de campos exige um administrador autorizado do CRM.')
  return access
}

async function getLeadAccess(db: ProfileDb, user: AuthUser, leadId: string, lock = false, newlyCreated = false) {
  const result = await db.query<LeadAccess>(`SELECT l.id, l.organization_id, COALESCE(l.crm_instance_id, p.crm_instance_id) AS crm_instance_id,
      l.record_type_id, l.owner_member_id, l.owner_id, l.assigned_to, l.team_id
    FROM public.leads l JOIN public.crm_pipelines p ON p.id = l.pipeline_id AND p.organization_id = l.organization_id
    JOIN public.crm_instances ci ON ci.id = COALESCE(l.crm_instance_id, p.crm_instance_id) AND ci.organization_id = l.organization_id
      AND (p.crm_instance_id IS NULL OR l.crm_instance_id IS NULL OR p.crm_instance_id = l.crm_instance_id)
    WHERE l.id = $1 AND ($3::boolean OR EXISTS (
      SELECT 1 FROM public.crm_instance_members member
      JOIN public.memberships m ON m.user_id = member.user_id AND m.organization_id = l.organization_id
      WHERE member.crm_instance_id = ci.id AND member.user_id = $2 AND member.status = 'active'
        AND (member.role IN ('client_admin', 'yux_admin')
          OR l.owner_member_id = member.id OR l.owner_id = $2 OR l.assigned_to = $2
          OR (member.role = 'manager' AND EXISTS (
            SELECT 1 FROM public.crm_team_members tm WHERE tm.team_id = l.team_id AND tm.member_id = member.id AND tm.role = 'manager'
          )))
    )) ${lock ? 'FOR UPDATE OF l' : ''}`, [leadId, user.id, isInternal(user) || newlyCreated])
  if (!result.rows[0]) throw profileError(404, 'Lead não encontrado ou sem acesso.')
  return result.rows[0]
}

async function requireRecordType(db: ProfileDb, instanceId: string, typeId: string, allowArchived = false) {
  const result = await db.query<TypeRow>(`SELECT * FROM public.crm_record_types
    WHERE id = $1 AND crm_instance_id = $2 AND (is_active OR $3::boolean)`, [typeId, instanceId, allowArchived])
  if (!result.rows[0]) throw profileError(422, 'Tipo de cliente inválido para este CRM.')
}

async function assertFieldLimit(db: ProfileDb, access: InstanceAccess) {
  const result = await db.query<{ count: number }>(`SELECT COUNT(DISTINCT stable_key)::int AS count
    FROM public.crm_custom_field_definitions WHERE crm_instance_id = $1 AND is_active`, [access.id])
  if (Number(result.rows[0]?.count ?? 0) >= access.max_custom_field_count) throw profileError(409, 'Limite de campos personalizados do contrato atingido.')
}

function canConfigure(access: InstanceAccess, user: AuthUser) {
  return isInternal(user) || (access.allow_client_field_customization && access.member_status === 'active' && ['client_admin', 'yux_admin'].includes(access.member_role ?? ''))
}
function isInternal(user: AuthUser) { return ['yux_admin', 'yux_operator'].includes(user.role) }
function mapRecordType(row: TypeRow) { return { id: row.id, crmInstanceId: row.crm_instance_id, name: row.name, isActive: row.is_active } }
function mapField(row: DefinitionRow) {
  return { id: row.id, crmInstanceId: row.crm_instance_id, stableKey: row.stable_key, label: row.label,
    fieldType: row.field_type, recordTypeId: row.record_type_id, options: row.options, required: row.required,
    orderIndex: row.order_index, isActive: row.is_active }
}
function mapConflict(error: unknown) {
  return (error as { code?: string }).code === '23505' ? profileError(409, 'Já existe um tipo de cliente com este nome.') : error
}
export function profileError(statusCode: number, message: string) { return Object.assign(new Error(message), { statusCode }) }
