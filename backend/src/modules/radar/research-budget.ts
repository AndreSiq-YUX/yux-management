import type pg from 'pg'
import {z} from 'zod'
import {RADAR_SEARCH_SOURCES,type RadarSearchIntent,type RadarSearchLimits} from './search-capacity.js'
import {resolveRadarSearchConfiguration} from './search-configuration.js'
import {radarCostPolicySchema,type RadarCostPolicy} from './cost-conversion.js'
import type {RadarOperationalPolicy} from './operational-limits.js'
import {findRadarDataSource} from './repository.js'

const count=z.number().int().nonnegative().safe()
const budgetSchema=z.object({version:z.literal(1),requestId:z.uuid(),approvedBy:z.string().min(1),approvedAt:z.iso.datetime(),baselineRunId:z.string().nullable(),baselineKeys:z.array(z.string().min(1).max(200)),
 policy:z.object({maxSearchQueriesPerCandidate:count,maxSearchQueriesBySource:z.partialRecord(z.enum(RADAR_SEARCH_SOURCES),count),maxSearchQueriesTotalPerCandidate:count.nullable()}).strict(),policyVersion:z.number().int().nonnegative(),costPolicy:radarCostPolicySchema,
 sourceUnitPricesBrl:z.partialRecord(z.enum(RADAR_SEARCH_SOURCES),z.string().regex(/^\d+(?:\.\d+)?$/))}).strict()
export type RadarResearchIntentBudget=RadarSearchIntent&z.infer<typeof budgetSchema>
type BudgetPolicy=Pick<RadarResearchIntentBudget,'policy'|'policyVersion'|'costPolicy'|'sourceUnitPricesBrl'>
type Db=Pick<pg.Pool,'query'>
export async function loadRadarResearchBudgetPolicy(db:Db,input:{organizationId:string;configuration:unknown;policy:RadarOperationalPolicy}):Promise<BudgetPolicy>{
 const configured=resolveRadarSearchConfiguration(input.configuration).research,ceiling=input.policy.limits.maxSearchQueriesPerCompany
 const prices:Partial<Record<typeof RADAR_SEARCH_SOURCES[number],string>>={}
 for(const source of RADAR_SEARCH_SOURCES){const row=await findRadarDataSource(db as pg.Pool,input.organizationId,source);if(row&&row.defaultCostPerUnit>0)prices[source]=String(row.defaultCostPerUnit)}
 const policy:RadarSearchLimits={maxSearchQueriesPerCandidate:Math.min(configured.maxSearchQueriesPerCandidate,ceiling),maxSearchQueriesBySource:Object.fromEntries(RADAR_SEARCH_SOURCES.map(source=>[source,Math.min(configured.maxSearchQueriesBySource[source]??configured.maxSearchQueriesPerCandidate,ceiling)])),maxSearchQueriesTotalPerCandidate:configured.maxSearchQueriesTotalPerCandidate}
 return{policy:policy as BudgetPolicy['policy'],policyVersion:input.policy.version,costPolicy:{...input.policy.costPolicy},sourceUnitPricesBrl:prices}
}
export function createRadarResearchIntentBudget(input:{requestId:string;approvedBy:string;policy:BudgetPolicy;previousRun?:{id:string;calls:Record<string,{source:string;status:string}>}}):RadarResearchIntentBudget{
 return budgetSchema.parse({...input.policy,version:1,requestId:input.requestId,approvedBy:input.approvedBy,approvedAt:new Date().toISOString(),baselineRunId:input.previousRun?.id??null,
  baselineKeys:Object.entries(input.previousRun?.calls??{}).filter(([,call])=>(RADAR_SEARCH_SOURCES as readonly string[]).includes(call.source)&&call.status!=='rejected_before_provider').map(([key])=>key).sort()})
}
export async function loadRadarResearchIntentBudget(db:Db,input:{organizationId:string;candidateId:string;runId:string;configurationRevision:number}):Promise<RadarResearchIntentBudget|undefined>{
 const row=(await db.query(`SELECT item.research_budget FROM public.radar_research_request_items item JOIN public.radar_research_requests request ON request.id=item.research_request_id AND request.organization_id=item.organization_id
  WHERE item.organization_id=$1 AND item.candidate_id=$2 AND item.run_id=$3 AND request.configuration_revision=$4 AND item.research_budget IS NOT NULL ORDER BY request.created_at DESC LIMIT 1`,[input.organizationId,input.candidateId,input.runId,input.configurationRevision])).rows[0]
 const budgets:RadarResearchIntentBudget[]=row?.research_budget?[budgetSchema.parse(row.research_budget)]:[]
 const captures=(await db.query(`SELECT operation.resume_request_id,operation.research_budget_authorizations FROM public.radar_capture_items item JOIN public.radar_capture_operations operation ON operation.id=item.operation_id AND operation.organization_id=item.organization_id
  WHERE item.organization_id=$1 AND item.candidate_id=$2 AND item.run_id=$3 AND operation.configuration_revision=$4 AND operation.resume_request_id IS NOT NULL ORDER BY operation.updated_at DESC`,[input.organizationId,input.candidateId,input.runId,input.configurationRevision])).rows
 for(const capture of captures){
  for(const grant of Array.isArray(capture.research_budget_authorizations)?capture.research_budget_authorizations:[]){
   if(!grant||grant.requestId!==capture.resume_request_id||grant.configurationRevision!==input.configurationRevision||!Array.isArray(grant.items))continue
   const item=grant.items.find((item:{candidateId?:string;runId?:string})=>item.candidateId===input.candidateId&&(!item.runId||item.runId===input.runId))
   if(!item?.budget)continue
   const actor=(await db.query("SELECT id FROM public.app_users WHERE id=$1 AND is_active=TRUE AND role='yux_admin'",[grant.approvedBy])).rows[0]
   if(!actor)continue
   const budget=budgetSchema.parse(item.budget)
   if(budget.requestId!==grant.requestId||budget.approvedBy!==grant.approvedBy)throw Error('radar_intent_budget_invalid')
   budgets.push(budget)
  }
 }
 const budget=budgets.sort((a,b)=>Date.parse(b.approvedAt)-Date.parse(a.approvedAt))[0]
 if(!budget)return
 return{...budget,baselineKeys:budget.baselineRunId===input.runId?budget.baselineKeys:[]}
}
export function frozenRadarCostPolicy(budget:RadarResearchIntentBudget|undefined,fallback:RadarCostPolicy){return {...(budget?.costPolicy??fallback)}}
export function amendRadarResearchIntentBudget(value:unknown,policy:BudgetPolicy,approvedBy:string){
 const previous=budgetSchema.parse(value)
 return budgetSchema.parse({...previous,...policy,approvedBy,approvedAt:new Date().toISOString()})
}
