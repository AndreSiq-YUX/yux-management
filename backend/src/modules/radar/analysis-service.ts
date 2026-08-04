import type pg from 'pg'
import { z } from 'zod'
import type { AppEnv } from '../../config/env.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'

const radarAnalysisSchema = z.object({
  summary: z.string().min(1),
  source: z.object({ type: z.string().optional(), url: z.string().nullable().optional() }),
  evidence: z.array(z.unknown()),
  pain_hypotheses: z.array(z.string()),
  recommended_offer: z.string().nullable().optional(),
  score: z.object({
    total_score: z.number().int().min(0).max(100),
    fit_score: z.number().int().min(0).max(100),
    timing_score: z.number().int().min(0).max(100),
    pain_score: z.number().int().min(0).max(100),
    contactability_score: z.number().int().min(0).max(100),
    budget_score: z.number().int().min(0).max(100),
    personalization_score: z.number().int().min(0).max(100),
    explanation: z.string().min(1),
  }),
  message: z.object({
    channel: z.enum(['email', 'linkedin', 'phone', 'whatsapp_manual', 'task']),
    subject: z.string().nullable().optional(),
    body: z.string().min(1),
    personalization_notes: z.string().nullable().optional(),
    evidence_used: z.array(z.unknown()).default([]),
  }),
  risk_flags: z.array(z.string()),
  policyDecision: z.object({
    status: z.enum(['requires_human_approval', 'blocked']),
    canSendAutomatically: z.literal(false),
    canConvertToLead: z.boolean(),
    blockedReasons: z.array(z.string()),
    requiredReviewFields: z.array(z.string()),
  }),
  provider: z.string().optional(),
  model: z.string().optional(),
})

type RadarAnalysis = z.infer<typeof radarAnalysisSchema>

type RadarAnalysisContext = {
  run_id: string
  run_status: 'pending' | 'running' | 'succeeded' | 'failed'
  organization_id: string
  client_id: string | null
  contract_id: string | null
  campaign_id: string
  company_record_id: string
  opportunity_id: string
  strategy_profile_key: string
  target_segment: string
  target_city: string
  target_state: string
  offer_type: string
  trade_name: string | null
  legal_name: string | null
  cnae_main: string | null
  city: string | null
  state: string | null
  phone_raw: string | null
  email_raw: string | null
  website_url: string | null
  source_type: string
  source_url: string | null
  address: string | null
  public_email: string | null
  public_phone: string | null
  whatsapp: string | null
  instagram_url: string | null
  linkedin_url: string | null
  google_business_url: string | null
}

type RuntimeWorkflowResult = {
  run?: { id?: string }
  synthesis?: unknown
}

export async function executeRadarAnalysis(
  pool: pg.Pool,
  env: AppEnv,
  data: { runId: string; opportunityId: string },
) {
  const context = await loadRadarAnalysisContext(pool, data)
  if (context.run_status === 'succeeded') return { runId: context.run_id, status: 'succeeded' as const }

  await pool.query(
    `UPDATE public.radar_enrichment_runs
     SET status = 'running', started_at = COALESCE(started_at, NOW()), error_message = NULL, updated_at = NOW()
     WHERE id = $1`,
    [context.run_id],
  )

  try {
    const companyName = context.trade_name || context.legal_name || 'empresa sem nome informado'
    const evidence = buildPublicEvidence(context)
    const result = await invokeAgentRuntime<RuntimeWorkflowResult>(env, '/workflows/execute', {
      message: [
        `Analise a empresa ${companyName} para prospeccao ativa interna da YUX.`,
        `Campanha: ${context.target_segment} em ${context.target_city}/${context.target_state}.`,
        `Oferta prevista: ${context.offer_type}.`,
        'Use apenas as evidencias publicas identificadas e mantenha o primeiro contato sob revisao humana.',
      ].join('\n'),
      profile_key: context.strategy_profile_key || 'ai_sdr_comercial_1',
      source: 'radar',
      organization_id: context.organization_id,
      client_id: context.client_id || undefined,
      contract_id: context.contract_id || undefined,
      mode: 'commercial_radar_local_niche',
      retrieval_context: {
        company_name: companyName,
        segment: context.target_segment || context.cnae_main || '',
        city: context.city || context.target_city || '',
        state: context.state || context.target_state || '',
        website_url: context.website_url || '',
        source_type: context.source_type,
        source_url: context.source_url || context.website_url || '',
        channels: [context.email_raw || context.public_email, context.phone_raw || context.public_phone, context.whatsapp]
          .filter(Boolean),
        chunks: evidence,
      },
    })
    const analysis = radarAnalysisSchema.parse(result.synthesis)
    await persistRadarAnalysis(pool, context, analysis, result.run?.id)
    return { runId: context.run_id, status: 'succeeded' as const, opportunityId: context.opportunity_id }
  } catch (error) {
    await failRadarAnalysis(pool, context, error)
    throw error
  }
}

async function loadRadarAnalysisContext(
  pool: pg.Pool,
  data: { runId: string; opportunityId: string },
): Promise<RadarAnalysisContext> {
  const result = await pool.query<RadarAnalysisContext>(
    `SELECT r.id AS run_id, r.status AS run_status,
            o.organization_id, organization.client_id,
            active_contract.id AS contract_id,
            o.campaign_id, o.company_record_id, o.id AS opportunity_id,
            campaign.strategy_profile_key, campaign.target_segment, campaign.target_city,
            campaign.target_state, campaign.offer_type,
            company.trade_name, company.legal_name, company.cnae_main, company.city, company.state,
            company.phone_raw, company.email_raw, company.website_url, company.source_type,
            company.source_url, company.address,
            enrichment.public_email, enrichment.public_phone, enrichment.whatsapp,
            enrichment.instagram_url, enrichment.linkedin_url, enrichment.google_business_url
     FROM public.radar_enrichment_runs r
     JOIN public.radar_opportunities o ON o.id = r.opportunity_id
     JOIN public.radar_campaigns campaign ON campaign.id = o.campaign_id
     JOIN public.organizations organization ON organization.id = o.organization_id
     LEFT JOIN LATERAL (
       SELECT contract.id
         FROM public.contracts contract
        WHERE contract.client_id = organization.client_id AND contract.status = 'active'
        ORDER BY contract.starts_at DESC NULLS LAST, contract.created_at DESC
        LIMIT 1
     ) active_contract ON TRUE
     JOIN public.radar_company_records company ON company.id = o.company_record_id
     LEFT JOIN public.radar_company_enrichment enrichment ON enrichment.opportunity_id = o.id
     WHERE r.id = $1 AND o.id = $2 AND r.run_kind = 'analysis'
     LIMIT 1`,
    [data.runId, data.opportunityId],
  )
  const row = result.rows[0]
  if (!row) throw new Error('radar_analysis_run_not_found')
  return row
}

function buildPublicEvidence(context: RadarAnalysisContext) {
  const entries: Array<[string, string | null]> = [
    ['company-record', [context.trade_name || context.legal_name, context.cnae_main, context.city, context.state].filter(Boolean).join(' | ')],
    ['website', context.website_url],
    ['source', context.source_url],
    ['business-profile', context.google_business_url],
    ['instagram', context.instagram_url],
    ['linkedin', context.linkedin_url],
    ['public-contact', [context.email_raw || context.public_email, context.phone_raw || context.public_phone, context.whatsapp].filter(Boolean).join(' | ')],
  ]
  return entries
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([id, chunkText]) => ({ id, section_key: id, chunk_text: chunkText }))
}

async function persistRadarAnalysis(
  pool: pg.Pool,
  context: RadarAnalysisContext,
  analysis: RadarAnalysis,
  agentExecutionRunId?: string,
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const diagnostic = await client.query<{ id: string }>(
      `INSERT INTO public.radar_diagnostics (
         organization_id, campaign_id, company_record_id, opportunity_id, agent_execution_run_id,
         summary, detected_channels, pain_hypotheses, recommended_offer, evidence_json,
         risk_flags, strategy_profile_key, ai_model
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        context.organization_id, context.campaign_id, context.company_record_id, context.opportunity_id,
        agentExecutionRunId || null, analysis.summary,
        [context.email_raw || context.public_email ? 'email' : null, context.phone_raw || context.public_phone ? 'phone' : null, context.whatsapp ? 'whatsapp' : null].filter(Boolean),
        analysis.pain_hypotheses, analysis.recommended_offer || null, JSON.stringify(analysis.evidence),
        analysis.risk_flags, context.strategy_profile_key || 'ai_sdr_comercial_1', analysis.model || null,
      ],
    )
    const score = await client.query<{ id: string }>(
      `INSERT INTO public.radar_scores (
         organization_id, campaign_id, company_record_id, opportunity_id,
         total_score, fit_score, timing_score, pain_score, contactability_score,
         budget_score, personalization_score, explanation
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        context.organization_id, context.campaign_id, context.company_record_id, context.opportunity_id,
        analysis.score.total_score, analysis.score.fit_score, analysis.score.timing_score,
        analysis.score.pain_score, analysis.score.contactability_score, analysis.score.budget_score,
        analysis.score.personalization_score, analysis.score.explanation,
      ],
    )
    const message = await client.query<{ id: string }>(
      `INSERT INTO public.radar_message_suggestions (
         organization_id, campaign_id, company_record_id, opportunity_id, agent_execution_run_id,
         channel, subject, body, personalization_notes, evidence_used, policy_decision
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        context.organization_id, context.campaign_id, context.company_record_id, context.opportunity_id,
        agentExecutionRunId || null, analysis.message.channel, analysis.message.subject || null,
        analysis.message.body, analysis.message.personalization_notes || null,
        JSON.stringify(analysis.message.evidence_used), JSON.stringify(analysis.policyDecision),
      ],
    )
    await client.query(
      `UPDATE public.radar_opportunities
       SET status = 'review_pending', latest_diagnostic_id = $2, latest_score_id = $3,
           latest_message_suggestion_id = $4, updated_at = NOW()
       WHERE id = $1`,
      [context.opportunity_id, diagnostic.rows[0].id, score.rows[0].id, message.rows[0].id],
    )
    await client.query(
      `UPDATE public.radar_enrichment_runs
       SET status = 'succeeded', agent_execution_run_id = $2, output_payload = $3,
           completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [context.run_id, agentExecutionRunId || null, JSON.stringify(analysis)],
    )
    await client.query(
      `INSERT INTO public.radar_outreach_events (
         organization_id, campaign_id, company_record_id, opportunity_id, event_type, message_id
       ) VALUES
         ($1,$2,$3,$4,'diagnostic_generated',NULL),
         ($1,$2,$3,$4,'score_generated',NULL),
         ($1,$2,$3,$4,'message_generated',$5),
         ($1,$2,$3,$4,'analysis_completed',$5)`,
      [context.organization_id, context.campaign_id, context.company_record_id, context.opportunity_id, message.rows[0].id],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function failRadarAnalysis(pool: pg.Pool, context: RadarAnalysisContext, error: unknown) {
  const message = error instanceof Error ? error.message : 'radar_analysis_failed'
  await pool.query(
    `UPDATE public.radar_enrichment_runs
     SET status = 'failed', error_message = $2, completed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [context.run_id, message.slice(0, 1000)],
  )
  await pool.query(
    `UPDATE public.radar_opportunities
     SET status = CASE WHEN status = 'diagnosing' THEN 'enriched' ELSE status END, updated_at = NOW()
     WHERE id = $1`,
    [context.opportunity_id],
  )
  await pool.query(
    `INSERT INTO public.radar_outreach_events (
       organization_id, campaign_id, company_record_id, opportunity_id, event_type, event_status, notes
     ) VALUES ($1,$2,$3,$4,'analysis_failed','failed',$5)`,
    [context.organization_id, context.campaign_id, context.company_record_id, context.opportunity_id, message.slice(0, 1000)],
  )
}
