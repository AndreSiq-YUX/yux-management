import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { AuthUser } from '../../auth/routes.js';
import type { AppEnv } from '../../config/env.js';
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js';
import { requireRadarScope } from './access.js';
import { decisionConfigSchema, decisionContextSchema, decisionResultSchema, type DecisionContextV1, type DecisionResultV1, type RadarDecisionConfig } from './decision-contracts.js';
import { evaluateRadarDecision, matchingRadarDecisionCalibration } from './decision-policy.js';
import { loadRadarDecisionCalibrations } from './decision-calibration.js';
import { loadRadarOperationalLimits } from './operational-limits.js';
import { estimateRadarCostBrl, radarReportedCostAmount, addRadarDecimal, type RadarCostPolicy, type RadarCostEstimate } from './cost-conversion.js';
import { resolveRadarAnalysisRetry, type RadarAnalysisRetryBinding } from './analysis-retry-authorizations.js';
type Db = Pick<pg.Pool, 'query'>;
type ModelAttempt = {
    provider: string;
    modelName: string;
};
export type RadarDecisionRoute = {
    id: string;
    version: number;
    routingKey: string;
    authorizedAttempts?: number;
    attempts: ModelAttempt[];
    config: RadarDecisionConfig & {
        maxInputTokens: number;
    };
    fingerprint: string;
};
type DecisionCall = {
    source: 'openrouter_decision';
    status: string;
    requestId: string;
    contextHash: string;
    route: RadarDecisionRoute;
    context: DecisionContextV1;
    costPolicy: RadarCostPolicy;
    costEstimate: RadarCostEstimate;
    result?: DecisionResultV1;
    retryAuthorization?: RadarAnalysisRetryBinding;
    previous?: Array<{
        requestId: string;
        status: string;
        route: RadarDecisionRoute;
        costPolicy?: RadarCostPolicy;
        costEstimate?: RadarCostEstimate;
    }>;
    error?: string;
};
const failure = (code: string, statusCode = 409) => Object.assign(Error(code), { statusCode });
function canonical(value: unknown): string { if (Array.isArray(value))
    return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object')
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`; return JSON.stringify(value); }
export const radarDecisionHash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export async function loadRadarDecisionRoute(db: Db, task: string, tenant: {
    organizationId: string;
    clientId: string | null;
    contractId: string | null;
}, testRouteId?: string): Promise<RadarDecisionRoute | null> {
    const rows = (await db.query(`SELECT * FROM public.model_routing_rules WHERE (agent_type=$1 OR agent_type='radar_decision_default') AND routing_tier='default' AND agent_id IS NULL
 AND (organization_id IS NULL OR organization_id=$2) AND (client_id IS NULL OR client_id=$3) AND (contract_id IS NULL OR contract_id=$4)`, [task, tenant.organizationId, tenant.clientId, tenant.contractId])).rows;
    const rank = (row: pg.QueryResultRow) => ['organization_id', 'client_id', 'contract_id'].filter(key => row[key]).length;
    rows.sort((a, b) => rank(b) - rank(a) || Number(b.version ?? 1) - Number(a.version ?? 1) || String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
    const route = testRouteId ? rows.find(row => row.id === testRouteId) : rows.find(row => row.agent_type === task) ?? rows.find(row => row.agent_type === 'radar_decision_default');
    if (!route)
        return null;
    if (route.status !== 'active')
        throw failure('llm_route_not_active');
    if (route.kind !== 'decision' || route.protocol !== 'openrouter-decisions-alpha-v1' || route.provider !== 'openrouter')
        throw failure('llm_route_capability_incompatible');
    const chain = [...new Map([route, rows.find(row => row.agent_type === task && !row.organization_id && !row.client_id && !row.contract_id), rows.find(row => row.agent_type === 'radar_decision_default')].filter(Boolean).map(item => [item!.id, item!])).values()];
    const attempts: ModelAttempt[] = [];
    for (const item of chain) {
        if (!item || item.status !== 'active')
            continue;
        if (item.kind !== 'decision' || item.protocol !== 'openrouter-decisions-alpha-v1')
            throw failure('llm_route_capability_incompatible');
        for (const attempt of [{ provider: item.provider, modelName: item.model_name }, ...(item.fallback_routes ?? []), ...(item.fallback_model_name ? [{ provider: item.provider, modelName: item.fallback_model_name }] : [])]) {
            if (attempt.provider !== 'openrouter' || !attempt.modelName?.trim())
                throw failure('llm_route_capability_incompatible');
            if (!attempts.some(old => old.provider === attempt.provider && old.modelName === attempt.modelName))
                attempts.push(attempt);
        }
    }
    const config = { ...decisionConfigSchema.parse(route.decision_config ?? {}), maxInputTokens: Number(route.max_input_tokens ?? 24000) };
    const snapshot = { id: String(route.id), version: Number(route.version), attempts, config };
    return { ...snapshot, routingKey: task, fingerprint: radarDecisionHash({ ...snapshot, chainVersions: chain.map(item => [item!.id, Number(item!.version)]) }) };
}
export function radarDecisionPrice(route: RadarDecisionRoute, fallbackLimit: number, costPolicy: Parameters<typeof estimateRadarCostBrl>[0]['rateSnapshot']) {
    const models = route.attempts.slice(0, Math.min(route.config.maxAttempts, fallbackLimit + 1)), prices = models.map(item => route.config.modelPolicies[item.modelName]?.estimatedUsdPerAttempt);
    const amount = prices.every(value => typeof value === 'number') ? prices.reduce((sum, value) => addRadarDecimal(sum, radarReportedCostAmount(value)!), '0') : null;
    return estimateRadarCostBrl({ amount, currency: 'USD', rateSnapshot: costPolicy });
}
export async function invokeRadarDecision(env: AppEnv, input: DecisionContextV1, route: RadarDecisionRoute, tenant: {
    clientId: string | null;
    contractId: string | null;
}, requestId: string, runtime = invokeAgentRuntime, testOnly = false, retry?: RadarAnalysisRetryBinding) {
    const payload = { organization_id: input.organizationId, client_id: tenant.clientId, contract_id: tenant.contractId, request_id: requestId, task: input.task, enabled: true,
        identity: input.identity, criteria: input.criteria, evidence: input.evidence.map(({ sourceUrl, ...item }) => ({ ...item, source_url: sourceUrl })), options: input.options,
        route_snapshot: { id: route.id, version: route.version, attempts: route.attempts, authorizedAttempts: route.authorizedAttempts ?? 1, config: route.config, ...(testOnly ? { testOnly: true, routingKey: route.routingKey } : {}) }, ...(retry ? { retry_authorization: retry } : {}) };
    return decisionResultSchema.parse(await runtime<unknown>(env, '/radar/decide', payload, { timeoutMs: route.config.deadlineSeconds * 1000 + 10000 }));
}
/** Called only by the worker after it owns the company lease. Saved raw replies
 * are recovered before route/price checks so a later edit never forces repurchase. */
export type RadarDecisionOutcome = {
    action: string;
    effectiveMode: string;
    reasonCode: string;
    evidenceIds: string[];
    threshold?: number | null;
    result?: DecisionResultV1;
};
export async function decideRadarAction(pool: pg.Pool, user: AuthUser, value: DecisionContextV1, dependencies: {
    env: AppEnv;
    runId: string;
    leaseId: string;
    runtime?: typeof invokeAgentRuntime;
    authorize: () => Promise<void>;
    beforeEffect?:()=>void;
}): Promise<RadarDecisionOutcome> {
    const input = decisionContextSchema.parse(value);
    await requireRadarScope(pool, user, { organizationId: input.organizationId, campaignId: input.campaignId, candidateId: input.candidateId }, true);
    const tenantRow = (await pool.query(`SELECT organization.client_id,contract.id AS contract_id FROM public.organizations organization LEFT JOIN LATERAL(SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE WHERE organization.id=$1`, [input.organizationId])).rows[0];
    const tenant = { organizationId: input.organizationId, clientId: tenantRow?.client_id ?? null, contractId: tenantRow?.contract_id ?? null };
    const priorRow = (await pool.query('SELECT calls,campaign_id,configuration_revision,lease_id FROM public.radar_candidate_research_runs WHERE id=$1 AND organization_id=$2 AND candidate_id=$3', [dependencies.runId, input.organizationId, input.candidateId])).rows[0];
    if (!priorRow || priorRow.campaign_id !== input.campaignId || priorRow.configuration_revision !== input.configurationRevision || priorRow.lease_id !== dependencies.leaseId)
        throw failure('radar_decision_scope_changed');
    const prior: Record<string, {source?: string}> = priorRow.calls ?? {};
    // Only this service writes decision_* entries; other call types stay untouched.
    const decisionCalls = Object.entries(prior).filter(([, entry]) => entry.source === 'openrouter_decision') as Array<[
        string,
        DecisionCall
    ]>;
    const contextHash = radarDecisionHash({ ...input, humanReviewed: undefined });
    const pending = decisionCalls.find(([, entry]) => entry.context?.task === input.task && entry.status !== 'completed');
    if (pending && pending[1].contextHash !== contextHash) {
        // New page content must not strand a response already paid for. Recover
        // the old effect using its saved input, but never apply it to new facts.
        const oldCall = pending[1];
        const receipt = (await pool.query('SELECT * FROM public.radar_analysis_receipts WHERE organization_id=$1 AND action=$2 AND request_id=$3', [input.organizationId,input.task,oldCall.requestId])).rows[0];
        try {
            if (!receipt) throw failure('radar_decision_previous_request_uncertain');
            const raw = receipt.status === 'completed' ? receipt.result : await (dependencies.runtime ?? invokeAgentRuntime)<unknown>(dependencies.env,'/radar/revalidate', {organization_id:input.organizationId,client_id:receipt.input_request?.client_id??tenant.clientId,contract_id:receipt.input_request?.contract_id??tenant.contractId,action:input.task,request_id:oldCall.requestId,input_hash:receipt.input_hash});
            const result = decisionResultSchema.parse(raw);
            const updated = await pool.query(`UPDATE public.radar_candidate_research_runs SET calls=jsonb_set(calls,ARRAY[$3],$4::jsonb),updated_at=NOW() WHERE id=$1 AND lease_id=$2 AND lease_until>NOW() AND calls->$3->>'requestId'=$5 RETURNING id`, [dependencies.runId,dependencies.leaseId,pending[0],JSON.stringify({...oldCall,status:'completed',result,costEstimate:estimateRadarCostBrl({amount:radarReportedCostAmount(result.usage.costUsd),currency:'USD',rateSnapshot:oldCall.costPolicy})}),oldCall.requestId]);
            if (!updated.rows[0]) throw failure('radar_research_lease_lost');
            return {action:'continue',effectiveMode:'observe',reasonCode:'decision_evidence_changed',evidenceIds:[]};
        } catch (cause) {
            const config = (await pool.query('SELECT search_configuration FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2',[input.campaignId,input.organizationId])).rows[0]?.search_configuration;
            const retry = await resolveRadarAnalysisRetry(pool,{organizationId:input.organizationId,campaignId:input.campaignId,candidateId:input.candidateId,runId:dependencies.runId,configurationRevision:input.configurationRevision,action:input.task,previousRequestId:oldCall.requestId,searchConfiguration:config});
            if (!retry) throw cause;
            // The normal path below rechecks and atomically consumes this grant.
        }
    }
    const currentRoute = await loadRadarDecisionRoute(pool, input.task, tenant).catch(cause => { if (pending)
        return null; throw cause; });
    const route: RadarDecisionRoute | null = pending?.[1].route ?? currentRoute;
    const policy = await loadRadarOperationalLimits(pool);
    if (!route?.config.enabled)
        return { action: 'continue', effectiveMode: 'observe', reasonCode: 'decision_unconfigured', evidenceIds: [] };
    const price = radarDecisionPrice(route, policy.limits.maxFallbackAttemptsPerEffect, policy.costPolicy);
    const contentHash = radarDecisionHash({ contextHash, route: route.fingerprint });
    const completed = decisionCalls.find(([, entry]) => entry.contextHash === contextHash && entry.status === 'completed' && entry.route?.fingerprint === route.fingerprint);
    const key = pending?.[0] ?? completed?.[0] ?? `decision_${contentHash}`;
    const persist = async (call: DecisionCall) => {
        const updated = await pool.query(`UPDATE public.radar_candidate_research_runs SET calls=jsonb_set(calls,ARRAY[$3],$4::jsonb),updated_at=NOW() WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>NOW() RETURNING id`, [dependencies.runId, dependencies.leaseId, key, JSON.stringify(call)]);
        if (!updated.rows[0])
            throw failure('radar_research_lease_lost');
    };
    const db = await pool.connect();
    let call: DecisionCall, transactionOpen = false;
    try {
        await db.query('BEGIN');
        transactionOpen = true;
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`radar-decisions:${input.organizationId}:${input.candidateId}`]);
        const row = (await db.query(`SELECT calls,campaign_id,configuration_revision,candidate_id,organization_id,lease_id,status,lease_until>NOW() AS lease_active FROM public.radar_candidate_research_runs WHERE id=$1 FOR UPDATE`, [dependencies.runId])).rows[0];
        if (!row || row.campaign_id !== input.campaignId || row.organization_id !== input.organizationId || row.candidate_id !== input.candidateId || row.configuration_revision !== input.configurationRevision || row.lease_id !== dependencies.leaseId)
            throw failure('radar_decision_scope_changed');
        if(row.status!=='running'||row.lease_active!==true)throw failure('radar_research_lease_lost');
        call = row.calls?.[key];
        if (!call) {
            if (price.amountBrl === null)
                return { action: 'continue', effectiveMode: 'observe', reasonCode: 'decision_price_unconfigured', evidenceIds: [] };
            if (Object.values(row.calls ?? {} as Record<string, {
                source?: string;
            }>).filter(entry => (entry as {
                source?: string;
            }).source === 'openrouter_decision').length >= policy.limits.maxDecisionCallsPerCompany)
                return { action: 'continue', effectiveMode: 'observe', reasonCode: 'decision_limit_reached', evidenceIds: [] };
            dependencies.beforeEffect?.();
            call = { status: 'reserved', source: 'openrouter_decision', requestId: `${dependencies.runId}:${input.task}:${contentHash}`, contextHash, route: { ...route, authorizedAttempts: Math.min(route.config.maxAttempts, policy.limits.maxFallbackAttemptsPerEffect + 1) }, context: input, costPolicy: policy.costPolicy, costEstimate: price };
            await db.query(`UPDATE public.radar_candidate_research_runs SET calls=jsonb_set(calls,ARRAY[$2],$3::jsonb) WHERE id=$1`, [dependencies.runId, key, JSON.stringify(call)]);
        }
        await db.query('COMMIT');
        transactionOpen = false;
    }
    finally {
        if (transactionOpen)
            await db.query('ROLLBACK');
        db.release();
    }
    let result: DecisionResultV1 | undefined;
    if (call.status === 'completed')
        result = decisionResultSchema.parse(call.result);
    else {
        const receipt = (await pool.query('SELECT * FROM public.radar_analysis_receipts WHERE organization_id=$1 AND action=$2 AND request_id=$3', [input.organizationId, input.task, call.requestId])).rows[0];
        if (receipt?.status === 'completed')
            result = decisionResultSchema.parse(receipt.result);
        else if (receipt?.status === 'uncertain' || receipt?.status === 'reserved') {
            try {
                result = decisionResultSchema.parse(await (dependencies.runtime ?? invokeAgentRuntime)<unknown>(dependencies.env, '/radar/revalidate', { organization_id: input.organizationId, client_id: receipt.input_request?.client_id ?? tenant.clientId, contract_id: receipt.input_request?.contract_id ?? tenant.contractId, action: input.task, request_id: call.requestId, input_hash: receipt.input_hash }));
            }
            catch (cause) {
                const config = (await pool.query('SELECT search_configuration FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2', [input.campaignId, input.organizationId])).rows[0]?.search_configuration;
                const retry = await resolveRadarAnalysisRetry(pool, { organizationId: input.organizationId, campaignId: input.campaignId, candidateId: input.candidateId, runId: dependencies.runId, configurationRevision: input.configurationRevision, action: input.task, previousRequestId: call.requestId, searchConfiguration: config });
                if (!retry || !currentRoute?.config.enabled)
                    throw cause;
                const retryPrice = radarDecisionPrice(currentRoute, policy.limits.maxFallbackAttemptsPerEffect, policy.costPolicy);
                if (retryPrice.amountBrl === null)
                    throw failure('decision_price_unconfigured');
                call = { ...call, status: 'reserved', context:input, contextHash, route: { ...currentRoute, authorizedAttempts: Math.min(currentRoute.config.maxAttempts, policy.limits.maxFallbackAttemptsPerEffect + 1) }, costPolicy: policy.costPolicy, costEstimate: retryPrice, retryAuthorization: retry, requestId: `${dependencies.runId}:${input.task}:retry:${retry.authorization_id}`, previous: [...(call.previous ?? []), { requestId: call.requestId, status: call.status, route: call.route, costPolicy: call.costPolicy, costEstimate: call.costEstimate }] };
                await persist(call);
            }
        }
        if (!result) {
            if (call.status !== 'reserved' && call.status !== 'rejected_before_provider' && receipt?.status !== 'rejected_before_provider')
                throw failure('radar_decision_previous_request_uncertain');
            dependencies.beforeEffect?.();
            await dependencies.authorize();
            try {
                result = await invokeRadarDecision(dependencies.env, input, call.route, tenant, call.requestId, dependencies.runtime, false, call.retryAuthorization);
            }
            catch (cause) {
                const message = cause instanceof Error ? cause.message : '';
                const rejected = /agent_runtime_402:(radar_ai_wallet_missing|radar_ai_credits_insufficient)/.test(message) || /agent_runtime_422:radar_request_invalid/.test(message);
                await persist({ ...call, status: rejected ? 'rejected_before_provider' : 'uncertain', error: 'radar_decision_pending' });
                throw cause;
            }
        }
        await persist({ ...call, status: 'completed', result, costEstimate: estimateRadarCostBrl({ amount: radarReportedCostAmount(result.usage.costUsd), currency: 'USD', rateSnapshot: call.costPolicy }) });
    }
    const appliedRoute: RadarDecisionRoute = call.route;
    const currentCompany=(await pool.query('SELECT normalized_payload FROM public.radar_candidate_records WHERE id=$1 AND organization_id=$2 AND campaign_id=$3',[input.candidateId,input.organizationId,input.campaignId])).rows[0]?.normalized_payload;
    input.humanReviewed=input.humanReviewed||currentCompany?.manualDecisionOverride===true||currentCompany?.braveMatchStatus==='manual_matched';
    const calibrations = await loadRadarDecisionCalibrations(pool, appliedRoute.id, appliedRoute.fingerprint), decisionPolicy = { enabled: currentRoute?.fingerprint === appliedRoute.fingerprint, requestedMode: appliedRoute.config.mode, routeFingerprint: appliedRoute.fingerprint };
    const calibration = calibrations.find(item => matchingRadarDecisionCalibration(input, result, decisionPolicy, item)) ?? null;
    return { ...evaluateRadarDecision(input, result, decisionPolicy, calibration), result };
}
