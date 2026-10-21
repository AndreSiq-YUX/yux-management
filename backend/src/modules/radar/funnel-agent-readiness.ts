import type pg from 'pg';
import {loadRadarCampaignSpendBrl,radarCampaignBudgetAllows} from './campaign-budget.js';
import { loadRadarDeepResearchRoute, radarDeepResearchBudget } from './deep-research.js';
import { radarAgentCampaignSpentUsd } from './deep-research-execution.js';
import { loadRadarOperationalLimits } from './operational-limits.js';
import { addRadarDecimal, compareRadarDecimal, estimateRadarCostBrl, multiplyRadarDecimal, type RadarCostPolicy, type RadarCostEstimate } from './cost-conversion.js';

type Route = { status: string; kind: string; provider: string; protocol: string; model_name: string; fallback_routes?: Array<{ modelName: string; provider: string }>; research_config: unknown };
export function evaluateRadarFunnelAgentReadiness(input: {
    route?: Route; provider?: { status: string; hasSecret: boolean; internal: boolean; publicConfig: Record<string, unknown> };
    fallbackLimit: number; usedUsdCampaign: string; costPolicy: RadarCostPolicy; hasExistingEffect?: boolean;
    usedBrlCampaign?: string; budgetBrlCampaign?: string | number | null;
}): { allowed: boolean; recoverOnly: boolean; reason?: string; price?: RadarCostEstimate } {
    if (input.hasExistingEffect) return { allowed: true, recoverOnly: true };
    const route = input.route, provider = input.provider;
    if (!route || route.status !== 'active' || route.kind !== 'research' || route.provider !== 'perplexity' || route.protocol !== 'perplexity-agent-v1') return { allowed: false, recoverOnly: false, reason: 'research_unconfigured' };
    if (provider?.status !== 'active' || !provider.hasSecret || provider.publicConfig.retentionLicensed !== true || provider.publicConfig.agentResearchLicensed !== true || !provider.internal && provider.publicConfig.clientDeliveryLicensed !== true) return { allowed: false, recoverOnly: false, reason: 'radar_deep_research_license_required' };
    try {
        const budget = radarDeepResearchBudget(route.research_config, input.fallbackLimit);
        const attempts = [...new Map([{ provider: route.provider, modelName: route.model_name }, ...(route.fallback_routes ?? [])].map(item => [item.modelName, item])).values()];
        if (attempts.some(item => item.provider !== 'perplexity' || !item.modelName)) throw Error('llm_route_capability_incompatible');
        const reserved = multiplyRadarDecimal(String(budget.config.estimatedUsdPerAttempt), String(Math.min(attempts.length, budget.attempts)));
        const price = estimateRadarCostBrl({ amount: reserved, currency: 'USD', rateSnapshot: input.costPolicy });
        if (price.amountBrl === null) return { allowed: false, recoverOnly: false, price, reason: price.reason };
        if (!radarCampaignBudgetAllows(input.usedBrlCampaign ?? '0', price.amountBrl, input.budgetBrlCampaign)) return { allowed: false, recoverOnly: false, price, reason: 'source_budget_exceeded' };
        if (compareRadarDecimal(addRadarDecimal(input.usedUsdCampaign, reserved), String(budget.config.budgetUsdPerCampaign)) > 0) return { allowed: false, recoverOnly: false, price, reason: 'radar_deep_research_campaign_budget_reached' };
        return { allowed: true, recoverOnly: false, price };
    } catch (cause) { return { allowed: false, recoverOnly: false, reason: cause instanceof Error ? cause.message : 'research_unconfigured' }; }
}
export async function loadRadarFunnelAgentReadiness(db: Pick<pg.Pool, 'query'>, input: { organizationId: string; campaignId: string; runId: string }) {
    const run = (await db.query('SELECT calls FROM public.radar_candidate_research_runs WHERE id=$1 AND organization_id=$2 AND campaign_id=$3', [input.runId, input.organizationId, input.campaignId])).rows[0];
    if (Object.values(run?.calls ?? {}).some(value => (value as { source?: string }).source === 'perplexity_agent')) return { allowed: true, recoverOnly: true };
    const route = await loadRadarDeepResearchRoute(db, input.organizationId);
    const campaign = (await db.query('SELECT budget_limit FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2', [input.campaignId,input.organizationId])).rows[0];
    const usedBrlCampaign = await loadRadarCampaignSpendBrl(db,input.organizationId,input.campaignId);
    const policy = await loadRadarOperationalLimits(db);
    const row = (await db.query(`SELECT provider.status,provider.public_config,EXISTS(SELECT 1 FROM public.platform_provider_secrets secret WHERE secret.provider_connection_id=provider.id AND secret.secret_kind='api_key') AS has_secret,organization.kind='yux' AND organization.is_internal_growth_workspace AS internal FROM public.organizations organization CROSS JOIN LATERAL(SELECT * FROM public.platform_provider_connections WHERE provider_key='perplexity' AND environment='production' ORDER BY is_default DESC,updated_at DESC LIMIT 1) provider WHERE organization.id=$1`, [input.organizationId])).rows[0];
    const usage = (await db.query(`WITH entries AS(SELECT entry.value FROM public.radar_candidate_research_runs run CROSS JOIN LATERAL jsonb_each(run.calls) entry WHERE run.organization_id=$1 AND run.campaign_id=$2 AND entry.value->>'source'='perplexity_agent'),versions AS(SELECT value FROM entries UNION ALL SELECT history.value FROM entries CROSS JOIN LATERAL jsonb_array_elements(COALESCE(entries.value->'previous','[]')) history) SELECT jsonb_build_object('entry',jsonb_build_object('source','perplexity_agent','requestId',value->'requestId','reservedUsd',value->'reservedUsd','actualUsd',value->'actualUsd')) AS calls FROM versions`, [input.organizationId, input.campaignId])).rows;
    let usedUsdCampaign: string;
    try { usedUsdCampaign = radarAgentCampaignSpentUsd(usage); } catch { return { allowed: false, recoverOnly: false, reason: 'radar_deep_research_legacy_budget_requires_review' }; }
    return evaluateRadarFunnelAgentReadiness({ route: route as Route | undefined, provider: row ? { status: row.status, hasSecret: row.has_secret, internal: row.internal, publicConfig: row.public_config ?? {} } : undefined,
        costPolicy: policy.costPolicy, fallbackLimit: policy.limits.maxFallbackAttemptsPerEffect, usedUsdCampaign, usedBrlCampaign, budgetBrlCampaign: campaign?.budget_limit });
}
