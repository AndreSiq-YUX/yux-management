import { expect, it, vi } from 'vitest';
import type pg from 'pg';
import { loadRadarDecisionRoute, radarDecisionPrice, radarInitialObservationReserve, radarDecisionStageCapacity } from '../src/modules/radar/decision-service.js';
const tenant = { organizationId: 'org', clientId: 'client', contractId: 'contract' };
const row = (patch: Record<string, unknown> = {}) => ({ id: 'route', version: '1', agent_type: 'radar_decision_default', routing_tier: 'default', status: 'active', kind: 'decision', protocol: 'openrouter-decisions-alpha-v1', provider: 'openrouter', model_name: 'fixture/primary', fallback_routes: [], decision_config: { enabled: true, mode: 'observe', maxAttempts: 2, modelPolicies: { 'fixture/primary': { estimatedUsdPerAttempt: 1e-15 }, 'fixture/reserve': { estimatedUsdPerAttempt: 1e-15 } } }, ...patch });
const db = (rows: Record<string, unknown>[]) => ({ query: vi.fn(async () => ({ rows })) }) as unknown as pg.Pool;
it.each([
    ['effective','shadow',2], ['effective','enforce',2], ['off','enforce',1], ['off','shadow',1],
])('reserves only the minimum downstream decisions for G3=%s and G5=%s', (g3,g5,expected) => {
    expect(radarInitialObservationReserve({g3:{mode:g3},g5:{mode:g5}} as never)).toBe(expected);
});
it('reserves the sixth shared slot for the final observation rather than another G3 choice',()=>{
 const calls=Object.fromEntries(Array.from({length:5},(_,i)=>[`d${i}`,{source:'openrouter_decision',round:0,context:{task:i===0?'radar_initial_triage':'radar_next_action'}}]));
 const funnel={enabled:true,g1:{mode:'shadow'},g3:{mode:'effective'},g5:{mode:'shadow'}} as never;
 expect(radarDecisionStageCapacity({task:'radar_next_action',calls,funnel,maximum:6,round:0})).toEqual({allowed:false,reason:'decision_final_capacity_reserved',reservedForFinal:1});
 expect(radarDecisionStageCapacity({task:'radar_fit_gate',calls,funnel,maximum:6,round:0})).toMatchObject({allowed:true});
 expect(radarDecisionStageCapacity({task:'radar_fit_gate',calls:{...calls,last:{source:'openrouter_decision',round:0}},funnel,maximum:6,round:0})).toMatchObject({allowed:false,reason:'decision_limit_reached'});
});
it('counts only an explicitly selected recovery round while retaining the old paid effects',()=>{
 const calls={old:{source:'openrouter_decision',context:{task:'radar_next_action'}},current:{source:'openrouter_decision',round:1,context:{task:'radar_initial_triage'}},search:{source:'serper_web_search'}};
 expect(radarDecisionStageCapacity({task:'radar_fit_gate',calls,maximum:2,round:0})).toMatchObject({allowed:true});
 expect(radarDecisionStageCapacity({task:'radar_fit_gate',calls,maximum:2,round:1})).toMatchObject({allowed:true});
 expect(radarDecisionStageCapacity({task:'radar_quality_gate',calls,maximum:1,round:0})).toMatchObject({allowed:false,reason:'decision_limit_reached'});
});
it('resolves a scoped principal, scoped fallbacks and compatible reserves only, with an exact version fingerprint', async () => {
    const primary = row({ id: 'scoped', organization_id: 'org', agent_type: 'radar_initial_triage', fallback_routes: [{ provider: 'openrouter', modelName: 'fixture/manual' }] }), general = row({ id: 'general', agent_type: 'radar_initial_triage', model_name: 'fixture/general' }), reserve = row({ id: 'reserve', model_name: 'fixture/reserve' });
    const route = await loadRadarDecisionRoute(db([general, reserve, primary]), 'radar_initial_triage', tenant);
    expect(route?.attempts.map(item => item.modelName)).toEqual(['fixture/primary', 'fixture/manual', 'fixture/general', 'fixture/reserve']);
    expect((await loadRadarDecisionRoute(db([general, reserve, { ...primary, version: '2' }]), 'radar_initial_triage', tenant))?.fingerprint).not.toBe(route?.fingerprint);
    await expect(loadRadarDecisionRoute(db([{ ...primary, status: 'paused' }, reserve]), 'radar_initial_triage', tenant)).rejects.toThrow('llm_route_not_active');
    expect(await loadRadarDecisionRoute(db([row({ agent_type: 'global_llm', kind: 'chat' })]), 'radar_initial_triage', tenant)).toBeNull();
});
it('does not round tiny configured prices to zero and keeps unknown price distinct from free', async () => {
    const route = (await loadRadarDecisionRoute(db([row({ fallback_routes: [{ provider: 'openrouter', modelName: 'fixture/reserve' }] })]), 'radar_initial_triage', tenant))!;
    const fx = { usdToBrl: '5', rateAsOf: '2026-10-19T12:00:00Z', rateSource: 'manual' as const, marginPercent: '0' };
    expect(radarDecisionPrice(route, 1, fx)).toMatchObject({ originalAmount: '0.000000000000002', amountBrl: '0.00000000000001' });
    delete route.config.modelPolicies['fixture/reserve'];
    expect(radarDecisionPrice(route, 1, fx)).toMatchObject({ amountBrl: null, reason: 'radar_cost_unknown' });
});
