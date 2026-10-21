import { createHash } from 'node:crypto';
import { radarGateCriteriaSchema } from './funnel-policy.js';

export type RadarGateLabel = 'primary' | 'secondary' | 'outside' | 'doubt';
export type RadarGateSample = {
    candidateId: string;
    groupKey: string;
    label: RadarGateLabel;
    reviewedBy: string;
    eligibleForGate?:boolean;
};
export type RadarGatePartitionedSample = RadarGateSample & {
    partition: 'tune' | 'holdout';
    probabilityOutside?: number | null;
    eligibleOutside?:boolean;
};
const positive = (sample: RadarGateSample) => sample.label === 'primary' || sample.label === 'secondary';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** The seed and complete membership are saved before any model is evaluated.
 * Related establishments never appear on both sides of the independent test. */
export function partitionRadarGateDataset(samples: RadarGateSample[], seed: string, holdoutShare: number,fixed:ReadonlyMap<string,'tune'|'holdout'>=new Map()): RadarGatePartitionedSample[] {
    if (!seed || !Number.isFinite(holdoutShare) || holdoutShare < .1 || holdoutShare > .5) throw Error('radar_calibration_split_invalid');
    const groups = new Map<string, RadarGateSample[]>();
    const ids = new Set<string>();
    for (const sample of samples) {
        if (!sample.groupKey || !sample.reviewedBy?.trim() || ids.has(sample.candidateId)) throw Error('radar_calibration_dataset_invalid');
        ids.add(sample.candidateId);
        const group = groups.get(sample.groupKey) ?? [];
        if (group.some(item => positive(item) !== positive(sample) || (item.label === 'doubt') !== (sample.label === 'doubt'))) throw Error('radar_calibration_group_label_conflict');
        group.push(sample);
        groups.set(sample.groupKey, group);
    }
    const assignment = new Map<string, 'tune' | 'holdout'>();
    for (const stratum of ['positive', 'negative', 'doubt']) {
        const keys = [...groups].filter(([, group]) => (positive(group[0]) ? 'positive' : group[0].label === 'outside' ? 'negative' : 'doubt') === stratum)
            .map(([key]) => key).sort((a, b) => hash(`${seed}:${a}`).localeCompare(hash(`${seed}:${b}`)));
        const holdoutSize = Math.ceil(keys.length * holdoutShare);
        keys.forEach((key, index) => assignment.set(key, index < holdoutSize ? 'holdout' : 'tune'));
    }
    return samples.map(sample => ({ ...sample, partition: fixed.get(sample.groupKey)??assignment.get(sample.groupKey)! })).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}

function metrics(samples: RadarGatePartitionedSample[], threshold: number) {
    const positives = samples.filter(positive);
    const negatives = samples.filter(sample => sample.label === 'outside');
    const falseBlocks = positives.filter(sample => sample.eligibleOutside!==false&&(sample.probabilityOutside ?? -1) >= threshold).length;
    const correctBlocks = negatives.filter(sample => sample.eligibleOutside!==false&&(sample.probabilityOutside ?? -1) >= threshold).length;
    return {
        positives: positives.length, negatives: negatives.length, falseBlocks, correctBlocks,
        blockPrecision: correctBlocks + falseBlocks > 0 ? correctBlocks / (correctBlocks + falseBlocks) : 0,
        blockRecall: negatives.length > 0 ? correctBlocks / negatives.length : 0,
    };
}

export function evaluateRadarGateCalibration(dataset: RadarGatePartitionedSample[], criteriaValue: unknown) {
    const criteria = radarGateCriteriaSchema.parse(criteriaValue);
    const reasons: string[] = [];
    // Independent groups, not branch count, are the sample unit. Use the worst
    // positive / best negative score conservatively within each group.
    const grouped = new Map<string, RadarGatePartitionedSample>();
    for (const sample of dataset) {
        if(sample.eligibleForGate===false){reasons.push('ineligible_evaluation_population');continue;}
        if (sample.label === 'doubt') continue;
        const prior = grouped.get(sample.groupKey);
        if (prior && (prior.partition !== sample.partition || positive(prior) !== positive(sample))) throw Error('radar_calibration_partition_invalid');
        const p = sample.probabilityOutside;
        if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) reasons.push('incomplete_evaluation');
        const oldP = prior?.probabilityOutside;
        const probabilityOutside = oldP === undefined || oldP === null ? p : p === undefined || p === null ? null : positive(sample) ? Math.max(oldP, p) : Math.min(oldP, p);
        const eligibleOutside=prior?positive(sample)?prior.eligibleOutside!==false||sample.eligibleOutside!==false:prior.eligibleOutside!==false&&sample.eligibleOutside!==false:sample.eligibleOutside;
        grouped.set(sample.groupKey, { ...sample, probabilityOutside,eligibleOutside });
    }
    const samples = [...grouped.values()];
    const tune = samples.filter(sample => sample.partition === 'tune');
    const tuningPositive = tune.filter(positive);
    const maxPositive = Math.max(0, ...tuningPositive.map(sample => sample.probabilityOutside ?? 1));
    const threshold = Math.round(Math.max(criteria.minThreshold, maxPositive + criteria.thresholdMargin) * 1e12) / 1e12;
    const tuneMetrics = metrics(tune, threshold);
    const holdout = metrics(samples.filter(sample => sample.partition === 'holdout'), threshold);
    if (samples.filter(positive).length < criteria.minPositiveSamples) reasons.push('insufficient_positive_samples');
    if (samples.filter(sample => sample.label === 'outside').length < criteria.minNegativeSamples) reasons.push('insufficient_negative_samples');
    if (!tuningPositive.length || threshold > .99) reasons.push('no_safe_threshold');
    if (holdout.positives < criteria.minHoldoutPositives || holdout.negatives < criteria.minHoldoutNegatives) reasons.push('insufficient_holdout');
    if (holdout.falseBlocks > criteria.maxFalseBlocksOnPositives) reasons.push('holdout_false_block');
    if (holdout.blockPrecision < criteria.minBlockPrecision) reasons.push('holdout_precision_below_minimum');
    if (holdout.blockRecall < criteria.minBlockRecall) reasons.push('holdout_recall_below_minimum');
    return { threshold, tune: tuneMetrics, holdout, reasons: [...new Set(reasons)], approvable: reasons.length === 0,
        warnings: holdout.positives + holdout.negatives < 100 ? ['small_independent_test_set'] : [] };
}
