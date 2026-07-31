import type { FastifyRequest } from 'fastify'
import { ApiError, forbidden, unauthorized } from './errors.js'
import type { RequestContext } from './request-context.js'

export function requireAuth(request: FastifyRequest): RequestContext {
  if (!request.ctx) throw unauthorized()
  return request.ctx
}

export function requireInternalRole(request: FastifyRequest): RequestContext {
  const ctx = requireAuth(request)
  if (ctx.role !== 'yux_admin' && ctx.role !== 'yux_operator') throw forbidden()
  return ctx
}

export function requireAdminRole(request: FastifyRequest): RequestContext {
  const ctx = requireAuth(request)
  if (ctx.role !== 'yux_admin') throw forbidden()
  return ctx
}

export function requireMembership(request: FastifyRequest, organizationId: string): RequestContext {
  const ctx = requireAuth(request)
  if (ctx.role === 'yux_admin' || ctx.role === 'yux_operator') return ctx
  if (!ctx.organizationIds.includes(organizationId)) throw forbidden()
  return ctx
}

export function requireOrganizationScope(request: FastifyRequest, organizationId?: string): RequestContext {
  const ctx = requireAuth(request)
  if (ctx.role === 'yux_admin' || ctx.role === 'yux_operator') return ctx
  if (!organizationId) throw new ApiError(400, 'organization_id_required')
  return requireMembership(request, organizationId)
}
