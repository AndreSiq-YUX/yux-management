import { z } from 'zod';
import type pg from 'pg';
import type { AuthUser } from '../../auth/routes.js';
import type { RadarDecisionCalibration } from './decision-policy.js';
import { decisionTaskSchema } from './decision-contracts.js';
const version = z.string().min(1).max(200);
export const decisionCalibrationSchema = z.object({ routeId: z.uuid(), routeFingerprint: z.string().regex(/^[a-f0-9]{64}$/), provider: z.literal('openrouter'), upstreamProvider: version, requestedModel: version, resolvedModelSnapshot: version, adapterVersion: z.literal('openrouter-decisions-alpha-v1'), task: decisionTaskSchema, questionVersion: z.literal('radar-decisions-questions-v1'), contextVersion: z.literal('radar-decision-context-v1'), criteriaRubricVersion: z.literal('radar-decisions-rubric-v1'), datasetVersion: version,
    metric: z.enum(['top_probability', 'confidence']), thresholds: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,79}$/), z.number().finite().min(0).max(1)),
    validation: z.object({ sampleCount: z.number().int().min(100), falseExclusions: z.number().int().nonnegative(), reviewedBy: z.array(z.string().min(1).max(200)).min(2).max(10), evidenceReference: z.string().min(1).max(2000) }).strict(), confirmApproval: z.literal(true),
}).strict();
const admin = (user: AuthUser) => { if (user.role !== 'yux_admin')
    throw Object.assign(Error('radar_decision_admin_required'), { statusCode: 403 }); };
export async function listRadarDecisionCalibrations(db: Pick<pg.Pool, 'query'>, user: AuthUser) { admin(user); return (await db.query('SELECT id,route_id AS "routeId",route_fingerprint AS "routeFingerprint",calibration,approved_at AS "approvedAt",approved_by AS "approvedBy" FROM public.radar_decision_calibrations ORDER BY approved_at DESC LIMIT 200')).rows; }
export async function approveRadarDecisionCalibration(db: Pick<pg.Pool, 'query'>, user: AuthUser, value: unknown) {
    admin(user);
    const parsed = decisionCalibrationSchema.safeParse(value);
    if (!parsed.success)
        throw Object.assign(Error('radar_decision_calibration_invalid'), { statusCode: 400 });
    const input = parsed.data;
    if (!Object.keys(input.thresholds).length || input.validation.falseExclusions > input.validation.sampleCount || new Set(input.validation.reviewedBy).size < 2)
        throw Object.assign(Error('radar_decision_calibration_invalid'), { statusCode: 400 });
    const { confirmApproval: _confirm, ...calibration } = input;
    return (await db.query(`INSERT INTO public.radar_decision_calibrations(route_id,route_fingerprint,calibration,approved_by) VALUES($1,$2,$3,$4) RETURNING id,approved_at AS "approvedAt"`, [input.routeId, input.routeFingerprint, JSON.stringify(calibration), user.id])).rows[0];
}
export async function loadRadarDecisionCalibrations(db: Pick<pg.Pool, 'query'>, routeId: string, routeFingerprint: string): Promise<RadarDecisionCalibration[]> {
    const rows = (await db.query('SELECT calibration,approved_at FROM public.radar_decision_calibrations WHERE route_id=$1 AND route_fingerprint=$2 AND approved_at IS NOT NULL ORDER BY approved_at DESC,id DESC', [routeId, routeFingerprint])).rows;
    return rows.map(row => ({ ...row.calibration, approvedAt: new Date(row.approved_at).toISOString() }));
}
