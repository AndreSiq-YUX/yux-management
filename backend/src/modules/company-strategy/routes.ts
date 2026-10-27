import { createMissionConversation,isMissionConversationRolloutEnabled } from '../action-engine/mission-conversations.js'
import { resolveMissionAccountAccess } from '../action-engine/mission-account-availability.js'
import { createBullMqJobId } from '../../jobs/queue.js'
import { assertCompanyStrategyWrite,getCompanyStrategyRevisionForEditing } from './repository.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ApiError } from '../../http/errors.js'
import { requireOrganizationScope } from '../../http/guards.js'
import { runWithDatabaseRequestContext } from '../../db/request-context.js'
import { getCompanyStrategy, listCompanyStrategies, listCompanyStrategyRevisions, publishCompanyStrategy, saveCompanyStrategyDraft, setCompanyStrategyArchived, setPrimaryCompanyStrategy } from './repository.js'
import { strategyDraftCommandSchema, strategyPublishCommandSchema, strategyVersionCommandSchema, type CompanyStrategyAccess } from './schemas.js'
import { applyStrategyProposalSchema } from './schemas.js'
import { applyCompanyStrategyProposal,getCompanyStrategyProposal } from './proposals.js'

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
  const proposalPath='/organizations/:organizationId/strategy-proposals/:proposalId'
  const proposalParams=z.object({organizationId:z.string().uuid(),proposalId:z.string().uuid()})
  app.get(proposalPath,async request=>{
    const route=parse(proposalParams,request.params)
    return getCompanyStrategyProposal(app.pg,companyStrategyRequestAccess(request,route.organizationId),route.proposalId)
  })
  app.post(`${proposalPath}/apply`,async request=>{
    const route=parse(proposalParams,request.params)
    return applyCompanyStrategyProposal(app.pg,companyStrategyRequestAccess(request,route.organizationId),{...parse(applyStrategyProposalSchema,request.body),proposalId:route.proposalId})
  })
  const root = '/organizations/:organizationId/strategies'
  app.post(`${root}/:strategyId/review-conversation`,async(request,reply)=>{
    const route=parse(params,request.params)
    const access=companyStrategyRequestAccess(request,route.organizationId)
    assertCompanyStrategyWrite(access)
    const input=parse(z.object({expectedVersion:z.number().int().positive(),revisionId:z.string().uuid(),message:z.string().trim().min(1).max(12000),clientMessageId:z.string().uuid()}),request.body)
    if(!isMissionConversationRolloutEnabled(app.config,access.organizationId)) throw new ApiError(503,'mission_conversations_disabled')
    const account=await resolveMissionAccountAccess(app.pg,app.config,access)
    if(!account.enabledModules.includes('action_engine')) throw new ApiError(403,'action_engine_not_enabled')
    const strategy=await getCompanyStrategy(app.pg,access,route.strategyId!)
    if(strategy.archivedAt || strategy.version!==input.expectedVersion || (strategy.draftRevision??strategy.publishedRevision)?.id!==input.revisionId) throw new ApiError(409,'company_strategy_version_conflict')
    await getCompanyStrategyRevisionForEditing(app.pg,access,strategy.id,input.revisionId)
    const conversation=await createMissionConversation(app.pg,{organizationId:access.organizationId,contractId:account.contractId,title:`Revisar: ${(strategy.draftRevision??strategy.publishedRevision)!.content.title}`.slice(0,160),firstMessage:input.message,firstMessageClientId:input.clientMessageId,createdBy:access.actorId,idempotencyKey:input.clientMessageId,initialBrief:{companyStrategyReview:{strategyId:strategy.id,revisionId:input.revisionId,expectedVersion:input.expectedVersion}}})
    const job=await app.jobQueue.add('action-engine.processMissionConversation',{conversationId:conversation.id,organizationId:access.organizationId,requestedVersion:conversation.version,audience:access.role.startsWith('yux_')?'internal_operator':'client_user'},{jobId:createBullMqJobId('mission-conversation',conversation.id,conversation.version)})
    return reply.code(202).send({conversation,jobId:job.id})
  })
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
