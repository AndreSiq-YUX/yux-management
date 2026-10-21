import { z } from 'zod';
import type pg from 'pg';
import type { AuthUser } from '../../auth/routes.js';
import { radarFunnelPolicySchema } from './funnel-policy.js';
import { resolveRadarSearchConfiguration, type RadarSearchConfiguration } from './search-configuration.js';
import { assertRadarFunnelFloors, loadRadarFunnelFloors } from './funnel-floors.js';
import { loadRadarCampaignGateCalibrations } from './gate-evaluation.js';
import { radarFunnelTargetsHash, RADAR_FUNNEL_VERSIONS } from './funnel-context.js';
import { loadRadarDecisionRoute,radarDecisionHash } from './decision-service.js';
import { radarScopedFunnelOverrides } from './funnel-gate-application.js';
import { radarGateCriteriaSchema } from './funnel-policy.js';
import {backfillRadarCampaignRegistryActivities} from './registry-backfill.js';

export const radarFunnelScopeSchema = z.object({ organizationId: z.uuid(), campaignId: z.uuid() }).strict();
export const radarCampaignFunnelSaveSchema = radarFunnelScopeSchema.extend({ configurationRevision: z.number().int().positive(), expectedPolicyVersion: z.number().int().positive(), policy: radarFunnelPolicySchema,
    batch:z.object({maxReplenishmentPages:z.number().int().nonnegative().safe(),replenishmentBasis:z.enum(['initial_triage','final_fit'])}).strict().optional(),
    evidence:z.object({maxPages:z.number().int().min(1).max(10),maxChars:z.number().int().min(500).max(12000)}).strict().optional(),
}).strict();
const fail = (code: string, statusCode = 409) => Object.assign(Error(code), { statusCode });
function admin(user: AuthUser) { if (user.role !== 'yux_admin') throw fail('radar_source_admin_required', 403); }
export async function validateRadarFunnelActivation(db: Pick<pg.Pool, 'query'>, campaign: pg.QueryResultRow, config: RadarSearchConfiguration) {
    if (!config.funnel.enabled) return;
    assertRadarFunnelFloors(config.funnel, (await loadRadarFunnelFloors(db)).configuration);
    const prior = resolveRadarSearchConfiguration(campaign.search_configuration);
    if (!prior.funnel.enabled) {
        const old = (await db.query(`SELECT EXISTS(SELECT 1 FROM public.radar_capture_operations WHERE organization_id=$1 AND campaign_id=$2 AND historical_closed_at IS NULL AND NOT funnel_enabled UNION ALL SELECT 1 FROM public.radar_candidate_research_runs WHERE organization_id=$1 AND campaign_id=$2 AND historical_closed_at IS NULL AND NOT(output?'funnel')) AS pending`, [campaign.organization_id, campaign.id])).rows[0];
        if (old?.pending) throw fail('radar_close_legacy_lots_before_activation');
    }
    for (const gate of ['g1', 'g5'] as const) {
        if (config.funnel[gate].mode !== 'enforce') continue;
        const tenant = (await db.query(`SELECT organization.client_id,contract.id AS contract_id FROM public.organizations organization LEFT JOIN LATERAL(SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE WHERE organization.id=$1`, [campaign.organization_id])).rows[0];
        const route = await loadRadarDecisionRoute(db, gate === 'g1' ? 'radar_initial_triage' : 'radar_fit_gate', { organizationId: campaign.organization_id, clientId: tenant?.client_id ?? null, contractId: tenant?.contract_id ?? null }).catch(() => null);
        const calibrations = await loadRadarCampaignGateCalibrations(db, { organizationId: campaign.organization_id, campaignId: campaign.id, gate });
        if (!route?.config.enabled || !calibrations.some(item => item.configurationRevision === campaign.configuration_revision && item.targetsHash === radarFunnelTargetsHash(config, campaign.target_cnaes)&&item.criteriaHash===radarDecisionHash(config.funnel[gate].criteria) && item.routeFingerprint === route.fingerprint && item.contextVersion === RADAR_FUNNEL_VERSIONS.contextVersion)) throw fail('radar_campaign_calibration_required');
    }
}
export async function getRadarCampaignFunnelPolicy(pool: pg.Pool, user: AuthUser, value: unknown) {
    admin(user); const input = radarFunnelScopeSchema.parse(value);
    const row = (await pool.query('SELECT id,organization_id,search_configuration,configuration_revision,operational_policy_version,target_cnaes FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2', [input.campaignId, input.organizationId])).rows[0];
    if (!row) throw fail('radar_campaign_not_found', 404);
    const config = resolveRadarSearchConfiguration(row.search_configuration);
    const routeScopes = (await pool.query(`SELECT organization.client_id,contract.id AS contract_id FROM public.organizations organization LEFT JOIN LATERAL(SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE WHERE organization.id=$1`, [input.organizationId])).rows[0];
    const routes: Record<string, unknown> = {};
    for (const [gate, task] of [['g1', 'radar_initial_triage'], ['g3', 'radar_next_action'], ['g5', 'radar_fit_gate']] as const) {
        const route = await loadRadarDecisionRoute(pool, task, { organizationId: input.organizationId, clientId: routeScopes?.client_id ?? null, contractId: routeScopes?.contract_id ?? null }).catch(() => null);
        routes[gate] = route ? { fingerprint: route.fingerprint, enabled: route.config.enabled, models: route.attempts } : null;
    }
    return { configurationRevision: row.configuration_revision, policyVersion: Number(row.operational_policy_version), policy: config.funnel, routes,
        batch: { maxReplenishmentPages: config.batch.maxReplenishmentPages, replenishmentBasis: config.batch.replenishmentBasis },
        evidence: { maxPages: config.research.qualificationEvidenceMaxPages, maxChars: config.research.qualificationEvidenceMaxChars }, floors: await loadRadarFunnelFloors(pool) };
}
export async function saveRadarCampaignFunnelPolicy(pool: pg.Pool, user: AuthUser, value: unknown) {
    admin(user); const input = radarCampaignFunnelSaveSchema.parse(value), db = await pool.connect();
    try {
        await db.query('BEGIN');
        const row = (await db.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE', [input.campaignId, input.organizationId])).rows[0];
        if (!row || row.configuration_revision !== input.configurationRevision || Number(row.operational_policy_version) !== input.expectedPolicyVersion) throw fail('radar_funnel_policy_changed');
        const config = resolveRadarSearchConfiguration(row.search_configuration); config.funnel = input.policy;
        if(input.batch)Object.assign(config.batch,input.batch);
        if(input.evidence)Object.assign(config.research,{qualificationEvidenceMaxPages:input.evidence.maxPages,qualificationEvidenceMaxChars:input.evidence.maxChars});
        await validateRadarFunnelActivation(db, row, config);
        await db.query('UPDATE public.radar_campaigns SET search_configuration=$3,operational_policy_version=operational_policy_version+1,updated_at=NOW() WHERE id=$1 AND organization_id=$2', [input.campaignId, input.organizationId, JSON.stringify(config)]);
        await db.query('COMMIT');
    } catch (cause) { await db.query('ROLLBACK'); throw cause; } finally { db.release(); }
    return getRadarCampaignFunnelPolicy(pool, user, { organizationId: input.organizationId, campaignId: input.campaignId });
}
export async function closeRadarLegacyLots(pool: pg.Pool, user: AuthUser, value: unknown) {
    admin(user);
    const input = radarFunnelScopeSchema.extend({ configurationRevision: z.number().int().positive(), confirmClose: z.literal(true) }).strict().parse(value), db = await pool.connect();
    try {
        await db.query('BEGIN');
        const row = (await db.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE', [input.campaignId, input.organizationId])).rows[0];
        if (!row || row.configuration_revision !== input.configurationRevision) throw fail('radar_campaign_configuration_changed');
        if (resolveRadarSearchConfiguration(row.search_configuration).funnel.enabled) throw fail('radar_legacy_close_before_activation');
        const busy = (await db.query(`SELECT EXISTS(SELECT 1 FROM public.radar_candidate_research_runs WHERE organization_id=$1 AND campaign_id=$2 AND historical_closed_at IS NULL AND status='running' AND lease_until>NOW() UNION ALL SELECT 1 FROM public.radar_capture_operations WHERE organization_id=$1 AND campaign_id=$2 AND historical_closed_at IS NULL AND lease_until>NOW()) AS busy`, [input.organizationId, input.campaignId])).rows[0]?.busy;
        if (busy) throw fail('radar_wait_for_active_research_before_closing');
        const lots = (await db.query(`UPDATE public.radar_capture_operations SET historical_closed_at=NOW(),status='partial',discovery_stopped=TRUE,discovery_reason='historical_closed',lease_id=NULL,lease_until=NULL,updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND historical_closed_at IS NULL AND NOT funnel_enabled RETURNING id`, [input.organizationId, input.campaignId])).rows;
        const runs = await db.query(`UPDATE public.radar_candidate_research_runs SET historical_closed_at=NOW(),status=CASE WHEN status IN('queued','running') THEN 'partial' ELSE status END,lease_id=NULL,lease_until=NULL,updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND historical_closed_at IS NULL AND NOT(output?'funnel') RETURNING id`, [input.organizationId, input.campaignId]);
        await db.query(`UPDATE public.radar_research_request_items SET state='unchanged',reason_code='radar_historical_closed',updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND state IN('accepted','running','waiting')`, [input.organizationId, input.campaignId]);
        await db.query(`UPDATE public.radar_research_requests SET status='completed',lease_id=NULL,lease_until=NULL,updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND status IN('accepted','running','waiting')`, [input.organizationId, input.campaignId]);
        await db.query('DELETE FROM public.radar_capture_outbox WHERE organization_id=$1 AND campaign_id=$2', [input.organizationId, input.campaignId]);
        const recoveredActivities=await backfillRadarCampaignRegistryActivities(db,input.organizationId,input.campaignId);
        await db.query('COMMIT'); return { closedLots: lots.length, closedRuns: runs.rowCount,recoveredActivities, companiesPreserved: true, receiptsPreserved: true };
    } catch (cause) { await db.query('ROLLBACK'); throw cause; } finally { db.release(); }
}
export async function reopenRadarFunnelCandidate(pool: pg.Pool, user: AuthUser, candidateId: string, value: unknown) {
    admin(user);
    const input = radarFunnelScopeSchema.extend({ requestId: z.uuid(), configurationRevision: z.number().int().positive(), gate: z.enum(['g0', 'g1', 'g5']), reason: z.string().trim().min(3).max(1000), confirmFalseBlock: z.boolean().default(false) }).strict().parse(value);
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const campaign = (await db.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE', [input.campaignId, input.organizationId])).rows[0];
        if (!campaign || campaign.configuration_revision !== input.configurationRevision) throw fail('radar_campaign_configuration_changed');
        const prior = (await db.query('SELECT * FROM public.radar_funnel_reopen_audit WHERE organization_id=$1 AND request_id=$2', [input.organizationId, input.requestId])).rows[0];
        if (prior) {
            if (prior.candidate_id !== candidateId || prior.gate !== input.gate || prior.configuration_revision !== input.configurationRevision || prior.reason !== input.reason || prior.confirmed_false_block !== input.confirmFalseBlock) throw fail('radar_reopen_request_conflict');
            await db.query('COMMIT'); return { candidateId, status: 'restored' as const };
        }
        const candidate = (await db.query('SELECT * FROM public.radar_candidate_records WHERE id=$1 AND organization_id=$2 AND campaign_id=$3 FOR UPDATE', [candidateId, input.organizationId, input.campaignId])).rows[0];
        if (!candidate || candidate.status !== 'pending_review') throw fail('radar_candidate_not_pending');
        if((await db.query(`SELECT EXISTS(SELECT 1 FROM public.radar_candidate_research_runs WHERE candidate_id=$1 AND organization_id=$2 AND status='running' AND lease_until>NOW()) AS busy`,[candidateId,input.organizationId])).rows[0]?.busy)throw fail('radar_wait_for_active_research_before_reopening');
        const payload = candidate.normalized_payload, block = payload.decisionExclusion;
        const actualGate = block?.gate ?? (payload.funnel?.registry?.outcome === 'block' ? 'g0' : payload.funnel?.lastBlock?.gate);
        if (block?.active !== true || actualGate !== input.gate || Number(block.revision) !== input.configurationRevision) throw fail('radar_candidate_not_excluded');
        const approved = (await db.query('SELECT approved_at FROM public.radar_b2b_reviews WHERE candidate_id=$1 AND organization_id=$2', [candidateId, input.organizationId])).rows[0];
        if (approved?.approved_at) throw fail('radar_research_approved_candidate_requires_review');
        const override = { gate: input.gate, configurationRevision: input.configurationRevision, by: user.id, reason: input.reason, at: new Date().toISOString() };
        const overrides = radarScopedFunnelOverrides(payload).filter(item => item.gate !== input.gate || item.configurationRevision !== input.configurationRevision);
        await db.query(`UPDATE public.radar_candidate_records SET normalized_payload=$3,updated_at=NOW() WHERE id=$1 AND organization_id=$2`, [candidateId, input.organizationId, JSON.stringify({ ...payload,...(payload.funnelReviewRequest?{funnelReviewRequest:{...payload.funnelReviewRequest,handledAt:new Date().toISOString(),handledBy:user.id}}:{}), funnelOverride: override, funnelOverrides: [...overrides, override], decisionExclusion: { ...block, active: false }, targetStatus: 'review', productFit: 'unknown', triageReasons: ['Reaberta para completar a pesquisa conforme revisão humana.'] })]);
        await db.query(`INSERT INTO public.radar_funnel_reopen_audit(organization_id,campaign_id,candidate_id,request_id,gate,configuration_revision,reason,confirmed_false_block,reopened_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [input.organizationId, input.campaignId, candidateId, input.requestId, input.gate, input.configurationRevision, input.reason, input.confirmFalseBlock, user.id]);
        await db.query(`UPDATE public.radar_candidate_research_runs SET status='queued',funnel_outcome=NULL,error_code=NULL,output=(output-'decisionExcluded')||jsonb_build_object('discoveryLocked',FALSE),lease_id=NULL,lease_until=NULL,updated_at=NOW() WHERE id=(SELECT id FROM public.radar_candidate_research_runs WHERE candidate_id=$1 AND organization_id=$2 AND configuration_revision=$3 AND historical_closed_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1) AND status NOT IN('queued','running')`, [candidateId, input.organizationId, input.configurationRevision]);
        await db.query(`UPDATE public.radar_capture_items item SET initial_gate_status=CASE WHEN $4 IN('g0','g1') THEN 'pending' ELSE initial_gate_status END,status='queued',funnel_outcome=NULL,blocker=NULL FROM public.radar_capture_operations lot WHERE item.operation_id=lot.id AND item.organization_id=lot.organization_id AND item.candidate_id=$1 AND item.organization_id=$2 AND lot.configuration_revision=$3 AND lot.historical_closed_at IS NULL`, [candidateId,input.organizationId,input.configurationRevision,input.gate]);
        if (input.gate !== 'g0') {
            const config = resolveRadarSearchConfiguration(campaign.search_configuration), criteria = radarGateCriteriaSchema.parse(config.funnel[input.gate].criteria);
            const rows = (await db.query(`SELECT COUNT(*) FILTER(WHERE confirmed_false_block)::int AS reversed,COUNT(DISTINCT candidate_id)::int AS reopened FROM public.radar_funnel_reopen_audit WHERE organization_id=$1 AND campaign_id=$2 AND configuration_revision=$3 AND gate=$4`, [input.organizationId, input.campaignId, input.configurationRevision, input.gate])).rows[0];
            const blocked = Number((await db.query(`SELECT COUNT(DISTINCT candidate_id)::int AS total FROM public.radar_funnel_events WHERE organization_id=$1 AND campaign_id=$2 AND configuration_revision=$3 AND gate=$4 AND mode='enforce' AND would_block`, [input.organizationId, input.campaignId, input.configurationRevision, input.gate])).rows[0].total);
            if (Number(rows.reversed) >= criteria.autoShadowOnReversedAudits || blocked > 0 && Number(rows.reopened) / blocked > criteria.autoShadowOnReopenRate) await db.query(`UPDATE public.radar_campaign_gate_calibrations SET status='auto_shadowed',updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND configuration_revision=$3 AND gate=$4 AND status='approved'`, [input.organizationId, input.campaignId, input.configurationRevision, input.gate]);
        }
        await db.query('COMMIT'); return { candidateId, status: 'restored' as const };
    } catch (cause) { await db.query('ROLLBACK'); throw cause; } finally { db.release(); }
}
