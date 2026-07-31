import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { forbidden } from '../../http/errors.js'
import { requireAdminRole, requireAuth } from '../../http/guards.js'
import { testCnpjaProvider } from '../radar/cnpjaClient.js'
import {
  getAdminChannelConnections,
  getAdminHubSummary,
  getAuditEvents,
  getClientModuleLimits,
  getEmailProviderConnections,
  getGlobalUploadLimit,
  getOrganizationsWithLimits,
  loadPlatformProviderSecret,
  getProviderConnectionById,
  getProviderConnections,
  getSmtp2GoSummary,
  getSmtp2GoSubaccounts,
  getUsageCounters,
  recordAuditEvent,
  storePlatformProviderSecret,
  updateClientUploadLimit,
  updateGlobalUploadLimit,
  updateProviderConnectionHealth,
  upsertClientModuleLimit,
  upsertEmailProviderConnection,
  upsertProviderConnection,
  upsertSmtp2GoSubaccount,
} from './adminRepository.js'
import {
  applyBlueprintToContract,
  createClientOrganization,
  createContract,
  getActiveContractForClient,
  getClientForUser,
  getContractById,
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
const providerConnectionParams = z.object({ providerId: z.string().uuid() })
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

const providerSecretSchema = z.object({
  apiKey: z.string().min(10),
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

const smtp2GoSubaccountSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  connectionId: z.string().uuid(),
  smtp2goAccountId: z.string().min(1),
  name: z.string().min(1),
  monthlyQuota: z.number().int().nonnegative().optional(),
  dailySendLimit: z.number().int().nonnegative().optional(),
  status: z.enum(['active', 'paused', 'failed']).optional(),
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
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getProviderConnections(app.pg)
  })

  app.post('/admin/provider-connections', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = providerConnectionSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return upsertProviderConnection(app.pg, parsed.data)
  })

  app.post('/admin/provider-connections/:providerId/test', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = providerConnectionParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })

    const provider = await getProviderConnectionById(app.pg, params.data.providerId)
    if (!provider) return reply.code(404).send({ error: 'provider_not_found' })
    if (!isCredentialManagedProvider(provider.providerKey)) {
      return reply.code(400).send({ error: 'unsupported_provider_test' })
    }

    const apiKey = await loadPlatformProviderSecret(app.pg, provider.id, 'api_key', app.config.SESSION_SECRET)
    const result = await testProviderConnection(provider.providerKey, apiKey, provider.publicConfig)
    const updatedProvider = await updateProviderConnectionHealth(app.pg, provider.id, {
      status: result.ok ? 'active' : 'failed',
      lastError: result.ok ? null : result.message,
    })

    return {
      ok: result.ok,
      message: result.message,
      checkedAt: updatedProvider?.lastCheckedAt ?? new Date().toISOString(),
      provider: updatedProvider,
      permissions: result.permissions,
    }
  })

  app.post('/admin/provider-connections/:providerId/credential', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = providerConnectionParams.safeParse(request.params)
    const parsed = providerSecretSchema.safeParse(request.body)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const provider = await getProviderConnectionById(app.pg, params.data.providerId)
    if (!provider) return reply.code(404).send({ error: 'provider_not_found' })
    if (!isCredentialManagedProvider(provider.providerKey)) {
      return reply.code(400).send({ error: 'unsupported_provider_credential' })
    }

    const secret = await storePlatformProviderSecret(app.pg, {
      providerConnectionId: provider.id,
      secretKind: 'api_key',
      value: parsed.data.apiKey,
      metadata: { provider: provider.providerKey, source: 'admin' },
    }, app.config.SESSION_SECRET)

    const updatedProvider = await getProviderConnectionById(app.pg, provider.id)

    return {
      ok: true,
      reference: secret.reference,
      provider: updatedProvider,
    }
  })

  app.get('/admin/email-provider-connections', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getEmailProviderConnections(app.pg)
  })

  app.post('/admin/email-provider-connections', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = emailProviderConnectionSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return upsertEmailProviderConnection(app.pg, parsed.data)
  })

  app.get('/admin/smtp2go-subaccounts', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getSmtp2GoSubaccounts(app.pg)
  })

  app.post('/admin/smtp2go-subaccounts', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = smtp2GoSubaccountSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return upsertSmtp2GoSubaccount(app.pg, parsed.data)
  })

  app.get('/admin/client-module-limits', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const query = adminQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() })

    return getClientModuleLimits(app.pg, query.data.organizationId)
  })

  app.post('/admin/client-module-limits', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = clientModuleLimitSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return upsertClientModuleLimit(app.pg, parsed.data)
  })

  app.get('/admin/usage-counters', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const query = adminQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() })

    return getUsageCounters(app.pg, query.data.organizationId)
  })

  app.get('/admin/audit-events', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const query = adminQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() })

    return getAuditEvents(app.pg, query.data.limit ?? 50)
  })

  app.post('/admin/audit-events', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = auditEventSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return recordAuditEvent(app.pg, parsed.data)
  })

  app.get('/admin/channel-connections', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getAdminChannelConnections(app.pg)
  })

  app.get('/admin/hub-summary', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getAdminHubSummary(app.pg)
  })

  app.get('/admin/smtp2go-summary', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getSmtp2GoSummary(app.pg)
  })

  app.get('/admin/upload-limit/global', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return { limit: await getGlobalUploadLimit(app.pg) }
  })

  app.put('/admin/upload-limit/global', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = uploadLimitSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    await updateGlobalUploadLimit(app.pg, parsed.data.limit)
    return { ok: true }
  })

  app.get('/admin/upload-limit/organizations', async (request, reply) => {
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getOrganizationsWithLimits(app.pg)
  })

  app.put('/admin/upload-limit/organizations/:organizationId', async (request, reply) => {
    requireAdminRole(request)
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
    requireAdminRole(request)
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = moduleSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    return upsertPlatformModule(app.pg, parsed.data)
  })

  app.get('/organizations', async (request, reply) => {
    const ctx = requireAuth(request)
    const organizations = await getOrganizations(app.pg)
    if (ctx.role === 'yux_admin' || ctx.role === 'yux_operator') return organizations
    return organizations.filter((organization) => ctx.organizationIds.includes(organization.id))
  })

  app.post('/organizations/client', async (request, reply) => {
    requireAdminRole(request)
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
    const params = userParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })
    const ctx = requireAuth(request)
    if (ctx.userId !== params.data.userId && ctx.role !== 'yux_admin' && ctx.role !== 'yux_operator') throw forbidden()

    return getMembershipsForUser(app.pg, params.data.userId)
  })

  app.get('/users/:userId/client', async (request, reply) => {
    const params = userParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })
    const ctx = requireAuth(request)
    if (ctx.userId !== params.data.userId && ctx.role !== 'yux_admin' && ctx.role !== 'yux_operator') throw forbidden()

    return getClientForUser(app.pg, params.data.userId)
  })

  app.get('/users/:userId/portal-contract-context', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = userParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() })
    const ctx = requireAuth(request)
    if (ctx.userId !== params.data.userId && ctx.role !== 'yux_admin' && ctx.role !== 'yux_operator') throw forbidden()

    return getPortalContractContextForUser(app.pg, user, params.data.userId)
  })

  app.get('/packages', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return getPackages(app.pg)
  })

  app.post('/packages/upsert', async (request, reply) => {
    requireAdminRole(request)
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
    requireAdminRole(request)
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
    requireAdminRole(request)
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

    const contract = await getContractById(app.pg, user, params.data.contractId)
    if (!contract) return reply.code(404).send({ error: 'contract_not_found' })
    return contract.modules
  })

  app.put('/contracts/:contractId/modules/:moduleKey', async (request, reply) => {
    requireAdminRole(request)
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
    requireAdminRole(request)
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
    requireAdminRole(request)
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

type Smtp2GoTestResult = {
  ok: boolean
  message: string
  permissions?: string[]
}

function isCredentialManagedProvider(providerKey: string) {
  return providerKey === 'smtp2go' || providerKey === 'cnpja'
}

async function testProviderConnection(
  providerKey: string,
  apiKey: string | null,
  publicConfig?: Record<string, unknown>,
): Promise<Smtp2GoTestResult> {
  if (providerKey === 'smtp2go') return testSmtp2GoProvider(apiKey)
  if (providerKey === 'cnpja') return testCnpjaProvider(apiKey, publicConfig as Parameters<typeof testCnpjaProvider>[1])
  return { ok: false, message: 'Provedor nao suportado para teste automatico.' }
}

async function testSmtp2GoProvider(apiKey?: string | null): Promise<Smtp2GoTestResult> {
  if (!apiKey) {
    return {
      ok: false,
      message: 'Credencial master SMTP2GO nao esta disponivel no backend.',
    }
  }

  try {
    const response = await fetch('https://api.smtp2go.com/v3/api_keys/permissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': apiKey,
      },
      body: '{}',
    })
    const body = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        ok: false,
        message: extractSmtp2GoError(body) || `SMTP2GO retornou HTTP ${response.status}.`,
      }
    }

    const permissions = extractSmtp2GoPermissions(body)
    return {
      ok: true,
      message: permissions.length
        ? `Conexao validada. ${permissions.length} permissao(oes) retornada(s) pela API.`
        : 'Conexao validada pela API do SMTP2GO.',
      permissions,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Nao foi possivel conectar ao SMTP2GO.',
    }
  }
}

function extractSmtp2GoError(body: unknown) {
  if (!body || typeof body !== 'object') return null
  const value = body as { data?: unknown; error?: unknown; message?: unknown }
  if (typeof value.error === 'string') return value.error
  if (typeof value.message === 'string') return value.message
  if (value.data && typeof value.data === 'object') {
    const data = value.data as { error?: unknown; message?: unknown }
    if (typeof data.error === 'string') return data.error
    if (typeof data.message === 'string') return data.message
  }
  return null
}

function extractSmtp2GoPermissions(body: unknown) {
  if (!body || typeof body !== 'object') return []
  const value = body as { data?: unknown; permissions?: unknown }
  const candidates = [
    value.permissions,
    value.data && typeof value.data === 'object' ? (value.data as { permissions?: unknown }).permissions : undefined,
    value.data && typeof value.data === 'object' ? (value.data as { endpoints?: unknown }).endpoints : undefined,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((item): item is string => typeof item === 'string')
  }

  return []
}
