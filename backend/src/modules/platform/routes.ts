import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import {
  getAdminChannelConnections,
  getAdminHubSummary,
  getAuditEvents,
  getClientModuleLimits,
  getEmailProviderConnections,
  getGlobalUploadLimit,
  getOrganizationsWithLimits,
  getProviderConnections,
  getSmtp2GoSummary,
  getUsageCounters,
  recordAuditEvent,
  updateClientUploadLimit,
  updateGlobalUploadLimit,
  upsertClientModuleLimit,
  upsertEmailProviderConnection,
  upsertProviderConnection,
} from './adminRepository.js'
import {
  applyBlueprintToContract,
  createClientOrganization,
  createContract,
  getActiveContractForClient,
  getClientForUser,
  getContractById,
  getContractModules,
  getContractsForClient,
  getMembershipsForUser,
  getOrganizations,
  getPackageById,
  getPackages,
  getPlatformBlueprintById,
  getPlatformBlueprints,
  getPlatformContext,
  getPlatformContracts,
  getPlatformModules,
  getPortalContractContextForClient,
  getPortalContractContextForUser,
  getRoles,
  setContractModule,
  setPackageModules,
  updateContract,
  upsertPackageDefinition,
  upsertPlatformModule,
} from './repository.js'

const userParams = z.object({ userId: z.string().uuid() })
const clientParams = z.object({ clientId: z.string().uuid() })
const contractParams = z.object({ contractId: z.string().uuid() })
const packageParams = z.object({ packageId: z.string().uuid() })
const blueprintParams = z.object({ blueprintId: z.string().uuid() })
const blueprintApplicationSchema = z.object({
  blueprintId: z.string().uuid(),
  contractId: z.string().uuid(),
  organizationId: z.string().uuid(),
})
const contractModuleParams = z.object({
  contractId: z.string().uuid(),
  moduleKey: z.string().min(1),
})

const clientOrganizationSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().optional(),
})

const moduleSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  base: z.boolean(),
  internalRoute: z.string().nullable().optional(),
  portalRoute: z.string().nullable().optional(),
  requiredPermissions: z.array(z.string()).optional(),
})

const packageSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  moduleKeys: z.array(z.string()),
})

const packageModulesSchema = z.object({
  moduleKeys: z.array(z.string()),
})

const contractSchema = z.object({
  clientId: z.string().uuid(),
  packageId: z.string().uuid(),
  name: z.string().min(1),
  status: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().nullable().optional(),
  value: z.number().nullable().optional(),
  billingCycle: z.string().min(1),
  notes: z.string().nullable().optional(),
})

const contractPatchSchema = contractSchema
  .omit({ clientId: true })
  .partial()
  .extend({
    packageId: z.string().uuid().optional(),
  })

const contractModuleSchema = z.object({
  enabled: z.boolean(),
})

const adminQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
})

const providerConnectionSchema = z.object({
  id: z.string().uuid().optional(),
  providerType: z.string().min(1),
  providerKey: z.string().min(1),
  displayName: z.string().min(1),
  environment: z.string().optional(),
  status: z.string().optional(),
  publicConfig: z.record(z.string(), z.unknown()).optional(),
  secretReference: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  fallbackProviderId: z.string().uuid().nullable().optional(),
})

const emailProviderConnectionSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  status: z.string().optional(),
  tokenReference: z.string().nullable().optional(),
  defaultFromEmail: z.string().nullable().optional(),
  defaultFromName: z.string().nullable().optional(),
  dailySendLimit: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const clientModuleLimitSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  contractId: z.string().uuid().nullable().optional(),
  moduleKey: z.string().min(1),
  limitKey: z.string().min(1),
  limitValue: z.number().nonnegative(),
  source: z.string().optional(),
  effectiveFrom: z.string().optional(),
  effectiveUntil: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const auditEventSchema = z.object({
  actorUserId: z.string().uuid().nullable().optional(),
  actorRole: z.string().nullable().optional(),
  eventType: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().uuid().nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  contractId: z.string().uuid().nullable().optional(),
  safeBefore: z.record(z.string(), z.unknown()).optional(),
  safeAfter: z.record(z.string(), z.unknown()).optional(),
  note: z.string().nullable().optional(),
})

const uploadLimitSchema = z.object({
  limit: z.number().int().positive(),
})

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

export async function registerPlatformRoutes(app: FastifyInstance) {
  app.get('/context', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getPlatformContext(app.pg, user)
  })

  app.get('/modules', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getPlatformModules(app.pg)
  })

  app.get('/admin/provider-connections', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getProviderConnections(app.pg)
  })

  app.post('/admin/provider-connections', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = providerConnectionSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return upsertProviderConnection(app.pg, parsed.data)
  })

  app.get('/admin/email-provider-connections', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getEmailProviderConnections(app.pg)
  })

  app.post('/admin/email-provider-connections', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = emailProviderConnectionSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return upsertEmailProviderConnection(app.pg, parsed.data)
  })

  app.get('/admin/client-module-limits', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const query = adminQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() })

    return getClientModuleLimits(app.pg, query.data.organizationId)
  })

  app.post('/admin/client-module-limits', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = clientModuleLimitSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return upsertClientModuleLimit(app.pg, parsed.data)
  })

  app.get('/admin/usage-counters', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const query = adminQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() })

    return getUsageCounters(app.pg, query.data.organizationId)
  })

  app.get('/admin/audit-events', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const query = adminQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() })

    return getAuditEvents(app.pg, query.data.limit ?? 50)
  })

  app.post('/admin/audit-events', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = auditEventSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return recordAuditEvent(app.pg, parsed.data)
  })

  app.get('/admin/channel-connections', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getAdminChannelConnections(app.pg)
  })

  app.get('/admin/hub-summary', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getAdminHubSummary(app.pg)
  })

  app.get('/admin/smtp2go-summary', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getSmtp2GoSummary(app.pg)
  })

  app.get('/admin/upload-limit/global', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return { limit: await getGlobalUploadLimit(app.pg) }
  })

  app.put('/admin/upload-limit/global', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = uploadLimitSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    await updateGlobalUploadLimit(app.pg, parsed.data.limit)
    return { ok: true }
  })

  app.get('/admin/upload-limit/organizations', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getOrganizationsWithLimits(app.pg)
  })

  app.put('/admin/upload-limit/organizations/:organizationId', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ organizationId: z.string().uuid() }).safeParse(request.params)
    const parsed = uploadLimitSchema.safeParse(request.body)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    await updateClientUploadLimit(app.pg, params.data.organizationId, parsed.data.limit)
    return { ok: true }
  })

  app.post('/modules/upsert', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = moduleSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return upsertPlatformModule(app.pg, parsed.data)
  })

  app.get('/organizations', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getOrganizations(app.pg)
  })

  app.post('/organizations/client', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = clientOrganizationSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return createClientOrganization(app.pg, parsed.data)
  })

  app.get('/roles', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getRoles(app.pg)
  })

  app.get('/users/:userId/memberships', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = userParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })

    return getMembershipsForUser(app.pg, params.data.userId)
  })

  app.get('/users/:userId/client', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = userParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })

    return getClientForUser(app.pg, params.data.userId)
  })

  app.get('/users/:userId/portal-contract-context', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = userParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })

    return getPortalContractContextForUser(app.pg, user, params.data.userId)
  })

  app.get('/packages', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getPackages(app.pg)
  })

  app.post('/packages/upsert', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = packageSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return upsertPackageDefinition(app.pg, parsed.data)
  })

  app.get('/packages/:packageId', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = packageParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })

    const packageDefinition = await getPackageById(app.pg, params.data.packageId)
    if (!packageDefinition) return reply.code(404).send({ error: 'package_not_found' })
    return packageDefinition
  })

  app.put('/packages/:packageId/modules', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = packageParams.safeParse(request.params)
    const parsed = packageModulesSchema.safeParse(request.body)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return setPackageModules(app.pg, params.data.packageId, parsed.data.moduleKeys)
  })

  app.get('/contracts', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getPlatformContracts(app.pg, user)
  })

  app.post('/contracts', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = contractSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return createContract(app.pg, user, parsed.data)
  })

  app.get('/contracts/:contractId/modules', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = contractParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })

    return getContractModules(app.pg, params.data.contractId)
  })

  app.put('/contracts/:contractId/modules/:moduleKey', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = contractModuleParams.safeParse(request.params)
    const parsed = contractModuleSchema.safeParse(request.body)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return setContractModule(app.pg, params.data.contractId, params.data.moduleKey, parsed.data.enabled)
  })

  app.get('/contracts/:contractId', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = contractParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })

    const contract = await getContractById(app.pg, user, params.data.contractId)
    if (!contract) return reply.code(404).send({ error: 'contract_not_found' })
    return contract
  })

  app.patch('/contracts/:contractId', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = contractParams.safeParse(request.params)
    const parsed = contractPatchSchema.safeParse(request.body)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const contract = await updateContract(app.pg, user, params.data.contractId, parsed.data)
    if (!contract) return reply.code(404).send({ error: 'contract_not_found' })
    return contract
  })

  app.get('/clients/:clientId/active-contract', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = clientParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })

    return getActiveContractForClient(app.pg, user, params.data.clientId)
  })

  app.get('/clients/:clientId/contracts', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = clientParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })

    return getContractsForClient(app.pg, user, params.data.clientId)
  })

  app.get('/clients/:clientId/portal-contract-context', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = clientParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })

    return getPortalContractContextForClient(app.pg, user, params.data.clientId)
  })

  app.get('/blueprints', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getPlatformBlueprints(app.pg)
  })

  app.post('/blueprints/apply', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = blueprintApplicationSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return applyBlueprintToContract(app.pg, user, parsed.data)
  })

  app.get('/blueprints/:blueprintId', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = blueprintParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })

    const blueprint = await getPlatformBlueprintById(app.pg, params.data.blueprintId)
    if (!blueprint) return reply.code(404).send({ error: 'blueprint_not_found' })
    return blueprint
  })
}
