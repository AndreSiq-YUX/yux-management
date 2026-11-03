import type { AuthUser } from '../../auth/routes.js'
import type { PriorityDefinition, PriorityReason, PriorityResult } from './priority-model.js'
import { priorityContactBlockedSql } from './priority-repository.js'
import {
  getLeadAccess,
  getInstanceAccess,
  leadProfileScopeSql,
  profileError,
  type ProfileDb,
} from './record-profile.js'

type ReadRow = {
  lead_id: string
  activation_id: string
  version_id: string
  status: string | null
  contact_blocked: boolean
  pending: boolean
  definition: Pick<PriorityDefinition,'queues'|'fitBands'|'temperatureBands'>
  calculated_at: Date | null
  result: PriorityResult | null
}
const safeReason = (reason: PriorityReason): PriorityReason => {
  const base = { id: reason.id, label: reason.label }
  switch (reason.kind) {
    case 'criterion':
      return {
        ...base,
        kind: reason.kind,
        fieldKey: reason.fieldKey,
        points: reason.points,
        estimated: reason.estimated,
      }
    case 'missing_data':
      return {
        ...base,
        kind: reason.kind,
        fieldKeys: reason.fieldKeys,
        archivedFieldKeys: reason.archivedFieldKeys,
      }
    case 'exclusion':
      return { ...base, kind: reason.kind }
    default:
      return {
        ...base,
        kind: reason.kind,
        points: reason.points,
        signalId: reason.signalId,
        occurredAt: reason.occurredAt,
      }
  }
}

function toView(row: ReadRow) {
  const { result, definition } = row
  const exclusion = row.contact_blocked
    ? 'Contato bloqueado'
    : row.status === 'won' || row.status === 'lost'
      ? 'Lead fora da carteira ativa'
      : null
  const state = exclusion ? 'excluded' : row.pending || !result ? 'pending' : result.state
  const showScore = state !== 'pending' && !exclusion && result
  const queueId = state === 'ranked' ? (result?.queueId ?? null) : null
  const order = queueId ? definition.queues.findIndex((queue) => queue.id === queueId) : -1
  const queue = order >= 0 ? definition.queues[order] : undefined
  return {
    activationId: row.activation_id,
    versionId: row.version_id,
    evaluatedAt: showScore ? row.calculated_at?.toISOString() ?? null : null,
    state,
    fitScore: showScore ? result.fitScore : null,
    temperatureScore: showScore ? result.temperatureScore : null,
    priorityScore: state === 'ranked' ? (result?.priorityScore ?? null) : null,
    coveragePercent: showScore ? result.coveragePercent : null,
    fitBandLabel: showScore
      ? (definition.fitBands.find((band) => band.id === result.fitBandId)?.label ?? null)
      : null,
    temperatureBandLabel: showScore
      ? (definition.temperatureBands.find((band) => band.id === result.temperatureBandId)?.label ??
        null)
      : null,
    queueId,
    queueOrder: order < 0 ? null : order,
    queueLabel: queue?.label ?? (state === 'needs_data' ? 'Qualificar dados' : null),
    recommendation: queue?.recommendation ?? null,
    reasons: exclusion
      ? [{ kind: 'exclusion' as const, id: 'live_exclusion', label: exclusion }]
      : showScore
        ? (result.reasons ?? []).map(safeReason)
        : [],
  }
}

async function readViews(db: ProfileDb, user: AuthUser, ids: string[], details = false) {
  if (!ids.length) return []
  // Scope the rows with the exact lead authorization used by profile reads.
  const result = await db.query<ReadRow>(
    `SELECT l.id AS lead_id,l.status,a.id AS activation_id,a.version_id,e.calculated_at,
    ${priorityContactBlockedSql} AS contact_blocked,
    (w.lead_id IS NOT NULL OR e.calculated_at < a.refreshed_at) AS pending,
    jsonb_build_object('queues',v.definition->'queues','fitBands',v.definition->'fitBands',
      'temperatureBands',v.definition->'temperatureBands') AS definition,
    ${details ? 'e.result' : "e.result - 'reasons'"} AS result
    FROM public.crm_priority_configs c
    JOIN public.crm_priority_activations a ON a.id=c.active_activation_id
    JOIN public.crm_priority_versions v ON v.id=a.version_id
    JOIN LATERAL (SELECT scoped.id FROM public.leads scoped WHERE scoped.id=ANY($1::uuid[])
      AND (scoped.crm_instance_id=c.crm_instance_id OR scoped.crm_instance_id IS NULL)) ids ON TRUE
    JOIN public.leads l ON l.id=ids.id AND l.organization_id=c.organization_id
    JOIN public.crm_pipelines p ON p.id=l.pipeline_id AND p.organization_id=l.organization_id
    JOIN public.crm_instances ci ON ci.id=c.crm_instance_id AND ci.id=COALESCE(l.crm_instance_id,p.crm_instance_id)
      AND ci.organization_id=l.organization_id AND ci.status='active'
    LEFT JOIN public.crm_priority_evaluations e ON e.lead_id=l.id AND e.activation_id=a.id
    LEFT JOIN public.crm_priority_work w ON w.lead_id=l.id AND w.crm_instance_id=c.crm_instance_id
    WHERE l.deleted_at IS NULL AND (l.crm_instance_id IS NULL OR p.crm_instance_id IS NULL OR l.crm_instance_id=p.crm_instance_id)
      AND EXISTS (SELECT l.id ${leadProfileScopeSql} AND l.id=ids.id)`,
    [ids, user.id, ['yux_admin', 'yux_operator'].includes(user.role)],
  )
  return result.rows
}

export async function loadPrioritySummaries(db: ProfileDb, user: AuthUser, ids: string[]) {
  return new Map(
    (await readViews(db, user, ids)).map((row) => {
      const { reasons: _reasons, ...summary } = toView(row)
      return [row.lead_id, summary]
    }),
  )
}

export async function getLeadPriority(db: ProfileDb, user: AuthUser, id: string) {
  const lead = await getLeadAccess(db, user, id)
  await getInstanceAccess(db, user, lead.crm_instance_id!)
  const [row] = await readViews(db, user, [id], true)
  return row ? toView(row) : null
}

type TransitionScore = Pick<
  PriorityResult,
  'state' | 'queueId' | 'fitScore' | 'temperatureScore' | 'priorityScore' | 'coveragePercent'
>
const pickTransitionScore = (score: TransitionScore | null) =>
  score
    ? {
        state: score.state,
        queueId: score.queueId,
        fitScore: score.fitScore,
        temperatureScore: score.temperatureScore,
        priorityScore: score.priorityScore,
        coveragePercent: score.coveragePercent,
      }
    : null
export async function getLeadPriorityHistory(
  db: ProfileDb,
  user: AuthUser,
  id: string,
  afterId?: string,
) {
  const lead = await getLeadAccess(db, user, id)
  await getInstanceAccess(db, user, lead.crm_instance_id!)
  const args = [id, lead.organization_id, lead.crm_instance_id, afterId ?? null]
  if (
    afterId &&
    !(
      await db.query(
        `SELECT id FROM public.crm_priority_transitions
    WHERE lead_id=$1 AND organization_id=$2 AND crm_instance_id=$3 AND id=$4`,
        args,
      )
    ).rows[0]
  )
    throw profileError(404, 'Registro de prioridade não encontrado.')
  const rows = (
    await db.query<{
      id: string
      activation_id: string
      cause: string
      occurred_at: Date
      before_summary: TransitionScore | null
      after_summary: TransitionScore
    }>(
      `SELECT t.id,t.activation_id,t.cause,t.occurred_at,t.before_summary,t.after_summary
    FROM public.crm_priority_transitions t WHERE t.lead_id=$1 AND t.organization_id=$2 AND t.crm_instance_id=$3
    AND ($4::uuid IS NULL OR (t.occurred_at,t.id)<(SELECT occurred_at,id FROM public.crm_priority_transitions WHERE id=$4))
    ORDER BY t.occurred_at DESC,t.id DESC LIMIT 51`,
      args,
    )
  ).rows
  return {
    items: rows.slice(0, 50).map((row) => ({
      id: row.id,
      activationId: row.activation_id,
      cause: row.cause,
      occurredAt: row.occurred_at.toISOString(),
      before: pickTransitionScore(row.before_summary),
      after: pickTransitionScore(row.after_summary),
    })),
    nextCursor: rows.length > 50 ? rows[49].id : null,
  }
}
