import type { CompanyKnowledgeStatus } from '@/types/companyIntelligence'

export type KnowledgeStateInput = {
  documentStatus: CompanyKnowledgeStatus
  publicationId?: string | null
  eligibleProfiles?: string[]
  lastUsedQueryId?: string | null
  processingError?: string | null
}

export function labelForKnowledgeState(input: KnowledgeStateInput) {
  if (input.documentStatus === 'archived') return 'Arquivado'
  if (input.processingError) return 'Falha no processamento'
  if (input.documentStatus === 'indexing') return 'Processando'
  if (input.documentStatus === 'indexed' && !input.publicationId) return 'Pronto para revisão'
  if (input.lastUsedQueryId) return 'Usado por agente'
  if (input.documentStatus === 'published' && input.publicationId) return 'Publicado'
  if (input.documentStatus === 'draft') return 'Enviado'
  return 'Processando'
}

export function knowledgeProcessingErrorMessage(error?: string) {
  if (!error) return null
  const normalized = error.toLowerCase()
  if (normalized.includes('embedding') || normalized.includes('jina')) {
    return 'O conteúdo foi extraído, mas a busca inteligente não ficou pronta. Tente processar novamente.'
  }
  if (normalized.includes('source') || normalized.includes('file') || normalized.includes('download') || normalized.includes('fetch')) {
    return 'A fonte não pôde ser lida. Verifique o arquivo ou endereço e tente novamente.'
  }
  return 'O processamento não foi concluído. Abra a revisão para ver o que foi preservado.'
}

export function knowledgeJourneyStep(input: KnowledgeStateInput) {
  if (input.lastUsedQueryId) return 4
  if (input.documentStatus === 'published' && input.publicationId) return 4
  if (input.documentStatus === 'indexed') return 2
  if (input.documentStatus === 'indexing') return 1
  return 0
}
