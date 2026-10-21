import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { captureFixture, connectionString, admin, organizationId } from '../support/radar-capture-fixture.js';
import { resolveRadarSearchConfiguration } from '../../src/modules/radar/search-configuration.js';
import { radarFunnelTargetsHash, radarGateBindingFromResult } from '../../src/modules/radar/funnel-context.js';
import {radarDecisionHash} from '../../src/modules/radar/decision-service.js';
import {getRadarFunnelReport} from '../../src/modules/radar/funnel-report.js';
const api = await import('../../src/modules/radar/funnel-gate-application.js').catch(() => ({})) as Record<string, any>;
describe.skipIf(!connectionString)('live gate application authorization', () => {
    it('rechecks campaign-only calibration under the company lease and never uses the global calibration', async () => {
        const f = await captureFixture();
        try {
            const candidateId = randomUUID(), runId = randomUUID(), leaseId = randomUUID(), fingerprint = 'b'.repeat(64);
            const config = resolveRadarSearchConfiguration({ funnel: { enabled: true, g1: { mode: 'enforce' } } });
            await f.pool.query('UPDATE public.radar_campaigns SET search_configuration=$2 WHERE id=$1', [f.campaign.id, JSON.stringify(config)]);
            await f.pool.query(`INSERT INTO public.radar_candidate_records(id,organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload,raw_payload) VALUES($1::uuid,$2,$3,'manual','Empresa sintética',$1::uuid::text,'{}','{}')`, [candidateId, organizationId, f.campaign.id]);
            await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(id,organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,lease_id,lease_until) VALUES($1,$2,$3,$4,$5,1,'running',$6,NOW()+INTERVAL '6 minutes')`, [runId, organizationId, f.campaign.id, candidateId, admin.id, leaseId]);
            const result = { schemaVersion: 1, task: 'radar_initial_triage', status: 'decided', choice: 'outside_profile', reasonCode: 'registry_activity_mismatch', probabilities: { outside_profile: .99, compatible: .01 }, evidenceIds: ['registry'], requestedModel: 'fixture/model', resolvedModel: 'fixture/model-v1', provider: 'openrouter', upstreamProvider: 'fixture', adapterVersion: 'openrouter-decisions-alpha-v1', contextVersion: 'radar-decision-context-v2', questionVersion: 'radar-decisions-questions-v2', criteriaRubricVersion: 'radar-decisions-rubric-v2', attempts: [], usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } };
            const input = { organizationId, campaignId: f.campaign.id, candidateId, runId, leaseId, configurationRevision: 1, gate: 'g1', routeFingerprint: fingerprint, requestId: 'fixture', result,
                evidence: [{ id: 'registry', sourceUrl: 'https://cnpja.com/office/12345678000190', text: 'Atividade incompatível', role: 'registry', primary: true, contradictory: false, scope: 'establishment' }] };
            const deps = { authorize: async () => {}, currentRoute: async () => ({ fingerprint, config: { enabled: true } }) };
            const observed=await api.applyRadarFunnelGateDecision(f.pool, input, deps);
            expect(observed).toMatchObject({ action: 'continue', effectiveMode: 'shadow' });
            await api.markRadarFunnelInitialGate(f.pool,input,false,deps);
            const binding = radarGateBindingFromResult({ campaignId: f.campaign.id, configurationRevision: 1, targetsHash: radarFunnelTargetsHash(config, []),criteriaHash:radarDecisionHash(config.funnel.g1.criteria), routeFingerprint: fingerprint, result: result as never });
            await f.pool.query(`INSERT INTO public.radar_campaign_gate_calibrations(organization_id,campaign_id,configuration_revision,gate,binding,dataset,criteria,seed,dataset_hash,threshold,status,created_by,approved_by,approved_at) VALUES($1,$2,1,'g1',$3,'[]','{}',$4,'fixture',.9,'approved',$5,$5,NOW())`, [organizationId, f.campaign.id, JSON.stringify(binding), randomUUID(), admin.id]);
            const applied=await api.applyRadarFunnelGateDecision(f.pool, input, deps);
            expect(applied).toMatchObject({ action: 'exclude', effectiveMode: 'enforce' });
            expect(applied.eventKey).not.toBe(observed.eventKey);
            await f.pool.query('UPDATE public.radar_candidate_research_runs SET output=$2,calls=$3 WHERE id=$1',[runId,JSON.stringify({funnel:{initial:applied}}),JSON.stringify({decision:{source:'openrouter_decision',requestId:'fixture',result}})]);
            const report=await getRadarFunnelReport(f.pool,admin,{organizationId,campaignId:f.campaign.id});
            expect(report.companies[0].path).toEqual([
                expect.objectContaining({mode:'shadow',threshold:null,wouldBlock:null}),
                expect.objectContaining({mode:'enforce',threshold:.9,wouldBlock:true}),
            ]);
            // Only final dossier publication may mutate the commercial
            // projection; the gate records its scoped authorization first.
            const events = (await f.pool.query('SELECT mode,outcome FROM public.radar_funnel_events WHERE candidate_id=$1 ORDER BY created_at', [candidateId])).rows;
            expect(events).toEqual([{ mode: 'shadow', outcome: 'outside_profile' }, { mode: 'enforce', outcome: 'outside_profile' }]);
            await f.pool.query('UPDATE public.radar_candidate_research_runs SET lease_until=NOW()-INTERVAL \'1 second\' WHERE id=$1', [runId]);
            await expect(api.applyRadarFunnelGateDecision(f.pool, input, deps)).rejects.toThrow('radar_research_lease_lost');
        } finally { await f.close(); }
    }, 30000);
});
