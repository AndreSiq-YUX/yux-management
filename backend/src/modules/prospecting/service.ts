import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import { enrollLeadInSequence } from '../crm/scheduler.js'
import { getProspectingPolicy, resolveProspectingEligibility } from './repository.js'
import type { ProspectingChannel } from './types.js'

function requireInternal(user: AuthUser) {
  if (user.role !== 'yux_admin' && user.role !== 'yux_operator') {
    throw Object.assign(new Error('prospecting_forbidden'), { statusCode: 403 })
  }
}

export async function saveProspectingPolicy(pool: pg.Pool, user: AuthUser, input: {
  organizationId: string
  crmInstanceId?: string | null
  defaultSequenceId?: string | null
  whatsappConnectionId?: string | null
  enabled: boolean
  killSwitch: boolean
  dailyLimit: number
  maxAttemptsPerLead: number
  quietHours: { timezone: string; start: string; end: string }
  legalReviewed: boolean
}) {
  requireInternal(user)
  const result = await pool.query(
    `INSERT INTO public.prospecting_policies (
       organization_id, crm_instance_id, default_sequence_id, whatsapp_connection_id,
       enabled, kill_switch, daily_limit, max_attempts_per_lead, quiet_hours,
       legal_reviewed_at, legal_reviewed_by, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     ON CONFLICT (organization_id) DO UPDATE SET
       crm_instance_id = EXCLUDED.crm_instance_id,
       default_sequence_id = EXCLUDED.default_sequence_id,
       whatsapp_connection_id = EXCLUDED.whatsapp_connection_id,
       enabled = EXCLUDED.enabled,
       kill_switch = EXCLUDED.kill_switch,
       daily_limit = EXCLUDED.daily_limit,
       max_attempts_per_lead = EXCLUDED.max_attempts_per_lead,
       quiet_hours = EXCLUDED.quiet_hours,
       legal_reviewed_at = EXCLUDED.legal_reviewed_at,
       legal_reviewed_by = EXCLUDED.legal_reviewed_by,
       updated_at = NOW()
     RETURNING *`,
    [
      input.organizationId, input.crmInstanceId || null, input.defaultSequenceId || null,
      input.whatsappConnectionId || null, input.enabled, input.killSwitch,
      input.dailyLimit, input.maxAttemptsPerLead, JSON.stringify(input.quietHours),
      input.legalReviewed ? new Date().toISOString() : null, input.legalReviewed ? user.id : null,
    ],
  )
  return result.rows[0]
}

export async function listProspectingPlans(pool: pg.Pool, user: AuthUser, organizationId: string, radarOpportunityId?: string) {
  requireInternal(user)
  const result = await pool.query(
    `SELECT * FROM public.prospecting_plans
     WHERE organization_id = $1 AND ($2::uuid IS NULL OR radar_opportunity_id = $2)
     ORDER BY updated_at DESC LIMIT 100`,
    [organizationId, radarOpportunityId || null],
  )
  return result.rows
}

export async function createProspectingPlan(pool: pg.Pool, user: AuthUser, input: {
  organizationId: string
  radarOpportunityId: string
  sequenceId?: string
  primaryChannel: ProspectingChannel
  fallbackChannel?: ProspectingChannel
}) {
  requireInternal(user)
  const opportunity = await pool.query<{
    id: string; organization_id: string; status: string; converted_lead_id: string | null
    email: string | null; phone: string | null; crm_instance_id: string | null; default_sequence_id: string | null
  }>(
    `SELECT opportunity.id, opportunity.organization_id, opportunity.status, opportunity.converted_lead_id,
            lead.email, lead.phone,
            COALESCE(policy.crm_instance_id, (
              SELECT instance.id FROM public.crm_instances instance
              WHERE instance.organization_id = opportunity.organization_id AND instance.status = 'active'
              ORDER BY instance.created_at ASC LIMIT 1
            )) AS crm_instance_id,
            policy.default_sequence_id
     FROM public.radar_opportunities opportunity
     LEFT JOIN public.leads lead ON lead.id = opportunity.converted_lead_id
     LEFT JOIN public.prospecting_policies policy ON policy.organization_id = opportunity.organization_id
     WHERE opportunity.id = $1 AND opportunity.organization_id = $2
     LIMIT 1`,
    [input.radarOpportunityId, input.organizationId],
  )
  const row = opportunity.rows[0]
  if (!row) throw Object.assign(new Error('radar_opportunity_not_found'), { statusCode: 404 })
  if (!row.converted_lead_id) throw Object.assign(new Error('prospecting_lead_conversion_required'), { statusCode: 409 })
  if (!row.crm_instance_id) throw Object.assign(new Error('prospecting_crm_instance_required'), { statusCode: 409 })
  const sequenceId = input.sequenceId || row.default_sequence_id
  if (!sequenceId) throw Object.assign(new Error('prospecting_sequence_required'), { statusCode: 409 })
  const address = input.primaryChannel === 'email' ? row.email : input.primaryChannel === 'whatsapp' || input.primaryChannel === 'phone' ? row.phone : undefined
  const eligibility = await resolveProspectingEligibility(pool, {
    organizationId: input.organizationId,
    leadId: row.converted_lead_id,
    opportunityId: row.id,
    channel: input.primaryChannel,
    address,
  })
  const idempotencyKey = `${row.id}:${sequenceId}:${input.primaryChannel}`
  const result = await pool.query(
    `INSERT INTO public.prospecting_plans (
       organization_id, crm_instance_id, radar_opportunity_id, lead_id, sequence_id,
       primary_channel, fallback_channel, status, policy_snapshot, blocked_reasons, idempotency_key
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10)
     ON CONFLICT (radar_opportunity_id) DO UPDATE SET
       sequence_id = EXCLUDED.sequence_id,
       primary_channel = EXCLUDED.primary_channel,
       fallback_channel = EXCLUDED.fallback_channel,
       policy_snapshot = EXCLUDED.policy_snapshot,
       blocked_reasons = EXCLUDED.blocked_reasons,
       updated_at = NOW()
     RETURNING *`,
    [
      input.organizationId, row.crm_instance_id, row.id, row.converted_lead_id, sequenceId,
      input.primaryChannel, input.fallbackChannel || null, JSON.stringify(eligibility.policy),
      eligibility.blockedReasons, idempotencyKey,
    ],
  )
  return result.rows[0]
}

export async function approveProspectingPlan(pool: pg.Pool, user: AuthUser, planId: string) {
  requireInternal(user)
  const plan = await loadPlanContext(pool, planId)
  const eligibility = await currentEligibility(pool, plan)
  if (!eligibility.allowed) throw Object.assign(new Error(eligibility.blockedReasons.join(',')), { statusCode: 409 })
  await validateFirstSequenceStep(pool, plan.sequence_id, plan.primary_channel)
  const result = await pool.query(
    `UPDATE public.prospecting_plans
     SET status = 'approved', policy_snapshot = $2, blocked_reasons = '{}',
         approved_by = $3, approved_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [plan.id, JSON.stringify(eligibility.policy), user.id],
  )
  await pool.query(
    `INSERT INTO public.radar_outreach_events (
       organization_id, opportunity_id, lead_id, event_type, notes
     ) VALUES ($1,$2,$3,'plan_approved',$4)`,
    [plan.organization_id, plan.radar_opportunity_id, plan.lead_id, `plan:${plan.id}`],
  )
  return result.rows[0]
}

export async function startProspectingPlan(pool: pg.Pool, user: AuthUser, planId: string) {
  requireInternal(user)
  const plan = await loadPlanContext(pool, planId)
  if (plan.status !== 'approved' && plan.status !== 'paused') {
    throw Object.assign(new Error('prospecting_plan_approval_required'), { statusCode: 409 })
  }
  const eligibility = await currentEligibility(pool, plan)
  if (!eligibility.allowed) {
    await pool.query(
      `UPDATE public.prospecting_plans SET status = 'blocked', blocked_reasons = $2, updated_at = NOW() WHERE id = $1`,
      [plan.id, eligibility.blockedReasons],
    )
    throw Object.assign(new Error(eligibility.blockedReasons.join(',')), { statusCode: 409 })
  }
  await validateFirstSequenceStep(pool, plan.sequence_id, plan.primary_channel)
  const enrollment = await enrollLeadInSequence(pool, {
    organizationId: plan.organization_id,
    leadId: plan.lead_id,
    sequenceId: plan.sequence_id,
    existingEnrollment: 'skip',
    correlationId: plan.id,
  })
  await pool.query(
    `UPDATE public.crm_sequence_enrollments SET manual_note = $2, updated_at = NOW() WHERE id = $1`,
    [enrollment.enrollmentId, `prospecting-plan:${plan.id}`],
  )
  const result = await pool.query(
    `UPDATE public.prospecting_plans
     SET status = 'active', blocked_reasons = '{}', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [plan.id],
  )
  await pool.query(
    `INSERT INTO public.radar_outreach_events (
       organization_id, opportunity_id, lead_id, event_type, notes
     ) VALUES ($1,$2,$3,'prospecting_started',$4)`,
    [plan.organization_id, plan.radar_opportunity_id, plan.lead_id, `plan:${plan.id};enrollment:${enrollment.enrollmentId}`],
  )
  return { plan: result.rows[0], enrollment }
}

type PlanContext = {
  id: string; organization_id: string; radar_opportunity_id: string; lead_id: string
  sequence_id: string; primary_channel: ProspectingChannel; status: string
  email: string | null; phone: string | null
}

async function loadPlanContext(pool: pg.Pool, planId: string): Promise<PlanContext> {
  const result = await pool.query<PlanContext>(
    `SELECT plan.id, plan.organization_id, plan.radar_opportunity_id, plan.lead_id,
            plan.sequence_id, plan.primary_channel, plan.status, lead.email, lead.phone
     FROM public.prospecting_plans plan
     JOIN public.leads lead ON lead.id = plan.lead_id
     WHERE plan.id = $1 LIMIT 1`,
    [planId],
  )
  if (!result.rows[0] || !result.rows[0].lead_id || !result.rows[0].sequence_id) {
    throw Object.assign(new Error('prospecting_plan_not_found'), { statusCode: 404 })
  }
  return result.rows[0]
}

function currentEligibility(pool: pg.Pool, plan: PlanContext) {
  const address = plan.primary_channel === 'email' ? plan.email : plan.primary_channel === 'whatsapp' || plan.primary_channel === 'phone' ? plan.phone : undefined
  return resolveProspectingEligibility(pool, {
    organizationId: plan.organization_id,
    leadId: plan.lead_id,
    opportunityId: plan.radar_opportunity_id,
    channel: plan.primary_channel,
    address,
  })
}

async function validateFirstSequenceStep(pool: pg.Pool, sequenceId: string, channel: ProspectingChannel) {
  const policy = await getProspectingPolicy(pool, (await pool.query<{ organization_id: string }>(
    `SELECT organization_id FROM public.crm_sequences WHERE id = $1 LIMIT 1`, [sequenceId],
  )).rows[0]?.organization_id || '')
  const step = await pool.query<{ action_type: string; metadata: Record<string, unknown> }>(
    `SELECT action_type, metadata FROM public.crm_sequence_steps
     WHERE sequence_id = $1 AND is_active = TRUE ORDER BY order_index ASC LIMIT 1`,
    [sequenceId],
  )
  if (!step.rows[0]) throw Object.assign(new Error('prospecting_sequence_has_no_active_steps'), { statusCode: 409 })
  const expectedAction = channel === 'email' || channel === 'whatsapp' ? channel : 'internal_task'
  if (step.rows[0].action_type !== expectedAction) throw Object.assign(new Error('prospecting_primary_channel_mismatch'), { statusCode: 409 })
  if (channel === 'whatsapp' && policy?.require_template_outside_window && !step.rows[0].metadata?.templateName) {
    throw Object.assign(new Error('prospecting_whatsapp_template_required'), { statusCode: 409 })
  }
}
