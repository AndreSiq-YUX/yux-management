import { z } from 'zod'
import type { ActionPackVersion, RuntimeActionPackVersion, PackStepTemplate } from '../action-pack.js'
import { hashCanonical } from '../repository.js'
import { radarCapabilityInputSchemas } from '../../radar/action-engine-contracts.js'

export const radarProspectingParameters=z.object({
 campaign:radarCapabilityInputSchemas['radar.campaign.create'],
 requestedCount:z.number().int().min(1).max(1000),
}).strict()
type Parameters=z.infer<typeof radarProspectingParameters>
const from=(step:string,field:string)=>`binding:pack.${step}.output.${field}`
const campaignId=from('campaign','campaignId')
const steps:PackStepTemplate[]=[
 {stepKey:'pack.inspect',capabilityKey:'radar.campaign.inspect',defaultParameters:{}},
 {stepKey:'pack.campaign',capabilityKey:'radar.campaign.create',defaultParameters:{artifactRef:'resolvedParameters.campaign'}},
 {stepKey:'pack.preflight',capabilityKey:'radar.capture.preflight',defaultParameters:{campaignId,configurationRevision:from('campaign','configurationRevision'),requestedCount:'resolvedParameters.requestedCount'}},
 {stepKey:'pack.capture',capabilityKey:'radar.capture.start',approvalRequired:true,defaultParameters:{campaignId,configurationRevision:from('preflight','configurationRevision'),requestedCount:'resolvedParameters.requestedCount',approvalSubjectHash:from('preflight','approvalSubjectHash')}},
 {stepKey:'pack.await',capabilityKey:'radar.operation.await',defaultParameters:{artifactRef:from('capture','ref')}},
 {stepKey:'pack.results',capabilityKey:'radar.results.inspect',defaultParameters:{campaignId,offset:0,limit:100}},
 {stepKey:'pack.evaluate',capabilityKey:'system.evaluation.checkpoint',defaultParameters:{checkpointKey:'radar_research_delivery',targetRevenueBrl:'0'}},
].map((step,index,array)=>({...step,capabilityVersion:1,approvalRequired:step.approvalRequired??false,protected:true,dependsOn:index?[array[index-1]!.stepKey]:[]}))
const definition:Omit<ActionPackVersion,'contentHash'>={
 key:'radar_prospecting',semanticVersion:'1.0.0',schemaVersion:1,status:'published_for_internal_pilot',outcomeType:'commercial_research',
 parameterSchema:z.toJSONSchema(radarProspectingParameters),readinessSpec:{requiredModules:['radar'],requiredConnections:[],requiredKnowledge:['radar.commercial.operations']},
 topologyTemplate:{steps},protectedStepKeys:steps.map(s=>s.stepKey),extensionPoints:[],
 allowedCapabilities:[...new Set([...steps.map(s=>s.capabilityKey),'radar.campaign.duplicate','radar.campaign.criteria.update','radar.capture.resume','radar.research.request'])].map(key=>({key,versions:[1],required:steps.some(s=>s.capabilityKey===key)})),
 artifactContract:{consumes:[],produces:[{key:'radar.campaign',schemaVersion:1},{key:'radar.prospecting_result',schemaVersion:1}]},
 metricSpec:{primary:['companies_found','research_completed'],unknownPolicy:'block_when_research_pending',guardrails:['research_blocked','human_review_required']},
 economicsSpec:{currency:'BRL',revenueAttribution:'not_applicable',trackFromFirstRun:true},
 policyDefaults:{mode:'assisted',researchApprovalRequired:true,autonomousEnabled:false,contactsAllowed:false},
}
export const RADAR_PROSPECTING_PACK_V1:RuntimeActionPackVersion<Parameters>={...definition,parameters:radarProspectingParameters,contentHash:hashCanonical(definition)}
export function createRadarProspectingPlan(raw:unknown){
 const parameters=radarProspectingParameters.parse(raw)
 return{schemaVersion:1 as const,packKey:definition.key,packVersion:definition.semanticVersion,packContentHash:RADAR_PROSPECTING_PACK_V1.contentHash,parameters,deviations:[],steps:steps.map(step=>({...step,parameters:step.defaultParameters}))}
}
