import type pg from 'pg'
import type {AuthUser} from '../../auth/routes.js'
import {requireRadarScope} from './access.js'
import {resolveRadarSearchConfiguration} from './search-configuration.js'
import {radarQualityFromPayload,type RadarResearchQuality} from './research-quality.js'
import {projectRadarCompanyFacts} from './company-projection.js'
import {radarPublicPresenceFromDossier} from './public-presence.js'

export function summarizeRadarResearchMetrics(input:{companies:Array<{candidateId:string;quality:RadarResearchQuality}>;
  usage:Array<{sourceType:string;units:number;estimatedCostBrl:number}>;analyses:Array<{id:string;costUsd:number|null}>}){
  const companies=[...new Map(input.companies.map(item=>[item.candidateId,item])).values()]
  const analyses=[...new Map(input.analyses.map(item=>[item.id,item])).values()]
  const known=analyses.filter(item=>typeof item.costUsd==='number'&&Number.isFinite(item.costUsd)&&item.costUsd>=0)
  const amount=Math.round(input.usage.reduce((sum,item)=>sum+item.estimatedCostBrl,0)*1e6)/1e6
  const identified=companies.filter(item=>item.quality.identity==='associated').length,useful=companies.filter(item=>item.quality.contactability==='useful').length
  const ready=companies.filter(item=>item.quality.readyForReview).length
  return{companies:companies.length,identified,withUsefulContact:useful,readyForReview:ready,
    searchQueries:input.usage.reduce((sum,item)=>sum+item.units,0),searchEstimatedBrl:amount,sources:input.usage,
    searchCostPerCompanyBrl:companies.length?amount/companies.length:null,searchCostPerIdentityBrl:identified?amount/identified:null,searchCostPerUsefulContactBrl:useful?amount/useful:null,
    searchCostPerReadyForReviewBrl:ready?amount/ready:null,
    aiAnalyses:analyses.length,aiCostKnown:known.length,aiCostUnknown:analyses.length-known.length,aiReportedUsd:known.length?known.reduce((sum,item)=>sum+item.costUsd!,0):null}
}
export async function getRadarResearchMetrics(pool:pg.Pool,user:AuthUser,input:{organizationId:string;campaignId:string;from:string;to:string}){
  await requireRadarScope(pool,user,{organizationId:input.organizationId,campaignId:input.campaignId})
  const campaign=(await pool.query('SELECT configuration_revision,search_configuration FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2',[input.campaignId,input.organizationId])).rows[0]
  if(!campaign)throw Object.assign(Error('radar_campaign_not_found'),{statusCode:404})
  const params=[input.organizationId,input.campaignId,input.from,input.to]
  const [runRows,usageRows,receiptRows,analysisRows]=await Promise.all([
    pool.query(`SELECT DISTINCT ON(run.candidate_id) run.id,run.candidate_id,run.calls,run.configuration_revision,run.output,candidate.normalized_payload,candidate.title AS company_name
      FROM public.radar_candidate_research_runs run JOIN public.radar_candidate_records candidate ON candidate.id=run.candidate_id AND candidate.organization_id=run.organization_id
      WHERE run.organization_id=$1 AND run.campaign_id=$2 AND run.completed_at >= ($3::date::timestamp AT TIME ZONE 'UTC') AND run.completed_at < (($4::date+1)::timestamp AT TIME ZONE 'UTC')
      ORDER BY run.candidate_id,run.completed_at DESC,run.id DESC`,params),
    pool.query(`SELECT source_type,SUM(units) AS units,SUM(estimated_cost) AS cost FROM public.radar_source_usage_counters
      WHERE organization_id=$1 AND campaign_id=$2 AND usage_date BETWEEN $3::date AND $4::date GROUP BY source_type`,params),
    pool.query(`SELECT receipt.id,receipt.request_id,receipt.usage,receipt.status FROM public.radar_analysis_receipts receipt
      JOIN public.radar_candidate_research_runs run ON run.organization_id=receipt.organization_id AND run.id::text=split_part(receipt.request_id,':',1)
      WHERE receipt.organization_id=$1 AND run.campaign_id=$2 AND receipt.created_at>=($3::date::timestamp AT TIME ZONE 'UTC') AND receipt.created_at<(($4::date+1)::timestamp AT TIME ZONE 'UTC')`,params),
    pool.query(`SELECT run.id,run.calls FROM public.radar_candidate_research_runs run WHERE run.organization_id=$1 AND run.campaign_id=$2
      AND COALESCE(run.completed_at,run.updated_at)>=($3::date::timestamp AT TIME ZONE 'UTC') AND COALESCE(run.completed_at,run.updated_at)<(($4::date+1)::timestamp AT TIME ZONE 'UTC')`,params),
  ])
  const policy=resolveRadarSearchConfiguration(campaign.search_configuration).research
  const receiptIds=new Set(receiptRows.rows.map(row=>row.request_id))
  const analyses=receiptRows.rows.filter(row=>row.status!=='rejected_before_provider').map(row=>({id:row.request_id,costUsd:typeof row.usage?.costUsd==='number'?row.usage.costUsd:null}))
  for(const run of analysisRows.rows)for(const key of ['presence','semantic']){
    const call=run.calls?.[key]
    if(!call||call.status==='rejected_before_provider')continue
    const id=key==='presence'?`${run.id}:presence:${call.evidenceHash}`:`${run.id}:${call.evidenceHash}`
    if(!receiptIds.has(id))analyses.push({id,costUsd:null})
  }
  const result=summarizeRadarResearchMetrics({companies:runRows.rows.map(run=>{
    const name=String(run.normalized_payload?.tradeName||run.company_name||'')
    const presence=radarPublicPresenceFromDossier(run.output,run.configuration_revision,name?{name,legalName:typeof run.normalized_payload?.legalName==='string'?run.normalized_payload.legalName:undefined,cnpj:typeof run.normalized_payload?.cnpj==='string'?run.normalized_payload.cnpj:undefined}:undefined)
    const snapshot={...run.normalized_payload,researchRevision:run.configuration_revision,publicPresence:presence,externalReferences:presence?.externalReferences??[],
      websiteUrl:run.output?.discovery?.websiteUrl,siteFinalUrl:run.output?.discovery?.websiteUrl,websiteStatus:run.output?.siteAssociation==='confirmed'?'verified_present':'unknown',
      publicContacts:run.output?.contacts??[],sizeAssessment:run.output?.sizeAssessment,
      targetStatus:run.output?.qualification?.targetStatus??(run.normalized_payload.researchRunId===run.id?run.normalized_payload.targetStatus:'review'),
      productFit:run.output?.qualification?.productFit??run.output?.quality?.fit??'unknown'}
    return{candidateId:run.candidate_id,quality:radarQualityFromPayload(projectRadarCompanyFacts(snapshot),policy,campaign.configuration_revision)}
  }),
    usage:usageRows.rows.map(row=>({sourceType:row.source_type,units:Number(row.units),estimatedCostBrl:Number(row.cost)})),analyses})
  return{...result,period:{from:input.from,to:input.to,timeZone:'UTC'},currencyNote:'Buscas estimadas em BRL; IA é o subtotal informado em USD, pode estar incompleto e não inclui conversão cambial. Não substitui faturamento dos provedores.'}
}
