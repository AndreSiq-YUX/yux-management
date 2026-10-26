import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ApiError } from '../../http/errors.js'
import { requireOrganizationScope } from '../../http/guards.js'
import { runWithDatabaseRequestContext } from '../../db/request-context.js'
import { getCompanyStrategy, listCompanyStrategies, listCompanyStrategyRevisions, publishCompanyStrategy, saveCompanyStrategyDraft, setCompanyStrategyArchived, setPrimaryCompanyStrategy } from './repository.js'
import { strategyDraftCommandSchema, strategyPublishCommandSchema, strategyVersionCommandSchema, type CompanyStrategyAccess } from './schemas.js'

const params = z.object({ organizationId: z.string().uuid(), strategyId: z.string().uuid().optional() })
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new ApiError(400, 'invalid_company_strategy_payload')
  return result.data
}
export function companyStrategyRequestAccess(request: FastifyRequest, organizationId: string): CompanyStrategyAccess {
  const ctx = requireOrganizationScope(request, organizationId)
  return { organizationId, actorId: ctx.userId, role: ctx.role }
}
export async function registerCompanyStrategyRoutes(app: FastifyInstance) {
  const root = '/organizations/:organizationId/strategies'
  app.get(root, async request => {
    const route = parse(params, request.params)
    return listCompanyStrategies(app.pg, companyStrategyRequestAccess(request, route.organizationId))
  })
  app.get(`${root}/:strategyId`, async request => {
    const route = parse(params, request.params)
    return getCompanyStrategy(app.pg, companyStrategyRequestAccess(request, route.organizationId), route.strategyId!)
  })
  app.get(`${root}/:strategyId/revisions`, async request => {
    const route = parse(params, request.params)
    return listCompanyStrategyRevisions(app.pg, companyStrategyRequestAccess(request, route.organizationId), route.strategyId!)
  })
  for (const update of [false, true]) {
    app.route({ method: update ? 'PUT' : 'POST', url: update ? `${root}/:strategyId/draft` : root, handler: async request => {
      const route = parse(params, request.params)
      const input = parse(strategyDraftCommandSchema, request.body)
      if (update === (input.expectedVersion === null)) throw new ApiError(400, 'company_strategy_version_invalid')
      const access = companyStrategyRequestAccess(request, route.organizationId)
      return runWithDatabaseRequestContext({ role: access.role, organizationIds: [access.organizationId], serviceRole: 'api' }, () => saveCompanyStrategyDraft(app.pg, access, { ...input, ...(update ? { strategyId: route.strategyId! } : {}), origin: { kind: 'manual' } }))
    } })
  }
  app.post(`${root}/:strategyId/publish`, async request => {
    const route = parse(params, request.params)
    const access = companyStrategyRequestAccess(request, route.organizationId)
    const input = parse(strategyPublishCommandSchema, request.body)
    return publishCompanyStrategy(app.pg, access, { ...input, strategyId: route.strategyId! })
  })
  for (const operation of ['primary', 'archive', 'restore'] as const) app.post(`${root}/:strategyId/${operation}`, async request => {
    const route = parse(params, request.params)
    const access = companyStrategyRequestAccess(request, route.organizationId)
    const input = parse(strategyVersionCommandSchema, request.body)
    return operation === 'primary' ? setPrimaryCompanyStrategy(app.pg, access, { ...input, strategyId: route.strategyId! })
      : setCompanyStrategyArchived(app.pg, access, { ...input, strategyId: route.strategyId!, archived: operation === 'archive' })
  })
}
