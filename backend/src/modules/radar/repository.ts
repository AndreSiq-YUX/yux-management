import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import type {
  RadarCampaign,
  RadarCampaignRow,
  RadarCandidateRecord,
  RadarCandidateRecordRow,
  RadarCompanyRecord,
  RadarCompanyRecordRow,
  RadarDataSource,
  RadarDataSourceRow,
  RadarDiagnostic,
  RadarDiagnosticRow,
  RadarEnrichmentRun,
  RadarEnrichmentRunRow,
  RadarMessageSuggestion,
  RadarMessageSuggestionRow,
  RadarMetrics,
  RadarOpportunity,
  RadarOpportunityRow,
  RadarScore,
  RadarScoreRow,
} from './types.js'
import { parseRadarCsv, type RadarCsvImportIssue } from './csvImport.js'
import { assertSmallBatchLimit } from './sourceRules.js'

type RadarOpportunityWithRelationsRow = RadarOpportunityRow & {
  company: RadarCompanyRecordRow | null
  latest_score: RadarScoreRow | null
  latest_diagnostic: RadarDiagnosticRow | null
  latest_message_suggestion: RadarMessageSuggestionRow | null
}

type RadarQueryable = {
  query: <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) => Promise<pg.QueryResult<T>>
}

export type RadarCampaignInput = {
  organizationId: string
  name: string
  targetSegment: string
  targetCity: string
  targetState: string
  targetKeywords?: string[]
  targetCnaes?: string[]
  offerType: string
  budgetLimit?: number
  dailyLimit?: number
}

export type RadarCompanyInput = {
  organizationId: string
  campaignId: string
  legalName?: string
  tradeName?: string
  cnpj?: string
  cnaeMain?: string
  city?: string
  state?: string
  phoneRaw?: string
  emailRaw?: string
  websiteUrl?: string
  sourceType?: string
  sourceUrl?: string
  notes?: string
}

export type RadarCompanyInsertOptions = {
  runId?: string
}

export function isInternalRadarUser(user: AuthUser) {
  return user.role === 'yux_admin' || user.role === 'yux_operator'
}

export function requireRadarAccess(user: AuthUser) {
  if (!isInternalRadarUser(user)) {
    throw Object.assign(new Error('radar_forbidden'), { statusCode: 403 })
  }
}

export function buildRadarDedupeKey(input: {
  cnpj?: string | null
  websiteUrl?: string | null
  phoneRaw?: string | null
  tradeName?: string | null
  legalName?: string | null
  city?: string | null
  state?: string | null
}) {
  if (input.cnpj) return `cnpj:${input.cnpj.replace(/\D/g, '')}`
  if (input.websiteUrl) return `domain:${normalizeDomain(input.websiteUrl)}`
  if (input.phoneRaw) return `phone:${input.phoneRaw.replace(/\D/g, '')}`
  return `name_city:${normalizeToken(input.tradeName || input.legalName || 'empresa')}:${normalizeToken(input.city || '')}:${normalizeToken(input.state || '')}`
}

export async function listRadarCampaigns(pool: pg.Pool, user: AuthUser, organizationId: string) {
  requireRadarAccess(user)
  const result = await pool.query<RadarCampaignRow>(
    `SELECT *
     FROM public.radar_campaigns
     WHERE organization_id = $1
     ORDER BY updated_at DESC`,
    [organizationId],
  )
  return result.rows.map(mapCampaign)
}

export async function createRadarCampaign(pool: pg.Pool, user: AuthUser, input: RadarCampaignInput) {
  requireRadarAccess(user)
  const result = await pool.query<RadarCampaignRow>(
    `INSERT INTO public.radar_campaigns (
       organization_id, name, target_segment, target_city, target_state,
       target_keywords, target_cnaes, offer_type, budget_limit, daily_limit, created_by, owner_id
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     RETURNING *`,
    [
      input.organizationId,
      input.name.trim(),
      input.targetSegment.trim(),
      input.targetCity.trim(),
      input.targetState.trim().toUpperCase(),
      input.targetKeywords ?? [],
      input.targetCnaes ?? [],
      input.offerType.trim(),
      input.budgetLimit ?? null,
      input.dailyLimit ?? 10,
      user.id,
    ],
  )
  return mapCampaign(result.rows[0])
}

export async function listRadarDataSources(pool: pg.Pool, user: AuthUser, organizationId: string) {
  requireRadarAccess(user)
  const result = await pool.query<RadarDataSourceRow>(
    `SELECT *
     FROM public.radar_data_sources
     WHERE organization_id IS NULL OR organization_id = $1
     ORDER BY organization_id NULLS FIRST, display_name ASC`,
    [organizationId],
  )
  return result.rows.map(mapDataSource)
}

export async function updateRadarDataSource(
  pool: pg.Pool,
  user: AuthUser,
  sourceId: string,
  patch: { enabled?: boolean; rateLimitPerDay?: number; defaultCostPerUnit?: number; termsNotes?: string },
) {
  requireRadarAccess(user)
  const result = await pool.query<RadarDataSourceRow>(
    `UPDATE public.radar_data_sources
     SET enabled = COALESCE($2, enabled),
         rate_limit_per_day = COALESCE($3, rate_limit_per_day),
         default_cost_per_unit = COALESCE($4, default_cost_per_unit),
         terms_notes = COALESCE($5, terms_notes),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      sourceId,
      patch.enabled ?? null,
      patch.rateLimitPerDay ?? null,
      patch.defaultCostPerUnit ?? null,
      patch.termsNotes ?? null,
    ],
  )
  const row = result.rows[0]
  if (!row) throw Object.assign(new Error('radar_data_source_not_found'), { statusCode: 404 })
  return mapDataSource(row)
}

export async function listRadarOpportunities(pool: pg.Pool, user: AuthUser, campaignId: string) {
  requireRadarAccess(user)
  const result = await pool.query<RadarOpportunityWithRelationsRow>(
    `SELECT
       o.*,
       row_to_json(c)::jsonb AS company,
       row_to_json(s)::jsonb AS latest_score,
       row_to_json(d)::jsonb AS latest_diagnostic,
       row_to_json(m)::jsonb AS latest_message_suggestion
     FROM public.radar_opportunities o
     JOIN public.radar_company_records c ON c.id = o.company_record_id
     LEFT JOIN public.radar_scores s ON s.id = o.latest_score_id
     LEFT JOIN public.radar_diagnostics d ON d.id = o.latest_diagnostic_id
     LEFT JOIN public.radar_message_suggestions m ON m.id = o.latest_message_suggestion_id
     WHERE o.campaign_id = $1
     ORDER BY o.updated_at DESC`,
    [campaignId],
  )
  return result.rows.map(row => mapOpportunity(row, row.company ?? undefined, row.latest_score ?? undefined, row.latest_diagnostic ?? undefined, row.latest_message_suggestion ?? undefined))
}

async function fetchRadarOpportunityDetail(queryable: RadarQueryable, opportunityId: string) {
  const result = await queryable.query<RadarOpportunityWithRelationsRow>(
    `SELECT
       o.*,
       row_to_json(c)::jsonb AS company,
       row_to_json(s)::jsonb AS latest_score,
       row_to_json(d)::jsonb AS latest_diagnostic,
       row_to_json(m)::jsonb AS latest_message_suggestion
     FROM public.radar_opportunities o
     JOIN public.radar_company_records c ON c.id = o.company_record_id
     LEFT JOIN public.radar_scores s ON s.id = o.latest_score_id
     LEFT JOIN public.radar_diagnostics d ON d.id = o.latest_diagnostic_id
     LEFT JOIN public.radar_message_suggestions m ON m.id = o.latest_message_suggestion_id
     WHERE o.id = $1
     LIMIT 1`,
    [opportunityId],
  )
  const row = result.rows[0]
  return row ? mapOpportunity(row, row.company ?? undefined, row.latest_score ?? undefined, row.latest_diagnostic ?? undefined, row.latest_message_suggestion ?? undefined) : null
}

export async function getRadarCampaignMetrics(pool: pg.Pool, user: AuthUser, campaignId: string): Promise<RadarMetrics> {
  requireRadarAccess(user)
  const result = await pool.query<{
    companies: string | number
    opportunities: string | number
    enriched: string | number
    review_pending: string | number
    approved: string | number
    converted: string | number
    opted_out: string | number
    estimated_cost: string | number | null
  }>(
    `SELECT
       COUNT(DISTINCT o.company_record_id) AS companies,
       COUNT(*) AS opportunities,
       COUNT(*) FILTER (WHERE o.status IN ('enriched','diagnosing','diagnosed','message_drafted','review_pending','approved','converted')) AS enriched,
       COUNT(*) FILTER (WHERE o.status = 'review_pending') AS review_pending,
       COUNT(*) FILTER (WHERE o.status = 'approved') AS approved,
       COUNT(*) FILTER (WHERE o.status = 'converted') AS converted,
       COUNT(*) FILTER (WHERE o.status = 'opted_out') AS opted_out,
       COALESCE(SUM(cost.estimated_cost), 0) AS estimated_cost
     FROM public.radar_opportunities o
     LEFT JOIN public.radar_cost_logs cost ON cost.opportunity_id = o.id
     WHERE o.campaign_id = $1`,
    [campaignId],
  )
  const sourceBreakdownResult = await pool.query<{
    source_type: string
    companies: string | number
    opportunities: string | number
    candidates: string | number
    converted: string | number
    estimated_cost: string | number | null
  }>(
    `SELECT c.source_type,
            COUNT(DISTINCT c.id) AS companies,
            COUNT(DISTINCT o.id) AS opportunities,
            0 AS candidates,
            COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'converted') AS converted,
            COALESCE(SUM(cost.estimated_cost), 0) AS estimated_cost
     FROM public.radar_opportunities o
     JOIN public.radar_company_records c ON c.id = o.company_record_id
     LEFT JOIN public.radar_cost_logs cost ON cost.opportunity_id = o.id
     WHERE o.campaign_id = $1
     GROUP BY c.source_type
     UNION ALL
     SELECT source_type,
            0 AS companies,
            0 AS opportunities,
            COUNT(*) AS candidates,
            0 AS converted,
            0 AS estimated_cost
     FROM public.radar_candidate_records
     WHERE campaign_id = $1
     GROUP BY source_type`,
    [campaignId],
  )
  const sourceBreakdown = combineSourceBreakdown(sourceBreakdownResult.rows)
  const row = result.rows[0]
  return {
    companies: Number(row?.companies ?? 0),
    opportunities: Number(row?.opportunities ?? 0),
    enriched: Number(row?.enriched ?? 0),
    reviewPending: Number(row?.review_pending ?? 0),
    approved: Number(row?.approved ?? 0),
    converted: Number(row?.converted ?? 0),
    optedOut: Number(row?.opted_out ?? 0),
    estimatedCost: Number(row?.estimated_cost ?? 0),
    sourceBreakdown,
  }
}

export async function addRadarCompanyToCampaign(pool: pg.Pool, user: AuthUser, input: RadarCompanyInput) {
  requireRadarAccess(user)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await addRadarCompanyToCampaignWithClient(client, user, input)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function importRadarCsvToCampaign(
  pool: pg.Pool,
  user: AuthUser,
  input: { organizationId: string; campaignId: string; csv: string },
) {
  requireRadarAccess(user)
  const parsed = parseRadarCsv(input.csv)
  const client = await pool.connect()
  const imported: RadarOpportunity[] = []

  try {
    await client.query('BEGIN')
    const campaign = await client.query<{ id: string }>(
      `SELECT id
       FROM public.radar_campaigns
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [input.campaignId, input.organizationId],
    )
    if (!campaign.rows[0]) throw Object.assign(new Error('radar_campaign_not_found'), { statusCode: 404 })

    const run = await client.query<{ id: string }>(
      `INSERT INTO public.radar_enrichment_runs (
         organization_id, campaign_id, company_record_id, opportunity_id,
         status, provider, input_payload, output_payload, started_at, completed_at
       )
       VALUES ($1,$2,NULL,NULL,'succeeded','csv',$3,$4,NOW(),NOW())
       RETURNING id`,
      [
        input.organizationId,
        input.campaignId,
        JSON.stringify({ rowCount: parsed.rows.length + parsed.issues.length }),
        JSON.stringify({ importedCount: parsed.rows.length, issueCount: parsed.issues.length }),
      ],
    )

    for (const row of parsed.rows) {
      const result = await addRadarCompanyToCampaignWithClient(client, user, {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        tradeName: row.tradeName,
        legalName: row.legalName,
        cnpj: row.cnpj,
        cnaeMain: row.cnaeMain,
        city: row.city,
        state: row.state,
        websiteUrl: row.websiteUrl,
        emailRaw: row.emailRaw,
        phoneRaw: row.phoneRaw,
        sourceType: 'csv',
        sourceUrl: row.sourceUrl,
        notes: row.notes,
      }, { runId: run.rows[0].id })
      imported.push(result.opportunity)
    }

    await client.query('COMMIT')
    return { imported, issues: parsed.issues as RadarCsvImportIssue[], runId: run.rows[0].id }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function importRadarUrlsToCampaign(
  pool: pg.Pool,
  user: AuthUser,
  input: { organizationId: string; campaignId: string; urls: string[] },
) {
  requireRadarAccess(user)
  const urls = input.urls.map(url => url.trim()).filter(Boolean)
  assertSmallBatchLimit(urls.length)

  const source = await findRadarDataSource(pool, input.organizationId, 'jina_reader')
  const client = await pool.connect()
  const imported: RadarOpportunity[] = []
  const issues: Array<{ url: string; code: string; message: string }> = []

  try {
    await client.query('BEGIN')
    const campaign = await client.query<{ id: string }>(
      `SELECT id
       FROM public.radar_campaigns
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [input.campaignId, input.organizationId],
    )
    if (!campaign.rows[0]) throw Object.assign(new Error('radar_campaign_not_found'), { statusCode: 404 })

    const run = await client.query<{ id: string }>(
      `INSERT INTO public.radar_enrichment_runs (
         organization_id, campaign_id, company_record_id, opportunity_id, data_source_id,
         status, provider, input_payload, output_payload, error_message, started_at, completed_at
       )
       VALUES ($1,$2,NULL,NULL,$3,$4,'jina_reader',$5,$6,$7,NOW(),NOW())
       RETURNING id`,
      [
        input.organizationId,
        input.campaignId,
        source?.id ?? null,
        source?.enabled ? 'succeeded' : 'failed',
        JSON.stringify({ urls }),
        JSON.stringify({ importedCount: source?.enabled ? urls.length : 0 }),
        source?.enabled ? null : 'radar_source_disabled:jina_reader',
      ],
    )

    if (!source?.enabled) {
      await client.query('COMMIT')
      return {
        imported,
        issues: urls.map(url => ({
          url,
          code: 'source_disabled',
          message: 'Jina Reader esta desabilitado no catalogo do Radar.',
        })),
        runId: run.rows[0].id,
      }
    }

    for (const url of urls) {
      const result = await addRadarCompanyToCampaignWithClient(client, user, {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        tradeName: domainTitle(url),
        websiteUrl: url,
        sourceType: 'jina_reader',
        sourceUrl: url,
      }, { runId: run.rows[0].id })
      imported.push(result.opportunity)
      await client.query(
        `INSERT INTO public.radar_company_enrichment (
           company_record_id, opportunity_id, website_url, has_site, confidence_score
         )
         VALUES ($1,$2,$3,TRUE,60)
         ON CONFLICT (opportunity_id)
         DO UPDATE SET website_url = EXCLUDED.website_url,
                       has_site = TRUE,
                       confidence_score = GREATEST(public.radar_company_enrichment.confidence_score, 60),
                       updated_at = NOW()`,
        [result.company.id, result.opportunity.id, url],
      )
    }

    await client.query('COMMIT')
    return { imported, issues, runId: run.rows[0].id }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function runRadarAssistedSearch(
  pool: pg.Pool,
  user: AuthUser,
  input: {
    organizationId: string
    campaignId: string
    query: string
    city?: string
    state?: string
    sourceType: 'jina_search' | 'web_search'
    limit?: number
  },
) {
  requireRadarAccess(user)
  const limit = input.limit ?? 5
  assertSmallBatchLimit(limit)

  const source = await findRadarDataSource(pool, input.organizationId, input.sourceType)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const campaign = await client.query<{ id: string }>(
      `SELECT id
       FROM public.radar_campaigns
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [input.campaignId, input.organizationId],
    )
    if (!campaign.rows[0]) throw Object.assign(new Error('radar_campaign_not_found'), { statusCode: 404 })

    const run = await client.query<{ id: string }>(
      `INSERT INTO public.radar_enrichment_runs (
         organization_id, campaign_id, company_record_id, opportunity_id, data_source_id,
         status, provider, input_payload, output_payload, error_message, started_at, completed_at
       )
       VALUES ($1,$2,NULL,NULL,$3,$4,$5,$6,$7,$8,NOW(),NOW())
       RETURNING id`,
      [
        input.organizationId,
        input.campaignId,
        source?.id ?? null,
        source?.enabled ? 'succeeded' : 'failed',
        input.sourceType,
        JSON.stringify({ query: input.query, city: input.city, state: input.state, limit }),
        JSON.stringify({ candidateCount: source?.enabled ? limit : 0 }),
        source?.enabled ? null : `radar_source_disabled:${input.sourceType}`,
      ],
    )

    if (!source?.enabled) {
      await client.query('COMMIT')
      return {
        candidates: [],
        issues: [{ code: 'source_disabled', message: `${input.sourceType} esta desabilitado.` }],
        runId: run.rows[0].id,
      }
    }

    const candidates: RadarCandidateRecord[] = []
    for (const index of Array.from({ length: limit }, (_, value) => value)) {
      const title = `${input.query} ${input.city || ''} candidato ${index + 1}`.trim()
      const dedupeKey = `search:${normalizeToken(title)}`
      const inserted = await client.query<RadarCandidateRecordRow>(
        `INSERT INTO public.radar_candidate_records (
           organization_id, campaign_id, enrichment_run_id, source_type, source_url, title,
           snippet, raw_payload, normalized_payload, dedupe_key
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (campaign_id, dedupe_key)
         DO UPDATE SET updated_at = NOW()
         RETURNING *`,
        [
          input.organizationId,
          input.campaignId,
          run.rows[0].id,
          input.sourceType,
          null,
          title,
          `Resultado assistido para ${input.query}`,
          JSON.stringify({ generated: true }),
          JSON.stringify({ tradeName: title, city: input.city, state: input.state }),
          dedupeKey,
        ],
      )
      candidates.push(mapCandidate(inserted.rows[0]))
    }

    await client.query('COMMIT')
    return { candidates, issues: [], runId: run.rows[0].id }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function listRadarCandidates(pool: pg.Pool, user: AuthUser, campaignId: string) {
  requireRadarAccess(user)
  const result = await pool.query<RadarCandidateRecordRow>(
    `SELECT *
     FROM public.radar_candidate_records
     WHERE campaign_id = $1
     ORDER BY created_at DESC`,
    [campaignId],
  )
  return result.rows.map(mapCandidate)
}

export async function importRadarCandidate(pool: pg.Pool, user: AuthUser, candidateId: string) {
  requireRadarAccess(user)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const candidateResult = await client.query<RadarCandidateRecordRow>(
      `SELECT * FROM public.radar_candidate_records WHERE id = $1 LIMIT 1`,
      [candidateId],
    )
    const candidate = candidateResult.rows[0]
    if (!candidate) throw Object.assign(new Error('radar_candidate_not_found'), { statusCode: 404 })
    if (candidate.status !== 'pending_review') throw Object.assign(new Error('radar_candidate_not_pending'), { statusCode: 409 })

    const normalized = candidate.normalized_payload || {}
    const result = await addRadarCompanyToCampaignWithClient(client, user, {
      organizationId: candidate.organization_id,
      campaignId: candidate.campaign_id,
      tradeName: typeof normalized.tradeName === 'string' ? normalized.tradeName : candidate.title,
      legalName: typeof normalized.legalName === 'string' ? normalized.legalName : undefined,
      cnpj: typeof normalized.cnpj === 'string' ? normalized.cnpj : undefined,
      cnaeMain: typeof normalized.cnaeMain === 'string' ? normalized.cnaeMain : undefined,
      city: typeof normalized.city === 'string' ? normalized.city : undefined,
      state: typeof normalized.state === 'string' ? normalized.state : undefined,
      websiteUrl: typeof normalized.websiteUrl === 'string' ? normalized.websiteUrl : undefined,
      emailRaw: typeof normalized.emailRaw === 'string' ? normalized.emailRaw : undefined,
      phoneRaw: typeof normalized.phoneRaw === 'string' ? normalized.phoneRaw : undefined,
      sourceType: candidate.source_type,
      sourceUrl: candidate.source_url ?? undefined,
    }, { runId: candidate.enrichment_run_id ?? undefined })

    const updated = await client.query<RadarCandidateRecordRow>(
      `UPDATE public.radar_candidate_records
       SET status = 'imported',
           imported_company_record_id = $2,
           imported_opportunity_id = $3,
           reviewed_by = $4,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [candidate.id, result.company.id, result.opportunity.id, user.id],
    )

    await client.query('COMMIT')
    return { candidate: mapCandidate(updated.rows[0]), opportunity: result.opportunity }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function discardRadarCandidate(pool: pg.Pool, user: AuthUser, candidateId: string) {
  requireRadarAccess(user)
  const result = await pool.query<RadarCandidateRecordRow>(
    `UPDATE public.radar_candidate_records
     SET status = 'discarded', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [candidateId, user.id],
  )
  if (!result.rows[0]) throw Object.assign(new Error('radar_candidate_not_found'), { statusCode: 404 })
  return mapCandidate(result.rows[0])
}

export async function listRadarDuplicateCandidates(pool: pg.Pool, user: AuthUser, campaignId: string) {
  requireRadarAccess(user)
  const result = await pool.query(
    `SELECT *
     FROM public.radar_duplicate_candidates
     WHERE campaign_id = $1
     ORDER BY confidence_score DESC, created_at DESC`,
    [campaignId],
  )
  return result.rows
}

export async function updateRadarDuplicateCandidate(
  pool: pg.Pool,
  user: AuthUser,
  duplicateId: string,
  status: 'confirmed' | 'dismissed' | 'merged',
) {
  requireRadarAccess(user)
  const result = await pool.query(
    `UPDATE public.radar_duplicate_candidates
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [duplicateId, status],
  )
  if (!result.rows[0]) throw Object.assign(new Error('radar_duplicate_not_found'), { statusCode: 404 })
  return result.rows[0]
}

export async function batchAnalyzeRadarOpportunities(pool: pg.Pool, user: AuthUser, opportunityIds: string[]) {
  requireRadarAccess(user)
  assertSmallBatchLimit(opportunityIds.length)
  const analyzed: RadarOpportunity[] = []
  for (const opportunityId of opportunityIds) {
    analyzed.push(await runRadarOpportunityAnalysis(pool, user, opportunityId))
  }
  return { analyzed }
}

export async function batchEnrichRadarOpportunities(pool: pg.Pool, user: AuthUser, opportunityIds: string[]) {
  requireRadarAccess(user)
  assertSmallBatchLimit(opportunityIds.length)
  const result = await pool.query<RadarOpportunityRow>(
    `UPDATE public.radar_opportunities
     SET status = CASE WHEN status = 'raw' THEN 'enriched' ELSE status END,
         updated_at = NOW()
     WHERE id = ANY($1::uuid[])
     RETURNING *`,
    [opportunityIds],
  )
  return { enriched: result.rows.map(row => mapOpportunity(row)) }
}

export async function listRadarRuns(pool: pg.Pool, user: AuthUser, campaignId: string) {
  requireRadarAccess(user)
  const result = await pool.query<RadarEnrichmentRunRow>(
    `SELECT *
     FROM public.radar_enrichment_runs
     WHERE campaign_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [campaignId],
  )
  return result.rows.map(mapEnrichmentRun)
}

async function addRadarCompanyToCampaignWithClient(
  client: RadarQueryable,
  user: AuthUser,
  input: RadarCompanyInput,
  options: RadarCompanyInsertOptions = {},
) {
  const dedupeKey = buildRadarDedupeKey(input)
  const sourceType = input.sourceType ?? 'manual'
  const campaign = await client.query<{ id: string }>(
    `SELECT id
     FROM public.radar_campaigns
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [input.campaignId, input.organizationId],
  )
  if (!campaign.rows[0]) throw Object.assign(new Error('radar_campaign_not_found'), { statusCode: 404 })

  let runId = options.runId
  if (!runId) {
    const run = await client.query<{ id: string }>(
      `INSERT INTO public.radar_enrichment_runs (
         organization_id, campaign_id, company_record_id, opportunity_id,
         status, provider, input_payload, output_payload, started_at, completed_at
       )
       VALUES ($1,$2,NULL,NULL,'succeeded',$3,$4,$5,NOW(),NOW())
       RETURNING id`,
      [
        input.organizationId,
        input.campaignId,
        sourceType,
        JSON.stringify({ sourceType, sourceUrl: input.sourceUrl ?? null, notes: input.notes ?? null }),
        JSON.stringify({ accepted: true }),
      ],
    )
    runId = run.rows[0].id
  }

  const company = await client.query<RadarCompanyRecordRow>(
    `INSERT INTO public.radar_company_records (
       organization_id, cnpj, legal_name, trade_name, cnae_main, city, state,
       phone_raw, email_raw, website_url, source_type, source_url, dedupe_key
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (organization_id, dedupe_key)
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [
      input.organizationId,
      input.cnpj ?? null,
      input.legalName ?? null,
      input.tradeName ?? null,
      input.cnaeMain ?? null,
      input.city ?? null,
      input.state ?? null,
      input.phoneRaw ?? null,
      input.emailRaw ?? null,
      input.websiteUrl ?? null,
      sourceType,
      input.sourceUrl ?? null,
      dedupeKey,
    ],
  )
  const companyRow = company.rows[0]
  const opportunity = await client.query<RadarOpportunityRow>(
    `INSERT INTO public.radar_opportunities (organization_id, campaign_id, company_record_id, owner_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (campaign_id, company_record_id)
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [input.organizationId, input.campaignId, companyRow.id, user.id],
  )
  const opportunityRow = opportunity.rows[0]

  await client.query(
    `UPDATE public.radar_enrichment_runs
     SET company_record_id = COALESCE(company_record_id, $2),
         opportunity_id = COALESCE(opportunity_id, $3),
         updated_at = NOW()
     WHERE id = $1`,
    [runId, companyRow.id, opportunityRow.id],
  )
  await client.query(
    `INSERT INTO public.radar_outreach_events (organization_id, campaign_id, company_record_id, opportunity_id, event_type)
     VALUES ($1,$2,$3,$4,'company_added')`,
    [input.organizationId, input.campaignId, companyRow.id, opportunityRow.id],
  )
  await client.query(
    `INSERT INTO public.radar_compliance_logs (organization_id, company_record_id, opportunity_id, data_source)
     VALUES ($1,$2,$3,$4)`,
    [input.organizationId, companyRow.id, opportunityRow.id, sourceType],
  )
  await client.query(
    `INSERT INTO public.radar_cost_logs (
       organization_id, campaign_id, company_record_id, opportunity_id, source_type, action_type, units, estimated_cost, provider
     )
     VALUES ($1,$2,$3,$4,$5,'company_added',1,0,$5)`,
    [input.organizationId, input.campaignId, companyRow.id, opportunityRow.id, sourceType],
  )
  return { company: mapCompany(companyRow), opportunity: mapOpportunity(opportunityRow, companyRow) }
}

export async function reviewRadarOpportunity(
  pool: pg.Pool,
  user: AuthUser,
  opportunityId: string,
  status: 'approved' | 'rejected',
) {
  requireRadarAccess(user)
  const result = await pool.query<RadarOpportunityRow>(
    `UPDATE public.radar_opportunities
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [opportunityId, status],
  )
  const row = result.rows[0]
  if (!row) throw Object.assign(new Error('radar_opportunity_not_found'), { statusCode: 404 })

  await pool.query(
    `INSERT INTO public.radar_outreach_events (organization_id, campaign_id, company_record_id, opportunity_id, event_type)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      row.organization_id,
      row.campaign_id,
      row.company_record_id,
      row.id,
      status === 'approved' ? 'opportunity_approved' : 'opportunity_rejected',
    ],
  )
  if (status === 'approved' && row.latest_message_suggestion_id) {
    await pool.query(
      `UPDATE public.radar_message_suggestions
       SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [row.latest_message_suggestion_id, user.id],
    )
  }

  return await fetchRadarOpportunityDetail(pool, row.id) ?? mapOpportunity(row)
}

export async function optOutRadarOpportunity(pool: pg.Pool, user: AuthUser, opportunityId: string) {
  requireRadarAccess(user)
  const result = await pool.query<RadarOpportunityRow>(
    `UPDATE public.radar_opportunities
     SET status = 'opted_out', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [opportunityId],
  )
  const row = result.rows[0]
  if (!row) throw Object.assign(new Error('radar_opportunity_not_found'), { statusCode: 404 })
  await pool.query(
    `UPDATE public.radar_compliance_logs
     SET opt_out = TRUE, opt_out_at = NOW()
     WHERE opportunity_id = $1`,
    [opportunityId],
  )
  await pool.query(
    `INSERT INTO public.radar_outreach_events (organization_id, campaign_id, company_record_id, opportunity_id, event_type)
     VALUES ($1,$2,$3,$4,'opt_out_registered')`,
    [row.organization_id, row.campaign_id, row.company_record_id, row.id],
  )
  return await fetchRadarOpportunityDetail(pool, row.id) ?? mapOpportunity(row)
}

export async function runRadarOpportunityAnalysis(pool: pg.Pool, user: AuthUser, opportunityId: string) {
  requireRadarAccess(user)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const opportunityResult = await client.query<RadarOpportunityRow & {
      trade_name: string | null
      legal_name: string | null
      city: string | null
      state: string | null
      website_url: string | null
    }>(
      `SELECT o.*, c.trade_name, c.legal_name, c.city, c.state, c.website_url
       FROM public.radar_opportunities o
       JOIN public.radar_company_records c ON c.id = o.company_record_id
       WHERE o.id = $1
       LIMIT 1`,
      [opportunityId],
    )
    const opportunity = opportunityResult.rows[0]
    if (!opportunity) throw Object.assign(new Error('radar_opportunity_not_found'), { statusCode: 404 })

    const companyName = opportunity.trade_name || opportunity.legal_name || 'empresa'
    const evidence = [{ label: 'Fonte publica', value: opportunity.website_url || `${opportunity.city}/${opportunity.state}` }]
    const diagnostic = await client.query<{ id: string }>(
      `INSERT INTO public.radar_diagnostics (
         organization_id, campaign_id, company_record_id, opportunity_id, summary,
         pain_hypotheses, recommended_offer, evidence_json, risk_flags, strategy_profile_key
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ai_sdr_comercial_1')
       RETURNING id`,
      [
        opportunity.organization_id,
        opportunity.campaign_id,
        opportunity.company_record_id,
        opportunity.id,
        `Analise da oportunidade para ${companyName}.`,
        ['Possivel perda de oportunidades por baixa estrutura de captura e follow-up.'],
        'Diagnostico YUX 48h',
        JSON.stringify(evidence),
        [],
      ],
    )
    const score = await client.query<{ id: string }>(
      `INSERT INTO public.radar_scores (
         organization_id, campaign_id, company_record_id, opportunity_id,
         total_score, fit_score, timing_score, pain_score, contactability_score,
         budget_score, personalization_score, explanation
       )
       VALUES ($1,$2,$3,$4,72,75,65,70,70,60,80,$5)
       RETURNING id`,
      [
        opportunity.organization_id,
        opportunity.campaign_id,
        opportunity.company_record_id,
        opportunity.id,
        'Score inicial calculado por fit, dor aparente, contato publico e personalizacao disponivel.',
      ],
    )
    const message = await client.query<{ id: string }>(
      `INSERT INTO public.radar_message_suggestions (
         organization_id, campaign_id, company_record_id, opportunity_id,
         channel, subject, body, personalization_notes, evidence_used, policy_decision
       )
       VALUES ($1,$2,$3,$4,'email',$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        opportunity.organization_id,
        opportunity.campaign_id,
        opportunity.company_record_id,
        opportunity.id,
        `Analise rapida para ${companyName}`,
        `Analisei sinais publicos da ${companyName} e identifiquei oportunidades de melhoria comercial. Posso te enviar 3 ideias praticas?`,
        'Revisao humana obrigatoria antes de qualquer envio.',
        JSON.stringify(evidence),
        JSON.stringify({
          status: 'requires_human_approval',
          canSendAutomatically: false,
          canConvertToLead: true,
          blockedReasons: [],
          requiredReviewFields: ['message', 'evidence', 'risk_flags'],
        }),
      ],
    )
    const updated = await client.query<RadarOpportunityRow>(
      `UPDATE public.radar_opportunities
       SET status = 'review_pending',
           latest_diagnostic_id = $2,
           latest_score_id = $3,
           latest_message_suggestion_id = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [opportunity.id, diagnostic.rows[0].id, score.rows[0].id, message.rows[0].id],
    )
    await client.query(
      `INSERT INTO public.radar_outreach_events (organization_id, campaign_id, company_record_id, opportunity_id, event_type)
       VALUES ($1,$2,$3,$4,'diagnostic_generated'), ($1,$2,$3,$4,'score_generated'), ($1,$2,$3,$4,'message_generated')`,
      [opportunity.organization_id, opportunity.campaign_id, opportunity.company_record_id, opportunity.id],
    )
    await client.query('COMMIT')
    return await fetchRadarOpportunityDetail(client, updated.rows[0].id) ?? mapOpportunity(updated.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function convertRadarOpportunityToLead(pool: pg.Pool, user: AuthUser, opportunityId: string) {
  requireRadarAccess(user)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const opportunityResult = await client.query<RadarOpportunityRow & {
      trade_name: string | null
      legal_name: string | null
      email_raw: string | null
      phone_raw: string | null
      city: string | null
      state: string | null
      summary: string | null
      total_score: number | null
      message_body: string | null
    }>(
      `SELECT o.*, c.trade_name, c.legal_name, c.email_raw, c.phone_raw, c.city, c.state, d.summary, s.total_score, m.body AS message_body
       FROM public.radar_opportunities o
       JOIN public.radar_company_records c ON c.id = o.company_record_id
       LEFT JOIN public.radar_diagnostics d ON d.id = o.latest_diagnostic_id
       LEFT JOIN public.radar_scores s ON s.id = o.latest_score_id
       LEFT JOIN public.radar_message_suggestions m ON m.id = o.latest_message_suggestion_id
       WHERE o.id = $1
       LIMIT 1`,
      [opportunityId],
    )
    const opportunity = opportunityResult.rows[0]
    if (!opportunity) throw Object.assign(new Error('radar_opportunity_not_found'), { statusCode: 404 })
    if (opportunity.status === 'opted_out') throw Object.assign(new Error('radar_opportunity_opted_out'), { statusCode: 409 })
    if (opportunity.status !== 'approved') throw Object.assign(new Error('radar_opportunity_not_approved'), { statusCode: 409 })
    if (opportunity.converted_lead_id) throw Object.assign(new Error('radar_opportunity_already_converted'), { statusCode: 409 })

    const pipeline = await client.query<{ pipeline_id: string; stage_id: string }>(
      `SELECT p.id AS pipeline_id, s.id AS stage_id
       FROM public.crm_pipelines p
       JOIN public.crm_pipeline_stages s ON s.pipeline_id = p.id
       WHERE p.organization_id = $1 AND p.is_active = TRUE AND s.is_active = TRUE
       ORDER BY p.is_default DESC, s.order_index ASC
       LIMIT 1`,
      [opportunity.organization_id],
    )
    const firstPipeline = pipeline.rows[0]
    if (!firstPipeline) throw Object.assign(new Error('radar_crm_pipeline_not_found'), { statusCode: 409 })

    const companyName = opportunity.trade_name || opportunity.legal_name || 'Empresa Radar'
    const lead = await client.query<{ id: string }>(
      `INSERT INTO public.leads (
         organization_id, pipeline_id, stage_id, name, email, phone, company, source,
         source_kind, status, score, notes, last_activity_at, attribution_context, stage
       )
       VALUES ($1,$2,$3,$4,$5,$6,$4,'Radar Comercial','outbound','open',$7,$8,NOW(),$9,'NEW')
       RETURNING id`,
      [
        opportunity.organization_id,
        firstPipeline.pipeline_id,
        firstPipeline.stage_id,
        companyName,
        opportunity.email_raw || `radar-${opportunity.id}@yux.local`,
        opportunity.phone_raw,
        opportunity.total_score || 0,
        opportunity.summary || `Analise da oportunidade para ${companyName}.`,
        JSON.stringify({
          radarCampaignId: opportunity.campaign_id,
          radarCompanyRecordId: opportunity.company_record_id,
          radarOpportunityId: opportunity.id,
          radarDiagnosticId: opportunity.latest_diagnostic_id,
          radarScoreId: opportunity.latest_score_id,
          radarMessageSuggestionId: opportunity.latest_message_suggestion_id,
          recommendedOffer: 'Diagnostico YUX 48h',
        }),
      ],
    )
    const leadId = lead.rows[0].id
    await client.query(
      `INSERT INTO public.interactions (organization_id, lead_id, type, title, description, date)
       VALUES ($1,$2,'note','Analise Radar Comercial',$3,NOW())`,
      [opportunity.organization_id, leadId, `${opportunity.summary || ''}\n\nMensagem aprovada:\n${opportunity.message_body || ''}`.trim()],
    )
    const updated = await client.query<RadarOpportunityRow>(
      `UPDATE public.radar_opportunities
       SET status = 'converted', converted_lead_id = $2, converted_at = NOW(), converted_by = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [opportunity.id, leadId, user.id],
    )
    await client.query(
      `INSERT INTO public.radar_outreach_events (organization_id, campaign_id, company_record_id, opportunity_id, lead_id, event_type)
       VALUES ($1,$2,$3,$4,$5,'converted_to_lead')`,
      [opportunity.organization_id, opportunity.campaign_id, opportunity.company_record_id, opportunity.id, leadId],
    )
    await client.query('COMMIT')
    return { leadId, opportunity: await fetchRadarOpportunityDetail(client, updated.rows[0].id) ?? mapOpportunity(updated.rows[0]) }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export function mapCampaign(row: RadarCampaignRow): RadarCampaign {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    campaignType: row.campaign_type,
    targetSegment: row.target_segment,
    targetCity: row.target_city,
    targetState: row.target_state,
    targetKeywords: row.target_keywords ?? [],
    targetCnaes: row.target_cnaes ?? [],
    offerType: row.offer_type,
    status: row.status,
    ownerId: row.owner_id ?? undefined,
    budgetLimit: row.budget_limit !== null && row.budget_limit !== undefined ? Number(row.budget_limit) : undefined,
    dailyLimit: row.daily_limit,
    automationLevel: row.automation_level,
    strategyProfileKey: row.strategy_profile_key,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapDataSource(row: RadarDataSourceRow): RadarDataSource {
  return {
    id: row.id,
    organizationId: row.organization_id ?? undefined,
    sourceKey: row.source_key,
    sourceType: row.source_type,
    displayName: row.display_name,
    enabled: row.enabled,
    isPaid: row.is_paid,
    requiresSecret: row.requires_secret,
    termsNotes: row.terms_notes ?? undefined,
    defaultCostPerUnit: Number(row.default_cost_per_unit ?? 0),
    rateLimitPerDay: row.rate_limit_per_day,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapEnrichmentRun(row: RadarEnrichmentRunRow): RadarEnrichmentRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    campaignId: row.campaign_id,
    companyRecordId: row.company_record_id ?? undefined,
    opportunityId: row.opportunity_id ?? undefined,
    dataSourceId: row.data_source_id ?? undefined,
    agentExecutionRunId: row.agent_execution_run_id ?? undefined,
    status: row.status,
    provider: row.provider,
    inputPayload: row.input_payload ?? {},
    outputPayload: row.output_payload ?? {},
    errorMessage: row.error_message ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapCandidate(row: RadarCandidateRecordRow): RadarCandidateRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    campaignId: row.campaign_id,
    enrichmentRunId: row.enrichment_run_id ?? undefined,
    sourceType: row.source_type,
    sourceUrl: row.source_url ?? undefined,
    title: row.title,
    snippet: row.snippet ?? undefined,
    rawPayload: row.raw_payload ?? {},
    normalizedPayload: row.normalized_payload ?? {},
    dedupeKey: row.dedupe_key,
    status: row.status,
    importedCompanyRecordId: row.imported_company_record_id ?? undefined,
    importedOpportunityId: row.imported_opportunity_id ?? undefined,
    errorMessage: row.error_message ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapCompany(row: RadarCompanyRecordRow): RadarCompanyRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    cnpj: row.cnpj ?? undefined,
    legalName: row.legal_name ?? undefined,
    tradeName: row.trade_name ?? undefined,
    cnaeMain: row.cnae_main ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    address: row.address ?? undefined,
    phoneRaw: row.phone_raw ?? undefined,
    emailRaw: row.email_raw ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    sourceType: row.source_type,
    sourceUrl: row.source_url ?? undefined,
    sourceCollectedAt: row.source_collected_at,
    dedupeKey: row.dedupe_key,
    dedupeStatus: row.dedupe_status,
    recordStatus: row.record_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapOpportunity(
  row: RadarOpportunityRow,
  company?: RadarCompanyRecordRow,
  score?: RadarScoreRow,
  diagnostic?: RadarDiagnosticRow,
  message?: RadarMessageSuggestionRow,
): RadarOpportunity {
  return {
    id: row.id,
    organizationId: row.organization_id,
    campaignId: row.campaign_id,
    companyRecordId: row.company_record_id,
    status: row.status,
    ownerId: row.owner_id ?? undefined,
    priority: row.priority,
    latestScoreId: row.latest_score_id ?? undefined,
    latestDiagnosticId: row.latest_diagnostic_id ?? undefined,
    latestMessageSuggestionId: row.latest_message_suggestion_id ?? undefined,
    convertedLeadId: row.converted_lead_id ?? undefined,
    convertedAt: row.converted_at ?? undefined,
    convertedBy: row.converted_by ?? undefined,
    company: company ? mapCompany(company) : undefined,
    latestScore: score ? mapScore(score) : undefined,
    latestDiagnostic: diagnostic ? mapDiagnostic(diagnostic) : undefined,
    latestMessageSuggestion: message ? mapMessageSuggestion(message) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapScore(row: RadarScoreRow): RadarScore {
  return {
    id: row.id,
    totalScore: row.total_score,
    fitScore: row.fit_score,
    timingScore: row.timing_score,
    painScore: row.pain_score,
    contactabilityScore: row.contactability_score,
    budgetScore: row.budget_score,
    personalizationScore: row.personalization_score,
    explanation: row.explanation,
    createdAt: row.created_at,
  }
}

function mapDiagnostic(row: RadarDiagnosticRow): RadarDiagnostic {
  return {
    id: row.id,
    summary: row.summary,
    detectedServices: row.detected_services ?? [],
    detectedChannels: row.detected_channels ?? [],
    painHypotheses: row.pain_hypotheses ?? [],
    recommendedOffer: row.recommended_offer ?? undefined,
    evidence: row.evidence_json ?? [],
    riskFlags: row.risk_flags ?? [],
    strategyProfileKey: row.strategy_profile_key,
    aiCostEstimate: Number(row.ai_cost_estimate ?? 0),
    createdAt: row.created_at,
  }
}

function mapMessageSuggestion(row: RadarMessageSuggestionRow): RadarMessageSuggestion {
  return {
    id: row.id,
    channel: row.channel,
    subject: row.subject ?? undefined,
    body: row.body,
    personalizationNotes: row.personalization_notes ?? undefined,
    evidenceUsed: row.evidence_used ?? [],
    policyDecision: row.policy_decision,
    status: row.status,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeToken(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function normalizeDomain(value: string) {
  try {
    const url = value.startsWith('http') ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return normalizeToken(value)
  }
}

async function findRadarDataSource(pool: pg.Pool, organizationId: string, sourceKey: string) {
  const result = await pool.query<RadarDataSourceRow>(
    `SELECT *
     FROM public.radar_data_sources
     WHERE source_key = $1 AND (organization_id IS NULL OR organization_id = $2)
     ORDER BY organization_id NULLS LAST
     LIMIT 1`,
    [sourceKey, organizationId],
  )
  return result.rows[0] ? mapDataSource(result.rows[0]) : null
}

function domainTitle(url: string) {
  try {
    const parsed = url.startsWith('http') ? new URL(url) : new URL(`https://${url}`)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function combineSourceBreakdown(rows: Array<{
  source_type: string
  companies: string | number
  opportunities: string | number
  candidates: string | number
  converted: string | number
  estimated_cost: string | number | null
}>) {
  const bySource = new Map<string, {
    sourceType: string
    companies: number
    opportunities: number
    candidates: number
    converted: number
    estimatedCost: number
  }>()

  for (const row of rows) {
    const sourceType = row.source_type || 'manual'
    const current = bySource.get(sourceType) ?? {
      sourceType,
      companies: 0,
      opportunities: 0,
      candidates: 0,
      converted: 0,
      estimatedCost: 0,
    }
    current.companies += Number(row.companies ?? 0)
    current.opportunities += Number(row.opportunities ?? 0)
    current.candidates += Number(row.candidates ?? 0)
    current.converted += Number(row.converted ?? 0)
    current.estimatedCost += Number(row.estimated_cost ?? 0)
    bySource.set(sourceType, current)
  }

  return Array.from(bySource.values()).map(source => ({
    ...source,
    estimatedCost: Number(source.estimatedCost.toFixed(6)),
  }))
}
