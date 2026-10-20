import {z} from 'zod'
import type pg from 'pg'
import type {AuthUser} from '../../auth/routes.js'
import {requireRadarScope} from './access.js'
import {loadRadarOperationalLimits} from './operational-limits.js'
import {estimateRadarCostBrl} from './cost-conversion.js'
import {multiplyRadarDecimal,remainingRadarCostUnits} from './cost-conversion.js'

export const radarDeepResearchConfigSchema=z.object({enabled:z.boolean().default(false),allowEstimatedBudget:z.boolean().default(false),maxSteps:z.number().int().min(1).max(10).default(3),maxAttempts:z.number().int().min(1).max(10).default(1),timeoutSeconds:z.number().int().min(1).max(120).default(45),estimatedUsdPerAttempt:z.number().positive().optional(),budgetUsdPerResearch:z.number().positive().optional(),budgetUsdPerCampaign:z.number().positive().optional()}).strict()
export const PERPLEXITY_AGENT_REMOTE_CEILING_SUPPORTED=false
const failure=(code:string,statusCode=409)=>Object.assign(Error(code),{statusCode})
export function radarDeepResearchBudget(value:unknown,fallbackLimit:number){
 const config=radarDeepResearchConfigSchema.parse(value)
 if(!config.enabled||!config.allowEstimatedBudget)throw failure('research_estimated_budget_approval_required')
 if(!config.estimatedUsdPerAttempt||!config.budgetUsdPerResearch||!config.budgetUsdPerCampaign)throw failure('research_estimated_budget_invalid')
 const attempts=Math.min(config.maxAttempts,fallbackLimit+1,remainingRadarCostUnits({budget:String(config.budgetUsdPerResearch),used:'0',unitPrice:String(config.estimatedUsdPerAttempt)}))
 if(attempts<1)throw failure('research_estimated_budget_reached')
 return{config,attempts,amountUsd:multiplyRadarDecimal(String(config.estimatedUsdPerAttempt),String(attempts)),hardCeiling:false as const}
}
export async function loadRadarDeepResearchRoute(db:Pick<pg.Pool,'query'>,organizationId:string){
 return (await db.query(`SELECT route.*,organization.client_id,contract.id AS contract_id FROM public.organizations organization LEFT JOIN LATERAL(SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE
 JOIN public.model_routing_rules route ON route.agent_type='radar_deep_research' AND route.routing_tier='default' AND route.agent_id IS NULL AND (route.organization_id IS NULL OR route.organization_id=organization.id) AND (route.client_id IS NULL OR route.client_id=organization.client_id) AND (route.contract_id IS NULL OR route.contract_id=contract.id)
 WHERE organization.id=$1 ORDER BY ((route.organization_id IS NOT NULL)::int+(route.client_id IS NOT NULL)::int+(route.contract_id IS NOT NULL)::int) DESC,route.updated_at DESC LIMIT 1`,[organizationId])).rows[0]
}
/** max_steps and an estimated budget are never represented as a remote ceiling. */
export async function getRadarDeepResearchStatus(pool:pg.Pool,user:AuthUser,organizationId:string){
 if(user.role!=='yux_admin')throw failure('radar_source_admin_required',403)
 await requireRadarScope(pool,user,{organizationId})
 const route=(await pool.query(`SELECT route.* FROM public.organizations organization LEFT JOIN LATERAL(SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE
 JOIN public.model_routing_rules route ON route.agent_type='radar_deep_research' AND route.routing_tier='default' AND route.agent_id IS NULL AND (route.organization_id IS NULL OR route.organization_id=organization.id) AND (route.client_id IS NULL OR route.client_id=organization.client_id) AND (route.contract_id IS NULL OR route.contract_id=contract.id)
 WHERE organization.id=$1 ORDER BY ((route.organization_id IS NOT NULL)::int+(route.client_id IS NOT NULL)::int+(route.contract_id IS NOT NULL)::int) DESC,route.updated_at DESC LIMIT 1`,[organizationId])).rows[0]
 const policy=await loadRadarOperationalLimits(pool)
 const config=radarDeepResearchConfigSchema.parse(route?.research_config??{})
 const price=config.estimatedUsdPerAttempt?estimateRadarCostBrl({amount:String(config.estimatedUsdPerAttempt),currency:'USD',rateSnapshot:policy.costPolicy}):null
 const configured=!!route&&route.status==='active'&&route.kind==='research'&&route.provider==='perplexity'&&route.protocol==='perplexity-agent-v1'
 let reason:string|null=null
 try{radarDeepResearchBudget(config,policy.limits.maxFallbackAttemptsPerEffect)}catch(cause){reason=(cause as Error).message}
 return{configured,enabled:configured&&!reason&&price?.amountBrl!=null,reason:!configured?'research_unconfigured':reason??(price?.amountBrl==null?'radar_cost_rate_missing':null),budgetMode:'estimated_monitored',remoteCeilingSupported:PERPLEXITY_AGENT_REMOTE_CEILING_SUPPORTED,config,price,budget:estimateRadarCostBrl({amount:config.budgetUsdPerResearch?String(config.budgetUsdPerResearch):null,currency:'USD',rateSnapshot:policy.costPolicy}),model:route?.model_name,fallbacks:route?.fallback_routes??[]}
}
export {researchRadarGaps} from './deep-research-execution.js'
