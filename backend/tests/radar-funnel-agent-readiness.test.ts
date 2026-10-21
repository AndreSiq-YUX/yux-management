import { expect, it } from 'vitest';
const api = await import('../src/modules/radar/funnel-agent-readiness.js').catch(() => ({})) as Record<string, any>;
const route = { status: 'active', kind: 'research', provider: 'perplexity', protocol: 'perplexity-agent-v1', model_name: 'fixture/model', research_config: { enabled: true, allowEstimatedBudget: true, estimatedUsdPerAttempt: .03, budgetUsdPerResearch: .1, budgetUsdPerCampaign: 1 } };
const provider = { status: 'active', hasSecret: true, internal: false, publicConfig: { retentionLicensed: true, agentResearchLicensed: true, clientDeliveryLicensed: true } };
const base = { route, provider, fallbackLimit: 1, usedUsdCampaign: '0', costPolicy: { usdToBrl: '6', rateAsOf: '2026-10-21T12:00:00Z', rateSource: 'manual', marginPercent: '15' } };
it('offers the Agent only with a usable route, license, secret, converted estimate and remaining campaign budget', () => {
    expect(api.evaluateRadarFunnelAgentReadiness(base)).toMatchObject({ allowed: true, price: { amountBrl: '0.207' }, recoverOnly: false });
    expect(api.evaluateRadarFunnelAgentReadiness({ ...base, provider: { ...provider, publicConfig: {} } })).toMatchObject({ allowed: false });
    expect(api.evaluateRadarFunnelAgentReadiness({ ...base, route: undefined })).toMatchObject({ allowed: false });
    expect(api.evaluateRadarFunnelAgentReadiness({ ...base, usedUsdCampaign: '0.99' })).toMatchObject({ allowed: false });
    expect(api.evaluateRadarFunnelAgentReadiness({ ...base, costPolicy: { ...base.costPolicy, usdToBrl: null, rateAsOf: null } })).toMatchObject({ allowed: false });
});
it('always permits recovering an existing effect without implying a new purchase is eligible', () => {
    expect(api.evaluateRadarFunnelAgentReadiness({ ...base, route: undefined, hasExistingEffect: true })).toMatchObject({ allowed: true, recoverOnly: true });
});
it('includes the cumulative BRL cap in readiness without blocking receipt recovery', () => {
    expect(api.evaluateRadarFunnelAgentReadiness({ ...base, usedBrlCampaign: '0.8', budgetBrlCampaign: '1' })).toMatchObject({ allowed: false, reason: 'source_budget_exceeded' });
    expect(api.evaluateRadarFunnelAgentReadiness({ ...base, usedBrlCampaign: '0.793', budgetBrlCampaign: '1' })).toMatchObject({ allowed: true });
    expect(api.evaluateRadarFunnelAgentReadiness({ ...base, usedBrlCampaign: '20', budgetBrlCampaign: null })).toMatchObject({ allowed: true });
    expect(api.evaluateRadarFunnelAgentReadiness({ ...base, usedBrlCampaign: '20', budgetBrlCampaign: '0', hasExistingEffect: true })).toMatchObject({ allowed: true, recoverOnly: true });
});
