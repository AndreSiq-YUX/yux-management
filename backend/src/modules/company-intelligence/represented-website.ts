import {z} from 'zod'
import type pg from 'pg'
import {ApiError} from '../../http/errors.js'
import {withCompanyStrategyTransaction} from '../company-strategy/repository.js'
export const websiteTargetSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('own_company')}).strict(),z.object({kind:z.literal('represented_business'),representedBusinessId:z.string().uuid()}).strict()])
export type WebsiteTarget=z.infer<typeof websiteTargetSchema>
type Suggestion={suggestionKind:string;fieldPath:string;suggestedValue:unknown;[key:string]:unknown}
export function scopeRepresentedWebsiteSuggestions<T extends Suggestion>(suggestions:T[]):T[]{return suggestions.flatMap(item=>item.suggestionKind==='product'&&item.fieldPath==='products'?[item]:item.suggestionKind==='profile'&&['description','authorizedLines','representedBusiness.description','representedBusiness.authorizedLines'].includes(item.fieldPath)?[{...item,fieldPath:item.fieldPath.startsWith('representedBusiness.')?item.fieldPath:`representedBusiness.${item.fieldPath}`}]:[])}
export async function assertRepresentedWebsiteTarget(db:Pick<pg.Pool,'query'>,organizationId:string,target:WebsiteTarget){if(target.kind==='represented_business'&&!(await db.query("SELECT id FROM public.company_represented_businesses WHERE organization_id=$1 AND id=$2 AND status='active'",[organizationId,target.representedBusinessId])).rows[0])throw new ApiError(404,'represented_business_not_found')}
export async function applyRepresentedWebsiteSuggestions(db:pg.Pool,input:{organizationId:string;runId:string;userId:string;suggestionIds:string[];suggestionEdits?:Array<{id:string;suggestedValue:unknown}>}){
 return withCompanyStrategyTransaction(db,async client=>{
  const run=(await client.query("SELECT * FROM public.knowledge_intelligence_runs WHERE organization_id=$1 AND id=$2 AND run_kind='website_onboarding' FOR UPDATE",[input.organizationId,input.runId])).rows[0]
  if(!run)throw new ApiError(404,'website_onboarding_run_not_found')
  const target=websiteTargetSchema.parse(run.output_payload.target)
  if(target.kind!=='represented_business')throw new ApiError(409,'website_target_changed')
  const brand=(await client.query("SELECT * FROM public.company_represented_businesses WHERE organization_id=$1 AND id=$2 AND status='active' FOR UPDATE",[input.organizationId,target.representedBusinessId])).rows[0]
  if(!brand)throw new ApiError(404,'represented_business_not_found')
  const selected=(await client.query('SELECT * FROM public.company_intelligence_suggestions WHERE organization_id=$1 AND run_id=$2 AND id=ANY($3::uuid[]) ORDER BY id FOR UPDATE',[input.organizationId,input.runId,[...new Set(input.suggestionIds)]])).rows
  if(selected.length!==new Set(input.suggestionIds).size)throw new ApiError(400,'website_suggestion_not_found')
  if(run.status==='applied'&&selected.every(row=>row.status==='applied'))return
  if(!['ready_for_review','degraded','failed'].includes(run.status))throw new ApiError(409,'website_onboarding_not_ready')
  const edits=new Map((input.suggestionEdits??[]).map(edit=>[edit.id,edit.suggestedValue]))
  let description=brand.description,lines=brand.authorized_lines,changed=false,possibleDuplicates=0
  const productReconciliation:Array<Record<string,unknown>>=[]
  for(const suggestion of selected){
   const value=edits.has(suggestion.id)?edits.get(suggestion.id):suggestion.suggested_value
   if(suggestion.suggestion_kind==='profile'&&['representedBusiness.description','representedBusiness.authorizedLines'].includes(suggestion.field_path)){
    const field=suggestion.field_path==='representedBusiness.description'?'description':'authorized_lines'
    if(JSON.stringify(brand[field]??null)!==JSON.stringify(suggestion.current_value??null))throw new ApiError(409,'website_onboarding_confirmed_value_changed')
    if(field==='description')description=z.string().trim().max(12000).parse(value)
    else lines=z.array(z.string().trim().min(1).max(200)).max(100).parse(value)
    changed=true
   }else if(suggestion.suggestion_kind==='product'&&suggestion.field_path==='products'){
    const products=z.array(z.object({name:z.string().trim().min(1).max(200),description:z.string().max(12000).default(''),valueProposition:z.string().max(12000).optional(),sku:z.string().trim().min(1).max(200).optional(),sourceProductRef:z.string().trim().min(1).max(200).optional(),packaging:z.string().max(2000).optional(),storageConditions:z.string().max(2000).optional()}).passthrough()).max(50).parse(value)
    for(const product of products){
     const sourceUrl=new URL(run.output_payload.websiteUrl).origin
     const stableRef=product.sourceProductRef??product.sku
     const existing=stableRef?(await client.query("SELECT id FROM public.marketing_products_services WHERE organization_id=$1 AND represented_business_id=$2 AND metadata->>'sourceUrl'=$3 AND metadata->>'sourceProductRef'=$4",[input.organizationId,brand.id,sourceUrl,stableRef])).rows:[]
     if(existing.length){productReconciliation.push({productId:existing[0].id,sourceProductRef:stableRef,proposed:product,reason:'review_existing_product'});continue}
     const similar=(await client.query("SELECT id FROM public.marketing_products_services WHERE organization_id=$1 AND represented_business_id=$2 AND lower(name)=lower($3) AND status<>'archived'",[input.organizationId,brand.id,product.name])).rows
     possibleDuplicates+=similar.length?1:0
     const metadata={source:'website_onboarding',sourceRunId:run.id,sourceUrl,sourceProductRef:stableRef,sku:product.sku,packaging:product.packaging,storageConditions:product.storageConditions,commercialAvailability:'unconfirmed',needsReconciliation:similar.length>0,possibleDuplicateIds:similar.map(row=>row.id)}
     await client.query(`INSERT INTO public.marketing_products_services(organization_id,client_id,contract_id,represented_business_id,name,description,value_proposition,status,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8::jsonb)`,[input.organizationId,run.client_id,run.contract_id,brand.id,product.name,product.description,product.valueProposition??null,JSON.stringify(metadata)])
    }
   }else throw new ApiError(400,'represented_website_field_not_allowed')
   await client.query("UPDATE public.company_intelligence_suggestions SET suggested_value=$4::jsonb,status='applied',selected=true,applied_by=$3,applied_at=now(),updated_at=now() WHERE organization_id=$1 AND id=$2",[input.organizationId,suggestion.id,input.userId,JSON.stringify(value)])
  }
  if(changed)await client.query('UPDATE public.company_represented_businesses SET description=$3,authorized_lines=$4,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2',[input.organizationId,brand.id,description,lines])
  await client.query("UPDATE public.company_intelligence_suggestions SET status='rejected',selected=false WHERE organization_id=$1 AND run_id=$2 AND status='suggested'",[input.organizationId,run.id])
  await client.query("UPDATE public.knowledge_intelligence_runs SET status='applied',stage='completed',progress=100,output_payload=output_payload||$3::jsonb,completed_at=now() WHERE organization_id=$1 AND id=$2",[input.organizationId,run.id,JSON.stringify({possibleDuplicates,productReconciliation})])
 })
}
