import { useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle2, ExternalLink, FileText, Loader2, Settings2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { companyIntelligenceService } from '@/services/companyIntelligenceService'
import type { CompanyKnowledgeDocument, CompanyKnowledgeVisibility, KnowledgeProcessingResult } from '@/types/companyIntelligence'

interface KnowledgeLibraryProps {
  documents: CompanyKnowledgeDocument[]
  loading?: boolean
  onChanged: (document: CompanyKnowledgeDocument) => void
}

export function KnowledgeLibrary({ documents, loading = false, onChanged }: KnowledgeLibraryProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CompanyKnowledgeDocument | null>(null)
  const filtered = useMemo(() => documents.filter(document => `${document.title} ${document.summary || ''}`.toLowerCase().includes(search.toLowerCase())), [documents, search])

  if (loading) return <div className="flex items-center gap-2 rounded-lg border bg-white p-5 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" />Carregando biblioteca...</div>

  return (
    <section className="space-y-4">
      <Input aria-label="Buscar na base" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar documento, tema ou resumo..." />
      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.map(document => (
          <article key={document.id} className="rounded-lg border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-yux-700" /><div className="min-w-0"><h3 className="truncate font-semibold text-gray-950">{document.title}</h3><p className="mt-1 text-xs text-gray-500">{label(document.documentType)} · {label(document.sourceType)}</p></div></div>
              <Status value={document.status} />
            </div>
            {document.processingError ? <p className="mt-3 rounded-md bg-rose-50 p-2 text-xs text-rose-800">Falha na indexação: {document.processingError}</p> : document.summary ? <p className="mt-3 line-clamp-3 text-sm text-gray-600">{document.summary}</p> : null}
            <div className="mt-3 flex flex-wrap gap-1.5">{downstreamLabels(document).map(item => <span key={item} className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">{item}</span>)}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelected(document)}><Settings2 className="mr-2 h-4 w-4" />Revisar</Button>
              {document.storagePath && <Button size="sm" variant="ghost" asChild><a href={`/api/company-intelligence/knowledge/${document.id}/file`} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Arquivo</a></Button>}
              {document.status !== 'archived' && <Action label="Arquivar" icon={Archive} variant="ghost" onClick={async () => { if (confirm('Arquivar este conhecimento?')) onChanged(await companyIntelligenceService.archiveKnowledge(document.id)) }} />}
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && <p className="rounded-lg border bg-white p-6 text-center text-sm text-gray-600">Nenhum conhecimento encontrado.</p>}
      {selected && <KnowledgeSettingsDialog document={selected} onClose={() => setSelected(null)} onChanged={document => { onChanged(document); setSelected(document) }} />}
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
  useEffect(() => {
    companyIntelligenceService.getKnowledgeProcessing(document.id)
      .then(setProcessing)
      .catch(error => console.error(error))
      .finally(() => setProcessingLoading(false))
  }, [document.id])
  const save = async () => {
    setSaving(true)
    try {
      onChanged(await companyIntelligenceService.updateKnowledge(document.id, { title, visibility, allowedAgentProfileKeys: list(allowed), blockedAgentProfileKeys: list(blocked) }))
      toast.success('Regras de uso atualizadas.')
    } catch (error) { console.error(error); toast.error('Não foi possível atualizar as regras.') } finally { setSaving(false) }
  }
  const review = async (chunkId: string, status: 'approved' | 'rejected') => {
    await companyIntelligenceService.reviewKnowledgeChunk(document.id, chunkId, status)
    setProcessing(await companyIntelligenceService.getKnowledgeProcessing(document.id))
  }
  const publish = async () => {
    setPublishing(true)
    try {
      const hasApproved = Boolean(processing?.chunks.some(chunk => chunk.curationStatus === 'approved'))
      if (!hasApproved && !window.confirm('Nenhuma informação curada foi aprovada. Deseja publicar o texto original mesmo assim?')) return
      const changed = hasApproved
        ? await companyIntelligenceService.publishKnowledge(document.id)
        : await companyIntelligenceService.publishDegradedKnowledge(document.id)
      onChanged(changed)
      toast.success('Conhecimento publicado para os agentes.')
      onClose()
    } catch (error) {
      console.error(error)
      toast.error('Revise todas as informações antes de publicar.')
    } finally { setPublishing(false) }
  }
  const pending = processing?.chunks.filter(chunk => chunk.curationStatus === 'pending').length || 0
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Revisar conhecimento</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="knowledge-review-title">Título</Label><Input id="knowledge-review-title" value={title} onChange={event => setTitle(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="knowledge-review-visibility">Uso permitido</Label><select id="knowledge-review-visibility" className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={visibility} onChange={event => setVisibility(event.target.value as CompanyKnowledgeVisibility)}><option value="both">Interno e externo</option><option value="internal">Somente interno</option><option value="external">Agentes externos</option></select></div><div className="space-y-2"><Label htmlFor="allowed-profiles">Perfis de agente permitidos (opcional)</Label><Input id="allowed-profiles" value={allowed} onChange={event => setAllowed(event.target.value)} placeholder="marketing_strategist, ai_sdr_comercial_1" /></div><div className="space-y-2"><Label htmlFor="blocked-profiles">Perfis bloqueados</Label><Input id="blocked-profiles" value={blocked} onChange={event => setBlocked(event.target.value)} /></div><section className="space-y-3 border-t pt-4"><div><h3 className="font-semibold text-gray-950">Informações preparadas pela IA</h3><p className="text-xs text-gray-600">O texto original é preservado. Aprove apenas as informações precisas que poderão ser usadas pelos agentes.</p></div>{processingLoading && <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" />Preparando revisão...</p>}{processing?.run?.status === 'degraded' && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">A preparação ficou parcial: {processing.run.errorMessage || 'a IA ou os embeddings não estavam disponíveis'}. Você ainda pode publicar o texto original com confirmação.</p>}{processing?.chunks.map(chunk => <article key={chunk.id} className={`rounded-lg border p-3 ${chunk.curationStatus === 'approved' ? 'border-emerald-200 bg-emerald-50' : chunk.curationStatus === 'rejected' ? 'border-rose-200 bg-rose-50' : 'bg-white'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-gray-950">{chunk.body}</p>{chunk.evidenceExcerpt && <p className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-600">Evidência: “{chunk.evidenceExcerpt}” {chunk.sourceLocator && `— ${chunk.sourceLocator}`}</p>}</div><div className="flex shrink-0 gap-1"><Button size="sm" variant="outline" aria-label="Aprovar informação" onClick={() => void review(chunk.id, 'approved')}><CheckCircle2 className="h-4 w-4 text-emerald-700" /></Button><Button size="sm" variant="outline" aria-label="Rejeitar informação" onClick={() => void review(chunk.id, 'rejected')}><XCircle className="h-4 w-4 text-rose-700" /></Button></div></div></article>)}{!processingLoading && !processing?.chunks.length && document.bodyPreview && <div className="space-y-2"><Label>Texto original extraído</Label><Textarea readOnly rows={10} value={document.bodyPreview} /></div>}</section></div><DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Fechar</Button><Button variant="outline" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar regras'}</Button>{document.status === 'indexed' && <Button onClick={publish} disabled={publishing || pending > 0}>{publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{pending > 0 ? `Revisar ${pending} item(ns)` : processing?.chunks.length ? 'Publicar conhecimento' : 'Publicar texto original'}</Button>}</DialogFooter></DialogContent></Dialog>
}

function Action({ label: text, icon: Icon, onClick, variant = 'default' }: { label: string; icon: typeof CheckCircle2; onClick: () => Promise<void>; variant?: 'default' | 'ghost' }) {
  const [loading, setLoading] = useState(false)
  return <Button size="sm" variant={variant} disabled={loading} onClick={async () => { setLoading(true); try { await onClick(); toast.success(text === 'Publicar' ? 'Conhecimento publicado para os agentes.' : 'Conhecimento arquivado.') } catch (error) { console.error(error); toast.error('A ação não pôde ser concluída.') } finally { setLoading(false) } }}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}{text}</Button>
}

function Status({ value }: { value: CompanyKnowledgeDocument['status'] }) {
  const colors = { draft: 'bg-gray-100 text-gray-700', indexing: 'bg-blue-100 text-blue-800', indexed: 'bg-amber-100 text-amber-800', published: 'bg-emerald-100 text-emerald-800', archived: 'bg-slate-100 text-slate-600' }
  return <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${colors[value]}`}>{label(value)}</span>
}

function downstreamLabels(document: CompanyKnowledgeDocument) {
  if (document.status !== 'published') return ['Aguardando publicação']
  const labels = ['Marketing', 'Automação']
  if (document.visibility !== 'internal') labels.push('WhatsApp/Atendimento')
  labels.push('Estratégia')
  return labels
}

function list(value: string) { return value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean) }
function label(value: string) { return ({ manual: 'Texto', url: 'URL', file: 'Arquivo', brand: 'Marca', product: 'Produto', service: 'Serviço', faq: 'FAQ', case: 'Caso', campaign: 'Campanha', policy: 'Política', other: 'Outro', draft: 'Rascunho', indexing: 'Indexando', indexed: 'Pronto para publicar', published: 'Publicado', archived: 'Arquivado' } as Record<string, string>)[value] || value }
