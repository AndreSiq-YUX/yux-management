import { z } from 'zod';
import type pg from 'pg';
import type { AuthUser } from '../../auth/routes.js';
import type { AppEnv } from '../../config/env.js';
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js';
import { loadRadarDecisionRoute, radarDecisionPrice, invokeRadarDecision } from './decision-service.js';
import { loadRadarOperationalLimits } from './operational-limits.js';
import { loadRadarDecisionCalibrations } from './decision-calibration.js';
import type { DecisionContextV1 } from './decision-contracts.js';
type Route = {
    id?: string;
    kind?: string | null;
    agentType: string | null;
    organizationId?: string | null;
    clientId?: string | null;
    contractId?: string | null;
    status: string;
    modelName: string;
};
const fail = (code: string, statusCode = 409) => Object.assign(Error(code), { statusCode });
const requireAdmin = (user: AuthUser) => { if (user.role !== 'yux_admin')
    throw fail('radar_decision_admin_required', 403); };
export async function getRadarDecisionRouteStatus(pool: pg.Pool, user: AuthUser, route: Route, taskOverride?: DecisionContextV1['task']) {
    requireAdmin(user);
    if (route.kind !== 'decision' || !route.id)
        throw fail('llm_route_capability_incompatible');
    const row = (await pool.query(`SELECT organization.id AS organization_id,organization.client_id,contract.id AS contract_id FROM public.organizations organization
 LEFT JOIN LATERAL(SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE
 WHERE ($1::uuid IS NULL OR organization.id=$1) AND ($2::uuid IS NULL OR organization.client_id=$2) AND ($3::uuid IS NULL OR contract.id=$3)
 ORDER BY organization.is_internal_growth_workspace DESC,organization.id LIMIT 1`, [route.organizationId ?? null, route.clientId ?? null, route.contractId ?? null])).rows[0];
    if (!row)
        throw fail('radar_decision_test_tenant_missing');
    const tenant = { organizationId: row.organization_id, clientId: row.client_id ?? null, contractId: row.contract_id ?? null }, task = (['radar_initial_triage', 'radar_next_action', 'radar_quality_gate'].includes(route.agentType ?? '') ? route.agentType : taskOverride ?? 'radar_initial_triage') as DecisionContextV1['task'];
    const selected = await loadRadarDecisionRoute(pool, task, tenant);
    if (!selected)
        throw fail('radar_decision_route_unavailable');
    if (selected.id !== route.id)
        throw fail('radar_decision_route_shadowed');
    const policy = await loadRadarOperationalLimits(pool), calibrations = await loadRadarDecisionCalibrations(pool, selected.id, selected.fingerprint);
    return { kind: 'decision' as const, task, tenant, route: selected, price: radarDecisionPrice(selected, policy.limits.maxFallbackAttemptsPerEffect, policy.costPolicy), maxAttempts: Math.min(selected.config.maxAttempts, policy.limits.maxFallbackAttemptsPerEffect + 1), calibrations,
        policyVersion: policy.version, effectiveMode: 'observe', calibrationState: calibrations.length ? 'snapshot_requires_matching' : 'uncalibrated', protocol: 'openrouter-decisions-alpha-v1' };
}
export async function testRadarDecisionRoute(pool: pg.Pool, env: AppEnv, user: AuthUser, route: Route, value: unknown, runtime = invokeAgentRuntime) {
    requireAdmin(user);
    const parsed = z.object({ task: z.enum(['radar_initial_triage', 'radar_next_action', 'radar_quality_gate']).optional(), confirmPaid: z.literal(true), requestId: z.uuid(), expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/), expectedPolicyVersion: z.number().int().positive(), approvedPriceBrl: z.string().regex(/^\d+(?:\.\d+)?$/) }).strict().safeParse(value);
    if (!parsed.success)
        throw fail('radar_decision_test_confirmation_required', 400);
    const input = parsed.data;
    const status = await getRadarDecisionRouteStatus(pool, user, route, input.task);
    if (input.expectedFingerprint !== status.route.fingerprint)
        throw fail('decision_route_changed');
    if (status.price.amountBrl === null)
        throw fail(status.price.reason ?? 'radar_cost_unknown');
    if (input.expectedPolicyVersion !== status.policyVersion || input.approvedPriceBrl !== status.price.amountBrl)
        throw fail('radar_decision_test_price_changed');
    const context: DecisionContextV1 = { schemaVersion: 1, organizationId: status.tenant.organizationId, campaignId: '10000000-0000-4000-8000-000000000001', candidateId: '10000000-0000-4000-8000-000000000002', configurationRevision: 1, task: status.task,
        identity: { name: 'Empresa sintética de teste' }, criteria: { segment: 'Fornecedora de equipamentos industriais' }, evidence: [{ id: 'test_source', sourceUrl: 'https://empresa.example/', text: 'Empresa sintética de teste fornece equipamentos industriais. Dado sintético para validar o contrato, não pesquisa real.', role: 'identity', primary: true, contradictory: false, scope: 'establishment' }], options: status.task === 'radar_next_action' ? [{ id: 'read_site', description: 'Ler a página pública elegível.' }] : [], humanReviewed: false };
    const started = Date.now(), result = await invokeRadarDecision(env, context, { ...status.route, authorizedAttempts: status.maxAttempts }, status.tenant, `admin-decision:${input.requestId}`, runtime, true);
    return { ok: result.status === 'decided', kind: 'decision', selectedOption: result.choice, contractValid: result.status === 'decided', requestedModel: result.requestedModel, resolvedModel: result.resolvedModel, adapterVersion: result.adapterVersion, calibrationState: 'synthetic_test_not_calibration', latencyMs: Date.now() - started, usage: result.usage, attempts: result.attempts,
        model: route.modelName, provider: 'openrouter', checkedAt: new Date().toISOString(), message: result.status === 'decided' ? 'Contrato de decisão validado. Este teste sintético não comprova qualidade nem aprova calibração.' : 'O modelo não concluiu uma decisão válida. Nenhuma empresa foi alterada.' };
}
