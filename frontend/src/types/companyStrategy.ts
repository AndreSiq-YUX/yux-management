export type StrategySectionKind = 'diagnosis' | 'audiences' | 'offers' | 'markets' | 'positioning' | 'channels' | 'initiatives' | 'metrics' | 'constraints' | 'assumptions' | 'next_steps' | 'custom'
export interface CompanyStrategySection { id: string; kind: StrategySectionKind; title: string; body: string; agentUse: 'internal' | 'external_guidance' }
export interface CompanyStrategyContentV1 { schemaVersion: 1; title: string; objective: string; summary: string; sections: CompanyStrategySection[]; references: { productIds: string[]; documentIds: string[] } }
export interface CompanyStrategyRevision { id: string; strategyId: string; revisionNumber: number; content: CompanyStrategyContentV1; contentHash: string; origin: Record<string, unknown>; createdBy: string; createdAt: string }
export interface CompanyStrategy { id: string; organizationId: string; clientId: string | null; version: number; isPrimary: boolean; archivedAt: string | null; draftRevision: CompanyStrategyRevision | null; publishedRevision: CompanyStrategyRevision | null; createdAt: string; updatedAt: string }
export const strategySectionLabels: Record<StrategySectionKind, string> = {
  diagnosis: 'Diagnóstico', audiences: 'Públicos', offers: 'Ofertas e produtos', markets: 'Mercados e regiões', positioning: 'Posicionamento', channels: 'Canais', initiatives: 'Iniciativas', metrics: 'Indicadores', constraints: 'Limites e condições', assumptions: 'Hipóteses', next_steps: 'Próximos passos', custom: 'Seção personalizada',
}
export function emptyCompanyStrategy(): CompanyStrategyContentV1 { return { schemaVersion: 1, title: '', objective: '', summary: '', sections: [], references: { productIds: [], documentIds: [] } } }
