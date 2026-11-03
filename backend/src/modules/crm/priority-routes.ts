import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthUser } from '../../auth/routes.js'
import { priorityDefinitionSchema } from './priority-model.js'
import { getPriorityModel, previewPriority, savePriorityDraft } from './priority-repository.js'
import { inProfileTransaction, profileError } from './record-profile.js'
import { addPrioritySignal, listPrioritySignals, prioritySignalInput, revokePrioritySignal, revokePrioritySignalInput } from './priority-signals.js'
import { changePriorityActivation } from './priority-activation.js'
import { getLeadPriority, getLeadPriorityHistory } from './priority-views.js'

const instance = z.object({ crmInstanceId: z.uuid() }).strict()
const revision = z.number().int().min(0).max(2_147_483_646)
const draft = instance.extend({ expectedRevision: revision, definition: priorityDefinitionSchema })
const preview = instance.extend({
  revision: revision.min(1),
  runId: z.uuid().optional(),
  afterId: z.uuid().optional(),
}).refine(input => Boolean(input.runId) === Boolean(input.afterId), {
  message: 'Informe o identificador e o cursor juntos para continuar a simulação.',
})

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw profileError(400, issue?.code === 'custom' ? issue.message : 'Configuração de prioridade inválida.')
  }
  return result.data
}

export async function registerPriorityRoutes(
  app: FastifyInstance,
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>,
) {
  app.get('/priority/model', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const { crmInstanceId } = parse(instance, request.query)
    return getPriorityModel(app.pg, user, crmInstanceId)
  })
  app.put('/priority/draft', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const input = parse(draft, request.body)
    return inProfileTransaction(app.pg, db => savePriorityDraft(db, user, input))
  })
  app.post('/priority/preview', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const input = parse(preview, request.body)
    return inProfileTransaction(app.pg, db => previewPriority(db, user, input))
  })
  const leadId = z.object({ id: z.uuid() })
  const command = instance.extend({expectedActivationId:z.uuid().nullable(),requestId:z.uuid()})
  const publish = command.extend({revision:revision.min(1),runId:z.uuid()})
  const activate = command.extend({versionId:z.uuid().nullable()})
  app.post('/priority/publish',async (request,reply)=>{
    const user = await authenticate(request,reply)
    if (!user) return reply
    const input = parse(publish,request.body)
    return inProfileTransaction(app.pg,db=>changePriorityActivation(db,user,input))
  })
  app.post('/priority/activate',async (request,reply)=>{
    const user = await authenticate(request,reply)
    if (!user) return reply
    const input = parse(activate,request.body)
    return inProfileTransaction(app.pg,db=>changePriorityActivation(db,user,input))
  })
  app.get('/leads/:id/priority',async (request,reply)=>{
    const user = await authenticate(request,reply)
    if (!user) return reply
    const {id}=parse(leadId,request.params)
    return inProfileTransaction(app.pg,db=>getLeadPriority(db,user,id))
  })
  app.get('/leads/:id/priority/history',async (request,reply)=>{
    const user = await authenticate(request,reply)
    if (!user) return reply
    const {id}=parse(leadId,request.params)
    const {afterId}=parse(z.object({afterId:z.uuid().optional()}).strict(),request.query)
    return inProfileTransaction(app.pg,db=>getLeadPriorityHistory(db,user,id,afterId))
  })
  app.get('/leads/:id/priority-signals', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const { id } = parse(leadId, request.params)
    return inProfileTransaction(app.pg, db => listPrioritySignals(db,user,id))
  })
  app.post('/leads/:id/priority-signals', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const { id } = parse(leadId, request.params)
    const input = parse(prioritySignalInput, request.body)
    return reply.code(201).send(await inProfileTransaction(app.pg, db => addPrioritySignal(db,user,id,input)))
  })
  app.post('/leads/:id/priority-signals/:signalId/revoke', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const { id,signalId } = parse(leadId.extend({ signalId: z.uuid() }), request.params)
    const input = parse(revokePrioritySignalInput, request.body)
    return inProfileTransaction(app.pg, db => revokePrioritySignal(db,user,id,signalId,input))
  })
}
