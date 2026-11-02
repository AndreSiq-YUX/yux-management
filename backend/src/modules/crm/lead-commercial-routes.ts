import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify'
import type {AuthUser} from '../../auth/routes.js'
import {z} from 'zod'
import {inProfileTransaction,profileError} from './record-profile.js'
import {previewRadarLeadReconciliation,applyRadarLeadReconciliation} from '../radar/crm-reconciliation.js'
export async function registerLeadCommercialRoutes(app:FastifyInstance,authenticate:(r:FastifyRequest,p:FastifyReply)=>Promise<AuthUser|null>){
 app.get('/leads/:id/radar-data',async(request,reply)=>{
  const user=await authenticate(request,reply);if(!user)return reply
  const params=z.object({id:z.uuid()}).safeParse(request.params);if(!params.success)throw profileError(400,'Lead inválido.')
  return inProfileTransaction(app.pg,db=>previewRadarLeadReconciliation(db,user,{leadId:params.data.id}))
 })
 app.post('/leads/:id/radar-data',async(request,reply)=>{
  const user=await authenticate(request,reply);if(!user)return reply
  const params=z.object({id:z.uuid()}).safeParse(request.params)
  const body=z.object({previewRevision:z.string().regex(/^[a-f0-9]{64}$/),requestId:z.uuid()}).strict().safeParse(request.body)
  if(!params.success||!body.success)throw profileError(400,'Atualize a prévia dos dados e tente novamente.')
  return applyRadarLeadReconciliation(app.pg,user,{leadId:params.data.id,...body.data})
 })
}
