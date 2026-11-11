import type pg from 'pg'
import { z } from 'zod'
import type { AuthUser } from '../../auth/routes.js'
import { enrollLeadInSequence, listLeadEnrollments, moveLeadToStage, updateEnrollment } from './repository.js'

export const leadBulkSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('move_stage'), organizationId: z.uuid(), leadIds: z.array(z.uuid()).min(1).max(100), stageId: z.uuid() }).strict(),
  z.object({ action: z.literal('enroll_sequence'), organizationId: z.uuid(), leadIds: z.array(z.uuid()).min(1).max(100), sequenceId: z.uuid() }).strict(),
  z.object({ action: z.literal('pause_sequences'), organizationId: z.uuid(), leadIds: z.array(z.uuid()).min(1).max(100) }).strict(),
])
export type LeadBulkInput = z.infer<typeof leadBulkSchema>

type Outcome = { leadId: string; status: 'done' | 'skipped' | 'failed'; reason?: string }

const reasons: Record<string, string> = {
  lead_not_found: 'Lead indisponível ou sem permissão.',
  already_enrolled: 'Já está nesta sequência.',
  no_active_sequence: 'Nenhuma sequência ativa.',
  same_stage: 'Já está nesta etapa.',
}

function reasonOf(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  const status = (error as { statusCode?: number })?.statusCode
  if (status === 404 || status === 403 || code === 'lead_not_found') return reasons.lead_not_found
  return 'Não foi possível concluir para este lead.'
}

/**
 * Applies one action to up to 100 leads. Each lead is processed with the same
 * single-lead rules and access checks; one failure never blocks the others.
 */
export async function runLeadBulkAction(pool: pg.Pool, user: AuthUser, input: LeadBulkInput) {
  const leadIds = [...new Set(input.leadIds)]
  if (input.action === 'enroll_sequence') {
    const sequence = await pool.query(
      'SELECT 1 FROM public.crm_sequences WHERE id = $1 AND organization_id = $2 AND is_active = TRUE',
      [input.sequenceId, input.organizationId],
    )
    if (!sequence.rows[0]) throw Object.assign(new Error('Sequência indisponível ou inativa.'), { statusCode: 422 })
  }
  const outcomes: Outcome[] = []
  for (const leadId of leadIds) {
    try {
      const owned = await pool.query('SELECT stage_id FROM public.leads WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [leadId, input.organizationId])
      if (!owned.rows[0]) {
        outcomes.push({ leadId, status: 'failed', reason: reasons.lead_not_found })
        continue
      }
      if (input.action === 'move_stage') {
        if (owned.rows[0].stage_id === input.stageId) {
          outcomes.push({ leadId, status: 'skipped', reason: reasons.same_stage })
          continue
        }
        await moveLeadToStage(pool, user, leadId, input.stageId)
        outcomes.push({ leadId, status: 'done' })
      } else if (input.action === 'enroll_sequence') {
        const current = await listLeadEnrollments(pool, user, leadId)
        if (current.some(e => e.sequenceId === input.sequenceId && ['active', 'paused', 'manual'].includes(e.status))) {
          outcomes.push({ leadId, status: 'skipped', reason: reasons.already_enrolled })
          continue
        }
        await enrollLeadInSequence(pool, user, { organizationId: input.organizationId, leadId, sequenceId: input.sequenceId })
        outcomes.push({ leadId, status: 'done' })
      } else {
        const active = (await listLeadEnrollments(pool, user, leadId)).filter(e => e.status === 'active')
        if (!active.length) {
          outcomes.push({ leadId, status: 'skipped', reason: reasons.no_active_sequence })
          continue
        }
        for (const enrollment of active) await updateEnrollment(pool, user, enrollment.id, { status: 'paused', nextExecutionAt: null })
        outcomes.push({ leadId, status: 'done' })
      }
    } catch (error) {
      outcomes.push({ leadId, status: 'failed', reason: reasonOf(error) })
    }
  }
  return {
    done: outcomes.filter(o => o.status === 'done').length,
    skipped: outcomes.filter(o => o.status === 'skipped').length,
    failed: outcomes.filter(o => o.status === 'failed').length,
    outcomes,
  }
}
