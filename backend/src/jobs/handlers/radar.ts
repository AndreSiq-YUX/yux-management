import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { executeRadarAnalysis } from '../../modules/radar/analysis-service.js'

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
