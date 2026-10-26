import type {FastifyInstance} from 'fastify'
import {z} from 'zod'
import {ApiError} from '../../http/errors.js'
import {companyStrategyRequestAccess} from '../company-strategy/routes.js'
import {assertCompanyStrategyWrite} from '../company-strategy/repository.js'
import {representedBusinessSchema} from './represented-business-schemas.js'
const params=z.object({organizationId:z.string().uuid(),id:z.string().uuid().optional()})
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ApiError(400,'invalid_represented_business_payload');return result.data}
export function mapRepresentedBusiness(row:Record<string,any>){return {id:row.id,organizationId:row.organization_id,version:row.version,name:row.name,relationshipType:row.relationship_type,websiteUrl:row.website_url??undefined,description:row.description,serviceRegions:row.service_regions,authorizedLines:row.authorized_lines,commercialConditions:row.commercial_conditions,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at}}
export async function registerRepresentedBusinessRoutes(app:FastifyInstance){
 const root='/organizations/:organizationId/represented-businesses'
 app.get(root,async request=>{const route=parse(params,request.params);companyStrategyRequestAccess(request,route.organizationId);return (await app.pg.query('SELECT * FROM public.company_represented_businesses WHERE organization_id=$1 ORDER BY name,id',[route.organizationId])).rows.map(mapRepresentedBusiness)})
 for(const update of [false,true])app.route({method:update?'PUT':'POST',url:update?`${root}/:id`:root,handler:async request=>{
  const route=parse(params,request.params),access=companyStrategyRequestAccess(request,route.organizationId);assertCompanyStrategyWrite(access)
  const body=parse(update?representedBusinessSchema.extend({expectedVersion:z.number().int().positive()}):representedBusinessSchema,request.body)
  const values=[route.organizationId,body.name,body.relationshipType,body.websiteUrl??null,body.description,body.serviceRegions,body.authorizedLines,body.commercialConditions,body.status]
  const result=update?await app.pg.query(`UPDATE public.company_represented_businesses SET name=$2,relationship_type=$3,website_url=$4,description=$5,service_regions=$6,authorized_lines=$7,commercial_conditions=$8,status=$9,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$10 AND version=$11 RETURNING *`,[...values,route.id,parse(z.object({expectedVersion:z.number().int().positive()}),request.body).expectedVersion]):await app.pg.query(`INSERT INTO public.company_represented_businesses(organization_id,client_id,name,relationship_type,website_url,description,service_regions,authorized_lines,commercial_conditions,status) SELECT id,client_id,$2,$3,$4,$5,$6,$7,$8,$9 FROM public.organizations WHERE id=$1 RETURNING *`,values)
  if(!result.rows[0]){const exists=update&&(await app.pg.query('SELECT id FROM public.company_represented_businesses WHERE organization_id=$1 AND id=$2',[route.organizationId,route.id])).rows[0];throw new ApiError(exists?409:404,exists?'represented_business_version_conflict':'represented_business_not_found')}
  return mapRepresentedBusiness(result.rows[0])
 }})
 app.post(`${root}/:id/archive`,async request=>{
  const route=parse(params,request.params),access=companyStrategyRequestAccess(request,route.organizationId);assertCompanyStrategyWrite(access)
  const input=parse(z.object({expectedVersion:z.number().int().positive()}).strict(),request.body)
  const result=await app.pg.query("UPDATE public.company_represented_businesses SET status='archived',version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2 AND version=$3 RETURNING *",[route.organizationId,route.id,input.expectedVersion])
  if(!result.rows[0])throw new ApiError(409,'represented_business_version_conflict')
  return mapRepresentedBusiness(result.rows[0])
 })
}
