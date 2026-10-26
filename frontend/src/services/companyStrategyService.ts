import { apiRequest } from '@/lib/apiClient'
import type { CompanyStrategy, CompanyStrategyContentV1, CompanyStrategyRevision } from '@/types/companyStrategy'
const root = (organizationId: string) => `/company-intelligence/organizations/${encodeURIComponent(organizationId)}/strategies`
type DraftInput = { content: CompanyStrategyContentV1; expectedVersion: number | null; idempotencyKey: string }
export const companyStrategyService = {
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
