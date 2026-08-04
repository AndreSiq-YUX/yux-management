import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Plus, RefreshCw } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { KnowledgeCreateDialog } from '@/components/company-intelligence/KnowledgeCreateDialog'
import { KnowledgeLibrary } from '@/components/company-intelligence/KnowledgeLibrary'
import { KnowledgeReadinessPanel } from '@/components/growth-workspace/KnowledgeReadinessPanel'
import { Button } from '@/components/ui/button'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { countItems } from '@/lib/client-portal/portalDisplay'
import { companyIntelligenceService } from '@/services/companyIntelligenceService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CompanyKnowledgeDocument } from '@/types/companyIntelligence'

export function PortalKnowledgeBasePage() {
  const organization = usePlatformStore(state => state.organization)
  const activeContract = usePlatformStore(state => state.activeContract)
  const {
    loading,
    error,
    brandProfile,
    knowledgeDocuments,
    knowledgeMatches,
    productsServices,
    settings,
  } = usePortalMarketingContext()
  const [documents, setDocuments] = useState<CompanyKnowledgeDocument[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const loadLibrary = useCallback(async (quiet = false) => {
    if (!organization?.id) return
    if (!quiet) setLibraryLoading(true)
    try {
      setDocuments(await companyIntelligenceService.listKnowledge(organization.id))
    } catch (error) {
      console.error('Falha ao carregar base editável:', error)
    } finally {
      if (!quiet) setLibraryLoading(false)
    }
  }, [organization?.id])

  useEffect(() => { void loadLibrary() }, [loadLibrary])
  useEffect(() => {
    if (!documents.some(document => document.status === 'indexing')) return
    const interval = window.setInterval(() => { void loadLibrary(true) }, 5_000)
    return () => window.clearInterval(interval)
  }, [documents, loadLibrary])

  const replaceDocument = (changed: CompanyKnowledgeDocument) => {
    setDocuments(current => current.some(item => item.id === changed.id)
      ? current.map(item => item.id === changed.id ? changed : item)
      : [changed, ...current])
  }

  const effectiveDocuments = documents.length ? documents : knowledgeDocuments
  const publishedCount = countItems(effectiveDocuments, document => document.status === 'published')
  const indexedCount = countItems(effectiveDocuments, document => document.status === 'indexed')
  const activeProducts = productsServices.filter(product => product.status === 'active')
  const brandReadinessProfile = brandProfile || (settings ? {
    toneOfVoice: settings.toneOfVoice || '',
    persona: settings.persona || '',
    brandVoiceSummary: settings.toneOfVoice || '',
    forbiddenTopics: settings.forbiddenTopics || [],
    priorityTopics: settings.priorityTopics || [],
    visualGuidelines: settings.visualPreferences,
    status: 'active' as const,
  } : null)

  return (
    <PortalJourneyPage
      eyebrow="Empresa"
      title="Base de Conhecimento"
      description="Fonte compartilhada da empresa para IA, marketing, respostas sugeridas, campanhas, landing pages, FAQ e suporte."
      icon={BookOpen}
      metrics={[
        { label: 'Documentos', value: String(effectiveDocuments.length), detail: `${publishedCount} publicados e ${indexedCount} prontos para publicar.` },
        { label: 'Ofertas', value: String(activeProducts.length), detail: 'Produtos e servicos ativos para contexto comercial.' },
        { label: 'Busca IA', value: String(knowledgeMatches.length), detail: 'Trechos recuperados pela busca semantica.' },
      ]}
      capabilities={[
        'Enviar documentos, cadastrar FAQs, produtos, servicos, politicas, precos e objecoes.',
        'Importar site, ver paginas lidas e revisar conhecimento extraido.',
        'Aprovar conhecimento para Agente IA, respostas sugeridas e Marketing Studio.',
        'Marcar conteudo como publico ou interno e acompanhar lacunas detectadas pela IA.',
      ]}
      secondaryActions={[
        { label: 'Agente IA', href: '/portal/atendimento/agente-ia' },
        { label: 'Marketing Studio', href: '/portal/marketing/studio' },
        { label: 'Marca e Tom de Voz', href: '/portal/empresa/marca' },
      ]}
      note="A regra de produto e evitar bases duplicadas por modulo. Esta pagina representa a fonte unica de conhecimento da empresa."
    >
      <KnowledgeReadinessPanel
        profile={brandReadinessProfile}
        knowledgeDocuments={knowledgeDocuments}
        productsServices={productsServices}
        knowledgeMatches={knowledgeMatches}
      />
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4">
          <div><h2 className="font-semibold text-gray-950">Biblioteca da empresa</h2><p className="text-sm text-gray-600">Escreva conteúdo, importe páginas do site ou envie documentos para revisão.</p></div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => void loadLibrary()} disabled={libraryLoading}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button><Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Adicionar conhecimento</Button></div>
        </div>
        {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <KnowledgeLibrary documents={documents} loading={libraryLoading || loading && documents.length === 0} onChanged={replaceDocument} />
      </section>
      {organization?.id && <KnowledgeCreateDialog open={createOpen} onOpenChange={setCreateOpen} organizationId={organization.id} contractId={activeContract?.id} onCreated={created => created.forEach(replaceDocument)} />}
    </PortalJourneyPage>
  )
}
