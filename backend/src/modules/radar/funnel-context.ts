import type { DecisionContextV1, DecisionResultV1 } from './decision-contracts.js';
import type { RadarSearchConfiguration } from './search-configuration.js';
import type { RadarBusinessIdentity } from './site-discovery.js';
import type { RadarSiteEvidence } from './site-evidence.js';
import { radarDecisionHash } from './decision-service.js';
import { buildRadarRegistryEvidence } from './registry-evidence.js';
import { isRadarInstitutionalSource } from './source-identity.js';
import { extractRadarCnpjIdentifiers, normalizeRadarCnpjIdentifier } from './cnpj-identifier.js';
import type { RadarGateBinding } from './funnel-gates.js';

export const RADAR_FUNNEL_VERSIONS = {
    contextVersion: 'radar-decision-context-v2' as const,
    questionVersion: 'radar-decisions-questions-v2' as const,
    rubricVersion: 'radar-decisions-rubric-v2' as const,
    adapterVersion: 'openrouter-decisions-alpha-v1' as const,
};
export function radarFunnelTargetsHash(config: RadarSearchConfiguration, targetCnaes: string[] = []) {
    return radarDecisionHash({ targets: config.qualification.targets, outOfScopeExamples: config.qualification.outOfScopeExamples,
        registry: config.qualification.registry, targetCnaes, excludedNameTerms: config.excludedNameTerms });
}
export function radarFunnelDecisionCriteria(config: RadarSearchConfiguration, campaign: {
    target_segment?: string; offer_type?: string; product_focus?: string[]; target_cnaes?: string[];
}): DecisionContextV1['criteria'] {
    return { segment: campaign.target_segment, offer: campaign.offer_type, products: campaign.product_focus,
        targets: config.qualification.targets, outOfScopeExamples: config.qualification.outOfScopeExamples,
        includeTerms: config.qualification.includeAnyTerms, includeAllTerms: config.qualification.includeAllTerms,
        excludeTerms: config.qualification.excludeTerms, desiredCnaes: campaign.target_cnaes,
        cnaeRule: config.qualification.requireCnaeMatch ? 'required' : 'advisory',
        requiredContacts: config.research.completion.contactTypes, minimumUsefulContacts: String(config.research.completion.minimumUsefulContacts), contactPurpose: config.research.contactPurpose };
}
export function buildRadarFunnelEvidence(input: {
    identity: RadarBusinessIdentity; registryPayload: Record<string, unknown>; targetCnaes: string[];
    flags?: string[]; pages: RadarSiteEvidence[]; associatedWebsite?: string;
}): DecisionContextV1['evidence'] {
    const registry = buildRadarRegistryEvidence(input.registryPayload, input.targetCnaes, input.flags ?? []);
    const cnpj = normalizeRadarCnpjIdentifier(input.identity.cnpj);
    return [...(registry ? [registry] : []), ...input.pages.filter(page => !!page.text && !page.limitation).slice(0, 29).map(page => {
        const contradiction = !!cnpj && extractRadarCnpjIdentifiers(page.text).some(found => found !== cnpj);
        let associated = false;
        try { associated = !!input.associatedWebsite && new URL(input.associatedWebsite).origin === new URL(page.url).origin; } catch { /* An invalid URL cannot support a block. */ }
        const institutional = isRadarInstitutionalSource(page.url, { text: page.text, html: page.html });
        return { id: `ev_${radarDecisionHash({ url: page.url, text: page.text }).slice(0, 24)}`, sourceUrl: page.url, text: page.text.slice(0, 20000), role: 'activity' as const,
            primary: institutional && associated, contradictory: contradiction, scope: institutional && associated && !contradiction ? 'establishment' as const : 'unresolved' as const };
    })];
}
export function radarGateBindingFromResult(input: {
    campaignId: string; configurationRevision: number; targetsHash: string; criteriaHash?:string; routeFingerprint: string; result: DecisionResultV1;
}): RadarGateBinding {
    const result = input.result;
    return { campaignId: input.campaignId, configurationRevision: input.configurationRevision, targetsHash: input.targetsHash, criteriaHash:input.criteriaHash??'', routeFingerprint: input.routeFingerprint,
        provider: result.provider ?? '', upstreamProvider: result.upstreamProvider ?? '', requestedModel: result.requestedModel ?? '', resolvedModelSnapshot: result.resolvedModel ?? '',
        adapterVersion: result.adapterVersion ?? '', contextVersion: result.contextVersion ?? '', questionVersion: result.questionVersion ?? '', rubricVersion: result.criteriaRubricVersion ?? '' };
}
