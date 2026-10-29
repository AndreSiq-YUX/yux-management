import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AuthUser } from '../../auth/routes.js'
import { z } from 'zod'
import {
  createProfileField, createRecordType, fieldInputSchema, fieldPatchSchema, getLeadProfile,
  getProfileConfiguration, inProfileTransaction, patchProfileField, patchRecordType,
  profileInputSchema, recordTypeInputSchema, recordTypePatchSchema, saveLeadProfile,
} from './record-profile.js'

export async function registerRecordProfileRoutes(app: FastifyInstance,
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>) {
  const idSchema = z.object({ id: z.string().uuid() })
  app.get('/record-profile/configuration', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const query = z.object({ crmInstanceId: z.string().uuid() }).safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: 'CRM inválido.' })
    return getProfileConfiguration(app.pg, user, query.data.crmInstanceId)
  })
  app.post('/record-types', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const body = recordTypeInputSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Informe o nome do tipo de cliente e o CRM.' })
    return reply.code(201).send(await createRecordType(app.pg, user, body.data))
  })
  app.patch('/record-types/:id', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const params = idSchema.safeParse(request.params)
    const body = recordTypePatchSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Tipo de cliente inválido.' })
    return patchRecordType(app.pg, user, params.data.id, body.data)
  })
  app.post('/custom-fields', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const body = fieldInputSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message || 'Campo inválido.' })
    return reply.code(201).send(await createProfileField(app.pg, user, body.data))
  })
  app.patch('/custom-fields/:id', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const params = idSchema.safeParse(request.params)
    const body = fieldPatchSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Configuração do campo inválida.' })
    return patchProfileField(app.pg, user, params.data.id, body.data)
  })
  app.get('/leads/:id/profile', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const params = idSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Lead inválido.' })
    return getLeadProfile(app.pg, user, params.data.id)
  })
  app.put('/leads/:id/profile', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const params = idSchema.safeParse(request.params)
    const body = profileInputSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Dados da ficha inválidos.' })
    return inProfileTransaction(app.pg, db => saveLeadProfile(db, user, params.data.id, body.data))
  })
}
