import { z } from 'zod'
import { noEffectRecovery,type CapabilityDefinition } from '../capability-registry.js'
import { radarCapabilityInputSchemas,radarOperationRefSchema,type RadarCapabilityKey } from '../../radar/action-engine-contracts.js'

const uuid=z.string().uuid(),revision=z.number().int().positive()
const preview=z.object({preview:z.literal(true),researchStarted:z.literal(false)})
const saved=z.object({status:z.literal('saved'),campaignId:uuid,configurationRevision:revision,criteriaRevision:revision,researchStarted:z.literal(false)})
const accepted=z.object({status:z.literal('accepted'),ref:radarOperationRefSchema})
const preflight=z.object({campaignId:uuid,configurationRevision:revision,criteriaRevision:revision,requestedCount:z.number().int().positive(),allowed:z.boolean(),approvalSubjectHash:z.string(),blockers:z.array(z.string())})
const inspected=z.union([
 z.object({campaigns:z.array(z.record(z.string(),z.unknown()))}),
 z.object({campaignId:uuid,total:z.number().int().nonnegative(),candidates:z.array(z.record(z.string(),z.unknown()))}),
])
export const radarOperationOutcomeSchema=z.object({
 status:z.enum(['completed','partial','blocked']),ref:radarOperationRefSchema,
 counts:z.object({requested:z.number(),found:z.number(),complete:z.number(),withGaps:z.number(),outsideProfile:z.number(),waiting:z.number(),approved:z.number()}),
 message:z.string(),campaignHref:z.string(),
})
const pending=z.object({status:z.literal('pending'),ref:radarOperationRefSchema,nextCheckAt:z.string().datetime()})
const labels:Record<RadarCapabilityKey,string>={
 'radar.campaign.inspect':'Consultar campanhas do Radar',
 'radar.campaign.create':'Criar campanha do Radar',
 'radar.campaign.duplicate':'Duplicar campanha do Radar',
 'radar.campaign.criteria.update':'Alterar critérios do Radar',
 'radar.capture.preflight':'Conferir disponibilidade da pesquisa',
 'radar.capture.start':'Solicitar pesquisa de novas empresas',
 'radar.capture.resume':'Retomar o lote do Radar',
 'radar.research.request':'Solicitar pesquisa de empresas existentes',
 'radar.results.inspect':'Ler resultados do Radar',
 'radar.operation.await':'Acompanhar conclusão da pesquisa',
}
const reads=new Set<RadarCapabilityKey>(['radar.campaign.inspect','radar.capture.preflight','radar.results.inspect','radar.operation.await'])
const paid=new Set<RadarCapabilityKey>(['radar.capture.start','radar.capture.resume','radar.research.request'])
export const radarCapabilities:CapabilityDefinition[]=(Object.keys(labels) as RadarCapabilityKey[]).map(key=>({
 key,version:1,title:labels[key],description:labels[key]+'. Usa exclusivamente o domínio Radar; não cria campanhas de publicidade.',
 domain:'radar',risk:reads.has(key)?'read_only':paid.has(key)?'high':'low',
 effect:reads.has(key)?'none':paid.has(key)?'external':'internal',
 approval:paid.has(key)||key==='radar.campaign.criteria.update'?'always':key==='radar.campaign.duplicate'?'risk_based':'never',
 idempotency:reads.has(key)?'none':'required',
 inputSchema:radarCapabilityInputSchemas[key],
 outputSchema:z.union([preview,saved,accepted,preflight,inspected,pending,radarOperationOutcomeSchema]),
 requiredModules:['radar'],requiredConnections:[],
 requiredPermissions:reads.has(key)?['action_engine.read','radar.read']:['action_engine.write','radar:manage'],
 supportsModes:['shadow','prepare','assisted'],
 readiness:async context=>({ready:context.allowedModules.includes('radar'),blockers:context.allowedModules.includes('radar')?[]:[{code:'radar_not_entitled',message:'Radar não está disponível para esta missão.'}]}),
 recovery:reads.has(key)?noEffectRecovery():{kind:'irreversible',incidentType:'radar_effect_requires_review'},
 async execute(context,input) {
   if(context.dryRun)return{output:{preview:true,researchStarted:false},effectProduced:false}
   const command=context.commands?.runRadarCommand
   if(!command||context.actor.type!=='user'||!context.actor.id||!context.actionRunId)throw new Error('radar_mission_command_unavailable')
   const output=await command({key,input,context:{
     organizationId:context.organizationId,missionId:context.missionId,actionRunId:context.actionRunId,
     actorUserId:context.actor.id,idempotencyKey:context.idempotencyKey,
     mutationLease:context.mutationLease,fencingToken:context.fencingToken,
   }})
   return{output,effectProduced:!reads.has(key),
     ...(output.ref&&typeof output.ref==='object'?{sourceRecords:[{type:'radar_operation',id:String(Reflect.get(output.ref,'operationId'))}]}:{}),
   }
 },
}))
