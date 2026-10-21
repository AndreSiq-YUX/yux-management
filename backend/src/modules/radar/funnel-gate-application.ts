import type pg from 'pg';
import { evaluateRadarFunnelGate, matchesRadarGateCalibration, type RadarAiGate, type RadarFunnelOverride } from './funnel-gates.js';
import { resolveRadarSearchConfiguration } from './search-configuration.js';
import { radarFunnelTargetsHash, radarGateBindingFromResult, RADAR_FUNNEL_VERSIONS } from './funnel-context.js';
import { loadRadarCampaignGateCalibrations } from './gate-evaluation.js';
import { loadRadarFunnelFloors, assertRadarFunnelFloors } from './funnel-floors.js';
import { loadRadarDecisionRoute, radarDecisionHash, type RadarDecisionRoute } from './decision-service.js';
import type { DecisionContextV1, DecisionResultV1 } from './decision-contracts.js';
import { recordRadarFunnelEvent } from './funnel-events.js';
import { loadRadarOperationalLimits } from './operational-limits.js';
import { estimateRadarCostBrl, radarReportedCostAmount } from './cost-conversion.js';
import { evaluateRadarRegistryRules } from './registry-gate.js';
import { radarCompanyProjectionVersion } from './company-projection.js';

type RunScope = { organizationId: string; campaignId: string; candidateId: string; runId: string; leaseId: string; configurationRevision: number; expectedProjectionVersion?: string };
type Dependencies = { authorize: (db: Pick<pg.Pool, 'query'>) => Promise<void>; currentRoute?: (db: Pick<pg.Pool, 'query'>, task: string) => Promise<Pick<RadarDecisionRoute, 'fingerprint'> & { config: { enabled: boolean } } | null> };
const failure = (code: string) => Object.assign(Error(code), { statusCode: 409 });
export function radarScopedFunnelOverrides(payload: Record<string, unknown>): RadarFunnelOverride[] {
    const values = [...(Array.isArray(payload.funnelOverrides) ? payload.funnelOverrides : []), payload.funnelOverride];
    return values.filter((value): value is RadarFunnelOverride => !!value && typeof value === 'object' && ['g0', 'g1', 'g5'].includes(String((value as RadarFunnelOverride).gate)) && Number.isSafeInteger((value as RadarFunnelOverride).configurationRevision));
}
async function guarded<T>(pool: pg.Pool, scope: RunScope, deps: Dependencies, action: (db: pg.PoolClient, campaign: pg.QueryResultRow, payload: Record<string, unknown>) => Promise<T>) {
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const campaign = (await db.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR SHARE', [scope.campaignId, scope.organizationId])).rows[0];
        if (!campaign || campaign.configuration_revision !== scope.configurationRevision) throw failure('radar_campaign_configuration_changed');
        const run = (await db.query(`SELECT *,lease_until>NOW() AS lease_active FROM public.radar_candidate_research_runs WHERE id=$1 AND organization_id=$2 AND campaign_id=$3 AND candidate_id=$4 FOR UPDATE`, [scope.runId, scope.organizationId, scope.campaignId, scope.candidateId])).rows[0];
        if (!run || run.status !== 'running' || !run.lease_active || run.lease_id !== scope.leaseId || run.configuration_revision !== scope.configurationRevision) throw failure('radar_research_lease_lost');
        const candidate = (await db.query('SELECT normalized_payload FROM public.radar_candidate_records WHERE id=$1 AND organization_id=$2 AND campaign_id=$3 FOR SHARE', [scope.candidateId, scope.organizationId, scope.campaignId])).rows[0];
        if (!candidate) throw failure('radar_candidate_not_found');
        if (scope.expectedProjectionVersion && radarCompanyProjectionVersion(candidate.normalized_payload) !== scope.expectedProjectionVersion) throw failure('radar_research_projection_changed');
        await deps.authorize(db);
        const result = await action(db, campaign, candidate.normalized_payload);
        await db.query('COMMIT'); return result;
    } catch (cause) { await db.query('ROLLBACK'); throw cause; } finally { db.release(); }
}
export async function applyRadarFunnelRegistryGate(pool: pg.Pool, scope: RunScope, deps: Dependencies) {
    return guarded(pool, scope, deps, async (db, campaign, payload) => {
        const config = resolveRadarSearchConfiguration(campaign.search_configuration);
        const result = evaluateRadarRegistryRules({ payload, targetCnaes: campaign.target_cnaes, configuration: config });
        const override = radarScopedFunnelOverrides(payload).some(item => item.gate === 'g0' && item.configurationRevision === scope.configurationRevision);
        const blocked = config.funnel.enabled && config.funnel.g0.mode === 'enforce' && result.outcome === 'block' && !override;
        await recordRadarFunnelEvent(db, { ...scope, gate: 'g0', mode: config.funnel.g0.mode, outcome: blocked ? 'block' : result.outcome === 'doubt' ? 'doubt' : 'pass', reasonCode: result.rule,
            eventKey: `${scope.runId}:${radarDecisionHash({ registry: config.qualification.registry, terms: config.excludedNameTerms, mode: config.funnel.g0.mode, override })}`, costEstimateBrl: 0 });
        return blocked;
    });
}
export async function markRadarFunnelInitialGate(pool: pg.Pool, scope: RunScope, blocked: boolean, deps: Dependencies) {
    await guarded(pool, scope, deps, async db => {
        await db.query(`UPDATE public.radar_capture_items item SET initial_gate_status=$4,initial_gate_reason=CASE WHEN $4='block' THEN 'g1' ELSE NULL END FROM public.radar_capture_operations lot WHERE item.operation_id=lot.id AND item.organization_id=lot.organization_id AND item.run_id=$1 AND item.organization_id=$2 AND lot.configuration_revision=$3`, [scope.runId, scope.organizationId, scope.configurationRevision, blocked ? 'block' : 'pass']);
    });
}
export async function applyRadarFunnelGateDecision(pool: pg.Pool, input: RunScope & {
    gate: RadarAiGate; result?: DecisionResultV1; routeFingerprint?: string; requestId?: string;
    evidence: DecisionContextV1['evidence']; associatedWebsite?: string;failureCode?:string;
}, deps: Dependencies) {
    return guarded(pool, input, deps, async (db, campaign, payload) => {
        const config = resolveRadarSearchConfiguration(campaign.search_configuration), result = input.result;
        let requestedMode = config.funnel.enabled ? config.funnel[input.gate].mode : 'off' as const;
        try { assertRadarFunnelFloors(config.funnel, (await loadRadarFunnelFloors(db)).configuration); } catch { if (requestedMode === 'enforce') requestedMode = 'shadow'; }
        let action = { action: 'continue', effectiveMode: requestedMode === 'off' ? 'off' : 'shadow', reasonCode: input.failureCode??'decision_unavailable', evidenceIds: [] as string[], wouldBlock: false,overridden:false };
        if (result && input.routeFingerprint && result.contextVersion === RADAR_FUNNEL_VERSIONS.contextVersion && result.questionVersion === RADAR_FUNNEL_VERSIONS.questionVersion && result.criteriaRubricVersion === RADAR_FUNNEL_VERSIONS.rubricVersion) {
            const task = input.gate === 'g1' ? 'radar_initial_triage' : 'radar_fit_gate';
            let currentRoute;
            if (deps.currentRoute) currentRoute = await deps.currentRoute(db, task);
            else {
                const tenant = (await db.query(`SELECT organization.client_id,contract.id AS contract_id FROM public.organizations organization LEFT JOIN LATERAL(SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE WHERE organization.id=$1`, [input.organizationId])).rows[0];
                currentRoute = await loadRadarDecisionRoute(db, task, { organizationId: input.organizationId, clientId: tenant?.client_id ?? null, contractId: tenant?.contract_id ?? null }).catch(() => null);
            }
            const binding = radarGateBindingFromResult({ campaignId: input.campaignId, configurationRevision: input.configurationRevision, targetsHash: radarFunnelTargetsHash(config, campaign.target_cnaes),criteriaHash:radarDecisionHash(config.funnel[input.gate].criteria), routeFingerprint: input.routeFingerprint, result });
            const calibrations = await loadRadarCampaignGateCalibrations(db, { ...input, gate: input.gate });
            const calibration = calibrations.find(item => matchesRadarGateCalibration(binding, item, input.gate));
            const routeCurrent = currentRoute?.config.enabled && currentRoute.fingerprint === input.routeFingerprint;
            action = evaluateRadarFunnelGate({ gate: input.gate, requestedMode: routeCurrent ? requestedMode : requestedMode === 'off' ? 'off' : 'shadow', binding, calibration, result, evidence: input.evidence,
                hasConfirmedSite: !!input.associatedWebsite, override: radarScopedFunnelOverrides(payload).find(item => item.gate === input.gate && item.configurationRevision === input.configurationRevision) });
        } else if (result) action.reasonCode = 'decision_version_superseded';
        const policy = await loadRadarOperationalLimits(db);
        const cost = estimateRadarCostBrl({ amount: radarReportedCostAmount(result?.usage.costUsd), currency: 'USD', rateSnapshot: policy.costPolicy });
        await recordRadarFunnelEvent(db, { ...input, gate: input.gate, mode: action.effectiveMode as 'off' | 'shadow' | 'enforce', outcome: action.overridden?'human_override':result?.choice ?? 'unavailable', reasonCode: action.reasonCode, wouldBlock: action.wouldBlock,
            evidenceIds: action.evidenceIds, decisionRequestId: input.requestId, eventKey: `${input.runId}:${input.requestId ?? 'none'}:${radarDecisionHash({ action, policy: config.funnel[input.gate] })}`,
            ...(cost.amountBrl !== null ? { costEstimateBrl: Number(cost.amountBrl) } : {}) });
        return { ...action, choice: result?.choice, requestId: input.requestId };
    });
}
export async function applyRadarFunnelNextAction(pool: pg.Pool, input: RunScope & { result?: DecisionResultV1; requestId?: string; step: number; options: DecisionContextV1['options'] }, deps: Dependencies) {
    return guarded(pool, input, deps, async (db, campaign) => {
        const config = resolveRadarSearchConfiguration(campaign.search_configuration);
        const result = input.result;
        const effective = config.funnel.enabled && config.funnel.g3.mode === 'effective';
        const selected = effective && result?.status === 'decided' && result.contextVersion === RADAR_FUNNEL_VERSIONS.contextVersion && input.options.some(option => option.id === result.choice) ? result.choice! : 'continue';
        await recordRadarFunnelEvent(db, { ...input, gate: 'g3', mode: effective ? 'effective' : 'off', outcome: selected, reasonCode: result?.reasonCode ?? 'decision_unavailable', decisionRequestId: input.requestId,
            eventKey: `${input.runId}:${input.step}:${input.requestId ?? 'none'}:${effective}` });
        return { action: selected, effectiveMode: effective ? 'effective' : 'off', choice: result?.choice };
    });
}
