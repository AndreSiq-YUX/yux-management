import {createHash} from 'node:crypto'
import type pg from 'pg'
import type {AuthUser} from '../../auth/routes.js'
import {prepareRadarAdaptiveCapture,loadRadarAdaptiveItems} from './adaptive-capture.js'
import {radarAdaptiveDiscoveryCounts} from './discovery-plan.js'
import {resolveRadarSearchConfiguration} from './search-configuration.js'
import {getRadarResearchAvailability} from './research-availability.js'
import type {PreflightInput,PreflightDependencies,RadarCapturePreflight} from './capture-preflight.js'
import type {RadarOperationalPolicy} from './operational-limits.js'
import type {CaptureAvailability} from './capture-operation.js'
import {radarAdaptiveContinuations,effectiveRadarAdaptivePage} from './adaptive-continuation.js'

/** v2 does not consult v1 CNPJá cursor history or require its credentials when a
 * different approved source is selected. It also never upgrades an existing v1. */
export async function loadRadarAdaptivePreflight(db:Pick<pg.Pool,'query'>,user:AuthUser,input:PreflightInput,campaign:pg.QueryResultRow,op:pg.QueryResultRow|null,policy:RadarOperationalPolicy,deps:PreflightDependencies){
 const stored=op?.discovery_plan??await prepareRadarAdaptiveCapture(db,campaign as Parameters<typeof prepareRadarAdaptiveCapture>[1]),config=resolveRadarSearchConfiguration((op?.configuration_snapshot??campaign).search_configuration)
 const items=op?await loadRadarAdaptiveItems(db,op.id,input.organizationId):[],counts=radarAdaptiveDiscoveryCounts(items),remaining=Math.max(0,input.requestedCount-counts.qualifiedNew)
 const blockers:RadarCapturePreflight['blockers']=[],warnings:RadarCapturePreflight['warnings']=[],checks:RadarCapturePreflight['checks']=[]
 const fail=(code:string)=>blockers.push({code,message:code})
 if(op?.lease_active)fail('radar_capture_in_progress')
 if(['paused','archived','completed'].includes(campaign.status))fail('radar_capture_campaign_inactive')
 if((await db.query("SELECT id FROM public.radar_capture_operations WHERE organization_id=$1 AND campaign_id=$2 AND configuration_revision=$3 AND status IN ('queued','discovering','researching','blocked') AND ($4::uuid IS NULL OR id<>$4) LIMIT 1",[input.organizationId,input.campaignId,input.configurationRevision,op?.id??null])).rows.length)fail('radar_capture_other_active_lot')
 const pages=(await db.query('SELECT * FROM public.radar_discovery_pages WHERE organization_id=$1 AND campaign_id=$2 AND criteria_revision=$3 ORDER BY created_at,id',[input.organizationId,input.campaignId,input.configurationRevision])).rows.map(page=>effectiveRadarAdaptivePage(page))
 const recovering=items.some(item=>['pending','running','waiting'].includes(item.state))||pages.some(page=>page.status==='received'),needsDiscovery=remaining>0&&!recovering
 const canQualify=config.research.semanticQualificationEnabled||config.qualification.includeAnyTerms.length>0||config.qualification.includeAllTerms.length>0||config.qualification.requireCnaeMatch&&campaign.target_cnaes?.length>0
 if(needsDiscovery&&!canQualify)fail('radar_discovery_qualification_criteria_required')
 if(needsDiscovery&&!stored.plan.scopes.length)fail('radar_discovery_no_eligible_sources')
 const continuations=needsDiscovery?await radarAdaptiveContinuations(db,{organizationId:input.organizationId,campaignId:input.campaignId,configurationRevision:input.configurationRevision},policy):[]
 if(needsDiscovery&&pages.some(page=>['uncertain','reserved'].includes(page.status)&&!continuations.some(state=>state.pageId===page.id)))fail('radar_capture_discovery_uncertain')
 const worker=deps.workerReady?await deps.workerReady():!!(await db.query("SELECT 1 FROM public.worker_process_heartbeats WHERE 'external'=ANY(queue_classes) AND last_seen_at>NOW()-INTERVAL '90 seconds' LIMIT 1")).rows.length
 if(!worker)fail('radar_capture_worker_unavailable')
 checks.push({key:'external_worker',status:worker?'ok':'blocked'})
 const availability:CaptureAvailability=await(deps.availability??getRadarResearchAvailability)(db as pg.Pool,user,input.organizationId,input.campaignId)
 // Saved evidence is recoverable independently of new source capacity. Every
 // actual new effect still reauthorizes rights, route, wallet and budget.
 const recoverable=new Set(['source_limit_exceeded','source_budget_exceeded','provider_inactive','provider_secret_missing','source_disabled','source_cost_required'])
 if(!availability.allowed)for(const reason of availability.reasons)if(!recovering||!recoverable.has(reason.code))blockers.push(reason)
 if(!recovering&&(availability.presence?.routeConfigured===false||availability.semantic?.routeConfigured===false))fail('radar_capture_model_route_missing')
 const limits={pageSize:config.batch.pageSize,maxPagesPerScope:config.batch.maxPagesPerScope,maxQueriesPerBatch:config.batch.maxQueriesPerBatch}
 const accounting=Object.fromEntries(stored.plan.scopes.map((scope:{key:string})=>[scope.key,pages.filter(page=>page.operation_id===op?.id&&page.scope_key===scope.key&&['received','admitted'].includes(page.status)).length]))
 const requiresLimitsApproval=!!op&&needsDiscovery&&(pages.filter(page=>page.operation_id===op.id).length>=limits.maxQueriesPerBatch||['page_cap','query_cap'].includes(op.discovery_reason??''))
 const stateId=createHash('sha256').update(JSON.stringify({policyVersion:policy.version,revision:input.configurationRevision,op:op?.id,items,pages,limits,plan:stored.plan})).digest('hex')
 const preflight:RadarCapturePreflight={stateId,allowed:!blockers.length,requiresLimitsApproval,remaining,limits,policy,campaignLimits:resolveRadarSearchConfiguration(campaign.search_configuration).batch,continuations,attemptedQueries:Number(op?.queries??0),successfulPagesByScope:accounting,optimisticAdditionalCapacity:remaining,minimumAdditionalQueries:needsDiscovery?1:0,blockers,warnings,checks}
 return{preflight,operation:op,campaign,scopes:[],overflowCount:pages.filter(page=>page.status==='received').length,policy}
}
