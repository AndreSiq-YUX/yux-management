import { expect, it } from 'vitest';
const api = await import('../src/modules/radar/gate-calibration.js').catch(() => ({})) as Record<string, any>;
const samples = Array.from({ length: 60 }, (_, index) => ({ candidateId: `company-${index}`, groupKey: `root-${index}`, label: index < 36 ? 'primary' : 'outside', reviewedBy: 'human' }));
it('freezes a deterministic stratified split and keeps related establishments together', () => {
    const input = [...samples, { ...samples[0], candidateId: 'branch-2' }];
    const first = api.partitionRadarGateDataset(input, 'seed', .34);
    expect(api.partitionRadarGateDataset([...input].reverse(), 'seed', .34)).toEqual(first);
    expect(first.find((s: any) => s.candidateId === 'branch-2').partition).toBe(first.find((s: any) => s.candidateId === 'company-0').partition);
    expect(first.filter((s: any) => s.partition === 'holdout' && s.label === 'primary').length).toBeGreaterThanOrEqual(10);
    expect(first.filter((s: any) => s.partition === 'holdout' && s.label === 'outside').length).toBeGreaterThanOrEqual(7);
});
it('never approves a threshold with a false block in the independent holdout', () => {
    const dataset = api.partitionRadarGateDataset(samples, 'seed', .34).map((sample: any) => ({ ...sample, probabilityOutside: sample.label === 'outside' ? .99 : sample.partition === 'holdout' ? .99 : .1 }));
    const evaluation = api.evaluateRadarGateCalibration(dataset, {});
    expect(evaluation.approvable).toBe(false);
    expect(evaluation.reasons).toContain('holdout_false_block');
});
it('uses tuning positives plus a margin, never holdout results, to select the threshold', () => {
    const dataset = api.partitionRadarGateDataset(samples, 'seed', .34).map((sample: any) => ({ ...sample, probabilityOutside: sample.label === 'outside' ? .99 : .85 }));
    const evaluation = api.evaluateRadarGateCalibration(dataset, {});
    expect(evaluation.threshold).toBeCloseTo(.9);
    expect(evaluation.approvable).toBe(true);
    expect(evaluation.holdout.falseBlocks).toBe(0);
    expect(evaluation.warnings).toContain('small_independent_test_set');
});
it('refuses missing responses, contradictory group labels, and recalibration from an incomplete dataset', () => {
    expect(() => api.partitionRadarGateDataset([...samples, { ...samples[0], label: 'outside', candidateId: 'conflict' }], 'seed', .34)).toThrow('radar_calibration_group_label_conflict');
    const evaluation = api.evaluateRadarGateCalibration(api.partitionRadarGateDataset(samples, 'seed', .34), {});
    expect(evaluation.approvable).toBe(false);
    expect(evaluation.reasons).toContain('incomplete_evaluation');
});
