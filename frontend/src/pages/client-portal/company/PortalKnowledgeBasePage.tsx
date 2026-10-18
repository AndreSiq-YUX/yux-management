import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PortalPage } from '@/components/client-portal/PortalPage'
import { KnowledgeCreateDialog } from '@/components/company-intelligence/KnowledgeCreateDialog'
import { KnowledgeLibrary } from '@/components/company-intelligence/KnowledgeLibrary'
import { ErrorState, SectionCard, portalButtonClasses } from '@/components/portal-ui'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { countItems } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'
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
    knowledgeDocuments,
    productsServices,
  } = usePortalMarketingContext({ resources: ['knowledgeDocuments', 'productsServices'] })
  const [documents, setDocuments] = useState<CompanyKnowledgeDocument[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const loadLibrary = useCallback(async (quiet = false) => {
    if (!organization?.id) return
    if (!quiet) setLibraryLoading(true)
    try {
      setDocuments(await companyIntelligenceService.listKnowledge(organization.id))
    } catch (failure) {
      console.error('Falha ao carregar base editável:', failure)
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
  const returnHref = resolveKnowledgeReturnHref(searchParams.get('returnToKind'), searchParams.get('returnToId'), portalPath)

  return (
    <PortalPage
      eyebrow="Empresa"
      title="Base de conhecimento"
      description="Tudo o que a YUX e o atendimento podem usar para responder, criar campanhas, páginas e conteúdos com informação correta sobre a sua empresa."
      primaryAction={
        <button type="button" onClick={() => setCreateOpen(true)} className={portalButtonClasses('primary')}>
          <Plus aria-hidden="true" />
          Adicionar conhecimento
        </button>
      }
      metrics={[
        { label: 'Documentos', value: String(effectiveDocuments.length), detail: `${publishedCount} ${publishedCount === 1 ? 'publicado' : 'publicados'} e ${indexedCount} ${indexedCount === 1 ? 'pronto' : 'prontos'} para publicar.` },
        { label: 'Ofertas ativas', value: String(activeProducts.length), detail: 'Produtos e serviços usados como contexto comercial.' },
      ]}
      help={[
        'Envie documentos, cadastre perguntas frequentes, produtos, serviços, políticas, preços e respostas a objeções.',
        'Importe o seu site e revise o conhecimento extraído antes de usar.',
        'Aprove o que está correto para o atendimento, as respostas sugeridas e o Marketing Studio.',
        'Defina o que pode ser usado no atendimento aos seus clientes e o que é só de uso interno.',
      ]}
      related={[
        { label: 'Agente de IA', href: '/portal/atendimento/agente-ia' },
        { label: 'Marketing Studio', href: '/portal/marketing/studio' },
        { label: 'Marca e tom de voz', href: '/portal/empresa/marca' },
      ]}
    >
      {returnHref && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-yx-ok-line bg-yx-ok-soft p-4">
          <div>
            <strong className="text-yx-fg">Correção de conhecimento em andamento</strong>
            <p className="text-sm text-yx-fg-2">Salve ou publique o necessário e retorne à missão para revalidar o contexto.</p>
          </div>
          <Link to={returnHref} className={portalButtonClasses('primary')}>Retornar à missão</Link>
        </div>
      )}

      <KnowledgeProgress documents={documents} />

      <SectionCard
        id="company-library"
        title="Biblioteca da empresa"
        description="Escreva conteúdo, importe páginas do site ou envie documentos para revisão."
        action={
          <button type="button" onClick={() => void loadLibrary()} disabled={libraryLoading} className={portalButtonClasses('ghost')}>
            <RefreshCw aria-hidden="true" className={cn(libraryLoading && 'animate-spin motion-reduce:animate-none')} />
            Atualizar
          </button>
        }
        className="scroll-mt-6"
      >
        {error ? <ErrorState title="Não foi possível carregar parte da base." description={error} className="mb-4" /> : null}
        <KnowledgeLibrary documents={documents} loading={libraryLoading || (loading && documents.length === 0)} onChanged={replaceDocument} />
      </SectionCard>

      {organization?.id && <KnowledgeCreateDialog open={createOpen} onOpenChange={setCreateOpen} organizationId={organization.id} contractId={activeContract?.id} onCreated={created => created.forEach(replaceDocument)} />}
    </PortalPage>
  )
}

/** Barra de progresso compacta: Enviar → Processar → Revisar → Publicar → Ver uso (somente progresso comprovado). */
function KnowledgeProgress({ documents }: { documents: CompanyKnowledgeDocument[] }) {
  const steps = [
    { label: 'Enviar', complete: documents.length > 0 },
    { label: 'Processar', complete: documents.some(document => !['draft', 'indexing'].includes(document.status)) },
    { label: 'Revisar', complete: documents.some(document => ['indexed', 'published'].includes(document.status)) },
    { label: 'Publicar', complete: documents.some(document => document.status === 'published' && document.currentPublicationId) },
    { label: 'Ver uso', complete: documents.some(document => Boolean(document.lastUsedQueryId)) },
  ]
  const done = steps.filter(step => step.complete).length
  const nextIndex = steps.findIndex(step => !step.complete)
  const percent = Math.round((done / steps.length) * 100)
  return (
    <section aria-label="Progresso do conhecimento" className="rounded-[10px] border border-yx-line bg-yx-surface px-[18px] py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] font-medium text-yx-fg">
          {nextIndex === -1 ? 'Todas as etapas concluídas' : <>Próximo passo: <strong>{steps[nextIndex].label}</strong></>}
        </p>
        <p className="font-mono text-xs text-yx-fg-3">{done} de {steps.length} etapas</p>
      </div>
      <div
        role="progressbar"
        aria-label="Progresso do conhecimento"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${done} de ${steps.length} etapas`}
        className="mt-2 h-1.5 overflow-hidden rounded-[3px] bg-yx-bar-track"
      >
        <div className="h-full rounded-[3px] bg-brand-gradient" style={{ width: `${percent}%` }} />
      </div>
      <ol className="m-0 mt-2 grid list-none grid-cols-5 gap-1 p-0 text-center font-mono text-[11px] text-yx-fg-3">
        {steps.map((step, index) => (
          <li key={step.label} aria-current={index === nextIndex ? 'step' : undefined} className={cn(step.complete && 'text-yx-ok', index === nextIndex && 'font-semibold text-yx-blue')}>
            {step.complete ? '✓ ' : ''}{step.label}
          </li>
        ))}
      </ol>
    </section>
  )
}

function resolveKnowledgeReturnHref(kind: string | null, id: string | null, portalPath: (href?: string) => string) {
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null
  if (kind === 'conversation') return portalPath(`/portal/missoes/conversas/${id}`)
  if (kind === 'mission') return portalPath(`/portal/missoes/${id}`)
  return null
}
