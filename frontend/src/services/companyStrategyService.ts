import { apiRequest } from '@/lib/apiClient'
import type { CompanyStrategyProposal, CompanyStrategy, CompanyStrategyContentV1, CompanyStrategyRevision } from '@/types/companyStrategy'
const root = (organizationId: string) => `/company-intelligence/organizations/${encodeURIComponent(organizationId)}/strategies`
type DraftInput = { content: CompanyStrategyContentV1; expectedVersion: number | null; idempotencyKey: string }
const proposalRoot=(organizationId:string)=>`/company-intelligence/organizations/${encodeURIComponent(organizationId)}/strategy-proposals`
export const companyStrategyService = {
  getProposal:(organizationId:string,id:string)=>apiRequest<CompanyStrategyProposal>(`${proposalRoot(organizationId)}/${id}`),
  applyProposal:(organizationId:string,id:string,input:{expectedStrategyVersion:number|null;idempotencyKey:string;reviewedContent:CompanyStrategyContentV1})=>apiRequest<CompanyStrategy>(`${proposalRoot(organizationId)}/${id}/apply`,{method:'POST',body:input}),
  reviewConversation:(organizationId:string,strategy:CompanyStrategy,clientMessageId:string)=>apiRequest<{conversation:{id:string}}>(`${root(organizationId)}/${strategy.id}/review-conversation`,{method:'POST',body:{expectedVersion:strategy.version,revisionId:(strategy.draftRevision??strategy.publishedRevision)!.id,message:'Revise esta estratégia comigo. Considere a versão indicada como base de edição e proponha melhorias; não publique nem execute ações.',clientMessageId}}),
  list: (organizationId: string) => apiRequest<CompanyStrategy[]>(root(organizationId)),
  get: (organizationId: string, id: string) => apiRequest<CompanyStrategy>(`${root(organizationId)}/${id}`),
  createDraft: (organizationId: string, input: DraftInput) => apiRequest<CompanyStrategy>(root(organizationId), { method: 'POST', body: input }),
  saveDraft: (organizationId: string, id: string, input: DraftInput) => apiRequest<CompanyStrategy>(`${root(organizationId)}/${id}/draft`, { method: 'PUT', body: input }),
  publish: (organizationId: string, strategy: CompanyStrategy, idempotencyKey: string) => {
    const revision = strategy.draftRevision!
    return apiRequest<CompanyStrategy>(`${root(organizationId)}/${strategy.id}/publish`, { method: 'POST', body: { expectedVersion: strategy.version, revisionId: revision.id, expectedContentHash: revision.contentHash, idempotencyKey } })
  },
  setPrimary: (organizationId: string, strategy: CompanyStrategy) => apiRequest<CompanyStrategy>(`${root(organizationId)}/${strategy.id}/primary`, { method: 'POST', body: { expectedVersion: strategy.version } }),
  archive: (organizationId: string, strategy: CompanyStrategy) => apiRequest<CompanyStrategy>(`${root(organizationId)}/${strategy.id}/archive`, { method: 'POST', body: { expectedVersion: strategy.version } }),
  restore: (organizationId: string, strategy: CompanyStrategy) => apiRequest<CompanyStrategy>(`${root(organizationId)}/${strategy.id}/restore`, { method: 'POST', body: { expectedVersion: strategy.version } }),
  history: (organizationId: string, id: string) => apiRequest<CompanyStrategyRevision[]>(`${root(organizationId)}/${id}/revisions`),
}
