import type { DecisionContextV1, DecisionResultV1 } from './decision-contracts.js';
export type RadarDecisionCalibration = {
    provider: string;
    upstreamProvider?: string;
    requestedModel: string;
    resolvedModelSnapshot: string;
    adapterVersion: string;
    task: string;
    questionVersion: string;
    contextVersion: string;
    criteriaRubricVersion: string;
    datasetVersion: string;
    routeFingerprint: string;
    approvedAt: string | null;
    metric: 'top_probability' | 'confidence';
    thresholds: Record<string, number>;
};
export type RadarDecisionPolicy = {
    enabled: boolean;
    requestedMode: 'observe' | 'route' | 'auto_exclude';
    routeFingerprint: string;
};
export function matchingRadarDecisionCalibration(context: Pick<DecisionContextV1, 'task'>, result: DecisionResultV1, policy: RadarDecisionPolicy, calibration: RadarDecisionCalibration | null) {
    return !!calibration?.approvedAt && !!calibration.datasetVersion && calibration.routeFingerprint === policy.routeFingerprint
        && calibration.provider === result.provider && calibration.upstreamProvider === result.upstreamProvider && calibration.task === context.task && calibration.requestedModel === result.requestedModel && calibration.resolvedModelSnapshot === result.resolvedModel
        && calibration.adapterVersion === result.adapterVersion && calibration.questionVersion === result.questionVersion && calibration.contextVersion === result.contextVersion && calibration.criteriaRubricVersion === result.criteriaRubricVersion;
}
export function evaluateRadarDecision(context: DecisionContextV1, result: DecisionResultV1, policy: RadarDecisionPolicy, calibration: RadarDecisionCalibration | null) {
    const matched = matchingRadarDecisionCalibration(context, result, policy, calibration), effectiveMode = policy.enabled && matched ? policy.requestedMode : 'observe';
    const threshold = matched && result.choice ? calibration!.thresholds[result.choice] ?? null : null;
    const score = result.choice ? (calibration?.metric === 'confidence' ? result.confidence : result.probabilities?.[result.choice]) : null;
    const evidenceIds = result.evidenceIds.filter(id => context.evidence.some(item => item.id === id)), base = { action: 'continue', reasonCode: result.reasonCode, evidenceIds, effectiveMode, threshold };
    if (!policy.enabled || effectiveMode === 'observe' || context.humanReviewed || result.status !== 'decided' || threshold === null || typeof score !== 'number' || score < threshold)
        return base;
    if (context.task === 'radar_initial_triage' && effectiveMode === 'auto_exclude' && result.choice === 'outside_profile' && result.reasonCode === 'outside_activity'
        && evidenceIds.some(id => context.evidence.some(item => item.id === id && item.primary && item.scope === 'establishment')))
        return { ...base, action: 'exclude' };
    if (context.task === 'radar_next_action' && result.choice && context.options.some(item => item.id === result.choice) && result.reasonCode === 'action_selected')
        return { ...base, action: result.choice };
    // A decision can flag review, never bypass deterministic identity/contact/fit requirements.
    if (context.task === 'radar_quality_gate' && result.choice === 'review')
        return { ...base, action: 'review' };
    return base;
}
