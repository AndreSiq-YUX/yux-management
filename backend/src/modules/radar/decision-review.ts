import type pg from 'pg';
import type { AuthUser } from '../../auth/routes.js';
import { requireRadarScope } from './access.js';
export async function restoreRadarDecisionExclusion(pool: pg.Pool, user: AuthUser, candidateId: string) {
    await requireRadarScope(pool, user, { candidateId }, true);
    // Funnel overrides require a gate, revision and audited reason. A commercial
    // review request must not silently become the old global gate bypass.
    const requested=(await pool.query(`UPDATE public.radar_candidate_records SET normalized_payload=jsonb_set(normalized_payload,'{funnelReviewRequest}',jsonb_build_object('by',$2::text,'at',NOW())),updated_at=NOW() WHERE id=$1 AND status='pending_review' AND normalized_payload->'decisionExclusion'->>'active'='true' AND normalized_payload->'decisionExclusion'->>'gate' IN('g0','g1','g5') AND NOT EXISTS(SELECT 1 FROM public.radar_b2b_reviews review WHERE review.candidate_id=radar_candidate_records.id AND review.approved_at IS NOT NULL) RETURNING id`,[candidateId,user.id])).rows[0];
    if(requested)return{candidateId:requested.id,status:'review_requested'};
    const row = (await pool.query(`UPDATE public.radar_candidate_records SET normalized_payload=normalized_payload||jsonb_build_object('manualDecisionOverride',TRUE,'targetStatus','review','productFit','unknown','triageReasons',jsonb_build_array('Reincluída para revisão manual.'),'decisionExclusion',COALESCE(normalized_payload->'decisionExclusion','{}'::jsonb)||jsonb_build_object('active',FALSE,'restoredBy',$2::text,'restoredAt',NOW())),updated_at=NOW()
 WHERE id=$1 AND status='pending_review' AND normalized_payload->'decisionExclusion'->>'active'='true' AND NOT EXISTS(SELECT 1 FROM public.radar_b2b_reviews review WHERE review.candidate_id=radar_candidate_records.id AND review.approved_at IS NOT NULL) RETURNING id`, [candidateId, user.id])).rows[0];
    if (!row)
        throw Object.assign(Error('radar_candidate_not_excluded'), { statusCode: 409 });
    return { candidateId: row.id, status: 'restored' };
}
