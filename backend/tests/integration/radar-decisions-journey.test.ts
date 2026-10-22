import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { captureFixture, connectionString, organizationId, admin } from '../support/radar-capture-fixture.js';
import { upsertAdminLlmRoute, getAdminLlmRouteById } from '../../src/modules/platform/adminRepository.js';
import { getRadarOperationalLimits, updateRadarOperationalLimits } from '../../src/modules/radar/operational-limits.js';
import { decideRadarAction } from '../../src/modules/radar/decision-service.js';
import { getRadarDecisionRouteStatus, testRadarDecisionRoute } from '../../src/modules/radar/decision-admin.js';
import { projectRadarCommercialResponse } from '../../src/modules/radar/commercial-view.js';
import type { DecisionContextV1 } from '../../src/modules/radar/decision-contracts.js';
import { authorizeRadarAnalysisRetries } from '../../src/modules/radar/analysis-retry-authorizations.js';
import { queueRadarResearchRequest } from '../../src/modules/radar/research-requests.js';
import { getRadarAdministrativeResearch } from '../../src/modules/radar/administrative-research.js';
import { approveRadarDecisionCalibration } from '../../src/modules/radar/decision-calibration.js';
import { restoreRadarDecisionExclusion } from '../../src/modules/radar/decision-review.js';
import { startRadarCandidateResearch, executeRadarCandidateResearch } from '../../src/modules/radar/research-service.js';
describe.skipIf(!connectionString)('real backend → HTTP runtime → per-attempt PostgreSQL Decisions, synthetic provider only', () => {
    let child: ChildProcess, url: string, env: any, runtimeErrors = '';
    beforeAll(async () => {
        const server = createServer();
        await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
        const port = (server.address() as {
            port: number;
        }).port;
        await new Promise<void>(ok => server.close(() => ok()));
        url = `http://127.0.0.1:${port}`;
        const cwd = resolve('../workers/marketing-studio-agent-runtime'), libs = resolve('../.superpowers/sdd/2026-10-19-radar-recuperacao-e-experiencia/python-libs');
        child = spawn('python', ['tests/support/decision_runtime_server.py'], { cwd, windowsHide: true, env: { ...process.env, PYTHONPATH: `${cwd};${libs}`, DATABASE_URL: connectionString!.replace('radar_test@', 'yux_runtime@'), YUX_AGENT_RUNTIME_TOKEN: 'fixture-decision-token', RADAR_DECISION_TEST_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
        let errors = '';
        child.stderr?.on('data', data => { errors += data; runtimeErrors += data; });
        env = { YUX_AGENT_RUNTIME_URL: url, YUX_AGENT_RUNTIME_TOKEN: 'fixture-decision-token' };
        for (let index = 0; index < 100; index++) {
            if (child.exitCode !== null)
                throw Error(errors);
            try {
                if ((await fetch(`${url}/health`, { headers: { authorization: 'Bearer fixture-decision-token' } })).ok)
                    return;
            }
            catch { }
            await new Promise(ok => setTimeout(ok, 100));
        }
        throw Error(`fixture_runtime_not_ready ${errors}`);
    }, 20000);
    afterAll(() => child?.kill());
    it('keeps a shared slot for G5 under real transactional G3 reservations and reuses paid choices',async()=>{
        const f=await captureFixture(),policy=await getRadarOperationalLimits(f.pool,admin);let routeId:string|undefined;
        try{
            await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:policy.version,limits:{...policy.limits,maxDecisionCallsPerCompany:6},costPolicy:{usdToBrl:'5',rateAsOf:'2026-10-19T12:00:00Z',rateSource:'manual',marginPercent:'0'}});
            routeId=(await upsertAdminLlmRoute(f.pool,{agentType:'radar_decision_default',organizationId,provider:'openrouter',kind:'decision',modelName:'fixture/primary',decisionConfig:{enabled:true,mode:'observe',maxAttempts:1,modelPolicies:{'fixture/primary':{estimatedUsdPerAttempt:.001}}}})).id;
            await f.pool.query(`UPDATE radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{funnel}','{"enabled":true,"g1":{"mode":"shadow"},"g3":{"mode":"effective"},"g5":{"mode":"shadow"}}') WHERE id=$1`,[f.campaign.id]);
            const candidate=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Alfa',$3,'{}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0],lease=randomUUID();
            const run=(await f.pool.query(`INSERT INTO radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,lease_id,lease_until) VALUES($1,$2,$3,$4,1,'running',$5,NOW()+INTERVAL '5 minutes') RETURNING id`,[organizationId,f.campaign.id,candidate.id,admin.id,lease])).rows[0];
            const input:DecisionContextV1={schemaVersion:1,contextVersion:'radar-decision-context-v2',organizationId,campaignId:f.campaign.id,candidateId:candidate.id,configurationRevision:1,task:'radar_initial_triage',identity:{name:'Empresa Alfa'},criteria:{segment:'Empresas'},evidence:[],options:[],humanReviewed:false},deps={env,runId:run.id,leaseId:lease,authorize:async()=>{}};
            await decideRadarAction(f.pool,admin,input,deps);
            const g3=(step:number):DecisionContextV1=>({...input,task:'radar_next_action',step,options:[{id:'read_alfa',description:'Ler Alfa'},{id:'search_other',description:'Outra fonte'}]});
            for(let step=0;step<4;step++)expect(await decideRadarAction(f.pool,admin,g3(step),deps)).toHaveProperty('requestId');
            expect(await decideRadarAction(f.pool,admin,g3(4),deps)).toMatchObject({reasonCode:'decision_final_capacity_reserved'});
            expect(await decideRadarAction(f.pool,admin,g3(0),deps)).toHaveProperty('requestId');
            expect(await decideRadarAction(f.pool,admin,{...input,task:'radar_fit_gate'},deps)).toHaveProperty('requestId');
            expect((await f.pool.query('SELECT count(*)::int AS n FROM radar_analysis_receipts WHERE request_id LIKE $1',[`${run.id}:%`])).rows[0].n).toBe(6);
        }finally{const current=await getRadarOperationalLimits(f.pool,admin);await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:current.version,limits:policy.limits,costPolicy:policy.costPolicy});if(routeId)await f.pool.query('DELETE FROM model_routing_rules WHERE id=$1',[routeId]);await f.close()}
    },30000);
    it.each([1,6])('reserves G3 without starving G1 when the ceiling is %s',async(maximum)=>{
        const f=await captureFixture(),policy=await getRadarOperationalLimits(f.pool,admin);let routeId:string|undefined;
        try{
            await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:policy.version,limits:{...policy.limits,maxDecisionCallsPerCompany:maximum},costPolicy:{usdToBrl:'5',rateAsOf:'2026-10-19T12:00:00Z',rateSource:'manual',marginPercent:'0'}});
            routeId=(await upsertAdminLlmRoute(f.pool,{agentType:'radar_decision_default',organizationId,provider:'openrouter',kind:'decision',modelName:'fixture/primary',decisionConfig:{enabled:true,mode:'observe',maxAttempts:1,modelPolicies:{'fixture/primary':{estimatedUsdPerAttempt:.001}}}})).id;
            for(const mode of ['off','shadow']){
                await f.pool.query(`UPDATE radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{funnel}',$2) WHERE id=$1`,[f.campaign.id,JSON.stringify({enabled:true,g1:{mode},g3:{mode:'effective'}})]);
                const candidate=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Alfa',$3,'{}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0],lease=randomUUID();
                const run=(await f.pool.query(`INSERT INTO radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,lease_id,lease_until) VALUES($1,$2,$3,$4,1,'running',$5,NOW()+INTERVAL '5 minutes') RETURNING id`,[organizationId,f.campaign.id,candidate.id,admin.id,lease])).rows[0];
                const input:DecisionContextV1={schemaVersion:1,contextVersion:'radar-decision-context-v2',organizationId,campaignId:f.campaign.id,candidateId:candidate.id,configurationRevision:1,task:'radar_initial_triage',identity:{name:'Empresa Alfa'},criteria:{segment:'Empresas'},evidence:[],options:[],humanReviewed:false},deps={env,runId:run.id,leaseId:lease,authorize:async()=>{}};
                if(mode==='shadow')expect(await decideRadarAction(f.pool,admin,input,deps)).toMatchObject(maximum===1?{reasonCode:'decision_observation_capacity_reserved'}:{result:{status:'decided'}});
                expect(await decideRadarAction(f.pool,admin,{...input,task:'radar_next_action',step:0,options:[{id:'read_alfa',description:'Ler Alfa'},{id:'search_other',description:'Outra fonte'}]},deps)).toMatchObject({result:{status:'decided'}});
                const calls=(await f.pool.query('SELECT calls FROM radar_candidate_research_runs WHERE id=$1',[run.id])).rows[0].calls;
                expect(Object.values(calls)).toHaveLength(mode==='shadow'&&maximum>1?2:1);expect(Object.values(calls).some((call:any)=>call.context.task==='radar_next_action')).toBe(true);
            }
        }finally{const current=await getRadarOperationalLimits(f.pool,admin);await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:current.version,limits:policy.limits,costPolicy:policy.costPolicy});if(routeId)await f.pool.query('DELETE FROM model_routing_rules WHERE id=$1',[routeId]);await f.close()}
    },30000);
    for(const funnel of [false,true])it(`the actual company worker collects facts with all three decision stages (${funnel?'opt-in funnel':'legacy'})`, async () => {
        const f = await captureFixture(), policy = await getRadarOperationalLimits(f.pool, admin);
        let routeId: string | undefined;
        try {
            await updateRadarOperationalLimits(f.pool, admin, { expectedVersion: policy.version, limits: { ...policy.limits, maxDecisionCallsPerCompany: funnel?6:3 }, costPolicy: { usdToBrl: '5', rateAsOf: '2026-10-19T12:00:00Z', rateSource: 'manual', marginPercent: '0' } });
            routeId = (await upsertAdminLlmRoute(f.pool, { agentType: 'radar_decision_default', organizationId, provider: 'openrouter', kind: 'decision', modelName: 'fixture/primary', decisionConfig: { enabled: true, mode: 'observe', maxAttempts: 1, modelPolicies: { 'fixture/primary': { estimatedUsdPerAttempt: .001 } } } })).id;
            await f.pool.query(`UPDATE radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{research}',(search_configuration->'research')||$2::jsonb) WHERE id=$1`, [f.campaign.id, JSON.stringify({ presenceResolutionEnabled: false, semanticQualificationEnabled: false, profileEnabled: false, sizeAssessment: { enabled: false } })]);
            if(funnel)await f.pool.query(`UPDATE radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{funnel}','{"enabled":true,"g1":{"mode":"enforce"},"g3":{"mode":"effective"}}') WHERE id=$1`,[f.campaign.id]);
            const candidate = (await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Alfa',$3,$4) RETURNING id`, [organizationId, f.campaign.id, randomUUID(), JSON.stringify({ cnpj: '12345678000190', websiteUrl: 'https://alfa.example/', tradeName: 'Empresa Alfa', city: 'Curitiba', state: 'PR' })])).rows[0];
            const run = await startRadarCandidateResearch(f.pool, admin, { organizationId, candidateId: candidate.id, configurationRevision: 1 });
            const page = { url: 'https://alfa.example/', text: 'Empresa Alfa CNPJ 12.345.678/0001-90. Contato compras@alfa.example.', observedAt: new Date().toISOString() };
            await executeRadarCandidateResearch(f.pool, env, { organizationId, runId: run.runId }, undefined, { loadSecret: async () => 'fixture-not-real', web: async () => funnel?[{url:page.url,title:'Empresa Alfa',snippets:[],observedAt:page.observedAt},{url:'https://outra.example/',title:'Outra hipótese',snippets:[],observedAt:page.observedAt}]:[], collect: async () => [page] });
            const saved = (await f.pool.query('SELECT status,calls,output FROM radar_candidate_research_runs WHERE id=$1', [run.runId])).rows[0];
            expect(saved.status).not.toBe('failed');
            const decisions = Object.values(saved.calls).filter((call: any) => call.source === 'openrouter_decision');
            expect(decisions).toHaveLength(3);
            expect(decisions.every((call: any) => call.status === 'completed')).toBe(true);
            expect(saved.output.contacts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'email', value: 'compras@alfa.example' })]));
            const receipts = (await f.pool.query('SELECT action,status FROM radar_analysis_receipts WHERE request_id LIKE $1', [`${run.runId}:%`])).rows;
            expect(receipts.map(row => row.action).sort()).toEqual(funnel?['radar_fit_gate','radar_initial_triage','radar_next_action']:['radar_initial_triage', 'radar_next_action', 'radar_quality_gate']);
            if(funnel)expect((await f.pool.query('SELECT gate FROM radar_funnel_events WHERE run_id=$1 ORDER BY created_at',[run.runId])).rows.map(row=>row.gate)).toEqual(expect.arrayContaining(['g0','g1','g3','g5']));
            expect(receipts.every(row => row.status === 'completed')).toBe(true);
            // A second delivery of the same worker does not buy another decision.
            await executeRadarCandidateResearch(f.pool, env, { organizationId, runId: run.runId });
            expect((await f.pool.query('SELECT id FROM radar_analysis_receipts WHERE request_id LIKE $1', [`${run.runId}:%`])).rows).toHaveLength(3);
        } finally {
            const current = await getRadarOperationalLimits(f.pool, admin);
            await updateRadarOperationalLimits(f.pool, admin, { expectedVersion: current.version, limits: policy.limits, costPolicy: policy.costPolicy });
            if (routeId) await f.pool.query('DELETE FROM model_routing_rules WHERE id=$1', [routeId]);
            await f.pool.query("DELETE FROM radar_analysis_receipts WHERE organization_id=$1 AND action IN('radar_initial_triage','radar_next_action','radar_quality_gate')", [organizationId]);
            await f.close();
        }
    }, 30000);
    it('runs all stages through the real decision endpoint, reuses completed calls, records fallback costs and keeps client projections clean', async () => {
        const f = await captureFixture(), policy = await getRadarOperationalLimits(f.pool, admin);
        let routeId: string | undefined;
        try {
            await updateRadarOperationalLimits(f.pool, admin, { expectedVersion: policy.version, limits: { ...policy.limits, maxDecisionCallsPerCompany: 3 }, costPolicy: { usdToBrl: '5', rateAsOf: '2026-10-19T12:00:00Z', rateSource: 'manual', marginPercent: '0' } });
            const route = await upsertAdminLlmRoute(f.pool, { agentType: 'radar_decision_default', organizationId, provider: 'openrouter', kind: 'decision', modelName: 'fixture/invalid', fallbackRoutes: [{ provider: 'openrouter', modelName: 'fixture/primary' }], decisionConfig: { enabled: true, mode: 'auto_exclude', maxAttempts: 2, modelPolicies: { 'fixture/invalid': { estimatedUsdPerAttempt: .001 }, 'fixture/primary': { estimatedUsdPerAttempt: .001 } } } });
            routeId = route.id;
            const candidate = (await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Alfa',$3,'{}') RETURNING id`, [organizationId, f.campaign.id, randomUUID()])).rows[0];
            const lease = randomUUID(), run = (await f.pool.query(`INSERT INTO radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,lease_id,lease_until) VALUES($1,$2,$3,$4,1,'running',$5,NOW()+INTERVAL '5 minutes') RETURNING id`, [organizationId, f.campaign.id, candidate.id, admin.id, lease])).rows[0];
            const input: DecisionContextV1 = { schemaVersion: 1, organizationId, campaignId: f.campaign.id, candidateId: candidate.id, configurationRevision: 1, task: 'radar_initial_triage', identity: { name: 'Empresa Alfa' }, criteria: { segment: 'Atividade configurada' }, evidence: [{ id: 'e1', sourceUrl: 'https://empresa.example/', text: 'Empresa Alfa opera nesta atividade.', role: 'identity', primary: true, contradictory: false, scope: 'establishment' }], options: [], humanReviewed: false };
            const deps = { env, runId: run.id, leaseId: lease, authorize: async () => { } };
            for (const task of ['radar_initial_triage', 'radar_next_action', 'radar_quality_gate'] as const) {
                const result = await decideRadarAction(f.pool, admin, { ...input, task }, deps);
                expect(result).toMatchObject({ action: 'continue', effectiveMode: 'observe' });
                expect(result.result?.usage.costUsd).toBe(.00002);
                expect(result.result?.attempts).toHaveLength(2);
            }
            await decideRadarAction(f.pool, admin, input, deps);
            const receipts = (await f.pool.query(`SELECT * FROM radar_analysis_receipts WHERE request_id LIKE $1`, [`${run.id}:%`])).rows;
            expect(receipts).toHaveLength(3);
            expect(receipts.every(row => row.status === 'completed')).toBe(true);
            expect((await f.pool.query('SELECT * FROM radar_effect_receipts WHERE analysis_receipt_id=ANY($1::uuid[])', [receipts.map(row => row.id)])).rows).toHaveLength(6);
            // A lost backend acknowledgement must recover the old paid result,
            // even when new evidence arrived, without applying it to new facts.
            const calls = (await f.pool.query('SELECT calls FROM radar_candidate_research_runs WHERE id=$1', [run.id])).rows[0].calls;
            const triageKey = Object.keys(calls).find(key => calls[key].context?.task === input.task)!;
            await f.pool.query("UPDATE radar_candidate_research_runs SET calls=jsonb_set(calls,ARRAY[$2,'status'],'\"uncertain\"'::jsonb) WHERE id=$1", [run.id, triageKey]);
            expect(await decideRadarAction(f.pool, admin, { ...input, evidence: [{ ...input.evidence[0], text: 'Empresa Alfa publicou uma informação nova.' }] }, deps)).toMatchObject({ action: 'continue', effectiveMode: 'observe', reasonCode: 'decision_evidence_changed' });
            expect((await f.pool.query('SELECT calls FROM radar_candidate_research_runs WHERE id=$1', [run.id])).rows[0].calls[triageKey].status).toBe('completed');
            expect((await f.pool.query('SELECT id FROM radar_analysis_receipts WHERE request_id LIKE $1', [`${run.id}:%`])).rows).toHaveLength(3);
            expect((await f.pool.query('SELECT id FROM radar_effect_receipts WHERE analysis_receipt_id=ANY($1::uuid[])', [receipts.map(row => row.id)])).rows).toHaveLength(6);
            const response = projectRadarCommercialResponse('research', { run: { status: 'partial', output: { decisions: receipts, calls: receipts } }, configurationRevision: 1 });
            expect(JSON.stringify(response)).not.toMatch(/fixture\/|openrouter|decision_config|receipt|model/i);
            const status = await getRadarDecisionRouteStatus(f.pool, admin, (await getAdminLlmRouteById(f.pool, routeId!))!);
            const test = await testRadarDecisionRoute(f.pool, env, admin, (await getAdminLlmRouteById(f.pool, routeId!))!, { confirmPaid: true, expectedFingerprint: status.route.fingerprint, expectedPolicyVersion: status.policyVersion, approvedPriceBrl: status.price.amountBrl, requestId: randomUUID() });
            expect(test).toMatchObject({ kind: 'decision', contractValid: true, calibrationState: 'synthetic_test_not_calibration' });
            for (const role of ['client_admin', 'client_member', 'yux_operator'] as const)
                await expect(getRadarDecisionRouteStatus(f.pool, { ...admin, role }, route as never)).rejects.toMatchObject({ statusCode: 403 });
        }
        finally {
            const current = await getRadarOperationalLimits(f.pool, admin);
            await updateRadarOperationalLimits(f.pool, admin, { expectedVersion: current.version, limits: policy.limits, costPolicy: policy.costPolicy });
            if (routeId)
                await f.pool.query('DELETE FROM model_routing_rules WHERE id=$1', [routeId]);
            await f.pool.query("DELETE FROM radar_analysis_receipts WHERE organization_id=$1 AND action IN('radar_initial_triage','radar_next_action','radar_quality_gate')", [organizationId]);
            await f.close();
        }
    }, 30000);
    it('never repeats an uncertain decision; an explicit scoped retry is consumed once and does not lose the old receipt', async () => {
        const f = await captureFixture(), policy = await getRadarOperationalLimits(f.pool, admin);
        let routeId: string | undefined;
        try {
            await updateRadarOperationalLimits(f.pool, admin, { expectedVersion: policy.version, limits: policy.limits, costPolicy: { usdToBrl: '5', rateAsOf: '2026-10-19T12:00:00Z', rateSource: 'manual', marginPercent: '0' } });
            let route = await upsertAdminLlmRoute(f.pool, { agentType: 'radar_decision_default', organizationId, provider: 'openrouter', kind: 'decision', modelName: 'fixture/timeout', fallbackRoutes: [{ provider: 'openrouter', modelName: 'fixture/primary' }], decisionConfig: { enabled: true, mode: 'observe', maxAttempts: 2, modelPolicies: { 'fixture/timeout': { estimatedUsdPerAttempt: .001 }, 'fixture/primary': { estimatedUsdPerAttempt: .001 } } } });
            routeId = route.id;
            const candidate = (await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Alfa',$3,'{}') RETURNING id`, [organizationId, f.campaign.id, randomUUID()])).rows[0];
            const lease = randomUUID(), run = (await f.pool.query(`INSERT INTO radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,lease_id,lease_until) VALUES($1,$2,$3,$4,1,'running',$5,NOW()+INTERVAL '5 minutes') RETURNING id`, [organizationId, f.campaign.id, candidate.id, admin.id, lease])).rows[0];
            const input: DecisionContextV1 = { schemaVersion: 1, organizationId, campaignId: f.campaign.id, candidateId: candidate.id, configurationRevision: 1, task: 'radar_initial_triage', identity: { name: 'Empresa Alfa' }, criteria: { segment: 'Atividade configurada' }, evidence: [], options: [], humanReviewed: false }, deps = { env, runId: run.id, leaseId: lease, authorize: async () => { } };
            await expect(decideRadarAction(f.pool, admin, input, deps)).rejects.toThrow('decision_effect_uncertain');
            await expect(decideRadarAction(f.pool, admin, input, deps)).rejects.toThrow('radar_analysis_previous_request_uncertain');
            const old = (await f.pool.query('SELECT * FROM radar_analysis_receipts WHERE request_id LIKE $1', [`${run.id}:%`])).rows[0];
            expect((await f.pool.query('SELECT * FROM radar_effect_receipts WHERE analysis_receipt_id=$1', [old.id])).rows).toHaveLength(1);
            expect((await getRadarAdministrativeResearch(f.pool, admin, { organizationId, campaignId: f.campaign.id })).analyses.find(item => item.receiptId === old.id)).toMatchObject({ canAuthorizeRetry: true, canRevalidate: false });
            route = await upsertAdminLlmRoute(f.pool, { ...route, id: route.id!, kind: 'decision', protocol: 'openrouter-decisions-alpha-v1', modelName: 'fixture/primary', fallbackRoutes: [], fallbackModelName: null } as never);
            const retryPolicy = await getRadarOperationalLimits(f.pool, admin);
            await updateRadarOperationalLimits(f.pool, admin, { expectedVersion: retryPolicy.version, limits: retryPolicy.limits, costPolicy: { ...retryPolicy.costPolicy, usdToBrl: '6', rateAsOf: '2026-10-19T13:00:00Z', rateSource: 'manual', marginPercent: '0' } });
            const grant = await authorizeRadarAnalysisRetries(f.pool, admin, { organizationId, campaignId: f.campaign.id, configurationRevision: 1, requestId: randomUUID(), expiresAt: new Date(Date.now() + 3600000).toISOString(), acknowledgePreviousChargeMayExist: true, items: [{ candidateId: candidate.id, previousReceiptId: old.id }] });
            const campaign = (await f.pool.query('SELECT commercial_criteria_revision FROM radar_campaigns WHERE id=$1', [f.campaign.id])).rows[0];
            const requestId = randomUUID();
            await queueRadarResearchRequest(f.pool, admin, { organizationId, campaignId: f.campaign.id, candidateIds: [candidate.id], criteriaRevision: campaign.commercial_criteria_revision, requestId, intent: 'resume', analysisAuthorizationId: grant.analysisAuthorizationId });
            await f.pool.query(`UPDATE radar_research_request_items SET run_id=$1 WHERE research_request_id=(SELECT id FROM radar_research_requests WHERE request_id=$2 AND organization_id=$3)`, [run.id, requestId, organizationId]);
            const retried = await decideRadarAction(f.pool, admin, input, deps).catch(cause => { throw Error(`${cause}\n${runtimeErrors}`); });
            expect(retried).toMatchObject({ result: { status: 'decided', requestedModel: 'fixture/primary' } });
            const savedCalls = (await f.pool.query('SELECT calls FROM radar_candidate_research_runs WHERE id=$1', [run.id])).rows[0].calls;
            expect(Object.values(savedCalls).find((call: any) => call.source === 'openrouter_decision')).toMatchObject({ costPolicy: { usdToBrl: '6' } });
            expect(await decideRadarAction(f.pool, admin, input, deps)).toMatchObject({ result: { status: 'decided' } });
            expect((await f.pool.query('SELECT status FROM radar_analysis_receipts WHERE id=$1', [old.id])).rows[0].status).toBe('uncertain');
            const approval = (await f.pool.query('SELECT consumed_at,consumed_by_analysis_receipt_id FROM radar_analysis_retry_authorizations WHERE request_id=$1', [grant.analysisAuthorizationId])).rows[0];
            expect(approval.consumed_at).toBeTruthy();
            expect(approval.consumed_by_analysis_receipt_id).not.toBe(old.id);
            expect((await f.pool.query('SELECT * FROM radar_analysis_receipts WHERE request_id LIKE $1', [`${run.id}:%`])).rows).toHaveLength(2);
        }
        finally {
            const current = await getRadarOperationalLimits(f.pool, admin);
            await updateRadarOperationalLimits(f.pool, admin, { expectedVersion: current.version, limits: policy.limits, costPolicy: policy.costPolicy });
            await f.close();
            const clean = new (await import('pg')).default.Pool({ connectionString });
            if (routeId)
                await clean.query('DELETE FROM model_routing_rules WHERE id=$1', [routeId]);
            await clean.query("DELETE FROM radar_analysis_receipts WHERE organization_id=$1 AND action IN('radar_initial_triage','radar_next_action','radar_quality_gate')", [organizationId]);
            await clean.end();
        }
    }, 30000);
    it('uses an approved exact calibration, immediately observes after model swap, and preserves human overrides and RLS', async () => {
        const f = await captureFixture(), policy = await getRadarOperationalLimits(f.pool, admin);
        let routeId: string | undefined;
        try {
            await updateRadarOperationalLimits(f.pool, admin, { expectedVersion: policy.version, limits: policy.limits, costPolicy: { usdToBrl: '5', rateAsOf: '2026-10-19T12:00:00Z', rateSource: 'manual', marginPercent: '0' } });
            let route = await upsertAdminLlmRoute(f.pool, { agentType: 'radar_decision_default', organizationId, provider: 'openrouter', kind: 'decision', modelName: 'fixture/outside', decisionConfig: { enabled: true, mode: 'auto_exclude', maxAttempts: 1, modelPolicies: { 'fixture/outside': { estimatedUsdPerAttempt: 1e-8 }, 'fixture/primary': { estimatedUsdPerAttempt: 1e-8 } } } });
            routeId = route.id;
            const candidate = (await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Alfa',$3,'{"websiteUrl":"https://empresa.example/"}') RETURNING id`, [organizationId, f.campaign.id, randomUUID()])).rows[0];
            const lease = randomUUID(), run = (await f.pool.query(`INSERT INTO radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,lease_id,lease_until) VALUES($1,$2,$3,$4,1,'running',$5,NOW()+INTERVAL '5 minutes') RETURNING id`, [organizationId, f.campaign.id, candidate.id, admin.id, lease])).rows[0];
            const input: DecisionContextV1 = { schemaVersion: 1, organizationId, campaignId: f.campaign.id, candidateId: candidate.id, configurationRevision: 1, task: 'radar_initial_triage', identity: { name: 'Empresa Alfa' }, criteria: { segment: 'Perfil configurado' }, evidence: [{ id: 'e1', sourceUrl: 'https://empresa.example/', text: 'Empresa Alfa. Atividade distinta comprovada nesta fonte sintética.', role: 'activity', primary: true, contradictory: false, scope: 'establishment' }], options: [], humanReviewed: false }, deps = { env, runId: run.id, leaseId: lease, authorize: async () => { } };
            const first = await decideRadarAction(f.pool, admin, input, deps);
            expect(first).toMatchObject({ action: 'continue', effectiveMode: 'observe', result: { choice: 'outside_profile' } });
            const status = await getRadarDecisionRouteStatus(f.pool, admin, route), result = first.result!;
            // Synthetic approval proves the gate wiring only; never a real quality claim.
            await approveRadarDecisionCalibration(f.pool, admin, { routeId, routeFingerprint: status.route.fingerprint, provider: 'openrouter', upstreamProvider: result.upstreamProvider, requestedModel: result.requestedModel, resolvedModelSnapshot: result.resolvedModel, adapterVersion: result.adapterVersion, task: input.task, questionVersion: result.questionVersion, contextVersion: result.contextVersion, criteriaRubricVersion: result.criteriaRubricVersion, datasetVersion: 'synthetic-fixture-only', metric: 'top_probability', thresholds: { outside_profile: .98 }, validation: { sampleCount: 100, falseExclusions: 0, reviewedBy: ['synthetic-reviewer-1', 'synthetic-reviewer-2'], evidenceReference: 'synthetic integration fixture; not a real benchmark' }, confirmApproval: true });
            expect(await decideRadarAction(f.pool, admin, input, deps)).toMatchObject({ action: 'exclude', effectiveMode: 'auto_exclude' });
            expect(await decideRadarAction(f.pool, admin, { ...input, humanReviewed: true }, deps)).toMatchObject({ action: 'continue' });
            expect((await f.pool.query('SELECT * FROM radar_analysis_receipts WHERE request_id LIKE $1', [`${run.id}:%`])).rows).toHaveLength(1);
            const rls = await f.pool.connect();
            try {
                await rls.query('BEGIN');
                await rls.query('SET LOCAL ROLE yux_api');
                await rls.query("SELECT set_config('app.current_role','client_admin',true)");
                expect((await rls.query('SELECT * FROM radar_decision_calibrations')).rows).toEqual([]);
            }
            finally {
                await rls.query('ROLLBACK');
                rls.release();
            }
            await f.pool.query('UPDATE radar_candidate_records SET normalized_payload=normalized_payload||$2::jsonb WHERE id=$1', [candidate.id, JSON.stringify({ decisionExclusion: { active: true, revision: 1, reason: 'outside_profile', runId: run.id } })]);
            expect(await restoreRadarDecisionExclusion(f.pool, admin, candidate.id)).toMatchObject({ status: 'restored' });
            expect((await f.pool.query('SELECT normalized_payload FROM radar_candidate_records WHERE id=$1', [candidate.id])).rows[0].normalized_payload).toMatchObject({ manualDecisionOverride: true, websiteUrl: 'https://empresa.example/', decisionExclusion: { active: false, runId: run.id } });
            route = await upsertAdminLlmRoute(f.pool, { ...route, id: routeId!, kind: 'decision', protocol: 'openrouter-decisions-alpha-v1', modelName: 'fixture/primary' } as never);
            expect(await decideRadarAction(f.pool, admin, input, deps)).toMatchObject({ action: 'continue', effectiveMode: 'observe' });
        }
        finally {
            const current = await getRadarOperationalLimits(f.pool, admin);
            await updateRadarOperationalLimits(f.pool, admin, { expectedVersion: current.version, limits: policy.limits, costPolicy: policy.costPolicy });
            if (routeId) {
                await f.pool.query('DELETE FROM radar_decision_calibrations WHERE route_id=$1', [routeId]);
                await f.pool.query('DELETE FROM model_routing_rules WHERE id=$1', [routeId]);
            }
            await f.pool.query("DELETE FROM radar_analysis_receipts WHERE organization_id=$1 AND action IN('radar_initial_triage','radar_next_action','radar_quality_gate')", [organizationId]);
            await f.close();
        }
    }, 30000);
});
