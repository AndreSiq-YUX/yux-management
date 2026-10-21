import type { DecisionContextV1, DecisionResultV1 } from './decision-contracts.js';

export type RadarAiGate = 'g1' | 'g5';
export type RadarGateBinding = {
    campaignId: string;
    configurationRevision: number;
    targetsHash: string;
    criteriaHash: string;
    routeFingerprint: string;
    provider: string;
    upstreamProvider: string;
    requestedModel: string;
    resolvedModelSnapshot: string;
    adapterVersion: string;
    contextVersion: string;
    questionVersion: string;
    rubricVersion: string;
};
export type RadarCampaignGateCalibration = RadarGateBinding & {
    gate: RadarAiGate;
    status: 'draft' | 'approved' | 'superseded' | 'auto_shadowed';
    threshold: number | null;
};
export type RadarFunnelOverride = {
    gate: 'g0' | RadarAiGate;
    configurationRevision: number;
    by?: string;
    reason?: string;
    at?: string;
};
const bindingKeys = ['campaignId', 'configurationRevision', 'targetsHash', 'criteriaHash', 'routeFingerprint', 'provider',
    'upstreamProvider', 'requestedModel', 'resolvedModelSnapshot', 'adapterVersion', 'contextVersion',
    'questionVersion', 'rubricVersion'] as const;

/** Model probabilities are not transferable, including across fallback providers. */
export function matchesRadarGateCalibration(binding: RadarGateBinding, calibration: RadarCampaignGateCalibration | null | undefined, gate: RadarAiGate): boolean {
    return !!calibration && calibration.gate === gate && bindingKeys.every(key => binding[key] !== '' && binding[key] === calibration[key]);
}
export function resolveRadarGateMode(input: {
    requestedMode: 'off' | 'shadow' | 'enforce';
    gate: RadarAiGate;
    binding: RadarGateBinding;
    calibration?: RadarCampaignGateCalibration | null;
}) {
    if (input.requestedMode === 'off') return { mode: 'off' as const, threshold: null };
    const current = matchesRadarGateCalibration(input.binding, input.calibration, input.gate);
    const threshold = current ? input.calibration?.threshold ?? null : null;
    return {
        mode: input.requestedMode === 'enforce' && current && input.calibration?.status === 'approved' && threshold !== null ? 'enforce' as const : 'shadow' as const,
        threshold,
    };
}
export function radarFunnelOutsideEvidenceSupported(input:{gate:RadarAiGate;result:Pick<DecisionResultV1,'choice'|'reasonCode'|'evidenceIds'>;evidence:DecisionContextV1['evidence'];hasConfirmedSite?:boolean}){
    const validReason=input.gate==='g1'?['outside_activity','registry_activity_mismatch','registry_name_mismatch'].includes(input.result.reasonCode):input.result.reasonCode==='outside_activity';
    return input.result.choice==='outside_profile'&&validReason&&(input.gate!=='g5'||input.hasConfirmedSite===true)&&input.evidence.some(item=>input.result.evidenceIds.includes(item.id)&&item.primary&&item.scope==='establishment'&&!item.contradictory&&(input.gate==='g1'?item.role==='registry':item.role==='activity'));
}

export function evaluateRadarFunnelGate(input: {
    gate: RadarAiGate;
    requestedMode: 'off' | 'shadow' | 'enforce';
    binding: RadarGateBinding;
    calibration?: RadarCampaignGateCalibration | null;
    result: Pick<DecisionResultV1, 'status' | 'choice' | 'reasonCode' | 'evidenceIds' | 'probabilities' | 'matchedTargetKey'>;
    evidence: DecisionContextV1['evidence'];
    hasConfirmedSite?: boolean;
    override?: RadarFunnelOverride | null;
}) {
    const { mode, threshold } = resolveRadarGateMode(input);
    const overridden = input.override?.gate === input.gate && input.override.configurationRevision === input.binding.configurationRevision;
    const cited = input.evidence.filter(item => input.result.evidenceIds.includes(item.id));
    // G5 must cite actual activity on the associated institutional site. A
    // fiscal entry cannot masquerade as a post-site observation.
    const primary = cited.some(item => item.primary && item.scope === 'establishment' && !item.contradictory &&
        (input.gate === 'g1' ? item.role === 'registry' : item.role === 'activity'));
    const evidenceSufficient = primary && (input.gate !== 'g5' || input.hasConfirmedSite === true);
    const probability = input.result.choice ? input.result.probabilities?.[input.result.choice] : undefined;
    const confident = input.result.status === 'decided' && threshold !== null && probability !== undefined && probability >= threshold;
    const wouldBlock = radarFunnelOutsideEvidenceSupported(input)&&confident;
    const weakFit = input.result.choice === 'weak_fit' && evidenceSufficient && confident;
    const action = !overridden && mode === 'enforce' ? wouldBlock ? 'exclude' : weakFit ? 'short_investigation' : 'continue' : 'continue';
    const matchedTargetKey = mode === 'enforce' && confident && evidenceSufficient && input.result.choice === 'compatible' ? input.result.matchedTargetKey : undefined;
    return { action, effectiveMode: mode, threshold, wouldBlock, overridden, matchedTargetKey, reasonCode: input.result.reasonCode, evidenceIds: cited.map(item => item.id) };
}
