import { useEffect, useMemo, useState } from 'react'
import { Activity, Archive, BookOpen, CheckCircle2, ExternalLink, FileText, Loader2, Settings2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { ConfirmDialog, EmptyState, StatusChip, portalButtonClasses, type StatusChipVariant } from '@/components/portal-ui'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { companyIntelligenceService } from '@/services/companyIntelligenceService'
import { knowledgeProcessingErrorMessage, labelForKnowledgeState } from '@/lib/company-intelligence/knowledgeState'
import { formatPortalDateTime } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'
import type { CompanyKnowledgeDocument, CompanyKnowledgeVisibility, KnowledgeProcessingResult, KnowledgeRetrievalTrace } from '@/types/companyIntelligence'

interface KnowledgeLibraryProps {
  documents: CompanyKnowledgeDocument[]
  loading?: boolean
  onChanged: (document: CompanyKnowledgeDocument) => void
}

/** Permissões em linguagem simples (o valor interno continua sendo `visibility`). */
export const KNOWLEDGE_VISIBILITY_LABELS: Record<CompanyKnowledgeVisibility, string> = {
  external: 'Pode ser usado no atendimento aos seus clientes',
  internal: 'Só uso interno',
  both: 'Uso interno e atendimento aos seus clientes',
}

const VISIBILITY_ORDER: CompanyKnowledgeVisibility[] = ['external', 'internal', 'both']

/** Revisão em tela cheia no celular; janela centralizada a partir de `sm`. */
const FULLSCREEN_ON_MOBILE =
  'left-0 top-0 h-full max-h-none w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-yx-line bg-yx-surface text-yx-fg ' +
  'sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg'

export function KnowledgeLibrary({ documents, loading = false, onChanged }: KnowledgeLibraryProps) {
  const [brandFilter,setBrandFilter]=useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CompanyKnowledgeDocument | null>(null)
  const [usageDocument, setUsageDocument] = useState<CompanyKnowledgeDocument | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<CompanyKnowledgeDocument | null>(null)
  const filtered = useMemo(() => documents.filter(document => (!brandFilter||document.representedBusinessId===brandFilter)&&`${document.title} ${document.summary || ''}`.toLowerCase().includes(search.toLowerCase())), [documents, search,brandFilter])

  const representedOptions=new Map(documents.filter(document=>document.representedBusinessId).map(document=>[document.representedBusinessId!,document.representedBusinessName??'Marca vinculada']))
  if (loading) return <div role="status" className="flex items-center gap-2 rounded-[10px] border border-yx-line bg-yx-surface p-5 text-sm text-yx-fg-3"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Carregando biblioteca...</div>

  return (
    <section className="space-y-4">
      {!!representedOptions.size&&<label className="block text-sm">Filtrar por representada<select className="ml-2 rounded border p-2" value={brandFilter} onChange={e=>setBrandFilter(e.target.value)}><option value="">Todas as fontes</option>{[...representedOptions.entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>}
      {documents.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="knowledge-search" className="sr-only">Buscar na base</Label>
          <Input id="knowledge-search" aria-label="Buscar na base" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar documento, tema ou resumo..." />
        </div>
      ) : null}
      <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
        {filtered.map(document => (
          <li key={document.id} className="min-w-0">
            <article className="h-full rounded-[10px] border border-yx-line bg-yx-surface p-4 text-yx-fg">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 basis-[180px] gap-3">
                  <FileText aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-yx-blue" />
                  <div className="min-w-0">
                    <h3 className="break-words font-display text-[15px] font-semibold leading-snug text-yx-fg">{document.title}</h3>
                    <p className="mt-1 text-xs text-yx-fg-3">{label(document.documentType)} · {label(document.sourceType)}</p>
                  </div>
                </div>
                <Status document={document} />
              </div>
              {document.processingError ? <p role="alert" className="mt-3 rounded-lg border border-yx-crit-line bg-yx-crit-soft p-2 text-xs text-yx-crit">{knowledgeProcessingErrorMessage(document.processingError)}</p> : document.summary ? <p className="mt-3 line-clamp-3 text-sm text-yx-fg-2">{document.summary}</p> : null}
              <ul className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0">{downstreamLabels(document).map(item => <li key={item} className="rounded-full border border-yx-line bg-yx-surface-2 px-2 py-0.5 text-[11.5px] text-yx-fg-2">{item}</li>)}</ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={portalButtonClasses('ghost')} onClick={() => setSelected(document)}><Settings2 aria-hidden="true" />Revisar</button>
                {document.lastUsedQueryId && <button type="button" className={portalButtonClasses('ghost')} onClick={() => setUsageDocument(document)}><Activity aria-hidden="true" />Ver último uso</button>}
                {document.storagePath && <a className={portalButtonClasses('ghost')} href={`/api/company-intelligence/knowledge/${document.id}/file`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Arquivo</a>}
                {document.status !== 'archived' && <button type="button" className={portalButtonClasses('ghost')} onClick={() => setArchiveTarget(document)}><Archive aria-hidden="true" />Arquivar</button>}
              </div>
            </article>
          </li>
        ))}
      </ul>
      {!documents.length && (
        <EmptyState
          icon={BookOpen}
          title="Sua base de conhecimento ainda está vazia"
          description="Aqui aparecem os textos, FAQs, documentos e páginas do site que a YUX e o atendimento podem usar. Use “Adicionar conhecimento” para começar."
        />
      )}
      {documents.length > 0 && !filtered.length && <p className="rounded-[10px] border border-dashed border-yx-line-strong p-6 text-center text-sm text-yx-fg-3">Nenhum conhecimento encontrado para “{search}”.</p>}
      {selected && <KnowledgeSettingsDialog document={selected} onClose={() => setSelected(null)} onChanged={document => { onChanged(document); setSelected(document) }} />}
      {usageDocument?.lastUsedQueryId && <KnowledgeUsageDialog document={usageDocument} onClose={() => setUsageDocument(null)} />}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={open => { if (!open) setArchiveTarget(null) }}
        title="Arquivar este conhecimento?"
        description={archiveTarget ? `“${archiveTarget.title}” deixa de ser usado pelo atendimento e pelos agentes.` : ''}
        confirmLabel="Arquivar"
        tone="danger"
        onConfirm={async () => {
          if (!archiveTarget) return
          onChanged(await companyIntelligenceService.archiveKnowledge(archiveTarget.id))
          toast.success('Conhecimento arquivado.')
        }}
      />
    </section>
  )
}

function KnowledgeSettingsDialog({ document, onClose, onChanged }: { document: CompanyKnowledgeDocument; onClose: () => void; onChanged: (value: CompanyKnowledgeDocument) => void }) {
  const [title, setTitle] = useState(document.title)
  const [visibility, setVisibility] = useState<CompanyKnowledgeVisibility>(document.visibility)
  const [allowed, setAllowed] = useState(document.allowedAgentProfileKeys.join(', '))
  const [blocked, setBlocked] = useState(document.blockedAgentProfileKeys.join(', '))
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState<KnowledgeProcessingResult | null>(null)
  const [processingLoading, setProcessingLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [publicationResult, setPublicationResult] = useState<{ publicationId: string; version: number; contentHash: string } | null>(null)
  const [reviewFilter, setReviewFilter] = useState<'all' | 'pending' | 'duplicates' | 'conflicts'>('all')
  useEffect(() => {
    companyIntelligenceService.getKnowledgeProcessing(document.id)
      .then(setProcessing)
      .catch(error => console.error(error))
      .finally(() => setProcessingLoading(false))
  }, [document.id])
  const save = async () => {
    setSaving(true)
    try {
      onChanged(await companyIntelligenceService.updateKnowledge(document.id, {
        expectedVersion: document.governanceVersion,
        ...(title.trim() ? { title: title.trim() } : {}),
        visibility, allowedAgentProfileKeys: list(allowed), blockedAgentProfileKeys: list(blocked),
      }))
      toast.success('Progresso e regras de uso atualizados.')
    } catch (error) { console.error(error); toast.error('Não foi possível atualizar as regras.') } finally { setSaving(false) }
  }
  const review = async (chunkId: string, status: 'approved' | 'rejected') => {
    await companyIntelligenceService.reviewKnowledgeChunk(document.id, chunkId, status)
    setProcessing(await companyIntelligenceService.getKnowledgeProcessing(document.id))
  }
  const publish = async () => {
    setPublishing(true)
    try {
      const approvedItemIds = processing?.chunks.filter(chunk => chunk.curationStatus === 'approved').map(chunk => chunk.id) || []
      if (!approvedItemIds.length) {
        toast.error('Aprove ao menos uma informação com evidência antes de publicar.')
        return
      }
      const changed = await companyIntelligenceService.publishKnowledge(document.id, {
        expectedVersion: document.governanceVersion,
        visibility,
        allowedAgentProfileKeys: list(allowed),
        blockedAgentProfileKeys: list(blocked),
        approvedItemIds,
      })
      onChanged(changed)
      setPublicationResult({ publicationId: changed.publicationId, version: changed.version, contentHash: changed.contentHash })
      toast.success('Conhecimento publicado.')
    } catch (error) {
      console.error(error)
      toast.error('Revise todas as informações antes de publicar.')
    } finally { setPublishing(false) }
  }
  const pending = processing?.chunks.filter(chunk => chunk.curationStatus === 'pending').length || 0
  const approved = processing?.chunks.filter(chunk => chunk.curationStatus === 'approved').length || 0
  const visibleChunks = processing?.chunks.filter(chunk => matchesReviewFilter(chunk, reviewFilter)) ?? []
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className={FULLSCREEN_ON_MOBILE}>
        <DialogHeader>
          <DialogTitle className="font-display">Revisar conhecimento</DialogTitle>
          <DialogDescription className="text-yx-fg-3">Confira o que foi extraído, aprove o que está correto e defina quem pode usar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="knowledge-review-title">Título</Label><Input id="knowledge-review-title" value={title} onChange={event => setTitle(event.target.value)} /></div>
          <div className="space-y-2">
            <Label htmlFor="knowledge-review-visibility">Quem pode usar</Label>
            <select id="knowledge-review-visibility" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={visibility} onChange={event => setVisibility(event.target.value as CompanyKnowledgeVisibility)}>
              {VISIBILITY_ORDER.map(option => <option key={option} value={option}>{KNOWLEDGE_VISIBILITY_LABELS[option]}</option>)}
            </select>
          </div>
          <details className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">
            <summary className="cursor-pointer text-sm font-medium text-yx-fg">Detalhes técnicos</summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-2"><Label htmlFor="allowed-profiles">Perfis de agente permitidos (opcional)</Label><Input id="allowed-profiles" value={allowed} onChange={event => setAllowed(event.target.value)} placeholder="marketing_strategist, ai_sdr_comercial_1" /></div>
              <div className="space-y-2"><Label htmlFor="blocked-profiles">Perfis bloqueados</Label><Input id="blocked-profiles" value={blocked} onChange={event => setBlocked(event.target.value)} /></div>
              {processing?.run?.errorMessage ? <p className="text-xs text-yx-fg-3">Motivo técnico do processamento parcial: {processing.run.errorMessage}</p> : null}
            </div>
          </details>
          <section className="space-y-3 border-t border-yx-line pt-4">
            <div><h3 className="font-display font-semibold text-yx-fg">Informações preparadas pela IA</h3><p className="text-xs text-yx-fg-3">O texto original é preservado. Aprove apenas as informações corretas, que poderão ser usadas pelo atendimento e pelos agentes.</p></div>
            <div className="space-y-1.5">
              <Label htmlFor="knowledge-review-filter" className="text-xs">Filtrar revisão</Label>
              <select id="knowledge-review-filter" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto" value={reviewFilter} onChange={event => setReviewFilter(event.target.value as typeof reviewFilter)}><option value="all">Todos os grupos</option><option value="pending">Pendentes</option><option value="duplicates">Possíveis duplicados</option><option value="conflicts">Possíveis conflitos</option></select>
            </div>
            {processingLoading && <p className="flex items-center gap-2 text-sm text-yx-fg-3"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Preparando revisão...</p>}
            {processing?.run?.status === 'degraded' && <p className="rounded-lg border border-yx-warn-line bg-yx-warn-soft p-3 text-sm text-yx-warn">A preparação ficou parcial: a leitura inteligente não estava totalmente disponível. O texto bruto não será publicado; conclua a revisão com evidência verificável.</p>}
            {visibleChunks.map(chunk => (
              <article key={chunk.id} className={cn('rounded-lg border p-3', chunk.curationStatus === 'approved' ? 'border-yx-ok-line bg-yx-ok-soft' : chunk.curationStatus === 'rejected' ? 'border-yx-crit-line bg-yx-crit-soft' : 'border-yx-line bg-yx-surface')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-yx-fg">{chunk.body}</p>
                    {chunk.evidenceExcerpt && <p className="mt-2 rounded bg-yx-surface-2 p-2 text-xs text-yx-fg-2">Evidência: “{chunk.evidenceExcerpt}” {chunk.sourceLocator && `— ${chunk.sourceLocator}`}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className={portalButtonClasses('ghost', 'px-2.5')} aria-label="Aprovar informação" onClick={() => void review(chunk.id, 'approved')}><CheckCircle2 aria-hidden="true" className="text-yx-ok" /></button>
                    <button type="button" className={portalButtonClasses('ghost', 'px-2.5')} aria-label="Rejeitar informação" onClick={() => void review(chunk.id, 'rejected')}><XCircle aria-hidden="true" className="text-yx-crit" /></button>
                  </div>
                </div>
              </article>
            ))}
            {!processingLoading && !visibleChunks.length && document.bodyPreview && <div className="space-y-2"><Label>Texto original extraído</Label><Textarea readOnly rows={10} value={document.bodyPreview} /></div>}
          </section>
          <div className="rounded-lg border border-yx-line bg-yx-surface-2 p-3 text-sm text-yx-fg-2"><strong className="text-yx-fg">Quem poderá usar esta publicação:</strong> {KNOWLEDGE_VISIBILITY_LABELS[visibility]}.</div>
          {publicationResult && <div role="status" className="rounded-lg border border-yx-ok-line bg-yx-ok-soft p-3 text-sm text-yx-ok">Publicação v{publicationResult.version} salva. Identidade: {publicationResult.contentHash.slice(0, 12)}…</div>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0 sm:space-x-2">
          <button type="button" className={portalButtonClasses('ghost')} onClick={onClose}>Fechar</button>
          <button type="button" className={portalButtonClasses('ghost')} onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar progresso'}</button>
          {['indexed', 'published'].includes(document.status) && (
            <button type="button" className={portalButtonClasses('primary')} onClick={publish} disabled={publishing || pending > 0 || approved === 0}>
              {publishing ? <Loader2 aria-hidden="true" className="animate-spin" /> : <CheckCircle2 aria-hidden="true" />}
              {pending > 0 ? `Revisar ${pending} item(ns)` : approved > 0 ? 'Publicar conhecimento aprovado' : 'Aprovação com evidência obrigatória'}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const STATUS_VARIANTS: Record<CompanyKnowledgeDocument['status'], StatusChipVariant> = {
  draft: 'neutral',
  indexing: 'neutral',
  indexed: 'warn',
  published: 'ok',
  archived: 'neutral',
}

function Status({ document }: { document: CompanyKnowledgeDocument }) {
  return (
    <StatusChip variant={STATUS_VARIANTS[document.status]} className="shrink-0">
      {labelForKnowledgeState({ documentStatus: document.status, publicationId: document.currentPublicationId, eligibleProfiles: document.allowedAgentProfileKeys, lastUsedQueryId: document.lastUsedQueryId, processingError: document.processingError })}
    </StatusChip>
  )
}

function downstreamLabels(document: CompanyKnowledgeDocument) {
  if (document.status !== 'published' || !document.currentPublicationId) return ['Ainda não disponível para o atendimento']
  const labels = [document.visibility === 'internal' ? KNOWLEDGE_VISIBILITY_LABELS.internal : KNOWLEDGE_VISIBILITY_LABELS.external]
  if (document.visibility === 'both') labels.push(KNOWLEDGE_VISIBILITY_LABELS.internal)
  if (document.lastUsedQueryId) labels.push('Já foi usado em conversas')
  return labels
}

function matchesReviewFilter(chunk: KnowledgeProcessingResult['chunks'][number], filter: 'all' | 'pending' | 'duplicates' | 'conflicts') {
  if (filter === 'all') return true
  if (filter === 'pending') return chunk.curationStatus === 'pending'
  const flags = Array.isArray(chunk.metadata.flags) ? chunk.metadata.flags.map(String) : []
  if (filter === 'duplicates') return Boolean(chunk.metadata.duplicateOf) || flags.includes('duplicate')
  return Boolean(chunk.metadata.conflictsWith) || flags.includes('conflict')
}

function KnowledgeUsageDialog({ document, onClose }: { document: CompanyKnowledgeDocument; onClose: () => void }) {
  const [trace, setTrace] = useState<KnowledgeRetrievalTrace | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!document.lastUsedQueryId) return
    companyIntelligenceService.getKnowledgeUsage(document.organizationId, document.lastUsedQueryId)
      .then(setTrace).catch(() => setError(true))
  }, [document.lastUsedQueryId, document.organizationId])
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="border-yx-line bg-yx-surface text-yx-fg">
        <DialogHeader><DialogTitle className="font-display">Último uso no atendimento</DialogTitle></DialogHeader>
        {error ? <p role="alert" className="rounded-lg border border-yx-crit-line bg-yx-crit-soft p-3 text-sm text-yx-crit">Este registro de uso não está disponível para o seu acesso.</p> : trace ? (
          <div className="space-y-3 text-sm">
            <p><strong>Pergunta atendida:</strong> {trace.query}</p>
            <p><strong>Quando:</strong> {formatPortalDateTime(trace.createdAt)}</p>
            <details className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">
              <summary className="cursor-pointer font-medium">Detalhes técnicos</summary>
              <div className="mt-2 space-y-1 text-xs text-yx-fg-2">
                <p>Perfil do agente: {trace.profileKey}</p>
                <p>Módulo: {trace.filters.moduleKey || 'não informado'}</p>
                <p>Fontes retornadas: {trace.scoreMetadata.sourceCount ?? trace.resultChunkIds.length + trace.resultCardIds.length}</p>
                <p>Rastreio {trace.id}</p>
              </div>
            </details>
          </div>
        ) : <p className="flex items-center gap-2 text-sm text-yx-fg-3"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Carregando...</p>}
        <DialogFooter><button type="button" className={portalButtonClasses('ghost')} onClick={onClose}>Fechar</button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function list(value: string) { return value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean) }
function label(value: string) { return ({ manual: 'Texto', url: 'Site', file: 'Arquivo', faq: 'Perguntas frequentes', integration: 'Integração', brand: 'Marca', product: 'Produto', service: 'Serviço', case: 'Caso', campaign: 'Campanha', policy: 'Política', other: 'Outro' } as Record<string, string>)[value] || value }
