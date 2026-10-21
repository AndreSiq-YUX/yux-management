import { expect, it } from 'vitest';
const api = await import('../src/modules/radar/presence-refresh.js').catch(() => ({})) as Record<string, any>;
const previous = { status: 'completed', evidenceHash: 'old', evidenceVersion: { hashVersion: 2 }, requestId: 'paid-old', result: { site: 'saved' }, costEstimate: { amountBrl: '.01' } };
it('allows one automatic presence refresh for genuinely new evidence and preserves paid history', () => {
    const result = api.planRadarPresenceRefresh({ enabled: true, previous, evidenceHash: 'new', maximum: 2 });
    expect(result.allowed).toBe(true);
    expect(result.history).toEqual([previous]);
    expect(api.planRadarPresenceRefresh({ enabled: true, previous: { ...previous, evidenceHash: 'new', previous: result.history }, evidenceHash: 'newer', maximum: 2 })).toMatchObject({ allowed: false, reason: 'radar_presence_resolution_limit_reached' });
});
it('never repurchases an unchanged, uncertain or unversioned legacy response automatically', () => {
    expect(api.planRadarPresenceRefresh({ enabled: true, previous, evidenceHash: 'old', maximum: 2 }).allowed).toBe(false);
    expect(api.planRadarPresenceRefresh({ enabled: true, previous: { ...previous, status: 'uncertain' }, evidenceHash: 'new', maximum: 2 }).allowed).toBe(false);
    expect(api.planRadarPresenceRefresh({ enabled: true, previous: { ...previous, evidenceVersion: undefined }, evidenceHash: 'new', maximum: 2 }).allowed).toBe(false);
    expect(api.planRadarPresenceRefresh({ enabled: false, previous, evidenceHash: 'new', maximum: 2 }).allowed).toBe(false);
});
