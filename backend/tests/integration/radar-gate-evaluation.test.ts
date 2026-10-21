import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { captureFixture, connectionString, admin, organizationId } from '../support/radar-capture-fixture.js';
const api = await import('../../src/modules/radar/gate-evaluation.js').catch(() => ({})) as Record<string, any>;
const route = { id: randomUUID(), version: 1, fingerprint: 'a'.repeat(64), routingKey: 'radar_initial_triage', attempts: [{ provider: 'openrouter', modelName: 'fixture/model' }], config: { enabled: true, mode: 'observe', maxAttempts: 1, timeoutSeconds: 10, deadlineSeconds: 30, maxInputTokens: 24000, modelPolicies: { 'fixture/model': { estimatedUsdPerAttempt: 0 } } } };
describe.skipIf(!connectionString)('campaign-scoped independent gate evaluation', () => {
    it('freezes only the population reaching the gate and includes the effective registry flags',async()=>{
        const f=await captureFixture();try{
            await f.pool.query(`UPDATE radar_campaigns SET target_cnaes=ARRAY['5620101'],search_configuration=jsonb_set(search_configuration,'{funnel}','{"enabled":true,"g0":{"mode":"enforce"}}')||'{"excludedNameTerms":["tabacaria"],"qualification":{"registry":{"mainActivityRule":"target_secondary_needs_review"}}}'::jsonb WHERE id=$1`,[f.campaign.id]);
            const ids:string[]=[];
            for(const name of ['Cozinha Alfa','Tabacaria Beta','Cozinha Grupo','Cozinha Sem Site']){
                const row=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual',$3,$4,$5) RETURNING id`,[organizationId,f.campaign.id,name,randomUUID(),JSON.stringify({tradeName:name,cnpj:'12345678000190',registryActivities:[{code:'4712100',main:true},{code:'5620101',main:false}]})])).rows[0];ids.push(row.id);
                if(name==='Cozinha Alfa'||name==='Cozinha Grupo')await f.pool.query(`INSERT INTO radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,output) VALUES($1,$2,$3,$4,1,'partial',$5)`,[organizationId,f.campaign.id,row.id,admin.id,JSON.stringify({siteAssociation:'confirmed',presenceResolution:{scope:name==='Cozinha Grupo'?'group':'establishment'},discovery:{websiteUrl:'https://alfa.example/'},pages:[{url:'https://alfa.example/',text:'Cozinha Alfa CNPJ 12.345.678/0001-90 atende empresas',observedAt:'2026-10-21'}]})]);
            }
            const labels=ids.map(candidateId=>({candidateId,label:'primary'}));
            const first=await api.createRadarGateCalibration(f.pool,admin,{organizationId,campaignId:f.campaign.id,gate:'g1',configurationRevision:1,expectedFingerprint:route.fingerprint,labels},{loadRoute:async()=>route});
            expect(first.dataset.map((row:any)=>row.candidateId)).not.toContain(ids[1]);
            const second=await api.createRadarGateCalibration(f.pool,admin,{organizationId,campaignId:f.campaign.id,gate:'g5',configurationRevision:1,expectedFingerprint:route.fingerprint,labels},{loadRoute:async()=>route});
            expect(second.dataset.map((row:any)=>row.candidateId)).toEqual([ids[0]]);
            const contexts=(await f.pool.query('SELECT context FROM radar_gate_evaluation_cases WHERE calibration_id=ANY($1::uuid[])',[[first.id,second.id]])).rows;
            expect(contexts.every(row=>row.context.criteria.registryFlags.includes('target_secondary_only'))).toBe(true);
            expect(contexts.every(row=>JSON.parse(row.context.evidence[0].text).flags.includes('target_secondary_only'))).toBe(true);
        }finally{await f.close()}
    });
    it('calls the actual decision adapter once under an evaluation receipt and never mutates the company', async () => {
        const f = await captureFixture();
        try {
            const candidateId = randomUUID();
            await f.pool.query(`INSERT INTO public.radar_candidate_records(id,organization_id,campaign_id,source_type,source_url,title,dedupe_key,normalized_payload,raw_payload) VALUES($1::uuid,$2,$3,'manual',NULL,'Empresa sintética',$1::uuid::text,$4,'{}')`, [candidateId, organizationId, f.campaign.id, JSON.stringify({ cnpj: '12345678000190', tradeName: 'Empresa sintética', registryActivities: [{ code: '1234567', main: true, text: 'Atividade da empresa' }] })]);
            const before = (await f.pool.query('SELECT * FROM public.radar_candidate_records WHERE id=$1', [candidateId])).rows[0];
            const calibration = await api.createRadarGateCalibration(f.pool, admin, { organizationId, campaignId: f.campaign.id, gate: 'g1', configurationRevision: 1, expectedFingerprint: route.fingerprint, labels: [{ candidateId, label: 'primary' }] }, { loadRoute: async () => route });
            const runtime = vi.fn(async (_env: unknown, path: string, input: any) => {
                expect(path).toBe('/radar/decide');
                expect(input.request_id).toBe(`eval:${calibration.id}:${candidateId}:g1`);
                expect(input.context_version).toBe('radar-decision-context-v2');
                expect(input.evidence[0].role).toBe('registry');
                return { schemaVersion: 1, task: 'radar_initial_triage', status: 'decided', choice: 'compatible', reasonCode: 'fit_supported', probabilities: { compatible: .99, outside_profile: .01 }, evidenceIds: [input.evidence[0].id], requestedModel: 'fixture/model', resolvedModel: 'fixture/model-v1', provider: 'openrouter', upstreamProvider: 'fixture', adapterVersion: 'openrouter-decisions-alpha-v1', contextVersion: 'radar-decision-context-v2', questionVersion: 'radar-decisions-questions-v2', criteriaRubricVersion: 'radar-decisions-rubric-v2', attempts: [], usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 } };
            });
            const input = { organizationId, campaignId: f.campaign.id, calibrationId: calibration.id, confirmPaid: true, expectedFingerprint: route.fingerprint, expectedPolicyVersion: calibration.policyVersion, approvedUnitPriceBrl: '0' };
            const dependencies = { env: {}, runtime, loadRoute: async () => route };
            expect(await api.runRadarGateEvaluationCase(f.pool, admin, input, dependencies)).toMatchObject({ done: true, completed: 1 });
            expect(await api.runRadarGateEvaluationCase(f.pool, admin, input, dependencies)).toMatchObject({ done: true, completed: 1 });
            expect(runtime).toHaveBeenCalledTimes(1);
            expect((await f.pool.query('SELECT * FROM public.radar_candidate_records WHERE id=$1', [candidateId])).rows[0]).toEqual(before);
            expect((await f.pool.query('SELECT COUNT(*)::int AS total FROM public.radar_candidate_research_runs WHERE candidate_id=$1', [candidateId])).rows[0].total).toBe(0);
            await expect(api.approveRadarGateCalibration(f.pool, admin, { organizationId, campaignId: f.campaign.id, calibrationId: calibration.id, confirmApproval: true }, { loadRoute: async () => route })).rejects.toThrow('radar_calibration_not_approvable');
        } finally { await f.close(); }
    }, 30000);
});
