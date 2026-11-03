import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthUser } from '../../auth/routes.js'
import { priorityDefinitionSchema } from './priority-model.js'
import { getPriorityModel, previewPriority, savePriorityDraft } from './priority-repository.js'
import { inProfileTransaction, profileError } from './record-profile.js'

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
}
