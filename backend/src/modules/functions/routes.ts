import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { requireAuth, requireInternalRole, requireMembership } from '../../http/guards.js'
import type { JobName } from '../../jobs/queue.js'
import { completeMetaChannelOAuth, disconnectMetaChannel, refreshMetaChannelHealth, startMetaChannelOAuth, testMetaChannel } from '../../lib/meta-channel-oauth.js'

type FunctionPolicy = {
  minRole: 'internal' | 'client_admin'
  organization: 'body' | 'campaign' | 'channel_connection' | 'publishing_run' | null
}

export const FUNCTION_POLICIES: Record<string, FunctionPolicy> = {
  'run-strategy-admin-chat': { minRole: 'internal', organization: null },
  'execute-ad-provider-mutation': { minRole: 'client_admin', organization: 'body' },
  'sync-ad-metrics': { minRole: 'client_admin', organization: 'campaign' },
  'start-meta-channel-connect': { minRole: 'client_admin', organization: 'body' },
  'complete-meta-channel-connect': { minRole: 'client_admin', organization: 'body' },
  'disconnect-meta-channel': { minRole: 'client_admin', organization: 'channel_connection' },
  'refresh-meta-channel-health': { minRole: 'client_admin', organization: 'channel_connection' },
  'send-meta-channel-test': { minRole: 'client_admin', organization: 'channel_connection' },
  'execute-wordpress-publishing': { minRole: 'client_admin', organization: 'publishing_run' },
  'execute-marketing-publishing': { minRole: 'client_admin', organization: 'publishing_run' },
}

const functionSchema = z.object({ body: z.record(z.string(), z.unknown()).optional() })
const uuid = z.string().uuid()

async function getAuthenticatedUser(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[request.server.config.SESSION_COOKIE_NAME]
  if (!token) {
    void reply.code(401).send({ error: 'not_authenticated' })
    return null
  }
  const user = await request.server.authStore.findUserBySession(hashSessionToken(token), new Date())
  if (!user) {
    void reply.code(401).send({ error: 'not_authenticated' })
    return null
  }
  return user
}

function readUuid(body: Record<string, unknown>, field: string) {
  const value = uuid.safeParse(body[field])
  return value.success ? value.data : null
}

async function resolveValidatedOrganizationId(
  app: FastifyInstance,
  policy: FunctionPolicy,
  body: Record<string, unknown>,
) {
  if (policy.organization === null) return null
  if (policy.organization === 'body') return readUuid(body, 'organizationId')

  const reference = policy.organization === 'campaign'
    ? readUuid(body, 'campaignId')
    : policy.organization === 'channel_connection'
      ? readUuid(body, 'connectionId')
      : readUuid(body, 'publishingRunId') ?? readUuid(body, 'organizationId')
  if (!reference) return null

  if (policy.organization === 'publishing_run' && readUuid(body, 'organizationId')) return readUuid(body, 'organizationId')

  const query = policy.organization === 'campaign'
    ? 'SELECT organization_id FROM public.campaigns WHERE id = $1 LIMIT 1'
    : policy.organization === 'channel_connection'
      ? 'SELECT organization_id FROM public.channel_connections WHERE id = $1 LIMIT 1'
      : 'SELECT organization_id FROM public.publishing_runs WHERE id = $1 LIMIT 1'
  const { rows } = await app.pg.query<{ organization_id: string }>(query, [reference])
  return rows[0]?.organization_id ?? null
}

export async function registerFunctionRoutes(app: FastifyInstance) {
  app.post('/:name', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ name: z.string().min(1) }).safeParse(request.params)
    const parsed = functionSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_function_request' })

    const policy = FUNCTION_POLICIES[params.data.name]
    if (!policy) return reply.code(404).send({ error: 'function_not_found' })

    const ctx = requireAuth(request)
    if (policy.minRole === 'internal') requireInternalRole(request)
    if (policy.minRole === 'client_admin' && !['yux_admin', 'yux_operator', 'client_admin'].includes(ctx.role)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const body = parsed.data.body || {}
    const organizationId = await resolveValidatedOrganizationId(app, policy, body)
    if (policy.organization !== null && !organizationId) {
      return reply.code(400).send({ error: 'invalid_function_organization' })
    }
    if (organizationId) requireMembership(request, organizationId)

    // OAuth state and code exchange must be performed synchronously: the browser
    // needs the authorization URL and no credential may ever enter a BullMQ job.
    if (params.data.name === 'start-meta-channel-connect') {
      return startMetaChannelOAuth(app.pg, app.config, { organizationId: organizationId!, userId: ctx.userId, channel: body.channel })
    }
    if (params.data.name === 'complete-meta-channel-connect') {
      return completeMetaChannelOAuth(app.pg, app.config, {
        organizationId: organizationId!, userId: ctx.userId, channel: body.channel,
        state: body.state, code: body.code, assets: body.assets,
      })
    }
    if (params.data.name === 'disconnect-meta-channel') return disconnectMetaChannel(app.pg, organizationId!, String(body.connectionId || ''))
    if (params.data.name === 'refresh-meta-channel-health') return refreshMetaChannelHealth(app.pg, organizationId!, String(body.connectionId || ''))
    if (params.data.name === 'send-meta-channel-test') return testMetaChannel(app.pg, organizationId!, String(body.connectionId || ''))

    const job = await app.jobQueue.add(functionJobName(params.data.name), {
      requestedBy: ctx.userId,
      functionName: params.data.name,
      organizationId,
      body,
    })

    return { success: true, pending: true, functionName: params.data.name, jobId: job.id }
  })
}

function functionJobName(name: string): JobName {
  if (name === 'run-strategy-admin-chat') return 'strategy.adminChat'
  if (name === 'sync-ad-metrics') return 'provider.syncMetrics'
  return 'provider.functionInvoke'
}
