import {z} from 'zod'
import type pg from 'pg'
import type {AuthUser} from '../../auth/routes.js'
import type {RadarSearchConfiguration} from './search-configuration.js'
import {radarCostPolicySchema,defaultRadarCostPolicy,type RadarCostPolicy} from './cost-conversion.js'

// Exact JSON/JavaScript integer boundary, not a product quota.
const integer=z.number().int().positive().safe()
export const radarOperationalLimitsSchema=z.object({
 maxNewCompaniesPerLot:integer,maxPagesPerScope:integer,maxDiscoveryQueriesPerLot:integer,maxDiscoveryPageSize:integer,
 maxVerificationBatch:integer,maxSearchQueriesPerCompany:integer,maxPublicPagesPerCompany:integer,
 maxCampaignDailyQueries:integer,maxSourceDailyQueries:integer,maxResearchFreshnessDays:integer,maxContinuationIdleMinutes:integer,
 maxDecisionCallsPerCompany:integer.default(3),maxDeepSearchesPerCompany:integer.default(1),maxFallbackAttemptsPerEffect:z.number().int().nonnegative().safe().default(1),stalledAfterMinutes:integer.default(10),
}).strict()
export type RadarOperationalLimits=z.infer<typeof radarOperationalLimitsSchema>
export const defaultRadarOperationalLimits:RadarOperationalLimits={maxNewCompaniesPerLot:1000,maxPagesPerScope:10,maxDiscoveryQueriesPerLot:100,maxDiscoveryPageSize:10,maxVerificationBatch:25,maxSearchQueriesPerCompany:5,maxPublicPagesPerCompany:10,maxCampaignDailyQueries:1000,maxSourceDailyQueries:1000,maxResearchFreshnessDays:30,maxContinuationIdleMinutes:60,maxDecisionCallsPerCompany:3,maxDeepSearchesPerCompany:1,maxFallbackAttemptsPerEffect:1,stalledAfterMinutes:10}
type Db=Pick<pg.Pool,'query'>
export type RadarOperationalPolicy={version:number;limits:RadarOperationalLimits;costPolicy:RadarCostPolicy;updatedAt:string|null;updatedBy:string|null}
const failure=(code:string,statusCode=409)=>Object.assign(new Error(code),{statusCode})
function requireAdmin(user:AuthUser){if(user.role!=='yux_admin')throw failure('radar_source_admin_required',403)}
export async function loadRadarOperationalLimits(db:Db):Promise<RadarOperationalPolicy>{
 const row=(await db.query('SELECT version,limits,cost_policy,updated_at,updated_by FROM private.radar_operational_policy()')).rows[0]
 // Conservative defaults support legacy/test adapters. A missing migration still
 // fails at SQL; the Admin endpoint never presents an unpersisted policy as saved.
 return row?{version:row.version,limits:radarOperationalLimitsSchema.parse(row.limits),costPolicy:radarCostPolicySchema.parse(row.cost_policy??defaultRadarCostPolicy),updatedAt:row.updated_at instanceof Date?row.updated_at.toISOString():row.updated_at,updatedBy:row.updated_by}
  :{version:0,limits:{...defaultRadarOperationalLimits},costPolicy:{...defaultRadarCostPolicy},updatedAt:null,updatedBy:null}
}
export async function getRadarOperationalLimits(db:Db,user:AuthUser){
 requireAdmin(user);const policy=await loadRadarOperationalLimits(db)
 if(!policy.version)throw failure('radar_operational_policy_unavailable',503)
 return policy
}
export async function updateRadarOperationalLimits(pool:pg.Pool,user:AuthUser,input:{expectedVersion:number;limits:RadarOperationalLimits;costPolicy?:RadarCostPolicy}){
 requireAdmin(user);const limits=radarOperationalLimitsSchema.parse(input.limits);z.number().int().positive().parse(input.expectedVersion)
 const db=await pool.connect()
 try{
  await db.query('BEGIN')
  const row=(await db.query('SELECT version,limits,cost_policy FROM public.radar_operational_limits WHERE singleton=TRUE FOR UPDATE')).rows[0]
  if(row?.version!==input.expectedVersion)throw failure('radar_operational_policy_stale')
  const costPolicy=radarCostPolicySchema.parse(input.costPolicy??row.cost_policy??defaultRadarCostPolicy)
  await db.query('INSERT INTO public.radar_operational_limit_audit(policy_version,old_limits,new_limits,updated_by,old_cost_policy,new_cost_policy) VALUES($1,$2,$3,$4,$5,$6)',[row.version+1,JSON.stringify(row.limits),JSON.stringify(limits),user.id,JSON.stringify(row.cost_policy??defaultRadarCostPolicy),JSON.stringify(costPolicy)])
  await db.query('UPDATE public.radar_operational_limits SET version=version+1,limits=$1,updated_by=$2,cost_policy=$3,updated_at=NOW() WHERE singleton=TRUE',[JSON.stringify(limits),user.id,JSON.stringify(costPolicy)])
  const result=await getRadarOperationalLimits(db,user);await db.query('COMMIT');return result
 }catch(cause){await db.query('ROLLBACK');throw cause}finally{db.release()}
}
export function assertRadarOperationalLimit(value:number,maximum:number){
 if(!Number.isSafeInteger(value)||value<1||value>maximum)throw failure('radar_operational_limit_exceeded',400)
}
export function validateRadarOperationalConfiguration(config:RadarSearchConfiguration,limits:RadarOperationalLimits,dailyLimit?:number){
 const pairs:Array<[number,number]>=[
  [config.batch.pageSize,limits.maxDiscoveryPageSize],[config.batch.maxPagesPerScope,limits.maxPagesPerScope],
  [config.batch.maxQueriesPerBatch,limits.maxDiscoveryQueriesPerLot],[config.batch.verificationLimit,limits.maxVerificationBatch],
  [config.research.maxSearchQueriesPerCandidate,limits.maxSearchQueriesPerCompany],[config.research.maxPagesPerCandidate,limits.maxPublicPagesPerCompany],
  [config.research.freshnessDays,limits.maxResearchFreshnessDays],
 ]
 for(const value of Object.values(config.research.maxSearchQueriesBySource??{}))if(value>0)pairs.push([value,limits.maxSearchQueriesPerCompany])
 if(dailyLimit!==undefined)pairs.push([Number(dailyLimit),limits.maxCampaignDailyQueries])
 for(const [value,max]of pairs)assertRadarOperationalLimit(value,max)
}
