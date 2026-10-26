import type pg from 'pg'
import type {FastifyInstance} from 'fastify'
import {z} from 'zod'
import {ApiError} from '../../http/errors.js'
import {companyStrategyRequestAccess} from '../company-strategy/routes.js'
import {assertCompanyStrategyWrite,withCompanyStrategyTransaction} from '../company-strategy/repository.js'
import type {CompanyStrategyAccess} from '../company-strategy/schemas.js'
import {resolveMarketingScope} from './repository.js'
const text=z.string().trim().max(12000)
const list=z.array(z.string().trim().min(1).max(300)).max(100)
export const representedProductSchema=z.object({name:z.string().trim().min(1).max(200),category:text.optional(),description:text.default(''),valueProposition:text.optional(),targetAudience:text.optional(),proofPoints:list.default([]),objections:list.default([]),cta:text.optional(),status:z.enum(['active','paused','archived']).default('active'),details:z.object({sku:z.string().trim().max(200).optional(),packaging:text.optional(),storageConditions:text.optional(),serviceRegions:list.optional(),commercialAvailability:z.enum(['confirmed','unconfirmed']).default('unconfirmed')}).strict().default({commercialAvailability:'unconfirmed'})}).strict()
export type RepresentedProductInput=z.infer<typeof representedProductSchema>
export function mapRepresentedProduct(row:Record<string,any>){return {id:row.id,organizationId:row.organization_id,clientId:row.client_id,contractId:row.contract_id,representedBusinessId:row.represented_business_id??undefined,name:row.name,category:row.category??undefined,description:row.description,valueProposition:row.value_proposition??undefined,targetAudience:row.target_audience??undefined,proofPoints:row.proof_points,objections:row.objections,cta:row.cta??undefined,status:row.status,metadata:row.metadata,createdAt:row.created_at,updatedAt:row.updated_at}}
export async function upsertRepresentedProduct(db:pg.Pool,access:CompanyStrategyAccess,input:{productId?:string;representedBusinessId:string;expectedUpdatedAt?:string;input:RepresentedProductInput}){
 assertCompanyStrategyWrite(access)
 const product=representedProductSchema.parse(input.input)
 const scope=await resolveMarketingScope(db,access.organizationId)
 return withCompanyStrategyTransaction(db,async client=>{
  const brand=(await client.query("SELECT id FROM public.company_represented_businesses WHERE organization_id=$1 AND id=$2 AND status='active' FOR UPDATE",[access.organizationId,input.representedBusinessId])).rows[0]
  if(!brand)throw new ApiError(404,'represented_business_not_found')
  const values=[access.organizationId,input.representedBusinessId,product.name,product.category??null,product.description,product.valueProposition??null,product.targetAudience??null,product.proofPoints,product.objections,product.cta??null,product.status,JSON.stringify(product.details)]
  if(input.productId&&!input.expectedUpdatedAt)throw new ApiError(400,'product_version_required')
  const result=input.productId?await client.query(`UPDATE public.marketing_products_services SET name=$3,category=$4,description=$5,value_proposition=$6,target_audience=$7,proof_points=$8,objections=$9,cta=$10,status=$11,metadata=metadata||$12::jsonb,updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp()),updated_at+interval '1 millisecond') WHERE organization_id=$1 AND represented_business_id=$2 AND id=$13 AND date_trunc('milliseconds',updated_at)=$14::timestamptz RETURNING *`,[...values,input.productId,input.expectedUpdatedAt]):await client.query(`INSERT INTO public.marketing_products_services(organization_id,represented_business_id,name,category,description,value_proposition,target_audience,proof_points,objections,cta,status,metadata,client_id,contract_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14) RETURNING *`,[...values,scope.clientId,scope.contractId])
  if(!result.rows[0]){const exists=(await client.query('SELECT id FROM public.marketing_products_services WHERE organization_id=$1 AND represented_business_id=$2 AND id=$3',[access.organizationId,input.representedBusinessId,input.productId])).rows[0];throw new ApiError(exists?409:404,exists?'product_version_conflict':'product_not_found')}
  return mapRepresentedProduct(result.rows[0])
 })
}
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const parsed=schema.safeParse(value);if(!parsed.success)throw new ApiError(400,'invalid_represented_product');return parsed.data}
export async function registerRepresentedProductRoutes(app:FastifyInstance){
 const root='/organizations/:organizationId/represented-businesses/:id'
 const params=z.object({organizationId:z.string().uuid(),id:z.string().uuid(),productId:z.string().uuid().optional(),documentId:z.string().uuid().optional()})
 app.get(`${root}/products`,async request=>{
  const route=parse(params,request.params);companyStrategyRequestAccess(request,route.organizationId)
  const query=parse(z.object({query:z.string().max(200).default(''),offset:z.coerce.number().int().min(0).max(100000).default(0),limit:z.coerce.number().int().min(1).max(100).default(20)}),request.query)
  const rows=await app.pg.query(`SELECT product.*,COUNT(*) OVER()::int AS total FROM public.marketing_products_services product WHERE organization_id=$1 AND represented_business_id=$2 AND ($3='' OR concat_ws(' ',name,description,category,metadata->>'sku') ILIKE '%'||$3||'%') ORDER BY name,id OFFSET $4 LIMIT $5`,[route.organizationId,route.id,query.query,query.offset,query.limit])
  return {items:rows.rows.map(mapRepresentedProduct),total:rows.rows[0]?.total??0,offset:query.offset,limit:query.limit}
 })
 for(const update of [false,true])app.route({method:update?'PUT':'POST',url:update?`${root}/products/:productId`:`${root}/products`,handler:async request=>{
  const route=parse(params,request.params),access=companyStrategyRequestAccess(request,route.organizationId);assertCompanyStrategyWrite(access)
  const body=parse(representedProductSchema.extend({expectedUpdatedAt:update?z.string().datetime({offset:true}):z.string().datetime({offset:true}).optional()}),request.body)
  const {expectedUpdatedAt,...input}=body
  return upsertRepresentedProduct(app.pg,access,{productId:route.productId,representedBusinessId:route.id,expectedUpdatedAt,input})
 }})
 app.post(`${root}/knowledge/:documentId`,async request=>{
  const route=parse(params,request.params),access=companyStrategyRequestAccess(request,route.organizationId);assertCompanyStrategyWrite(access)
  const result=await app.pg.query(`UPDATE public.knowledge_sources source SET represented_business_id=$2 WHERE source.organization_id=$1 AND source.id IN(SELECT source_id FROM public.marketing_knowledge_documents WHERE organization_id=$1 AND id=$3) AND EXISTS(SELECT 1 FROM public.company_represented_businesses WHERE organization_id=$1 AND id=$2 AND status='active') RETURNING source.id`,[route.organizationId,route.id,route.documentId])
  if(!result.rows[0])throw new ApiError(404,'represented_knowledge_not_found')
  return {sourceId:result.rows[0].id,representedBusinessId:route.id}
 })
}
