import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { captureFixture, connectionString, admin, organizationId, available, company } from '../support/radar-capture-fixture.js';
import { startRadarCaptureOperation, getRadarCaptureOperation } from '../../src/modules/radar/capture-operation.js';
import { advanceRadarCaptureDiscovery } from '../../src/modules/radar/capture-discovery.js';
const api = await import('../../src/modules/radar/funnel-controls.js').catch(() => ({})) as Record<string, any>;
describe.skipIf(!connectionString)('funnel administrative controls', () => {
    it('closes a legacy lot as immutable history without deleting companies, items or receipts', async () => {
        const f = await captureFixture();
        try {
            const lot = await startRadarCaptureOperation(f.pool, admin, { organizationId, campaignId: f.campaign.id, configurationRevision: 1, requestedCount: 2, requestId: randomUUID() }, { availability: available });
            await advanceRadarCaptureDiscovery(f.pool, {} as never, { organizationId, operationId: lot.operationId }, { availability: available, loadSecret: async () => 'fixture', searchPage: async () => ({ candidates: [company()] }) });
            const before = (await getRadarCaptureOperation(f.pool, admin, organizationId, lot.operationId)).items;
            expect(await api.closeRadarLegacyLots(f.pool, admin, { organizationId, campaignId: f.campaign.id, configurationRevision: 1, confirmClose: true })).toMatchObject({ closedLots: 1 });
            expect((await getRadarCaptureOperation(f.pool, admin, organizationId, lot.operationId)).items).toEqual(before);
            expect((await f.pool.query('SELECT historical_closed_at FROM radar_capture_operations WHERE id=$1', [lot.operationId])).rows[0].historical_closed_at).not.toBeNull();
            expect((await getRadarCaptureOperation(f.pool, admin, organizationId, lot.operationId)).canContinue).toBe(false);
            await f.pool.query('UPDATE radar_campaigns SET configuration_revision=2 WHERE id=$1',[f.campaign.id]);
            await expect(advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:lot.operationId},{availability:available})).rejects.toThrow('radar_historical_capture_closed');
            expect((await f.pool.query('SELECT status,discovery_reason FROM radar_capture_operations WHERE id=$1',[lot.operationId])).rows[0]).toEqual({status:'partial',discovery_reason:'historical_closed'});
        } finally { await f.close(); }
    }, 30000);
    it('only the global admin may edit technical modes, and enforce needs a campaign calibration', async () => {
        const f = await captureFixture();
        try {
            const input = { organizationId, campaignId: f.campaign.id, configurationRevision: 1, expectedPolicyVersion: 1, policy: { enabled: true, g1: { mode: 'enforce' } } };
            await expect(api.saveRadarCampaignFunnelPolicy(f.pool, { ...admin, role: 'client_admin' }, input)).rejects.toThrow('radar_source_admin_required');
            await expect(api.saveRadarCampaignFunnelPolicy(f.pool, admin, input)).rejects.toThrow('radar_campaign_calibration_required');
        } finally { await f.close(); }
    }, 30000);
});
