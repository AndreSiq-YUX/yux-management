import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type pg from 'pg';
import type { AuthUser } from '../../auth/routes.js';
import type { AppEnv } from '../../config/env.js';
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js';
import { decisionContextSchema, decisionResultSchema, type DecisionContextV1, type DecisionResultV1 } from './decision-contracts.js';
import { loadRadarDecisionRoute, invokeRadarDecision, radarDecisionHash, radarDecisionPrice, type RadarDecisionRoute } from './decision-service.js';
import { loadRadarOperationalLimits } from './operational-limits.js';
import { resolveRadarSearchConfiguration } from './search-configuration.js';
import { radarFunnelDecisionCriteria, buildRadarFunnelEvidence, radarFunnelTargetsHash, radarGateBindingFromResult, RADAR_FUNNEL_VERSIONS } from './funnel-context.js';
import { partitionRadarGateDataset, evaluateRadarGateCalibration, type RadarGatePartitionedSample } from './gate-calibration.js';
import { loadRadarFunnelFloors, assertRadarFunnelFloors } from './funnel-floors.js';
import type { RadarAiGate, RadarCampaignGateCalibration } from './funnel-gates.js';
import {radarFunnelOutsideEvidenceSupported} from './funnel-gates.js';
import type { RadarSiteEvidence } from './site-evidence.js';
import {multiplyRadarDecimal,addRadarDecimal,radarReportedCostAmount} from './cost-conversion.js';

const scopeSchema = z.object({ organizationId: z.uuid(), campaignId: z.uuid() });
export const radarGateCalibrationCreateSchema = scopeSchema.extend({
    gate: z.enum(['g1', 'g5']), configurationRevision: z.number().int().positive(), expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    labels: z.array(z.object({ candidateId: z.uuid(), label: z.enum(['primary', 'secondary', 'outside', 'doubt']) }).strict()).min(1).max(500),
}).strict();
export const radarGateEvaluationRunSchema = scopeSchema.extend({ calibrationId: z.uuid(), confirmPaid: z.literal(true),
    expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/), expectedPolicyVersion: z.number().int().positive(), approvedUnitPriceBrl: z.string().regex(/^\d+(?:\.\d+)?$/),
}).strict();
type Tenant = { organizationId: string; clientId: string | null; contractId: string | null };
type Dependencies = { loadRoute?: (db: Pick<pg.Pool, 'query'>, task: string, tenant: Tenant) => Promise<RadarDecisionRoute | null> };
const fail = (code: string, statusCode = 409) => Object.assign(Error(code), { statusCode });
function requireAdmin(user: AuthUser) { if (user.role !== 'yux_admin') throw fail('radar_decision_admin_required', 403); }
const taskFor = (gate: RadarAiGate) => gate === 'g1' ? 'radar_initial_triage' as const : 'radar_fit_gate' as const;
async function tenantFor(db: Pick<pg.Pool, 'query'>, organizationId: string): Promise<Tenant> {
    const row = (await db.query(`SELECT organization.client_id,contract.id AS contract_id FROM public.organizations organization LEFT JOIN LATERAL(SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE WHERE organization.id=$1`, [organizationId])).rows[0];
    if (!row) throw fail('radar_organization_not_found', 404);
    return { organizationId, clientId: row.client_id ?? null, contractId: row.contract_id ?? null };
}
async function calibrationFor(db: Pick<pg.Pool, 'query'>, scope: { organizationId: string; campaignId: string; calibrationId: string }, lock = false) {
    const row = (await db.query(`SELECT calibration.*,campaign.search_configuration,campaign.configuration_revision AS current_revision,campaign.target_cnaes FROM public.radar_campaign_gate_calibrations calibration JOIN public.radar_campaigns campaign ON campaign.id=calibration.campaign_id AND campaign.organization_id=calibration.organization_id WHERE calibration.id=$1 AND calibration.organization_id=$2 AND calibration.campaign_id=$3 ${lock ? 'FOR UPDATE OF calibration' : ''}`, [scope.calibrationId, scope.organizationId, scope.campaignId])).rows[0];
    if (!row) throw fail('radar_calibration_not_found', 404);
    return row;
}
function assertCurrent(row: pg.QueryResultRow) {
    const config = resolveRadarSearchConfiguration(row.search_configuration);
    if (row.configuration_revision !== row.current_revision || row.binding.targetsHash !== radarFunnelTargetsHash(config, row.target_cnaes)||radarDecisionHash(config.funnel[row.gate as RadarAiGate].criteria)!==radarDecisionHash(row.criteria)) throw fail('radar_calibration_criteria_changed');
    if (row.status !== 'draft') throw fail('radar_calibration_not_draft');
    return config;
}
export async function createRadarGateCalibration(pool: pg.Pool, user: AuthUser, value: unknown, deps: Dependencies = {}) {
    requireAdmin(user);
    const input = radarGateCalibrationCreateSchema.parse(value);
    if (new Set(input.labels.map(item => item.candidateId)).size !== input.labels.length) throw fail('radar_calibration_duplicate_company', 400);
    const tenant = await tenantFor(pool, input.organizationId);
    const route = await (deps.loadRoute ?? loadRadarDecisionRoute)(pool, taskFor(input.gate), tenant);
    if (!route?.config.enabled || route.fingerprint !== input.expectedFingerprint) throw fail('decision_route_changed');
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const campaign = (await db.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE', [input.campaignId, input.organizationId])).rows[0];
        if (!campaign || campaign.configuration_revision !== input.configurationRevision) throw fail('radar_campaign_configuration_changed');
        const config = resolveRadarSearchConfiguration(campaign.search_configuration);
        assertRadarFunnelFloors(config.funnel, (await loadRadarFunnelFloors(db)).configuration);
        const rows = (await db.query(`SELECT candidate.*,saved.output FROM public.radar_candidate_records candidate LEFT JOIN LATERAL(SELECT output FROM public.radar_candidate_research_runs WHERE candidate_id=candidate.id AND organization_id=candidate.organization_id ORDER BY created_at DESC,id DESC LIMIT 1) saved ON TRUE WHERE candidate.campaign_id=$1 AND candidate.organization_id=$2 AND candidate.id=ANY($3::uuid[]) ORDER BY candidate.id`, [input.campaignId, input.organizationId, input.labels.map(item => item.candidateId)])).rows;
        if (rows.length !== input.labels.length) throw fail('radar_calibration_company_scope_mismatch', 403);
        const previous=(await db.query(`SELECT seed,dataset FROM public.radar_campaign_gate_calibrations WHERE organization_id=$1 AND campaign_id=$2 AND configuration_revision=$3 AND gate=$4 ORDER BY created_at,id`,[input.organizationId,input.campaignId,input.configurationRevision,input.gate])).rows;
        const seed = previous[0]?.seed??randomUUID(), id = randomUUID(),fixed=new Map<string,'tune'|'holdout'>();
        for(const prior of previous)for(const sample of prior.dataset)if(!fixed.has(sample.groupKey))fixed.set(sample.groupKey,sample.partition);
        const samples = rows.map(row => {
            const cnpj = String(row.normalized_payload.cnpj ?? '').replace(/\D/g, '');
            let domain: string | undefined;
            try { if (row.output?.siteAssociation === 'confirmed') domain = new URL(row.output.discovery.websiteUrl).hostname; } catch { /* No confirmed group key. */ }
            return { candidateId: row.id, groupKey: cnpj.length === 14 ? `cnpj:${cnpj.slice(0, 8)}` : domain ? `domain:${domain}` : `company:${row.id}`,
                label: input.labels.find(item => item.candidateId === row.id)!.label, reviewedBy: user.id };
        });
        const dataset = partitionRadarGateDataset(samples, seed, config.funnel[input.gate].criteria.holdoutShare,fixed);
        const binding = { campaignId: input.campaignId, configurationRevision: input.configurationRevision, targetsHash: radarFunnelTargetsHash(config, campaign.target_cnaes),criteriaHash:radarDecisionHash(config.funnel[input.gate].criteria), routeFingerprint: route.fingerprint, ...RADAR_FUNNEL_VERSIONS };
        await db.query(`INSERT INTO public.radar_campaign_gate_calibrations(id,organization_id,campaign_id,configuration_revision,gate,binding,dataset,criteria,seed,dataset_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, input.organizationId, input.campaignId, input.configurationRevision, input.gate, JSON.stringify(binding), JSON.stringify(dataset), JSON.stringify(config.funnel[input.gate].criteria), seed, radarDecisionHash(dataset), user.id]);
        for (const row of rows) {
            const payload = row.normalized_payload, saved = row.output ?? {};
            const identity = { name: String(payload.tradeName ?? row.title), legalName: typeof payload.legalName === 'string' ? payload.legalName : undefined,
                cnpj: typeof payload.cnpj === 'string' ? payload.cnpj : undefined, city: typeof payload.city === 'string' ? payload.city : undefined, state: typeof payload.state === 'string' ? payload.state : undefined, address: typeof payload.address === 'string' ? payload.address : undefined };
            const pages: RadarSiteEvidence[] = input.gate === 'g5' && Array.isArray(saved.pages) ? saved.pages : [];
            const context = decisionContextSchema.parse({ schemaVersion: 1, organizationId: input.organizationId, campaignId: input.campaignId, candidateId: row.id, configurationRevision: input.configurationRevision, task: taskFor(input.gate), contextVersion: RADAR_FUNNEL_VERSIONS.contextVersion,
                identity, criteria: radarFunnelDecisionCriteria(config, campaign), evidence: buildRadarFunnelEvidence({ identity, registryPayload: payload, targetCnaes: campaign.target_cnaes ?? [], pages,
                    associatedWebsite: saved.siteAssociation === 'confirmed' ? saved.discovery?.websiteUrl : undefined }), options: [], humanReviewed: false });
            await db.query(`INSERT INTO public.radar_gate_evaluation_cases(calibration_id,organization_id,campaign_id,candidate_id,request_id,context,route) VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, input.organizationId, input.campaignId, row.id, `eval:${id}:${row.id}:${input.gate}`, JSON.stringify(context), JSON.stringify(route)]);
        }
        const policy = await loadRadarOperationalLimits(db);
        const price = radarDecisionPrice(route, policy.limits.maxFallbackAttemptsPerEffect, policy.costPolicy);
        await db.query('COMMIT');
        return { id, gate: input.gate, dataset, price, policyVersion: policy.version, binding, status: 'draft' };
    } catch (cause) { await db.query('ROLLBACK'); throw cause; } finally { db.release(); }
}

async function evaluationSummary(db: Pick<pg.Pool, 'query'>, calibrationId: string,includeMaterial=false) {
    const rows = (await db.query('SELECT candidate_id AS "candidateId",status,error_code AS "errorCode",result,context FROM public.radar_gate_evaluation_cases WHERE calibration_id=$1 ORDER BY candidate_id', [calibrationId])).rows;
    const completed = rows.filter(row => row.status === 'completed').length;
    return { completed, total: rows.length, done: completed === rows.length, cases: includeMaterial?rows:rows.map(({result:_result,context:_context,...row})=>row) };
}
function evaluatedDataset(dataset:RadarGatePartitionedSample[],cases:pg.QueryResultRow[],gate:RadarAiGate){
    return dataset.map(sample=>{
        const row=cases.find(item=>(item.candidateId??item.candidate_id)===sample.candidateId),parsed=decisionResultSchema.safeParse(row?.result),context=decisionContextSchema.safeParse(row?.context);
        return{...sample,probabilityOutside:row?.status==='completed'&&parsed.success&&parsed.data.status==='decided'?parsed.data.probabilities?.outside_profile??null:null,
            eligibleOutside:parsed.success&&context.success&&radarFunnelOutsideEvidenceSupported({gate,result:parsed.data,evidence:context.data.evidence,hasConfirmedSite:context.data.evidence.some(item=>item.role==='activity'&&item.primary&&item.scope==='establishment')})};
    });
}

/** One explicit authorization advances one case. Durable namespace and leases
 * recover saved replies before a new effect; uncertain calls are never retried. */
export async function runRadarGateEvaluationCase(pool: pg.Pool, user: AuthUser, value: unknown, deps: Dependencies & { env: AppEnv; runtime?: typeof invokeAgentRuntime }) {
    requireAdmin(user);
    const input = radarGateEvaluationRunSchema.parse(value);
    const tenant = await tenantFor(pool, input.organizationId);
    const db = await pool.connect(), lease = randomUUID();
    let selected!: pg.QueryResultRow;
    try {
        await db.query('BEGIN');
        const calibration = await calibrationFor(db, input, true);
        const cases = (await db.query('SELECT *,lease_until>NOW() AS lease_active FROM public.radar_gate_evaluation_cases WHERE calibration_id=$1 AND status<>\'completed\' ORDER BY (status=\'pending\'),candidate_id', [input.calibrationId])).rows;
        if (!cases.length || cases.some(row => row.lease_active)) { await db.query('COMMIT'); return { ...await evaluationSummary(pool, input.calibrationId), running: cases.some(row => row.lease_active) }; }
        selected = cases[0];
        if (selected.status === 'pending' || selected.status === 'rejected_before_provider') {
            const config = assertCurrent(calibration);
            assertRadarFunnelFloors(config.funnel, (await loadRadarFunnelFloors(db)).configuration);
            const route = await (deps.loadRoute ?? loadRadarDecisionRoute)(db, taskFor(calibration.gate), tenant);
            if (!route?.config.enabled || route.fingerprint !== input.expectedFingerprint || route.fingerprint !== selected.route.fingerprint) throw fail('decision_route_changed');
            const policy = await loadRadarOperationalLimits(db), price = radarDecisionPrice(route, policy.limits.maxFallbackAttemptsPerEffect, policy.costPolicy);
            if (policy.version !== input.expectedPolicyVersion || price.amountBrl === null || price.amountBrl !== input.approvedUnitPriceBrl) throw fail('radar_decision_test_price_changed');
            selected.route = { ...route, authorizedAttempts: Math.min(route.config.maxAttempts, policy.limits.maxFallbackAttemptsPerEffect + 1) };
        }
        await db.query(`UPDATE public.radar_gate_evaluation_cases SET lease_id=$3,lease_until=NOW()+INTERVAL '180 seconds',updated_at=NOW() WHERE calibration_id=$1 AND candidate_id=$2`, [input.calibrationId, selected.candidate_id, lease]);
        await db.query('COMMIT');
    } catch (cause) { await db.query('ROLLBACK'); throw cause; } finally { db.release(); }
    const context: DecisionContextV1 = decisionContextSchema.parse(selected.context);
    const runtime = deps.runtime ?? invokeAgentRuntime;
    try {
        const receipt = (await pool.query('SELECT * FROM public.radar_analysis_receipts WHERE organization_id=$1 AND action=$2 AND request_id=$3', [input.organizationId, context.task, selected.request_id])).rows[0];
        let result: DecisionResultV1;
        if (receipt?.status === 'completed') result = decisionResultSchema.parse(receipt.result);
        else if (receipt && receipt.status !== 'rejected_before_provider' || !['pending', 'rejected_before_provider'].includes(selected.status)) {
            if (!receipt?.input_hash) throw fail('radar_evaluation_response_uncertain');
            result = decisionResultSchema.parse(await runtime(deps.env, '/radar/revalidate', { organization_id: input.organizationId, client_id: receipt.input_request?.client_id ?? tenant.clientId, contract_id: receipt.input_request?.contract_id ?? tenant.contractId, action: context.task, request_id: selected.request_id, input_hash: receipt.input_hash }));
        } else {
            const marked = await pool.query(`UPDATE public.radar_gate_evaluation_cases SET status='submitting',route=$4,updated_at=NOW() WHERE calibration_id=$1 AND candidate_id=$2 AND lease_id=$3 AND lease_until>NOW() RETURNING candidate_id`, [input.calibrationId, selected.candidate_id, lease, JSON.stringify(selected.route)]);
            if (!marked.rows.length) throw fail('radar_evaluation_lease_lost');
            result = await invokeRadarDecision(deps.env, context, selected.route, tenant, selected.request_id, runtime);
        }
        const updated = await pool.query(`UPDATE public.radar_gate_evaluation_cases SET status='completed',result=$4,error_code=NULL,lease_id=NULL,lease_until=NULL,updated_at=NOW() WHERE calibration_id=$1 AND candidate_id=$2 AND lease_id=$3 AND lease_until>NOW() RETURNING candidate_id`, [input.calibrationId, selected.candidate_id, lease, JSON.stringify(result)]);
        if (!updated.rows.length) throw fail('radar_evaluation_lease_lost');
    } catch (cause) {
        const rejected = cause instanceof Error && /agent_runtime_(?:402:(?:radar_ai_wallet_missing|radar_ai_credits_insufficient)|422:radar_request_invalid)/.test(cause.message);
        await pool.query(`UPDATE public.radar_gate_evaluation_cases SET status=$4,error_code=$5,lease_id=NULL,lease_until=NULL,updated_at=NOW() WHERE calibration_id=$1 AND candidate_id=$2 AND lease_id=$3`, [input.calibrationId, selected.candidate_id, lease, rejected ? 'rejected_before_provider' : 'uncertain', rejected ? 'radar_evaluation_rejected_before_provider' : 'radar_evaluation_response_uncertain']);
        throw cause;
    }
    return evaluationSummary(pool, input.calibrationId);
}

export async function approveRadarGateCalibration(pool: pg.Pool, user: AuthUser, value: unknown, deps: Dependencies = {}) {
    requireAdmin(user);
    const input = scopeSchema.extend({ calibrationId: z.uuid(), confirmApproval: z.literal(true) }).strict().parse(value);
    const tenant = await tenantFor(pool, input.organizationId), db = await pool.connect();
    try {
        await db.query('BEGIN');
        const row = await calibrationFor(db, input, true), config = assertCurrent(row);
        assertRadarFunnelFloors(config.funnel, (await loadRadarFunnelFloors(db)).configuration);
        const route = await (deps.loadRoute ?? loadRadarDecisionRoute)(db, taskFor(row.gate), tenant);
        if (!route?.config.enabled || route.fingerprint !== row.binding.routeFingerprint) throw fail('decision_route_changed');
        const cases = (await db.query('SELECT * FROM public.radar_gate_evaluation_cases WHERE calibration_id=$1', [row.id])).rows;
        const results = cases.map(item => item.status === 'completed' ? decisionResultSchema.safeParse(item.result) : null);
        const snapshots = results.map(item => item?.success && item.data.status === 'decided' ? radarGateBindingFromResult({ campaignId: input.campaignId, configurationRevision: row.configuration_revision, targetsHash: row.binding.targetsHash,criteriaHash:radarDecisionHash(row.criteria), routeFingerprint: route.fingerprint, result: item.data }) : null);
        const validSnapshots = snapshots.filter(item => item !== null);
        const homogeneous = validSnapshots.length === cases.length && new Set(validSnapshots.map(radarDecisionHash)).size === 1 && validSnapshots.every(item => item.upstreamProvider && item.resolvedModelSnapshot && item.contextVersion === RADAR_FUNNEL_VERSIONS.contextVersion);
        const dataset=evaluatedDataset(row.dataset,cases,row.gate);
        const metrics = evaluateRadarGateCalibration(dataset, row.criteria);
        if (!homogeneous || !metrics.approvable) throw Object.assign(fail('radar_calibration_not_approvable'), { details: { ...metrics, homogeneous } });
        await db.query(`UPDATE public.radar_campaign_gate_calibrations SET status='superseded',updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND gate=$3 AND status='approved'`, [input.organizationId, input.campaignId, row.gate]);
        await db.query(`UPDATE public.radar_campaign_gate_calibrations SET binding=$2,metrics=$3,threshold=$4,status='approved',approved_by=$5,approved_at=NOW(),updated_at=NOW() WHERE id=$1`, [row.id, JSON.stringify(validSnapshots[0]), JSON.stringify(metrics), metrics.threshold, user.id]);
        await db.query('COMMIT');
        return { id: row.id, status: 'approved', metrics, binding: validSnapshots[0] };
    } catch (cause) { await db.query('ROLLBACK'); throw cause; } finally { db.release(); }
}

export async function loadRadarCampaignGateCalibrations(db: Pick<pg.Pool, 'query'>, scope: { organizationId: string; campaignId: string; gate: RadarAiGate }): Promise<RadarCampaignGateCalibration[]> {
    return (await db.query(`SELECT binding,gate,status,threshold FROM public.radar_campaign_gate_calibrations WHERE organization_id=$1 AND campaign_id=$2 AND gate=$3 AND status='approved' ORDER BY approved_at DESC,id DESC`, [scope.organizationId, scope.campaignId, scope.gate])).rows.map(row => ({ ...row.binding, gate: row.gate, status: row.status, threshold: row.threshold === null ? null : Number(row.threshold) }));
}
export async function listRadarGateCalibrations(pool: pg.Pool, user: AuthUser, value: unknown) {
    requireAdmin(user);
    const input = scopeSchema.strict().parse(value);
    return (await pool.query(`SELECT id,gate,status,binding,dataset,criteria,metrics,threshold,created_at AS "createdAt",approved_at AS "approvedAt" FROM public.radar_campaign_gate_calibrations WHERE organization_id=$1 AND campaign_id=$2 ORDER BY created_at DESC LIMIT 100`, [input.organizationId, input.campaignId])).rows;
}
export async function getRadarGateCalibrationReport(pool:pg.Pool,user:AuthUser,value:unknown){
    requireAdmin(user);
    const input=scopeSchema.extend({calibrationId:z.uuid()}).strict().parse(value);
    const calibration=await calibrationFor(pool,input),summary=await evaluationSummary(pool,input.calibrationId,true);
    const first=(await pool.query('SELECT route FROM public.radar_gate_evaluation_cases WHERE calibration_id=$1 ORDER BY candidate_id LIMIT 1',[input.calibrationId])).rows[0];
    const policy=await loadRadarOperationalLimits(pool),price=first?radarDecisionPrice(first.route,policy.limits.maxFallbackAttemptsPerEffect,policy.costPolicy):null;
    const dataset=evaluatedDataset(calibration.dataset,summary.cases,calibration.gate);
    let actualUsdKnownSubtotal='0',unknownCosts=0;
    for(const row of summary.cases){const amount=radarReportedCostAmount(row.result?.usage?.costUsd);if(amount===null){if(row.status!=='pending')unknownCosts++;}else actualUsdKnownSubtotal=addRadarDecimal(actualUsdKnownSubtotal,amount);}
    return{...summary,cases:summary.cases.map(({context:_context,result:_result,...row})=>row),calibration,metrics:evaluateRadarGateCalibration(dataset,calibration.criteria),price,policyVersion:policy.version,
        totalEstimatedBrl:price?.amountBrl?multiplyRadarDecimal(price.amountBrl,String(summary.total-summary.completed)):null,actualUsdKnownSubtotal,unknownCosts};
}
export async function revokeRadarGateCalibration(pool: pg.Pool, user: AuthUser, value: unknown) {
    requireAdmin(user);
    const input = scopeSchema.extend({ calibrationId: z.uuid(), reason: z.string().trim().min(3).max(500) }).strict().parse(value);
    const row = (await pool.query(`UPDATE public.radar_campaign_gate_calibrations SET status='superseded',metrics=metrics||jsonb_build_object('revokedReason',$4::text,'revokedBy',$5::text),updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND campaign_id=$3 RETURNING id,status`, [input.calibrationId, input.organizationId, input.campaignId, input.reason, user.id])).rows[0];
    if (!row) throw fail('radar_calibration_not_found', 404);
    return row;
}
