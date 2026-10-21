import type pg from 'pg';
/** Caller holds the campaign lock and has confirmed no live research lease.
 * Use only already-retained facts or the official reference catalog, never a
 * new registry lookup. Existing nonempty activity sets are not overwritten. */
export async function backfillRadarCampaignRegistryActivities(db:Pick<pg.Pool,'query'>,organizationId:string,campaignId:string){
 const result=await db.query(`WITH saved AS(
 SELECT candidate.id,CASE WHEN jsonb_typeof(raw_payload->'registryActivities')='array' AND jsonb_array_length(raw_payload->'registryActivities')>0 THEN raw_payload->'registryActivities'
 WHEN jsonb_typeof(raw_payload->'activities')='array' AND jsonb_array_length(raw_payload->'activities')>0 THEN raw_payload->'activities'
 ELSE (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('code',regexp_replace(item.code,'[^0-9]','','g'),'text',catalog.description,'main',item.ordinal=1)) ORDER BY item.ordinal) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(normalized_payload->'cnaes')='array' THEN normalized_payload->'cnaes' ELSE '[]'::jsonb END) WITH ORDINALITY item(code,ordinal) LEFT JOIN radar_cnae_catalog catalog ON catalog.code=regexp_replace(item.code,'[^0-9]','','g') WHERE item.code~'^[0-9][0-9/ -]*$') END AS activities
 FROM radar_candidate_records candidate WHERE organization_id=$1 AND campaign_id=$2 AND source_type='cnpja_advanced_search' AND (NOT(normalized_payload?'registryActivities') OR normalized_payload->'registryActivities'='[]'::jsonb))
 UPDATE radar_candidate_records candidate SET normalized_payload=jsonb_set(candidate.normalized_payload,'{registryActivities}',saved.activities),updated_at=NOW() FROM saved WHERE candidate.id=saved.id AND saved.activities IS NOT NULL AND saved.activities<>'[]'::jsonb`,[organizationId,campaignId]);
 return result.rowCount??0;
}
