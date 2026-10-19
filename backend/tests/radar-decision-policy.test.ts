import { expect, it } from 'vitest';
const api = await import('../src/modules/radar/decision-policy.js');
const context = { task: 'radar_initial_triage', options: [], evidence: [{ id: 'e1', sourceUrl: 'https://empresa.example/', text: 'Atividade comprovada', primary: true, scope: 'establishment' }], humanReviewed: false };
const result = { status: 'decided', choice: 'outside_profile', reasonCode: 'outside_activity', evidenceIds: ['e1'], probabilities: { outside_profile: .99, investigate: .01 }, confidence: .97, provider: 'openrouter', requestedModel: 'fixture/jev', resolvedModel: 'fixture/jev-1', adapterVersion: 'openrouter-decisions-alpha-v1', contextVersion: 'radar-decision-context-v1', questionVersion: 'radar-decisions-questions-v1', criteriaRubricVersion: 'radar-decisions-rubric-v1' };
const calibration = { provider: result.provider, requestedModel: result.requestedModel, resolvedModelSnapshot: result.resolvedModel, adapterVersion: result.adapterVersion, task: context.task, questionVersion: result.questionVersion, contextVersion: result.contextVersion, criteriaRubricVersion: result.criteriaRubricVersion, datasetVersion: 'human-v1', routeFingerprint: 'route-v1', approvedAt: '2026-10-19T10:00:00Z', metric: 'top_probability', thresholds: { outside_profile: .98 } };
it('has no shared threshold or automatic exclusion without exact model/snapshot/context calibration', () => {
    for (const changed of [{}, { requestedModel: 'fixture/luna' }, { resolvedModel: 'fixture/jev-2' }, { contextVersion: 'radar-decision-context-v2' }]) {
        const verdict = api.evaluateRadarDecision(context as never, { ...result, ...changed } as never, { enabled: true, requestedMode: 'auto_exclude', routeFingerprint: 'route-v1' } as never, Object.keys(changed).length ? calibration as never : null);
        expect(verdict).toMatchObject({ effectiveMode: 'observe', action: 'continue', threshold: null });
    }
});
it('requires literal supplied evidence, calibrated probability, appropriate reason and no human correction before reversible exclusion', () => {
    const policy = { enabled: true, requestedMode: 'auto_exclude', routeFingerprint: 'route-v1' };
    expect(api.evaluateRadarDecision(context as never, result as never, policy as never, calibration as never)).toMatchObject({ action: 'exclude', effectiveMode: 'auto_exclude', threshold: .98, evidenceIds: ['e1'] });
    for (const changed of [{ reasonCode: 'more_evidence_needed' }, { evidenceIds: ['invented'] }, { probabilities: { outside_profile: .5, investigate: .5 } }])
        expect(api.evaluateRadarDecision(context as never, { ...result, ...changed } as never, policy as never, calibration as never).action).toBe('continue');
    expect(api.evaluateRadarDecision({ ...context, humanReviewed: true } as never, result as never, policy as never, calibration as never).action).toBe('continue');
});
it('can choose only an already eligible action and never approve quality or buy an invented tool', () => {
    const c = { ...context, task: 'radar_next_action', options: [{ id: 'read_site', description: 'Ler página elegível' }] }, r = { ...result, task: c.task, choice: 'read_site', reasonCode: 'action_selected', probabilities: { read_site: .99, investigate: .01 } }, p = { enabled: true, requestedMode: 'route', routeFingerprint: 'route-v1' }, k = { ...calibration, task: c.task, thresholds: { read_site: .95 } };
    expect(api.evaluateRadarDecision(c as never, r as never, p as never, k as never)).toMatchObject({ action: 'read_site' });
    expect(api.evaluateRadarDecision(c as never, { ...r, choice: 'invented_tool' } as never, p as never, k as never).action).toBe('continue');
    expect(api.evaluateRadarDecision({ ...c, task: 'radar_quality_gate' } as never, { ...r, choice: 'ready' } as never, p as never, { ...k, task: 'radar_quality_gate', thresholds: { ready: .9 } } as never).action).toBe('continue');
});
