import type { AuthUser } from '../../auth/routes.js'
import { evaluatePriority, priorityDefinitionSchema, type PriorityDefinition, type PriorityInput } from './priority-model.js'
import { qualificationFieldCatalog, qualificationLeadFields } from './qualification-repository.js'
import { getInstanceAccess, getProfileConfiguration, leadProfileScopeSql, profileError, type ProfileDb } from './record-profile.js'

type ConfigRow = {
  revision: number
  draft: unknown
  active_version_id: string | null
  effects_enabled: boolean
}

type PreviewTotals = {
  processed: number
  ranked: number
  needsData: number
  excluded: number
  byQueue: Record<string, number>
}

type RunRow = {
  id: string
  as_of: Date
  revision: number
  next_cursor: string | null
  completed_at: Date | null
  totals: PreviewTotals
}

type PreviewLead = Parameters<typeof qualificationLeadFields>[0] & {
  id: string
  name: string
  city: string | null
  state: string | null
  status: string | null
  contact_blocked: boolean
}

const PAGE_SIZE = 50
const CONFIG_COLUMNS = 'revision, draft, active_version_id, effects_enabled'

async function priorityAccess(db: ProfileDb, user: AuthUser, instanceId: string) {
  const access = await getInstanceAccess(db, user, instanceId)
  const canEdit = user.role === 'yux_admin' ||
    (user.role === 'client_admin' && access.member_role === 'client_admin' && access.member_status === 'active')
  return { organizationId: access.organization_id, canEdit }
}

async function readConfig(db: ProfileDb, instanceId: string, organizationId: string, lock = false) {
  const result = await db.query<ConfigRow>(
    `SELECT ${CONFIG_COLUMNS} FROM public.crm_priority_configs
      WHERE crm_instance_id=$1 AND organization_id=$2 ${lock ? 'FOR SHARE' : ''}`,
    [instanceId, organizationId],
  )
  return result.rows[0]
}

async function readCatalog(db: ProfileDb, user: AuthUser, instanceId: string) {
  const profile = await getProfileConfiguration(db, user, instanceId)
  const fields = [
    ...qualificationFieldCatalog(profile),
    { key: 'lead.city', label: 'Cidade', type: 'text', options: [], recordTypeId: null },
    { key: 'lead.state', label: 'UF', type: 'text', options: [], recordTypeId: null },
  ]
  const stages = await db.query<{ value: string; label: string }>(
    `SELECT s.id AS value, s.name AS label FROM public.crm_pipeline_stages s
      JOIN public.crm_pipelines p ON p.id=s.pipeline_id
      WHERE p.crm_instance_id=$1 AND s.is_active ORDER BY p.name,s.order_index,s.id`, [instanceId],
  )
  return {
    recordTypes: profile.recordTypes.filter(type => type.isActive).map(({ id, name }) => ({ id, name })),
    fields: fields.map(field => field.type === 'stage' ? { ...field, type: 'select', options: stages.rows } : field),
    archivedFieldKeys: new Set(profile.fields.filter(field => !field.isActive).map(field => `custom:${field.stableKey}`)),
  }
}

type PriorityCatalog = Awaited<ReturnType<typeof readCatalog>>
type CatalogField = PriorityCatalog['fields'][number]
type Criterion = PriorityDefinition['fitGroups'][number]['alternatives'][number]

function validFieldValue(field: CatalogField, value: unknown): value is string | boolean | number {
  if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (field.type === 'boolean') return typeof value === 'boolean'
  if (typeof value !== 'string' || !value.trim()) return false
  if (field.type === 'select') return field.options.some(option => option.value === value)
  if (field.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value)
  return true
}

function validateDefinitionFields(definition: PriorityDefinition, catalog: PriorityCatalog) {
  const fields = new Map(catalog.fields.map(field => [field.key, field]))
  const recordTypes = new Set(catalog.recordTypes.map(type => type.id))
  function check(rule: Pick<Criterion, 'recordTypeId' | 'fieldKey' | 'operator' | 'comparisonValue'>, scope: string | null, hasBands = false) {
    const field = fields.get(rule.fieldKey)
    if (scope && !recordTypes.has(scope))
      throw profileError(422, 'Selecione um tipo de cliente ativo deste CRM.')
    if (!field || (field.recordTypeId && field.recordTypeId !== scope))
      throw profileError(422, 'Selecione um campo ativo e aplicável a este tipo de cliente.')
    if (hasBands) {
      if (field.type !== 'number') throw profileError(422, 'Faixas exigem um campo numérico.')
      return
    }
    if (rule.operator === 'exists') return
    if (!validFieldValue(field, rule.comparisonValue))
      throw profileError(422, 'O valor de comparação deve corresponder ao tipo do campo.')
    if (['greater_than', 'less_than', 'at_least', 'at_most'].includes(rule.operator) && field.type !== 'number')
      throw profileError(422, 'O comparador exige um campo numérico.')
    if (['contains', 'not_contains'].includes(rule.operator) && !['text', 'textarea'].includes(field.type))
      throw profileError(422, 'O comparador exige um campo de texto.')
  }

  for (const group of definition.fitGroups) {
    for (const rule of group.alternatives) check(rule, rule.recordTypeId ?? group.recordTypeId, rule.bands.length > 0)
  }
  for (const rule of definition.exclusions) check(rule, rule.recordTypeId)
}

export async function getPriorityModel(db: ProfileDb, user: AuthUser, crmInstanceId: string) {
  const access = await priorityAccess(db, user, crmInstanceId)
  const config = await readConfig(db, crmInstanceId, access.organizationId)
  const catalog = access.canEdit ? await readCatalog(db, user, crmInstanceId) : null
  return {
    revision: config?.revision ?? 0,
    draft: access.canEdit && config ? priorityDefinitionSchema.parse(config.draft) : null,
    activeVersionId: config?.active_version_id ?? null,
    effectsEnabled: config?.effects_enabled ?? false,
    canEdit: access.canEdit,
    ...(catalog ? { fields: catalog.fields, recordTypes: catalog.recordTypes } : {}),
  }
}

export async function savePriorityDraft(db: ProfileDb, user: AuthUser, input: {
  crmInstanceId: string; expectedRevision: number; definition: PriorityDefinition
}) {
  const { crmInstanceId, expectedRevision, definition } = input
  const access = await priorityAccess(db, user, crmInstanceId)
  if (!access.canEdit) throw profileError(403, 'A configuração de prioridade exige um administrador autorizado.')
  validateDefinitionFields(definition, await readCatalog(db, user, crmInstanceId))
  const params = [crmInstanceId, access.organizationId, JSON.stringify(definition), user.id]
  const result = expectedRevision === 0
    ? await db.query<ConfigRow>(
        `INSERT INTO public.crm_priority_configs (crm_instance_id,organization_id,draft,updated_by,revision)
         VALUES ($1,$2,$3,$4,1) ON CONFLICT (crm_instance_id) DO NOTHING RETURNING ${CONFIG_COLUMNS}`, params)
    : await db.query<ConfigRow>(
        `UPDATE public.crm_priority_configs SET draft=$3, updated_by=$4, updated_at=now(), revision=revision+1
          WHERE crm_instance_id=$1 AND organization_id=$2 AND revision=$5 RETURNING ${CONFIG_COLUMNS}`,
        [...params, expectedRevision])
  const saved = result.rows[0]
  if (!saved) throw profileError(409, 'O rascunho mudou. Atualize a configuração antes de salvar.')
  return { revision: saved.revision, draft: definition }
}

async function readPreviewPage(db: ProfileDb, user: AuthUser, instanceId: string, organizationId: string, cursor: string | null) {
  const result = await db.query<PreviewLead>(
    `SELECT l.id,l.name,l.record_type_id,l.company,l.source,l.value,l.stage_id,l.city,l.state,l.status,
       EXISTS (
         SELECT 1 FROM public.radar_opportunities o
         JOIN public.radar_compliance_logs c ON c.opportunity_id=o.id AND c.organization_id=o.organization_id AND c.opt_out
         WHERE o.converted_lead_id=l.id AND o.organization_id=l.organization_id
       ) AS contact_blocked
     ${leadProfileScopeSql}
       AND ci.id=$1 AND l.organization_id=$4 AND ($5::uuid IS NULL OR l.id>$5)
     ORDER BY l.id LIMIT ${PAGE_SIZE + 1}`,
    [instanceId, user.id, ['yux_admin', 'yux_operator'].includes(user.role), organizationId, cursor],
  )
  return {
    leads: result.rows.slice(0, PAGE_SIZE),
    nextCursor: result.rows.length > PAGE_SIZE ? result.rows[PAGE_SIZE - 1].id : null,
  }
}

async function readPreviewFields(db: ProfileDb, user: AuthUser, instanceId: string, organizationId: string, leads: PreviewLead[]) {
  const fieldsByLead = new Map<string, PriorityInput['fields']>()
  if (!leads.length) return { fieldsByLead, archivedFieldKeys: new Set<string>() }
  const catalog = await readCatalog(db, user, instanceId)
  const catalogByKey = new Map(catalog.fields.map(field => [field.key, field]))
  const values = await db.query<{ lead_id: string; field_key: string; value: unknown }>(
    `SELECT lead_id,field_key,value FROM public.lead_custom_field_values
      WHERE organization_id=$1 AND lead_id=ANY($2::uuid[])`, [organizationId, leads.map(lead => lead.id)],
  )
  const leadById = new Map(leads.map(lead => [lead.id, lead]))
  for (const lead of leads) {
    const candidate = { ...qualificationLeadFields(lead), 'lead.city': lead.city, 'lead.state': lead.state }
    const known = Object.entries(candidate).filter(([key, value]) => {
      const field = catalogByKey.get(key)
      return field && validFieldValue(field, value)
    })
    fieldsByLead.set(lead.id, Object.fromEntries(known))
  }
  for (const { lead_id, field_key, value } of values.rows) {
    const key = `custom:${field_key}`
    const field = catalogByKey.get(key)
    const lead = leadById.get(lead_id)
    if (field && lead && (!field.recordTypeId || field.recordTypeId === lead.record_type_id) && validFieldValue(field, value))
      fieldsByLead.get(lead_id)![key] = value
  }
  return { fieldsByLead, archivedFieldKeys: catalog.archivedFieldKeys }
}

export async function previewPriority(db: ProfileDb, user: AuthUser, input: {
  crmInstanceId: string; revision: number; runId?: string; afterId?: string
}) {
  const { crmInstanceId, revision } = input
  const { organizationId } = await priorityAccess(db, user, crmInstanceId)
  const config = await readConfig(db, crmInstanceId, organizationId, true)
  if (config?.revision !== revision)
    throw profileError(409, 'O rascunho mudou. Inicie uma nova simulação.')
  const definition = priorityDefinitionSchema.parse(config.draft)
  const emptyTotals: PreviewTotals = { processed: 0, ranked: 0, needsData: 0, excluded: 0, byQueue: {} }
  const run = input.runId
    ? (await db.query<RunRow>(
        `SELECT id,as_of,revision,next_cursor,completed_at,totals FROM public.crm_priority_preview_runs
          WHERE id=$1 AND crm_instance_id=$2 AND organization_id=$3 AND actor_id=$4
            AND as_of > now() - interval '24 hours' FOR UPDATE`,
        [input.runId, crmInstanceId, organizationId, user.id],
      )).rows[0]
    : (await db.query<RunRow>(
        `INSERT INTO public.crm_priority_preview_runs (crm_instance_id,organization_id,actor_id,revision,totals)
          VALUES ($1,$2,$3,$4,$5) RETURNING id,as_of,revision,next_cursor,completed_at,totals`,
        [crmInstanceId, organizationId, user.id, revision, JSON.stringify(emptyTotals)],
      )).rows[0]
  if (!run) throw profileError(404, 'Simulação não encontrada ou expirada.')
  if (run.revision !== revision || run.completed_at || run.next_cursor !== (input.afterId ?? null))
    throw profileError(409, 'A simulação mudou. Use o cursor atual ou inicie uma nova simulação.')

  const { leads, nextCursor } = await readPreviewPage(db, user, crmInstanceId, organizationId, run.next_cursor)
  const { fieldsByLead, archivedFieldKeys } = await readPreviewFields(db, user, crmInstanceId, organizationId, leads)
  const totals = run.totals
  const byQueue = new Map(Object.entries(totals.byQueue))
  const results = leads.map(lead => {
    const result = evaluatePriority({ id: run.id, revision, definition }, {
      leadId: lead.id, recordTypeId: lead.record_type_id, fields: fieldsByLead.get(lead.id) ?? {}, archivedFieldKeys,
      status: lead.status === 'won' || lead.status === 'lost' ? lead.status : 'open',
      deleted: false, contactBlocked: lead.contact_blocked, signals: [],
    }, run.as_of)
    totals.processed++
    if (result.state === 'needs_data') totals.needsData++
    else totals[result.state]++
    if (result.queueId) byQueue.set(result.queueId, (byQueue.get(result.queueId) ?? 0) + 1)
    return { leadId: lead.id, name: lead.name, ...result }
  })
  totals.byQueue = Object.fromEntries(byQueue)
  await db.query(
    `UPDATE public.crm_priority_preview_runs
        SET next_cursor=$2, totals=$3, completed_at=CASE WHEN $2::uuid IS NULL THEN now() ELSE NULL END
      WHERE id=$1`, [run.id, nextCursor, JSON.stringify(totals)],
  )
  return { revision, runId: run.id, results, nextCursor, totals, asOf: run.as_of.toISOString(), mode: 'profile_only' as const }
}
