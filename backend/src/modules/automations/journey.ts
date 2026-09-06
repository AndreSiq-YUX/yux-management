import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import { getAutomationFlow, saveAutomationSimulation } from './repository.js'

type RecordValue = Record<string, unknown>

const actionTypes = new Set([
  'create_task', 'change_stage', 'move_to_pipeline', 'assign_owner', 'send_whatsapp', 'send_email',
  'create_ticket', 'update_field', 'register_activity', 'webhook', 'call_api', 'convert_proposal',
  'create_project', 'create_invoice', 'ai_classify_lead', 'ai_generate_message', 'ai_generate_proposal',
  'enroll_sequence', 'pause_sequence', 'add_tag', 'adjust_score',
])
const conditionOperators = new Set(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'exists'])
const externalActionTypes = new Set(['send_whatsapp', 'send_email', 'webhook', 'call_api'])

export type AutomationValidation = { valid: boolean; errors: string[] }

export function validateAutomationDefinition(flow: any): AutomationValidation {
  const errors: string[] = []
  if (!Array.isArray(flow.triggers) || flow.triggers.length === 0) errors.push('automation_trigger_required')
  if (!Array.isArray(flow.actions) || flow.actions.length === 0) errors.push('automation_action_required')
  if ((flow.triggers?.length ?? 0) > 20) errors.push('automation_trigger_limit_exceeded')
  if ((flow.conditions?.length ?? 0) > 100) errors.push('automation_condition_limit_exceeded')
  if ((flow.actions?.length ?? 0) > 100) errors.push('automation_action_limit_exceeded')
  if (!Number.isInteger(flow.dailyRunLimit) || flow.dailyRunLimit < 0 || flow.dailyRunLimit > 100_000) {
    errors.push('automation_daily_run_limit_invalid')
  }
  for (const trigger of flow.triggers ?? []) {
    if (!nonEmpty(trigger.triggerType)) errors.push('automation_trigger_type_required')
  }
  const positions = new Set<number>()
  for (const action of flow.actions ?? []) {
    if (!actionTypes.has(action.actionType)) errors.push(`automation_action_type_unregistered:${action.actionType}`)
    if (positions.has(Number(action.orderIndex))) errors.push('automation_action_order_duplicated')
    positions.add(Number(action.orderIndex))
    if (action.actionType === 'create_task' && !nonEmpty(action.payload?.title)) errors.push('automation_create_task_title_required')
    if (action.actionType === 'move_to_pipeline' && !nonEmpty(action.payload?.pipelineId)) errors.push('automation_pipeline_id_required')
    if (action.actionType === 'change_stage' && !nonEmpty(action.payload?.stageId)) errors.push('automation_stage_id_required')
    if (action.actionType === 'update_field' && (!nonEmpty(action.payload?.field) || !Object.hasOwn(action.payload ?? {}, 'value'))) errors.push('automation_update_field_input_required')
    if (action.actionType === 'enroll_sequence' && !nonEmpty(action.payload?.sequenceId)) errors.push('automation_sequence_id_required')
    if (action.actionType === 'pause_sequence' && !nonEmpty(action.payload?.sequenceId) && !nonEmpty(action.payload?.enrollmentId)) errors.push('automation_pause_sequence_target_required')
    if (action.actionType === 'add_tag' && !nonEmpty(action.payload?.tagId) && !nonEmpty(action.payload?.tagName) && !nonEmpty(action.payload?.name)) errors.push('automation_tag_required')
    if (action.actionType === 'adjust_score' && !Number.isFinite(Number(action.payload?.delta))) errors.push('automation_score_delta_required')
    if (externalActionTypes.has(action.actionType) && flow.requiresHumanApproval !== true) errors.push('automation_external_action_requires_approval')
  }
  for (const condition of flow.conditions ?? []) {
    if (!conditionOperators.has(condition.operator)) errors.push(`automation_condition_operator_unregistered:${condition.operator}`)
    if (!nonEmpty(condition.field)) errors.push('automation_condition_field_required')
  }
  errors.push(...validateGraph(flow.graph))
  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}

export async function simulateAutomationJourney(pool: pg.Pool, user: AuthUser, input: {
  flowId: string; organizationId: string; eventType: string; samplePayload: RecordValue
}) {
  const flow = await ownedFlow(pool, user, input.flowId, input.organizationId)
  const validation = validateAutomationDefinition(flow)
  if (!validation.valid) throw domainError(422, 'automation_graph_invalid', validation.errors)
  const triggerMatched = flow.triggers.some((trigger: any) => trigger.triggerType === '*' || trigger.triggerType === input.eventType)
  const conditionResults = flow.conditions.map((condition: any) => {
    const actual = readPath(input.samplePayload, condition.field)
    const passed = evaluateCondition(actual, condition.operator, condition.value)
    return { conditionId: condition.id ?? null, field: condition.field, operator: condition.operator, passed }
  })
  const matched = triggerMatched && conditionResults.every((item: { passed: boolean }) => item.passed)
  const result = {
    matched,
    triggerMatched,
    conditionResults,
    plannedActions: matched ? flow.actions.map((action: any) => ({ id: action.id, actionType: action.actionType, orderIndex: action.orderIndex, payload: action.payload })) : [],
    blockedReasons: triggerMatched ? conditionResults.filter((item: { passed: boolean }) => !item.passed).map((item: any) => `condition_failed:${item.field}`) : ['trigger_not_matched'],
  }
  const simulation = await saveAutomationSimulation(pool, user, {
    organizationId: input.organizationId, flowId: input.flowId, eventType: input.eventType,
    samplePayload: input.samplePayload, matched: result.matched, conditionResults: result.conditionResults,
    plannedActions: result.plannedActions, blockedReasons: result.blockedReasons,
  })
  return { ...result, simulationId: simulation.id }
}

export async function activateAutomationFlow(pool: pg.Pool, user: AuthUser, flowId: string, organizationId: string) {
  const flow = await ownedFlow(pool, user, flowId, organizationId)
  await requireAutomationWrite(pool, user, organizationId)
  const validation = validateAutomationDefinition(flow)
  if (!validation.valid) throw domainError(422, 'automation_graph_invalid', validation.errors)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM public.automation_flows WHERE id = $1 AND organization_id = $2 FOR UPDATE', [flowId, organizationId])
    const version = await client.query<{ version_number: number }>(
      'SELECT COALESCE(MAX(version_number),0)::int + 1 AS version_number FROM public.automation_flow_versions WHERE flow_id = $1',
      [flowId],
    )
    const versionNumber = Number(version.rows[0]?.version_number ?? 1)
    const snapshot = {
      triggers: flow.triggers,
      conditions: flow.conditions,
      actions: flow.actions,
      graph: flow.graph ?? null,
      dailyRunLimit: flow.dailyRunLimit,
      allowReentry: flow.allowReentry ?? false,
      reentryCooldownMinutes: flow.reentryCooldownMinutes ?? 0,
      requiresHumanApproval: flow.requiresHumanApproval,
      riskLevel: flow.riskLevel,
    }
    const created = await client.query<{ id: string }>(
      `INSERT INTO public.automation_flow_versions (flow_id,version_number,status,snapshot,published_by,published_at)
       VALUES ($1,$2,'published',$3,$4,NOW()) RETURNING id`,
      [flowId, versionNumber, snapshot, user.id],
    )
    const versionId = created.rows[0]?.id
    if (!versionId) throw new Error('automation_version_not_created')
    await client.query(
      `UPDATE public.automation_flow_versions SET status='archived'
       WHERE flow_id=$1 AND id<>$2 AND status='published'`,
      [flowId, versionId],
    )
    await client.query(
      `UPDATE public.automation_flows SET status='published',is_enabled=TRUE,active_version_id=$2,published_version=$3,last_error=NULL,updated_at=NOW()
       WHERE id=$1`,
      [flowId, versionId, versionNumber],
    )
    await client.query('COMMIT')
    return { flow: await getAutomationFlow(pool, user, flowId), publishedVersion: { id: versionId, versionNumber } }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function activateAutomationVersion(
  pool: pg.Pool,
  user: AuthUser,
  flowId: string,
  versionId: string,
  organizationId: string,
) {
  const flow = await ownedFlow(pool, user, flowId, organizationId)
  await requireAutomationWrite(pool, user, organizationId)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM public.automation_flows WHERE id=$1 AND organization_id=$2 FOR UPDATE', [flowId, organizationId])
    const version = await client.query<{ id: string; version_number: number; snapshot: RecordValue; status: string }>(
      `SELECT id,version_number,snapshot,status FROM public.automation_flow_versions
       WHERE id=$1 AND flow_id=$2 AND status IN ('published','archived') LIMIT 1 FOR UPDATE`,
      [versionId, flowId],
    )
    const selected = version.rows[0]
    if (!selected) throw domainError(422, 'automation_approved_version_required')
    const validation = validateAutomationDefinition({
      ...selected.snapshot,
      dailyRunLimit: selected.snapshot.dailyRunLimit ?? flow.dailyRunLimit,
      requiresHumanApproval: selected.snapshot.requiresHumanApproval ?? flow.requiresHumanApproval,
    })
    if (!validation.valid) throw domainError(422, 'automation_graph_invalid', validation.errors)
    await client.query(
      `UPDATE public.automation_flow_versions SET status='archived'
       WHERE flow_id=$1 AND id<>$2 AND status='published'`,
      [flowId, versionId],
    )
    await client.query(`UPDATE public.automation_flow_versions SET status='published' WHERE id=$1`, [versionId])
    await client.query(
      `UPDATE public.automation_flows SET status='published',is_enabled=TRUE,active_version_id=$2,published_version=$3,last_error=NULL,updated_at=NOW()
       WHERE id=$1 AND organization_id=$4`,
      [flowId, versionId, Number(selected.version_number), organizationId],
    )
    await client.query('COMMIT')
    return { flow: await getAutomationFlow(pool, user, flowId), publishedVersion: { id: versionId, versionNumber: Number(selected.version_number) } }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function duplicateAutomationFlow(pool: pg.Pool, user: AuthUser, flowId: string, organizationId: string) {
  const source = await ownedFlow(pool, user, flowId, organizationId)
  await requireAutomationWrite(pool, user, organizationId)
  const copyId = randomUUID()
  const copyName = `${source.name} (cópia ${copyId.slice(0, 6)})`
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO public.automation_flows
       (id,organization_id,name,description,status,is_enabled,sector_template_key,automation_kind,builder_mode,daily_run_limit,requires_human_approval,risk_level,graph)
       SELECT $1,organization_id,$2,description,'draft',FALSE,sector_template_key,automation_kind,builder_mode,daily_run_limit,requires_human_approval,risk_level,graph
       FROM public.automation_flows WHERE id=$3 AND organization_id=$4`,
      [copyId, copyName, flowId, organizationId],
    )
    await client.query(`INSERT INTO public.automation_triggers (flow_id,trigger_type,config) SELECT $1,trigger_type,config FROM public.automation_triggers WHERE flow_id=$2`, [copyId, flowId])
    await client.query(`INSERT INTO public.automation_conditions (flow_id,field,operator,value,order_index) SELECT $1,field,operator,value,order_index FROM public.automation_conditions WHERE flow_id=$2`, [copyId, flowId])
    await client.query(`INSERT INTO public.automation_actions (flow_id,action_type,order_index,payload) SELECT $1,action_type,order_index,payload FROM public.automation_actions WHERE flow_id=$2`, [copyId, flowId])
    await client.query('COMMIT')
    return getAutomationFlow(pool, user, copyId)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function pauseAutomationFlow(pool: pg.Pool, user: AuthUser, flowId: string, organizationId: string) {
  await ownedFlow(pool, user, flowId, organizationId)
  await requireAutomationWrite(pool, user, organizationId)
  await pool.query(`UPDATE public.automation_flows SET status='paused',is_enabled=FALSE,updated_at=NOW() WHERE id=$1 AND organization_id=$2`, [flowId, organizationId])
  const active = await pool.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM public.automation_execution_runs WHERE flow_id=$1 AND status IN ('queued','processing')`, [flowId])
  return { flow: await getAutomationFlow(pool, user, flowId), activeRuns: Number(active.rows[0]?.count ?? 0) }
}

async function ownedFlow(pool: pg.Pool, user: AuthUser, flowId: string, organizationId: string) {
  const flow = await getAutomationFlow(pool, user, flowId)
  if (flow.organizationId !== organizationId) throw domainError(404, 'automation_flow_not_found')
  return flow
}

async function requireAutomationWrite(pool: pg.Pool, user: AuthUser, organizationId: string) {
  if (user.role === 'yux_admin' || user.role === 'yux_operator') return
  const allowed = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM public.memberships membership
     JOIN public.role_permissions permission ON permission.role_key=membership.role_key AND permission.permission_key='automations.write'
     WHERE membership.user_id=$1 AND membership.organization_id=$2 LIMIT 1`,
    [user.id, organizationId],
  )
  if (!allowed.rows[0]) throw domainError(403, 'automation_write_forbidden')
}

function validateGraph(graph: unknown) {
  if (!graph || typeof graph !== 'object') return []
  const nodes = Array.isArray(Reflect.get(graph, 'nodes')) ? Reflect.get(graph, 'nodes') as any[] : []
  const edges = Array.isArray(Reflect.get(graph, 'edges')) ? Reflect.get(graph, 'edges') as any[] : []
  if (nodes.length > 200) return ['automation_graph_node_limit_exceeded']
  if (edges.length > 400) return ['automation_graph_edge_limit_exceeded']
  if (nodes.some(node => !['trigger', 'condition', 'action'].includes(String(node?.type ?? '')))) return ['automation_graph_node_type_unregistered']
  const ids = new Set(nodes.map(node => String(node?.id ?? '')).filter(Boolean))
  if (ids.size !== nodes.length) return ['automation_graph_node_id_invalid']
  const adjacency = new Map<string, string[]>()
  for (const id of ids) adjacency.set(id, [])
  for (const edge of edges) {
    const source = String(edge?.source ?? '')
    const target = String(edge?.target ?? '')
    if (!ids.has(source) || !ids.has(target)) return ['automation_graph_edge_invalid']
    adjacency.get(source)?.push(target)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const cycle = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    if ((adjacency.get(id) ?? []).some(cycle)) return true
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return [...ids].some(cycle) ? ['automation_graph_cycle'] : []
}

function evaluateCondition(actual: unknown, operator: string, expected: unknown) {
  if (operator === 'exists') return (actual !== undefined && actual !== null && actual !== '') === Boolean(expected ?? true)
  if (operator === 'equals') return actual === expected
  if (operator === 'not_equals') return actual !== expected
  if (operator === 'contains') return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase())
  if (operator === 'greater_than') return Number(actual) > Number(expected)
  if (operator === 'less_than') return Number(actual) < Number(expected)
  return false
}

function readPath(value: RecordValue, path: string) {
  return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? Reflect.get(current, key) : undefined, value)
}
function nonEmpty(value: unknown) { return typeof value === 'string' && value.trim().length > 0 }
function domainError(statusCode: number, message: string, details?: string[]) { return Object.assign(new Error(message), { statusCode, details }) }
