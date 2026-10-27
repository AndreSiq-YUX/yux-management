import {listRadarCampaignExclusions,restoreRadarCampaignExclusion} from './campaign-exclusions.js';
import {isRadarSemanticallyOutside} from './semantic-eligibility.js';
import type pg from 'pg';
import type { AuthUser } from '../../auth/routes.js';
import { requireRadarScope } from './access.js';
import {reconcileRadarCaptureItems} from './capture-reconciliation.js';
export async function restoreRadarDecisionExclusion(pool: pg.Pool, user: AuthUser, candidateId: string) {
    await requireRadarScope(pool, user, { candidateId }, true);
    const initial=(await pool.query("SELECT organization_id,campaign_id FROM public.radar_candidate_records WHERE id=$1 AND status='discarded'",[candidateId])).rows[0];
    if(initial){
      const exclusions=await listRadarCampaignExclusions(pool,user,{organizationId:initial.organization_id,campaignId:initial.campaign_id});
      for(const item of exclusions.filter(item=>item.candidateId===candidateId))await restoreRadarCampaignExclusion(pool,user,{organizationId:initial.organization_id,campaignId:initial.campaign_id,exclusionId:item.id});
      if(exclusions.some(item=>item.candidateId===candidateId))return{candidateId,status:'restored'};

      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query('SELECT id FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[initial.campaign_id,initial.organization_id]);
        const restored=(await client.query(`UPDATE public.radar_candidate_records SET status='pending_review',normalized_payload=normalized_payload||jsonb_build_object('manualDiscardRestored',jsonb_build_object('by',$2::text,'at',NOW())),updated_at=NOW() WHERE id=$1 AND organization_id=$3 AND status='discarded' AND NOT EXISTS(SELECT 1 FROM public.radar_b2b_reviews review WHERE review.candidate_id=radar_candidate_records.id AND review.approved_at IS NOT NULL) RETURNING id`,[candidateId,user.id,initial.organization_id])).rows[0];
        if(!restored)throw Object.assign(Error('radar_candidate_not_excluded'),{statusCode:409});
        await reconcileRadarCaptureItems(client,{organizationId:initial.organization_id,candidateId});
        await client.query('COMMIT');return{candidateId,status:'restored'};
      }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
    }
    const semantic=(await pool.query(`SELECT candidate.organization_id, candidate.normalized_payload,run.id AS run_id,run.output,run.configuration_revision FROM public.radar_candidate_records candidate JOIN public.radar_campaigns campaign ON campaign.id=candidate.campaign_id AND campaign.organization_id=candidate.organization_id JOIN LATERAL(SELECT * FROM public.radar_candidate_research_runs research WHERE research.candidate_id=candidate.id AND research.organization_id=candidate.organization_id AND research.configuration_revision=campaign.configuration_revision AND research.status IN('partial','succeeded') ORDER BY research.created_at DESC,research.id DESC LIMIT 1) run ON TRUE WHERE candidate.id=$1 AND candidate.status='pending_review'`,[candidateId])).rows[0];
    if(semantic&&isRadarSemanticallyOutside(semantic.output)&&!['g0','g1','g5'].includes(semantic.normalized_payload?.decisionExclusion?.gate)){
      const restored=(await pool.query(`UPDATE public.radar_candidate_records SET normalized_payload=normalized_payload||jsonb_build_object('semanticReviewOverride',jsonb_build_object('runId',$2::text,'revision',$3::integer,'by',$4::text,'at',NOW()),'targetStatus','review','productFit','unknown','decisionExclusion',jsonb_build_object('active',FALSE)),updated_at=NOW() WHERE id=$1 AND organization_id=$5 AND status='pending_review' AND normalized_payload=$6::jsonb AND EXISTS(SELECT 1 FROM public.radar_campaigns campaign WHERE campaign.id=radar_candidate_records.campaign_id AND campaign.organization_id=$5 AND campaign.configuration_revision=$3) AND NOT EXISTS(SELECT 1 FROM public.radar_b2b_reviews review WHERE review.candidate_id=radar_candidate_records.id AND review.approved_at IS NOT NULL) RETURNING id`,[candidateId,semantic.run_id,semantic.configuration_revision,user.id,semantic.organization_id,JSON.stringify(semantic.normalized_payload)])).rows[0];
      if(!restored)throw Object.assign(Error('radar_campaign_configuration_changed'),{statusCode:409});
      return{candidateId,status:'restored'};
    }
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
