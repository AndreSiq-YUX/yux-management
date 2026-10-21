import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { captureFixture, connectionString, admin, organizationId } from '../support/radar-capture-fixture.js';
const api = await import('../../src/modules/radar/gate-evaluation.js').catch(() => ({})) as Record<string, any>;
const route = { id: randomUUID(), version: 1, fingerprint: 'a'.repeat(64), routingKey: 'radar_initial_triage', attempts: [{ provider: 'openrouter', modelName: 'fixture/model' }], config: { enabled: true, mode: 'observe', maxAttempts: 1, timeoutSeconds: 10, deadlineSeconds: 30, maxInputTokens: 24000, modelPolicies: { 'fixture/model': { estimatedUsdPerAttempt: 0 } } } };
describe.skipIf(!connectionString)('campaign-scoped independent gate evaluation', () => {
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
