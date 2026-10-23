import type pg from 'pg'
import { radarCapabilityInputSchemas,projectRadarMissionPreflight,type RadarCapabilityKey,type RadarMissionContext,type RadarOperationRef } from './action-engine-contracts.js'
import { assertRadarMissionMutation,assertRadarMissionResource,resolveRadarMissionActor,radarMissionError } from './action-engine-access.js'
import { runRadarMissionCommand,attachRadarMissionOperation } from './action-engine-store.js'
import { createRadarCampaign,duplicateRadarCampaign,listRadarCampaigns,listRadarCandidates } from './repository.js'
import { saveRadarCommercialCriteria } from './commercial-criteria.js'
import { getRadarCapturePreflight } from './capture-preflight.js'
import { startRadarCaptureOperation } from './capture-operation.js'
import { resumeRadarCaptureOperation } from './capture-dispatch.js'
import { queueRadarResearchRequest } from './research-requests.js'
import { projectRadarCommercialResponse } from './commercial-view.js'
import { prepareNewRadarSearchConfiguration } from './search-configuration.js'
import { inspectRadarMissionOperation } from '../action-engine/radar-operation-waits.js'
import { acquireResourceClaim } from '../action-engine/resource-claims.js'

export type RadarActionEngineConfig={RADAR_ACTION_ENGINE_ENABLED?:boolean;RADAR_ACTION_ENGINE_TENANT_ALLOWLIST?:string}
export function radarActionEngineEnabled(config:RadarActionEngineConfig,organizationId:string) {
  return config.RADAR_ACTION_ENGINE_ENABLED===true
    &&(config.RADAR_ACTION_ENGINE_TENANT_ALLOWLIST??'').split(',').map(s=>s.trim()).includes(organizationId)
}
const reads=new Set<RadarCapabilityKey>(['radar.campaign.inspect','radar.capture.preflight','radar.results.inspect','radar.operation.await'])

export async function executeRadarMissionCommand(pool:pg.Pool,config:RadarActionEngineConfig,context:RadarMissionContext,key:RadarCapabilityKey,raw:unknown):Promise<Record<string,unknown>> {
  if(key==='radar.operation.await')return inspectRadarMissionOperation(pool,context,raw)
  if(!radarActionEngineEnabled(config,context.organizationId))throw radarMissionError('radar_mission_unavailable',503)
  const user=await resolveRadarMissionActor(pool,context)
  const input=radarCapabilityInputSchemas[key].parse(raw) as Record<string,unknown>
  await assertRadarMissionResource(pool,context,{
    ...(typeof input.existingCampaignId==='string'?{campaignId:input.existingCampaignId}:{}),
    ...(typeof input.campaignId==='string'?{campaignId:input.campaignId}:{}),
    ...(typeof input.operationId==='string'?{operationId:input.operationId}:{}),
    ...(Array.isArray(input.candidateIds)?{candidateIds:input.candidateIds as string[]}:{}),
  })
  if(!reads.has(key))await assertRadarMissionMutation(pool,context,key)
  const mission=(await pool.query('SELECT autonomy_envelope FROM public.action_missions WHERE id=$1 AND organization_id=$2',[context.missionId,context.organizationId])).rows[0]
  const maxBudget=Number(mission?.autonomy_envelope?.maxTotalCostBrl)
  const campaign=async(id:string)=>{
    const row=(await pool.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2',[id,context.organizationId])).rows[0]
    if(!row)throw radarMissionError('radar_mission_scope_forbidden',403)
    return row
  }
  const preview=async(id:string,configurationRevision:number,requestedCount:number,operationId?:string)=>{
    const c=await campaign(id)
    const p=await getRadarCapturePreflight(pool,user,{organizationId:context.organizationId,campaignId:id,configurationRevision,requestedCount,...(operationId?{operationId}:{})})
    const bounded=c.budget_limit!==null&&Number(c.budget_limit)>0&&Number(c.budget_limit)<=maxBudget
    return projectRadarMissionPreflight({campaignId:id,configurationRevision,criteriaRevision:Number(c.commercial_criteria_revision),requestedCount},p,bounded?maxBudget:NaN)
  }
  if(key==='radar.campaign.inspect') {
    const all=await listRadarCampaigns(pool,user,context.organizationId)
    return{campaigns:projectRadarCommercialResponse('campaigns',input.campaignId?all.filter(c=>c.id===input.campaignId):all)}
  }
  if(key==='radar.results.inspect') {
    const all=await listRadarCandidates(pool,user,String(input.campaignId))
    const selected=Array.isArray(input.candidateIds)?all.filter(c=>(input.candidateIds as string[]).includes(c.id)):all
    return{campaignId:input.campaignId,total:selected.length,candidates:projectRadarCommercialResponse('candidates',selected.slice(Number(input.offset),Number(input.offset)+Number(input.limit)))}
  }
  if(key==='radar.capture.preflight')return preview(String(input.campaignId),Number(input.configurationRevision),Number(input.requestedCount),typeof input.operationId==='string'?input.operationId:undefined)
  const transactional=['radar.campaign.create','radar.campaign.duplicate','radar.campaign.criteria.update'].includes(key)
  return runRadarMissionCommand(pool,context,key,input,async(client,requestId)=>{
    if(key==='radar.campaign.create') {
      const v=radarCapabilityInputSchemas[key].parse(input)
      if('existingCampaignId' in v) {
        const c=await campaign(v.existingCampaignId)
        return{status:'saved',campaignId:c.id,configurationRevision:Number(c.configuration_revision),criteriaRevision:Number(c.commercial_criteria_revision),researchStarted:false}
      }
      const c=await createRadarCampaign(client,user,{...v,organizationId:context.organizationId,campaignType:'regional_b2b',
        searchConfiguration:prepareNewRadarSearchConfiguration({cities:v.cities}),budgetLimit:Number.isFinite(maxBudget)&&maxBudget>0?maxBudget:0})
      await acquireResourceClaim(client,{organizationId:context.organizationId,missionId:context.missionId,missionLabel:'Pesquisa Radar',resourceKey:'radar.campaign',scope:c.id,mode:'exclusive',ttlSeconds:900})
      return{status:'saved',campaignId:c.id,configurationRevision:c.configurationRevision,criteriaRevision:c.commercialCriteriaRevision,researchStarted:false}
    }
    if(key==='radar.campaign.duplicate') {
      const v=radarCapabilityInputSchemas[key].parse(input)
      const c=await duplicateRadarCampaign(client,user,{...v,organizationId:context.organizationId})
      await acquireResourceClaim(client,{organizationId:context.organizationId,missionId:context.missionId,missionLabel:'Pesquisa Radar',resourceKey:'radar.campaign',scope:c.id,mode:'exclusive',ttlSeconds:900})
      return{status:'saved',campaignId:c.id,configurationRevision:c.configurationRevision,criteriaRevision:c.commercialCriteriaRevision,researchStarted:false}
    }
    if(key==='radar.campaign.criteria.update') {
      const v=radarCapabilityInputSchemas[key].parse(input)
      const {campaignId,...criteria}=v
      const result=await saveRadarCommercialCriteria(pool,user,campaignId,{...criteria,organizationId:context.organizationId},{client})
      return{status:'saved',campaignId:result.campaign.id,configurationRevision:result.campaign.configurationRevision,criteriaRevision:result.campaign.commercialCriteriaRevision,researchStarted:false}
    }
    let ref:RadarOperationRef
    const previous=key==='radar.research.request'
      ? (await pool.query('SELECT id AS operation_id,campaign_id,configuration_revision,criteria_revision FROM public.radar_research_requests WHERE organization_id=$1 AND request_id=$2',[context.organizationId,requestId])).rows[0]
      : (await pool.query(`SELECT request.operation_id,request.campaign_id,request.configuration_revision,COALESCE((operation.configuration_snapshot->>'commercial_criteria_revision')::int,1) AS criteria_revision
           FROM public.radar_capture_requests request JOIN public.radar_capture_operations operation ON operation.id=request.operation_id AND operation.organization_id=request.organization_id
           WHERE request.organization_id=$1 AND request.request_id=$2`,[context.organizationId,requestId])).rows[0]
    if(previous) {
      ref={operationType:key==='radar.research.request'?'research':'capture',operationId:String(previous.operation_id),requestId,campaignId:String(previous.campaign_id),configurationRevision:Number(previous.configuration_revision),criteriaRevision:Number(previous.criteria_revision)}
      await attachRadarMissionOperation(client,context,ref)
      return{status:'accepted',ref}
    }
    const scopedCampaign=typeof input.campaignId==='string'?input.campaignId
      :(await pool.query('SELECT campaign_id FROM public.radar_capture_operations WHERE id=$1 AND organization_id=$2',[input.operationId,context.organizationId])).rows[0]?.campaign_id
    const boundCampaign=await campaign(scopedCampaign)
    const campaignBudget=boundCampaign.budget_limit===null?NaN:Number(boundCampaign.budget_limit)
    if(!Number.isFinite(maxBudget)||maxBudget<=0||!Number.isFinite(campaignBudget)||campaignBudget<=0||campaignBudget>maxBudget)throw radarMissionError('radar_mission_campaign_budget_unbounded')
    const claim=(await pool.query(`SELECT id FROM public.action_resource_claims WHERE organization_id=$1 AND mission_id=$2 AND resource_key='radar.campaign' AND scope=$3 AND active=TRUE AND lease_expires_at>NOW()`,[context.organizationId,context.missionId,scopedCampaign])).rows[0]
    if(!claim)throw radarMissionError('radar_mission_campaign_claim_required',403)
    if(key==='radar.research.request') {
      const v=radarCapabilityInputSchemas[key].parse(input)
      if(!Number.isFinite(maxBudget)||maxBudget<=0)throw radarMissionError('radar_mission_budget_required')
      const c=await campaign(v.campaignId)
      await queueRadarResearchRequest(pool,user,{...v,organizationId:context.organizationId,requestId})
      const row=(await pool.query('SELECT id FROM public.radar_research_requests WHERE organization_id=$1 AND request_id=$2',[context.organizationId,requestId])).rows[0]
      ref={operationType:'research',operationId:String(row.id),requestId,campaignId:v.campaignId,configurationRevision:Number(c.configuration_revision),criteriaRevision:v.criteriaRevision}
    } else if(key==='radar.capture.start') {
      const v=radarCapabilityInputSchemas[key].parse(input)
      const approved=await preview(v.campaignId,v.configurationRevision,v.requestedCount)
      if(!approved.allowed||approved.approvalSubjectHash!==v.approvalSubjectHash)throw radarMissionError('radar_mission_preflight_changed')
      const accepted=await startRadarCaptureOperation(pool,user,{...v,organizationId:context.organizationId,requestId})
      ref={operationType:'capture',operationId:accepted.operationId,requestId,campaignId:v.campaignId,configurationRevision:v.configurationRevision,criteriaRevision:approved.criteriaRevision}
    } else {
      const v=radarCapabilityInputSchemas['radar.capture.resume'].parse(input)
      const op=(await pool.query('SELECT campaign_id,requested_count FROM public.radar_capture_operations WHERE id=$1 AND organization_id=$2',[v.operationId,context.organizationId])).rows[0]!
      const approved=await preview(op.campaign_id,v.configurationRevision,Number(op.requested_count),v.operationId)
      if(!approved.allowed||approved.approvalSubjectHash!==v.approvalSubjectHash)throw radarMissionError('radar_mission_preflight_changed')
      await resumeRadarCaptureOperation(pool,user,{...v,organizationId:context.organizationId,requestId})
      ref={operationType:'capture',operationId:v.operationId,requestId,campaignId:op.campaign_id,configurationRevision:v.configurationRevision,criteriaRevision:approved.criteriaRevision}
    }
    await attachRadarMissionOperation(client,context,ref)
    return{status:'accepted',ref}
  },transactional)
}
