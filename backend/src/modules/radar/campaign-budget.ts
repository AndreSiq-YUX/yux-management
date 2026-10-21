import type pg from 'pg';
import {addRadarDecimal, compareRadarDecimal} from './cost-conversion.js';

/** Cumulative BRL reservations/settlements across every source and every day.
 * Callers reserving money must hold the campaign row lock until reservation. */
export async function loadRadarCampaignSpendBrl(db: Pick<pg.Pool, 'query'>, organizationId: string, campaignId: string): Promise<string> {
    const result = await db.query(`SELECT COALESCE(SUM(estimated_cost),0) AS cost FROM public.radar_source_usage_counters WHERE organization_id=$1 AND campaign_id=$2`, [organizationId, campaignId]);
    return String(result.rows[0]?.cost ?? 0);
}
export function radarCampaignBudgetAllows(spent: string, reserved: string, limit: string | number | null | undefined): boolean {
    return limit === null || limit === undefined || compareRadarDecimal(addRadarDecimal(spent, reserved), String(limit)) <= 0;
}
