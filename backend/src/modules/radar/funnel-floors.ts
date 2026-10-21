import { z } from 'zod';
import type pg from 'pg';
import type { AuthUser } from '../../auth/routes.js';
import type { RadarFunnelPolicy } from './funnel-policy.js';

export const radarFunnelFloorsSchema = z.object({
    minPositiveSamples: z.number().int().min(20).safe(), minNegativeSamples: z.number().int().min(10).safe(),
    minHoldoutPositives: z.number().int().min(8).safe(), minHoldoutNegatives: z.number().int().min(5).safe(),
    minThreshold: z.number().min(.75).max(.99), minBlockPrecision: z.number().min(.95).max(1), maxFalseBlocksOnPositives: z.literal(0),
}).strict();
export async function loadRadarFunnelFloors(db: Pick<pg.Pool, 'query'>) {
    const row = (await db.query('SELECT version,configuration FROM public.radar_funnel_policy_floors WHERE singleton=TRUE')).rows[0];
    if (!row) throw Object.assign(Error('radar_funnel_floors_unavailable'), { statusCode: 503 });
    return { version: Number(row.version), configuration: radarFunnelFloorsSchema.parse(row.configuration) };
}
export function assertRadarFunnelFloors(policy: RadarFunnelPolicy, floors: z.infer<typeof radarFunnelFloorsSchema>) {
    for (const gate of ['g1', 'g5'] as const) {
        for (const key of ['minPositiveSamples', 'minNegativeSamples', 'minHoldoutPositives', 'minHoldoutNegatives', 'minThreshold', 'minBlockPrecision'] as const) {
            if (policy[gate].criteria[key] < floors[key]) throw Object.assign(Error('radar_campaign_below_funnel_floor'), { statusCode: 400 });
        }
    }
}
export async function saveRadarFunnelFloors(db: Pick<pg.Pool, 'query'>, user: AuthUser, value: unknown) {
    if (user.role !== 'yux_admin') throw Object.assign(Error('radar_source_admin_required'), { statusCode: 403 });
    const input = z.object({ expectedVersion: z.number().int().positive(), configuration: radarFunnelFloorsSchema }).strict().parse(value);
    const row = (await db.query(`UPDATE public.radar_funnel_policy_floors SET configuration=$2,version=version+1,updated_at=NOW() WHERE singleton=TRUE AND version=$1 RETURNING version,configuration`, [input.expectedVersion, JSON.stringify(input.configuration)])).rows[0];
    if (!row) throw Object.assign(Error('radar_funnel_floors_changed'), { statusCode: 409 });
    return { version: Number(row.version), configuration: radarFunnelFloorsSchema.parse(row.configuration) };
}
