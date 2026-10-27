import {getCompanyPortfolioContext} from '../company-intelligence/portfolio-context.js'
import { getCompanyStrategyContext } from '../company-strategy/context.js'
import { hashCanonical, type Queryable } from './repository.js'
import { verifyMissionKnowledgeContext } from './mission-source-verifier.js'

type PlanningContext = { companyContext: Record<string, unknown>; knowledgeItems: Array<Record<string, unknown>>; sourceIds: string[]; contextHash: string }
/** Shared by every pack, after domain grounding and before freezing the plan snapshot. */
export async function addCompanyStrategyToMissionPlanning<T extends PlanningContext>(db: Queryable, input: { organizationId: string; contractId?: string | null; query: string; context: T }): Promise<T> {
  const strategyIds = [...new Set(input.context.knowledgeItems.filter(item => item.kind === 'company_strategy').map(item => item.companyStrategyId).filter((id): id is string => typeof id === 'string'))]
  const current = await getCompanyStrategyContext(db, { organizationId: input.organizationId, contractId: input.contractId, profileKey: 'growth_strategist', audience: 'client_user', query: input.query, strategyIds })
  if (current.context.coverage.incomplete) throw new Error('mission_company_strategy_context_incomplete')
  const portfolio=await getCompanyPortfolioContext(db,{organizationId:input.organizationId,contractId:input.contractId,profileKey:'growth_strategist',audience:'client_user',query:input.query,representedBusinessIds:current.portfolioSelection.representedBusinessIds})
  const verified = await verifyMissionKnowledgeContext(db, { organizationId: input.organizationId, contractId: input.contractId, audience: 'client_user', agentProfileKey: 'growth_strategist', sourceRefs: current.sources })
  const knowledgeItems = [
    ...input.context.knowledgeItems.filter(item => item.kind !== 'company_strategy'),
    ...verified.knowledgeItems.map(item => ({ ...item, content: JSON.stringify(current.context.selected.find(selected => selected.revisionId === item.id)), contextExcerpt: true })),
  ]
  return { ...input.context, companyContext: { ...input.context.companyContext, company_strategy_context: current.context,portfolio_context:portfolio }, knowledgeItems,
    sourceIds: [...new Set([...input.context.sourceIds, ...verified.sources.map(source => source.id)])].sort(),
    contextHash: hashCanonical({ previous: input.context.contextHash, companyStrategy: current.context,portfolio, sources: verified.sources.map(({content:_content,...source})=>source) }) }
}
