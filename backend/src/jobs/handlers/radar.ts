import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { executeRadarAnalysis } from '../../modules/radar/analysis-service.js'
import type { AuthUser } from '../../auth/routes.js'
import { enrichRadarCandidateWithLicensedBrave, inspectRadarCandidateBusinessSite,
  runRadarCnpjaAdvancedSearch } from '../../modules/radar/repository.js'
import { buildRadarDiscoveryScopes, resolveRadarSearchConfiguration } from '../../modules/radar/search-configuration.js'
import { startRadarCandidateResearch } from '../../modules/radar/research-service.js'
import type { RegisteredJobQueue } from '../registry.js'

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

type RadarBatchData = { organizationId: string; campaignId: string; requestedBy: string; configurationRevision?: number }

async function authorizedRadarBatch(pool: pg.Pool, data: Record<string, unknown>) {
  const input = data as RadarBatchData
  if (!input.organizationId || !input.campaignId || !input.requestedBy) throw new Error('radar_batch_payload_invalid')
  const user = await pool.query<{ id: string; email: string; display_name: string; role: string }>(
    `SELECT id, email, display_name, role FROM app_users
     WHERE id = $1 AND role = 'yux_admin' AND is_active = TRUE LIMIT 1`, [input.requestedBy],
  )
  const row = user.rows[0]
  if (!row) throw new Error('radar_batch_admin_not_active')
  const campaign = await pool.query<{ id: string; target_states: string[]; search_configuration: unknown; configuration_revision: number }>(
    `SELECT id, target_states, search_configuration, configuration_revision FROM public.radar_campaigns
     WHERE id = $1 AND organization_id = $2 AND campaign_type = 'regional_b2b' LIMIT 1`,
    [input.campaignId, input.organizationId],
  )
  if (!campaign.rows[0]) throw new Error('radar_batch_campaign_not_found')
  const rowCampaign = campaign.rows[0]
  const revision = rowCampaign.configuration_revision ?? 1
  if (input.configurationRevision !== undefined && input.configurationRevision !== revision) throw new Error('radar_campaign_configuration_changed')
  const configuration = resolveRadarSearchConfiguration(rowCampaign.search_configuration)
  return { input, configuration, revision, scopes: buildRadarDiscoveryScopes({ targetStates: rowCampaign.target_states,
    searchConfiguration: configuration, configurationRevision: revision }),
    user: { id: row.id, email: row.email, name: row.display_name, role: row.role } as AuthUser }
}

function secretMaterial(env: AppEnv) {
  return env.PROVIDER_SECRET_ENCRYPTION_KEY_B64
    ? `provider-key:${env.PROVIDER_SECRET_ENCRYPTION_KEY_B64}` : env.SESSION_SECRET
}

export async function handleRadarRegionalDiscovery(pool: pg.Pool, env: AppEnv,
  data: Record<string, unknown>, signal?: AbortSignal,
  dependencies: { discover?: typeof runRadarCnpjaAdvancedSearch } = {}) {
  const { input, scopes, configuration, revision, user } = await authorizedRadarBatch(pool, data)
  const summary: Record<string, { pages: number; candidates: number; status: string }> = {}
  const completed = await pool.query<{ scope_key: string }>(
    `SELECT scope_key FROM public.radar_regional_discovery_cursors
     WHERE campaign_id = $1 AND organization_id = $2 AND scope_key = ANY($3::text[]) AND completed = TRUE`,
    [input.campaignId, input.organizationId, scopes.map(scope => scope.key)],
  )
  const completedKeys = new Set(completed.rows.map(row => row.scope_key))
  for (const scope of scopes) summary[scope.label] = { pages: 0, candidates: 0,
    status: completedKeys.has(scope.key) ? 'completed' : 'pending' }
  let queries = 0
  for (let round = 0; round < configuration.batch.maxPagesPerScope; round++) {
    for (const scope of scopes) {
      if (signal?.aborted) return { summary, interrupted: true }
      if (!['pending', 'more_available'].includes(summary[scope.label].status)) continue
      if (queries >= configuration.batch.maxQueriesPerBatch) return { summary, interrupted: false, batchLimitReached: true }
      try {
        queries++
        const result = await (dependencies.discover ?? runRadarCnpjaAdvancedSearch)(pool, user, {
          organizationId: input.organizationId, campaignId: input.campaignId,
          regionalState: scope.state, regionalCity: scope.city, expectedRevision: revision,
          limit: configuration.batch.pageSize, secretKeyMaterial: secretMaterial(env),
        })
        if (result.issues.length) {
          summary[scope.label].status = result.issues[0].code
          continue
        }
        summary[scope.label].pages++
        summary[scope.label].candidates += result.candidates.length
        summary[scope.label].status = result.completed ? 'completed' : 'more_available'
      } catch (error) {
        summary[scope.label].status = error instanceof Error ? error.message : 'failed'
      }
    }
  }
  return { summary, interrupted: false }
}

export async function handleRadarRegionalVerification(pool: pg.Pool, env: AppEnv,
  data: Record<string, unknown>, signal?: AbortSignal,
  dependencies: { enrich?: typeof enrichRadarCandidateWithLicensedBrave;
    inspect?: typeof inspectRadarCandidateBusinessSite; queue?: RegisteredJobQueue;
    startResearch?: typeof startRadarCandidateResearch } = {}) {
  const { input, user, configuration, revision } = await authorizedRadarBatch(pool, data)
  const result = await pool.query<{ id: string; normalized_payload: Record<string, unknown> }>(
    `SELECT id, normalized_payload FROM public.radar_candidate_records
     WHERE organization_id = $1 AND campaign_id = $2 AND source_type = 'cnpja_advanced_search'
       AND status = 'pending_review'
       ${configuration.research.enabled ? '' : `AND COALESCE(normalized_payload->>'discoveryRevision', '1') = $3::text`}
       AND ${configuration.research.enabled
        ? `((normalized_payload->>'researchRevision') IS DISTINCT FROM $3::text OR COALESCE(normalized_payload->>'researchComplete','false') <> 'true')`
        : `(normalized_payload->>'analysisRevision') IS DISTINCT FROM $3::text`}
       AND NOT EXISTS (SELECT 1 FROM public.radar_b2b_reviews review WHERE review.candidate_id=radar_candidate_records.id AND review.approved_at IS NOT NULL)
     ORDER BY created_at ASC LIMIT $4`, [input.organizationId, input.campaignId, revision, configuration.batch.verificationLimit],
  )
  const summary = { inspected: 0, matched: 0, needsReview: 0, errors: 0 }
  for (const candidate of result.rows) {
    if (signal?.aborted) return { summary, interrupted: true }
    if (configuration.research.enabled) {
      if (!dependencies.queue) throw new Error('radar_research_queue_required')
      try {
        const run = await (dependencies.startResearch ?? startRadarCandidateResearch)(pool,user,{organizationId:input.organizationId,candidateId:candidate.id,configurationRevision:revision})
        if (run.status !== 'succeeded') await dependencies.queue.add('radar.researchCandidate',{runId:run.runId,organizationId:input.organizationId},{jobId:`radar-research-${run.runId}-${Date.now()}`})
        summary.inspected++
      } catch {summary.errors++}
      continue
    }
    const website = typeof candidate.normalized_payload.websiteUrl === 'string'
      ? candidate.normalized_payload.websiteUrl : ''
    if (configuration.sources.enrichWithBrave && !website
      && String(candidate.normalized_payload.braveAttemptRevision ?? '') !== String(revision)) {
      try {
        const enrichment = await (dependencies.enrich ?? enrichRadarCandidateWithLicensedBrave)(pool, user, {
          organizationId: input.organizationId, candidateId: candidate.id, secretKeyMaterial: secretMaterial(env), expectedRevision: revision,
        })
        if (enrichment.matched) {
          summary.matched++
        } else summary.needsReview++
      } catch { summary.errors++ }
    }
    try {
      await (dependencies.inspect ?? inspectRadarCandidateBusinessSite)(pool, user,
        { organizationId: input.organizationId, candidateId: candidate.id, expectedRevision: revision })
      summary.inspected++
    } catch { summary.errors++ }
  }
  return { summary, interrupted: false }
}
