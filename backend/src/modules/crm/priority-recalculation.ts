import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { runWithDatabaseRequestContext } from '../../db/request-context.js'
import {
  evaluatePriority,
  priorityDefinitionSchema,
  type PriorityResult,
} from './priority-model.js'
import {
  priorityLeadFactColumns,
  readPriorityFields,
  type PriorityLeadFacts,
} from './priority-repository.js'
import { loadPrioritySignalsForLeads } from './priority-signals.js'
import { applyPriorityTransition } from './priority-actions.js'
import { inProfileTransaction, type ProfileDb } from './record-profile.js'

type Activation = {
  id: string
  crm_instance_id: string
  organization_id: string
  baseline_cursor: string | null
}
const pageSize = 50
const maxLeads = 250
const effectiveLeadJoin = `FROM public.leads l JOIN public.crm_pipelines p ON p.id=l.pipeline_id AND p.organization_id=l.organization_id`
const consistentInstance = `(l.crm_instance_id IS NULL OR p.crm_instance_id IS NULL OR l.crm_instance_id=p.crm_instance_id)`

export function markPriorityDirty(db: ProfileDb, leadId: string) {
  return db.query('SELECT private.mark_crm_priority_dirty($1)', [leadId]).then(() => undefined)
}

async function enqueueBaseline(db: ProfileDb) {
  const active = (
    await db.query<Activation>(`SELECT a.id,a.crm_instance_id,a.organization_id,a.baseline_cursor
    FROM public.crm_priority_activations a JOIN public.crm_priority_configs c ON c.active_activation_id=a.id
    JOIN public.crm_instances ci ON ci.id=a.crm_instance_id AND ci.status='active'
    WHERE a.baseline_completed_at IS NULL ORDER BY a.created_at,a.id LIMIT 1 FOR UPDATE OF a SKIP LOCKED`)
  ).rows[0]
  if (!active) return false
  const params = [active.crm_instance_id, active.organization_id, active.baseline_cursor]
  const leads = (
    await db.query<{ id: string }>(
      `SELECT l.id ${effectiveLeadJoin}
    WHERE l.organization_id=$2 AND l.deleted_at IS NULL AND ${consistentInstance}
      AND (l.crm_instance_id=$1 OR (l.crm_instance_id IS NULL AND p.crm_instance_id=$1))
      AND ($3::uuid IS NULL OR l.id>$3)
    ORDER BY l.id LIMIT ${pageSize + 1}`,
      params,
    )
  ).rows
  const page = leads.slice(0, pageSize)
  await db.query(
    `INSERT INTO public.crm_priority_work(lead_id,crm_instance_id,organization_id)
    SELECT id,$1,$2 FROM unnest($3::uuid[]) AS id ORDER BY id
    ON CONFLICT (lead_id) DO UPDATE SET requested_at=clock_timestamp(),
      crm_instance_id=EXCLUDED.crm_instance_id,organization_id=EXCLUDED.organization_id`,
    [active.crm_instance_id, active.organization_id, page.map((lead) => lead.id)],
  )
  await db.query(
    `UPDATE public.crm_priority_activations SET baseline_cursor=$2,
    baseline_completed_at=CASE WHEN $2::uuid IS NULL THEN now() ELSE NULL END WHERE id=$1`,
    [active.id, leads.length > pageSize ? page.at(-1)!.id : null],
  )
  return true
}

const summary = (result: PriorityResult) => ({
  state: result.state,
  queueId: result.queueId,
  fitScore: result.fitScore,
  temperatureScore: result.temperatureScore,
  priorityScore: result.priorityScore,
  coveragePercent: result.coveragePercent,
})

async function evaluateLead(db: ProfileDb, id: string, fixedNow?: Date) {
  const lead = (
    await db.query<
      PriorityLeadFacts & {
        organization_id: string
        crm_instance_id: string
        deleted_at: Date | null
      }
    >(
      `SELECT ${priorityLeadFactColumns},l.organization_id,COALESCE(l.crm_instance_id,p.crm_instance_id) AS crm_instance_id,l.deleted_at
    ${effectiveLeadJoin} WHERE l.id=$1 AND ${consistentInstance} FOR UPDATE OF l`,
      [id],
    )
  ).rows[0]
  const pending = (
    await db.query('SELECT lead_id FROM public.crm_priority_work WHERE lead_id=$1 FOR UPDATE', [id])
  ).rows[0]
  if (!lead || lead.deleted_at) {
    if (pending) await db.query('DELETE FROM public.crm_priority_work WHERE lead_id=$1', [id])
    // Deleted leads may still own a due time from an earlier evaluation.
    await db.query(
      'UPDATE public.crm_priority_evaluations SET next_evaluation_at=NULL WHERE lead_id=$1 AND next_evaluation_at IS NOT NULL',
      [id],
    )
    return false
  }
  const { organization_id: organizationId, crm_instance_id: instanceId } = lead
  const active = (
    await db.query<{
      id: string
      version_id: string
      revision: number
      definition: unknown
      refreshed_at: Date
      evaluation_time_ms: string
      effects_enabled: boolean
    }>(
      `SELECT a.id,a.version_id,a.refreshed_at,v.revision,v.definition,c.effects_enabled,
      ceil(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS evaluation_time_ms
      FROM public.crm_priority_configs c
      JOIN public.crm_priority_activations a ON a.id=c.active_activation_id
      JOIN public.crm_priority_versions v ON v.id=a.version_id
      JOIN public.crm_instances ci ON ci.id=c.crm_instance_id AND ci.status='active'
      WHERE c.crm_instance_id=$1 AND c.organization_id=$2`,
      [instanceId, organizationId],
    )
  ).rows[0]
  if (!active) return false
  // Sample the database clock after both locks so this evaluation includes the work it consumes.
  let now = fixedNow ?? new Date(Number(active.evaluation_time_ms))
  if (active.refreshed_at > now) now = active.refreshed_at
  const previous = (
    await db.query<{
      result: PriorityResult
      calculated_at: Date
      next_evaluation_at: Date | null
    }>(
      'SELECT result,calculated_at,next_evaluation_at FROM public.crm_priority_evaluations WHERE lead_id=$1 AND activation_id=$2',
      [id, active.id],
    )
  ).rows[0]
  if (previous && previous.calculated_at > now) return false
  if (!pending && previous && (!previous.next_evaluation_at || previous.next_evaluation_at > now))
    return false
  const definition = priorityDefinitionSchema.parse(active.definition)
  const { fieldsByLead, archivedFieldKeys } = await readPriorityFields(
    db,
    instanceId,
    organizationId,
    [lead],
  )
  const signals = await loadPrioritySignalsForLeads(
    db,
    { organizationId, instanceId },
    [id],
    new Date(now.getTime() - definition.historyDays * 86_400_000),
    now,
  )
  const result = evaluatePriority(
    { id: active.version_id, revision: active.revision, definition },
    {
      leadId: id,
      recordTypeId: lead.record_type_id,
      fields: fieldsByLead.get(id) ?? {},
      archivedFieldKeys,
      signals: signals.get(id) ?? [],
      status: lead.status === 'won' || lead.status === 'lost' ? lead.status : 'open',
      deleted: false,
      contactBlocked: lead.contact_blocked,
    },
    now,
  )
  const written = await db.query(
    `INSERT INTO public.crm_priority_evaluations
    (lead_id,crm_instance_id,organization_id,activation_id,result,calculated_at,next_evaluation_at)
    SELECT $1,$2,$3,$4,$5,$6,$7 FROM public.crm_priority_configs WHERE crm_instance_id=$2 AND organization_id=$3 AND active_activation_id=$4
    ON CONFLICT(lead_id,activation_id) DO UPDATE SET result=EXCLUDED.result,
      calculated_at=EXCLUDED.calculated_at,next_evaluation_at=EXCLUDED.next_evaluation_at`,
    [
      id,
      instanceId,
      organizationId,
      active.id,
      JSON.stringify(result),
      now,
      result.nextEvaluationAt,
    ],
  )
  if (!written.rowCount) return false
  const before = previous ? summary(previous.result) : null
  const after = summary(result)
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const cause =
      !previous || previous.calculated_at < active.refreshed_at
        ? 'baseline'
        : pending
          ? 'change'
          : 'time'
    const transitionId = randomUUID()
    await db.query(
      `INSERT INTO public.crm_priority_transitions
      (id,lead_id,crm_instance_id,organization_id,activation_id,cause,occurred_at,before_summary,after_summary)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        transitionId,
        id,
        instanceId,
        organizationId,
        active.id,
        cause,
        now,
        before ? JSON.stringify(before) : null,
        JSON.stringify(after),
      ],
    )
    if (active.effects_enabled) {
      await applyPriorityTransition(db, {
        id: transitionId,
        leadId: id,
        organizationId,
        instanceId,
        activationId: active.id,
        cause,
        occurredAt: now,
        previousQueueId: before?.queueId ?? null,
        queue: definition.queues.find(queue => queue.id === after.queueId),
      })
    }
  }
  if (pending) await db.query('DELETE FROM public.crm_priority_work WHERE lead_id=$1', [id])
  return true
}

export async function runPriorityRecalculation(pool: pg.Pool, fixedNow?: Date) {
  return runWithDatabaseRequestContext(
    { role: 'yux_admin', organizationIds: [], serviceRole: 'worker' },
    async () => {
      for (let i = 0; i < 5; i++) {
        if (!(await inProfileTransaction(pool, enqueueBaseline))) break
      }
      const candidates = await pool.query<{ lead_id: string }>(
        `
      (SELECT w.lead_id FROM public.crm_priority_configs c
       JOIN public.crm_instances ci ON ci.id=c.crm_instance_id AND ci.status='active'
       CROSS JOIN LATERAL (SELECT lead_id,requested_at FROM public.crm_priority_work
         WHERE crm_instance_id=c.crm_instance_id AND organization_id=c.organization_id
         ORDER BY requested_at,lead_id LIMIT ${maxLeads}) w
       WHERE c.active_activation_id IS NOT NULL ORDER BY w.requested_at,w.lead_id LIMIT ${maxLeads})
      UNION
      (SELECT e.lead_id FROM public.crm_priority_configs c
       JOIN public.crm_instances ci ON ci.id=c.crm_instance_id AND ci.status='active'
       CROSS JOIN LATERAL (SELECT lead_id,next_evaluation_at FROM public.crm_priority_evaluations
         WHERE activation_id=c.active_activation_id AND next_evaluation_at<=COALESCE($1::timestamptz,statement_timestamp())
         ORDER BY next_evaluation_at,lead_id LIMIT ${maxLeads}) e
       WHERE c.active_activation_id IS NOT NULL ORDER BY e.next_evaluation_at,e.lead_id LIMIT ${maxLeads})`,
        [fixedNow ?? null],
      )
      let processed = 0
      let failed = 0
      for (const { lead_id } of candidates.rows) {
        try {
          if (await inProfileTransaction(pool, (db) => evaluateLead(db, lead_id, fixedNow)))
            processed++
        } catch (error) {
          failed++
          console.error('[crm-priority] evaluation failed', {
            leadId: lead_id,
            code: (error as { code?: string }).code ?? 'evaluation_failed',
          })
        }
      }
      return { processed, failed }
    },
  )
}
