import type pg from 'pg';

/** A failed claim rolls back before provider access. Recover its predecessor
 * only with an unconsumed grant AND no protected receipt for that exact retry.
 * A missing receipt alone is never permission to replay an uncertain effect. */
export async function findRadarUnstartedAnalysisRetries(db:Pick<pg.Pool,'query'>,scope:{organizationId:string;campaignId:string;candidateId?:string;runId?:string}){
 return(await db.query(`SELECT receipt.id AS receipt_id,receipt.request_id AS previous_request_id,run.id AS run_id,
  run.candidate_id,run.configuration_revision,call.value AS current_call,call.value->>'requestId' AS current_request_id
  FROM public.radar_candidate_records candidate
  JOIN public.radar_campaigns campaign ON campaign.id=candidate.campaign_id AND campaign.organization_id=candidate.organization_id
  JOIN LATERAL(SELECT * FROM public.radar_candidate_research_runs execution WHERE execution.candidate_id=candidate.id AND execution.organization_id=candidate.organization_id ORDER BY execution.created_at DESC,execution.id DESC LIMIT 1) run ON TRUE
  CROSS JOIN LATERAL jsonb_each(run.calls) call
  JOIN public.radar_analysis_retry_authorizations grant_row ON grant_row.id::text=call.value->'retryAuthorization'->>'authorization_id'
   AND grant_row.organization_id=run.organization_id AND grant_row.campaign_id=run.campaign_id AND grant_row.candidate_id=run.candidate_id
   AND grant_row.configuration_revision=run.configuration_revision AND grant_row.policy_hash=call.value->'retryAuthorization'->>'policy_hash'
  JOIN public.radar_analysis_receipts receipt ON receipt.id=grant_row.previous_analysis_receipt_id AND receipt.organization_id=grant_row.organization_id AND receipt.action=grant_row.action
  WHERE candidate.organization_id=$1 AND candidate.campaign_id=$2 AND ($3::uuid IS NULL OR candidate.id=$3) AND ($4::uuid IS NULL OR run.id=$4)
   AND candidate.status='pending_review' AND run.configuration_revision=campaign.configuration_revision
   AND ($4::uuid IS NOT NULL OR run.status IN('partial','blocked','failed'))
   AND call.key IN('presence','semantic') AND grant_row.action=CASE call.key WHEN 'presence' THEN 'radar_presence_resolution' ELSE 'radar_business_qualification' END
   AND call.value->>'status'<>'completed' AND call.value->'previous'->>'requestId'=receipt.request_id
   AND call.value->>'requestId' IS NOT NULL AND grant_row.consumed_at IS NULL AND grant_row.consumed_by_analysis_receipt_id IS NULL
   AND receipt.status='uncertain'
   AND NOT EXISTS(SELECT 1 FROM public.radar_analysis_receipts attempted WHERE attempted.organization_id=run.organization_id AND attempted.action=grant_row.action AND attempted.request_id=call.value->>'requestId')
   AND NOT EXISTS(SELECT 1 FROM public.radar_b2b_reviews review WHERE review.organization_id=candidate.organization_id AND review.candidate_id=candidate.id AND review.approved_at IS NOT NULL)`,[scope.organizationId,scope.campaignId,scope.candidateId??null,scope.runId??null])).rows;
}
