import { z } from 'zod'
import { missionArtifactHash } from '../action-engine/mission-command.js'
import { radarStateSchema } from './search-configuration.js'

const uuid=z.string().uuid(),revision=z.number().int().positive()
const capture={campaignId:uuid,configurationRevision:revision,requestedCount:z.number().int().positive().safe()}
const terms=z.array(z.string().trim().min(1).max(160)).max(50)
const prefix=z.string().regex(/^\d{2,7}$/)
const criteria=z.object({
 configurationRevision:revision,targetCnaes:z.array(z.string().regex(/^\d{7}$/)).max(50),
 targets:z.array(z.object({key:z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),label:z.string().min(1).max(120),definition:z.string().min(1).max(1200),priority:z.enum(['primary','secondary']),cnaes:z.array(prefix).max(50).default([])}).strict()).max(10),
 outOfScopeExamples:terms,excludedNameTerms:terms,
 registry:z.object({mainActivityRule:z.enum(['any','target_main_required','target_secondary_needs_review']),blockedMainCnaes:z.array(prefix).max(200),blockedNameTerms:terms}).strict(),
 contactPurpose:z.enum(['general','suppliers','sales','finance','recruitment']),minPassRatio:z.number().min(0).max(1),
}).strict()
export const radarOperationRefSchema=z.object({
  operationType:z.enum(['capture','research']),operationId:uuid,requestId:uuid,campaignId:uuid,
  configurationRevision:revision,criteriaRevision:revision,
}).strict()
export type RadarOperationRef=z.infer<typeof radarOperationRefSchema>
export const radarCapabilityInputSchemas={
  'radar.campaign.inspect':z.object({campaignId:uuid.optional()}).strict(),
  'radar.campaign.create':z.object({
    name:z.string().trim().min(1).max(200),targetSegment:z.string().trim().min(1).max(2000),
    targetStates:z.array(radarStateSchema).min(1).max(27),
    cities:z.array(z.object({city:z.string().trim().min(1).max(100),state:radarStateSchema}).strict()).default([]),
    offerType:z.string().trim().min(1).max(2000),productFocus:z.array(z.string().trim().min(1)).max(12).default([]),
    targetKeywords:z.array(z.string().trim().min(1)).max(50).default([]),
    targetCnaes:z.array(z.string().regex(/^\d{7}$/)).max(50).default([]),
  }).strict().refine(value=>value.cities.every(city=>value.targetStates.includes(city.state)),{message:'city_state_outside_campaign_states'}).or(z.object({existingCampaignId:uuid}).strict()),
  'radar.campaign.duplicate':z.object({campaignId:uuid,name:z.string().trim().min(1).max(200).optional()}).strict(),
  'radar.campaign.criteria.update':criteria.extend({campaignId:uuid,closePendingLots:z.literal(false).default(false)}).strict(),
  'radar.capture.preflight':z.object({...capture,operationId:uuid.optional()}).strict(),
  'radar.capture.start':z.object({...capture,approvalSubjectHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  'radar.capture.resume':z.object({operationId:uuid,configurationRevision:revision,approvalSubjectHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  'radar.research.request':z.object({
    campaignId:uuid,criteriaRevision:revision,candidateIds:z.array(uuid).min(1),
    intent:z.enum(['resume','refresh','reanalyze']),
  }).strict(),
  'radar.operation.await':radarOperationRefSchema,
  'radar.results.inspect':z.object({campaignId:uuid,candidateIds:z.array(uuid).optional(),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(100).default(25)}).strict(),
}
export type RadarCapabilityKey=keyof typeof radarCapabilityInputSchemas
export type RadarMissionContext={
  organizationId:string;missionId:string;actionRunId:string;actorUserId:string;idempotencyKey:string;
  mutationLease?:string;fencingToken?:string;
}
export function projectRadarMissionPreflight(
  request:{campaignId:string;configurationRevision:number;criteriaRevision:number;requestedCount:number},
  preflight:{allowed:boolean;stateId:string;requiresLimitsApproval?:boolean;continuations?:unknown[];blockers?:unknown[];researchCapacity?:{estimatedMaximumCostBrl?:number}},
  maximumBudgetBrl:number,
) {
  const estimate=preflight.researchCapacity?.estimatedMaximumCostBrl
  const budgetKnown=Number.isFinite(maximumBudgetBrl)&&maximumBudgetBrl>0&&typeof estimate==='number'&&Number.isFinite(estimate)&&estimate>=0&&estimate<=maximumBudgetBrl
  const requiresRestart=preflight.continuations?.some(value=>!!value&&typeof value==='object'&&Reflect.get(value,'requiresRestartConfirmation')===true)
  const allowed=preflight.allowed&&budgetKnown&&!preflight.requiresLimitsApproval&&!requiresRestart
  return {
    ...request,allowed,
    approvalSubjectHash:missionArtifactHash({request,stateId:preflight.stateId,maximumBudgetBrl}),
    blockers:allowed?[]:['A pesquisa precisa de uma configuração ou autorização do administrador.'],
  }
}
