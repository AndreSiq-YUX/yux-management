import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { executeRadarAnalysis } from '../../modules/radar/analysis-service.js'
import type { AuthUser } from '../../auth/routes.js'
import { enrichRadarCandidateWithLicensedBrave, inspectRadarCandidateBusinessSite,
  runRadarCnpjaAdvancedSearch } from '../../modules/radar/repository.js'

export async function handleRadarOpportunityAnalysis(
  pool: pg.Pool,
  env: AppEnv,
  data: Record<string, unknown>,
) {
  const runId = typeof data.runId === 'string' ? data.runId : ''
  const opportunityId = typeof data.opportunityId === 'string' ? data.opportunityId : ''
  if (!runId || !opportunityId) throw new Error('radar_analysis_job_invalid')
  return executeRadarAnalysis(pool, env, { runId, opportunityId })
}

type RadarBatchData = { organizationId: string; campaignId: string; requestedBy: string }

async function authorizedRadarBatch(pool: pg.Pool, data: Record<string, unknown>) {
  const input = data as RadarBatchData
  if (!input.organizationId || !input.campaignId || !input.requestedBy) throw new Error('radar_batch_payload_invalid')
  const user = await pool.query<{ id: string; email: string; display_name: string; role: string }>(
    `SELECT id, email, display_name, role FROM app_users
     WHERE id = $1 AND role = 'yux_admin' AND is_active = TRUE LIMIT 1`, [input.requestedBy],
  )
  const row = user.rows[0]
  if (!row) throw new Error('radar_batch_admin_not_active')
  const campaign = await pool.query<{ id: string; target_states: string[] }>(
    `SELECT id, target_states FROM public.radar_campaigns
     WHERE id = $1 AND organization_id = $2 AND campaign_type = 'regional_b2b' LIMIT 1`,
    [input.campaignId, input.organizationId],
  )
  if (!campaign.rows[0]) throw new Error('radar_batch_campaign_not_found')
  return { input, states: campaign.rows[0].target_states,
    user: { id: row.id, email: row.email, name: row.display_name, role: row.role } as AuthUser }
}

function secretMaterial(env: AppEnv) {
  return env.PROVIDER_SECRET_ENCRYPTION_KEY_B64
    ? `provider-key:${env.PROVIDER_SECRET_ENCRYPTION_KEY_B64}` : env.SESSION_SECRET
}

export async function handleRadarRegionalDiscovery(pool: pg.Pool, env: AppEnv,
  data: Record<string, unknown>, signal?: AbortSignal,
  dependencies: { discover?: typeof runRadarCnpjaAdvancedSearch } = {}) {
  const { input, states, user } = await authorizedRadarBatch(pool, data)
  const summary: Record<string, { pages: number; candidates: number; status: string }> = {}
  for (const state of states) summary[state] = { pages: 0, candidates: 0, status: 'pending' }
  // Round-robin prevents the first state from consuming the whole daily quota.
  for (let round = 0; round < 3; round++) {
    for (const state of states) {
      if (signal?.aborted) return { summary, interrupted: true }
      if (!['MG', 'SP', 'PR'].includes(state)
        || !['pending', 'more_available'].includes(summary[state].status)) continue
      try {
        const result = await (dependencies.discover ?? runRadarCnpjaAdvancedSearch)(pool, user, {
          organizationId: input.organizationId, campaignId: input.campaignId,
          regionalState: state as 'MG' | 'SP' | 'PR', limit: 10, secretKeyMaterial: secretMaterial(env),
        })
        if (result.issues.length) {
          summary[state].status = result.issues[0].code
          continue
        }
        summary[state].pages++
        summary[state].candidates += result.candidates.length
        summary[state].status = result.completed ? 'completed' : 'more_available'
      } catch (error) {
        summary[state].status = error instanceof Error ? error.message : 'failed'
      }
    }
  }
  return { summary, interrupted: false }
}

export async function handleRadarRegionalVerification(pool: pg.Pool, env: AppEnv,
  data: Record<string, unknown>, signal?: AbortSignal,
  dependencies: { enrich?: typeof enrichRadarCandidateWithLicensedBrave;
    inspect?: typeof inspectRadarCandidateBusinessSite } = {}) {
  const { input, user } = await authorizedRadarBatch(pool, data)
  const result = await pool.query<{ id: string; normalized_payload: Record<string, unknown> }>(
    `SELECT id, normalized_payload FROM public.radar_candidate_records
     WHERE organization_id = $1 AND campaign_id = $2 AND source_type = 'cnpja_advanced_search'
       AND status = 'pending_review' AND (normalized_payload->>'siteCheckedAt') IS NULL
       AND ((normalized_payload->>'websiteUrl') IS NOT NULL
         OR (normalized_payload->>'braveAttemptedAt') IS NULL)
     ORDER BY created_at ASC LIMIT 10`, [input.organizationId, input.campaignId],
  )
  const summary = { inspected: 0, matched: 0, needsReview: 0, errors: 0 }
  for (const candidate of result.rows) {
    if (signal?.aborted) return { summary, interrupted: true }
    let website = typeof candidate.normalized_payload.websiteUrl === 'string'
      ? candidate.normalized_payload.websiteUrl : ''
    if (!website && !candidate.normalized_payload.braveAttemptedAt) {
      try {
        const enrichment = await (dependencies.enrich ?? enrichRadarCandidateWithLicensedBrave)(pool, user, {
          organizationId: input.organizationId, candidateId: candidate.id, secretKeyMaterial: secretMaterial(env),
        })
        if (enrichment.matched) {
          summary.matched++
          website = typeof enrichment.candidate?.normalizedPayload.websiteUrl === 'string'
            ? enrichment.candidate.normalizedPayload.websiteUrl : ''
        } else summary.needsReview++
      } catch { summary.errors++ }
    }
    if (website) {
      try {
        await (dependencies.inspect ?? inspectRadarCandidateBusinessSite)(pool, user,
          { organizationId: input.organizationId, candidateId: candidate.id })
        summary.inspected++
      } catch { summary.errors++ }
    }
  }
  return { summary, interrupted: false }
}
