import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import type {
  RadarCampaign,
  RadarCampaignRow,
  RadarCompanyRecord,
  RadarCompanyRecordRow,
  RadarDiagnostic,
  RadarDiagnosticRow,
  RadarMessageSuggestion,
  RadarMessageSuggestionRow,
  RadarMetrics,
  RadarOpportunity,
  RadarOpportunityRow,
  RadarScore,
  RadarScoreRow,
} from './types.js'

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
  }
}

export async function addRadarCompanyToCampaign(pool: pg.Pool, user: AuthUser, input: RadarCompanyInput) {
  requireRadarAccess(user)
  const dedupeKey = buildRadarDedupeKey(input)
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
        input.sourceType ?? 'manual',
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
    await client.query(
      `INSERT INTO public.radar_outreach_events (organization_id, campaign_id, company_record_id, opportunity_id, event_type)
       VALUES ($1,$2,$3,$4,'company_added')`,
      [input.organizationId, input.campaignId, companyRow.id, opportunity.rows[0].id],
    )
    await client.query(
      `INSERT INTO public.radar_compliance_logs (organization_id, company_record_id, opportunity_id, data_source)
       VALUES ($1,$2,$3,$4)`,
      [input.organizationId, companyRow.id, opportunity.rows[0].id, input.sourceType ?? 'manual'],
    )
    await client.query('COMMIT')
    return { company: mapCompany(companyRow), opportunity: mapOpportunity(opportunity.rows[0], companyRow) }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
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
