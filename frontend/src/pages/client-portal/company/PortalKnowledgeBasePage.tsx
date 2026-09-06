import { useCallback, useEffect, useState } from 'react'
import { BookOpen, BrainCircuit, Building2, Check, Plus, RefreshCw } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { KnowledgeCreateDialog } from '@/components/company-intelligence/KnowledgeCreateDialog'
import { KnowledgeLibrary } from '@/components/company-intelligence/KnowledgeLibrary'
import { KnowledgeReadinessPanel } from '@/components/growth-workspace/KnowledgeReadinessPanel'
import { Button } from '@/components/ui/button'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { countItems } from '@/lib/client-portal/portalDisplay'
import { companyIntelligenceService } from '@/services/companyIntelligenceService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CompanyKnowledgeDocument } from '@/types/companyIntelligence'

export function PortalKnowledgeBasePage() {
  const organization = usePlatformStore(state => state.organization)
  const activeContract = usePlatformStore(state => state.activeContract)
  const portalPath = usePortalWorkspacePath()
  const [searchParams] = useSearchParams()
  const {
    loading,
    error,
    brandProfile,
    knowledgeDocuments,
    knowledgeMatches,
    productsServices,
    settings,
  } = usePortalMarketingContext({ resources: ['brandProfile', 'knowledgeDocuments', 'knowledgeMatches', 'productsServices', 'settings'] })
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
    visualIdentity: {},
    visualGuidelines: settings.visualPreferences,
    status: 'active' as const,
  } : null)
  const returnHref = resolveKnowledgeReturnHref(searchParams.get('returnToKind'), searchParams.get('returnToId'), portalPath)

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
      <nav aria-label="Áreas de conhecimento" className="grid gap-3 sm:grid-cols-2">
        <a href="#company-library" className="border border-blue-200 bg-blue-50 p-4 text-left"><Building2 className="h-5 w-5 text-blue-700" /><strong className="mt-2 block text-slate-950">Acervo da empresa</strong><span className="mt-1 block text-sm text-slate-600">Fatos, marca, ofertas, políticas e documentos deste workspace.</span></a>
        <Link to={portalPath('/portal/missoes')} className="border border-violet-200 bg-violet-50 p-4 text-left"><BrainCircuit className="h-5 w-5 text-violet-700" /><strong className="mt-2 block text-slate-950">Metodologia estratégica</strong><span className="mt-1 block text-sm text-slate-600">Doutrina YUX governada, aplicada pelas missões conforme perfil e contrato.</span></Link>
      </nav>
      <KnowledgeJourney documents={documents} onAdd={() => setCreateOpen(true)} />
      {returnHref && <div className="flex flex-wrap items-center justify-between gap-3 border border-emerald-200 bg-emerald-50 p-4"><div><strong className="text-emerald-950">Correção de conhecimento em andamento</strong><p className="text-sm text-emerald-800">Salve ou publique o necessário e retorne à missão para revalidar o contexto.</p></div><Button asChild><Link to={returnHref}>Retornar à missão</Link></Button></div>}
      <KnowledgeReadinessPanel
        profile={brandReadinessProfile}
        knowledgeDocuments={documents}
        productsServices={productsServices}
        knowledgeMatches={knowledgeMatches}
      />
      <section id="company-library" className="space-y-4 scroll-mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4">
          <div><h2 className="font-semibold text-gray-950">Biblioteca da empresa</h2><p className="text-sm text-gray-600">Escreva conteúdo, importe páginas do site ou envie documentos para revisão.</p></div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => void loadLibrary()} disabled={libraryLoading}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button><Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Adicionar conhecimento</Button></div>
        </div>
        {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <KnowledgeLibrary documents={documents} loading={libraryLoading || loading && documents.length === 0} onChanged={replaceDocument} />
      </section>
      {organization?.id && <KnowledgeCreateDialog open={createOpen} onOpenChange={setCreateOpen} organizationId={organization.id} contractId={activeContract?.id} onCreated={created => created.forEach(replaceDocument)} />}
    </PortalJourneyPage>
  )
}

function KnowledgeJourney({ documents, onAdd }: { documents: CompanyKnowledgeDocument[]; onAdd: () => void }) {
  const steps = [
    { label: 'Enviar', complete: documents.length > 0 },
    { label: 'Processar', complete: documents.some(document => !['draft', 'indexing'].includes(document.status)) },
    { label: 'Revisar', complete: documents.some(document => ['indexed', 'published'].includes(document.status)) },
    { label: 'Publicar', complete: documents.some(document => document.status === 'published' && document.currentPublicationId) },
    { label: 'Ver uso', complete: documents.some(document => Boolean(document.lastUsedQueryId)) },
  ]
  const next = steps.find(step => !step.complete)?.label
  return <section aria-label="Percurso do conhecimento" className="border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-950">Enviar → Processar → Revisar → Publicar → Ver uso</h2><p className="mt-1 text-sm text-slate-600">Cada etapa mostra somente progresso comprovado pelos registros.</p></div>{next === 'Enviar' && <Button onClick={onAdd}><Plus className="mr-2 h-4 w-4" />Enviar conhecimento</Button>}</div><ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{steps.map((step, index) => <li key={step.label} className={`flex items-center gap-2 border p-3 text-sm ${step.complete ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : index === steps.findIndex(item => !item.complete) ? 'border-blue-300 bg-blue-50 font-semibold text-blue-900' : 'border-slate-200 text-slate-500'}`}>{step.complete ? <Check className="h-4 w-4" /> : <span className="flex h-5 w-5 items-center justify-center rounded-full border text-xs">{index + 1}</span>}{step.label}</li>)}</ol></section>
}

function resolveKnowledgeReturnHref(kind: string | null, id: string | null, portalPath: (href?: string) => string) {
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null
  if (kind === 'conversation') return portalPath(`/portal/missoes/conversas/${id}`)
  if (kind === 'mission') return portalPath(`/portal/missoes/${id}`)
  return null
}
