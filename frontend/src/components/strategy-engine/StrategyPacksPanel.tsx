import { FormEvent, ReactNode, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Database, FileUp, GitBranch, PackageCheck, Plus, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type {
  StrategyAgentProfile,
  StrategyIngestionCapabilities,
  StrategyIngestionJob,
  StrategyIngestionUploadInput,
  StrategyOrganization,
  StrategyPack,
  StrategyPackBinding,
  StrategyPackBindingInput,
  StrategyPackInput,
  StrategyPackItem,
  StrategyPackItemInput,
  StrategyPackItemReviewChanges,
  StrategyPackPublicationInput,
  StrategyPackPublicationResult,
} from '@/types/strategyEngine'

const moduleOptions = [
  'crm',
  'whatsapp_ai',
  'omnichannel',
  'marketing_studio',
  'campaigns',
  'landing_pages',
  'automations',
  'proposals',
  'bi_reports',
  'support',
]

const itemTypes = ['concept_card', 'playbook', 'rubric', 'chunk', 'prompt_rule']

function splitCsv(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function statusTone(status: string) {
  if (['published', 'approved', 'active', 'completed'].includes(status)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (['review', 'proposed', 'uploaded', 'extracting'].includes(status)) return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (['archived', 'failed', 'blocked'].includes(status)) return 'bg-red-50 text-red-700 ring-red-200'
  return 'bg-gray-50 text-gray-700 ring-gray-200'
}

function Pill({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${statusTone(value)}`}>{value}</span>
}

function isLegacyMetadataOnly(job: StrategyIngestionJob) {
  return job.status === 'uploaded' && !job.documentId && !job.sha256
}

function readinessMessages(capabilities: StrategyIngestionCapabilities) {
  const messages: string[] = []
  if (!capabilities.structuredIngestion.curationEnabled) messages.push('Curadoria estruturada está desativada')
  if (!capabilities.structuredIngestion.runtimeConfigured) messages.push('Harness estratégico não configurado')
  if (!capabilities.structuredIngestion.embeddingConfigured) messages.push('Embeddings OpenRouter não configurados')
  return messages
}

function jobStageLabel(job: StrategyIngestionJob) {
  if (isLegacyMetadataOnly(job)) return 'Aguardando reenvio do arquivo real'
  const labels: Record<string, string> = {
    upload: 'Recebendo e validando o arquivo',
    extraction: 'Extraindo texto e páginas',
    curation: 'Criando artefatos estratégicos com evidência',
    embedding: 'Gerando embeddings para busca',
    review: 'Pronto para revisão humana',
    ocr: 'O PDF precisa de OCR antes da curadoria',
  }
  return labels[job.currentStep] || job.currentStep
}

export function StrategyPacksPanel({
  packs,
  items,
  jobs,
  ingestionCapabilities,
  bindings,
  profiles,
  organizations,
  onSavePack,
  onSaveItem,
  onReviewItem,
  onPublishPack,
  onCreateJob,
  onRefreshJobs,
  onRetryJob,
  onSaveBinding,
}: {
  packs: StrategyPack[]
  items: StrategyPackItem[]
  jobs: StrategyIngestionJob[]
  ingestionCapabilities: StrategyIngestionCapabilities
  bindings: StrategyPackBinding[]
  profiles: StrategyAgentProfile[]
  organizations: StrategyOrganization[]
  onSavePack: (input: StrategyPackInput) => Promise<unknown>
  onSaveItem: (input: StrategyPackItemInput) => Promise<unknown>
  onReviewItem: (id: string, status: 'approved' | 'rejected' | 'proposed', reason: string, changes?: StrategyPackItemReviewChanges) => Promise<unknown>
  onPublishPack: (packId: string, input: StrategyPackPublicationInput) => Promise<StrategyPackPublicationResult>
  onCreateJob: (input: StrategyIngestionUploadInput) => Promise<unknown>
  onRefreshJobs: () => Promise<void>
  onRetryJob: (ingestionId: string) => Promise<void>
  onSaveBinding: (input: StrategyPackBindingInput) => Promise<unknown>
}) {
  const yuxWorkspace = organizations.find(organization => organization.isInternalGrowthWorkspace)
  const [selectedPackId, setSelectedPackId] = useState(packs[0]?.id || '')
  const selectedPack = packs.find(pack => pack.id === selectedPackId) || packs[0]
  const packItems = useMemo(() => items.filter(item => !selectedPack || item.packId === selectedPack.id), [items, selectedPack])
  const packJobs = useMemo(() => jobs.filter(job => !selectedPack || job.packId === selectedPack.id), [jobs, selectedPack])
  const packBindings = useMemo(() => bindings.filter(binding => !selectedPack || binding.packId === selectedPack.id), [bindings, selectedPack])
  const pendingItems = packItems.filter(item => item.status === 'proposed' || item.status === 'review')
  const approvedItems = packItems.filter(item => item.status === 'approved')
  const publishableApprovedItems = approvedItems.filter(item => item.sourceDocumentId && item.contentHash && item.sourceOrigin !== 'seed_example')
  const legacyApprovedItems = approvedItems.length - publishableApprovedItems.length
  const publishedPacks = packs.filter(pack => Boolean(pack.currentReleaseId))
  const missingReadiness = readinessMessages(ingestionCapabilities)

  const [packForm, setPackForm] = useState({
    packKey: '',
    name: '',
    description: '',
    sourceTitle: '',
    targetProfileKeys: '',
    targetModules: '',
  })
  const [jobForm, setJobForm] = useState<{ sourceName: string; sourceKind: string; file: File | null }>({ sourceName: '', sourceKind: 'private_book', file: null })
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({})
  const [reviewEdits, setReviewEdits] = useState<Record<string, { title: string; principle: string }>>({})
  const [reviewGroup, setReviewGroup] = useState<'all' | 'duplicates' | 'conflicts'>('all')
  const [publicationOpen, setPublicationOpen] = useState(false)
  const [itemForm, setItemForm] = useState({
    itemType: 'concept_card',
    title: '',
    summary: '',
    body: '',
    profileKeys: '',
    stageTags: '',
    retrievalTags: '',
  })
  const [bindingForm, setBindingForm] = useState({
    organizationId: yuxWorkspace?.id || '',
    profileKey: '',
    moduleKey: '',
    channel: '',
    workflowKey: '',
  })
  const visiblePendingItems = pendingItems.filter(item => strategyItemMatchesFilter(item, reviewGroup))

  async function submitPack(event: FormEvent) {
    event.preventDefault()
    await onSavePack({
      packKey: packForm.packKey,
      name: packForm.name,
      description: packForm.description,
      sourceKind: 'manual',
      sourceTitle: packForm.sourceTitle,
      status: 'draft',
      targetProfileKeys: splitCsv(packForm.targetProfileKeys),
      targetModules: splitCsv(packForm.targetModules),
    })
    setPackForm({ packKey: '', name: '', description: '', sourceTitle: '', targetProfileKeys: '', targetModules: '' })
  }

  async function submitJob(event: FormEvent) {
    event.preventDefault()
    if (!selectedPack || !jobForm.file || uploading) return
    if (jobForm.file.size > ingestionCapabilities.maxBytes) {
      setUploadError(`O arquivo excede o limite de ${ingestionCapabilities.maxMb} MB.`)
      return
    }
    if (!ingestionCapabilities.structuredIngestion.ready) {
      setUploadError(`A ingestão estruturada ainda não está pronta: ${missingReadiness.join('; ')}.`)
      return
    }
    const form = event.currentTarget
    setUploading(true)
    setUploadError('')
    try {
      await onCreateJob({
        packId: selectedPack.id,
        sourceName: jobForm.sourceName,
        sourceKind: jobForm.sourceKind,
        file: jobForm.file,
      })
      await onRefreshJobs()
      setJobForm({ sourceName: '', sourceKind: 'private_book', file: null })
      const input = form.querySelector<HTMLInputElement>('input[type="file"]')
      if (input) input.value = ''
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.')
    } finally {
      setUploading(false)
    }
  }

  function selectUploadFile(file: File | null) {
    setJobForm(current => ({ ...current, file }))
    if (file && file.size > ingestionCapabilities.maxBytes) {
      setUploadError(`O arquivo excede o limite de ${ingestionCapabilities.maxMb} MB.`)
      return
    }
    setUploadError('')
  }

  async function submitItem(event: FormEvent) {
    event.preventDefault()
    if (!selectedPack) return
    await onSaveItem({
      packId: selectedPack.id,
      itemType: itemForm.itemType,
      title: itemForm.title,
      summary: itemForm.summary,
      body: itemForm.body,
      profileKeys: splitCsv(itemForm.profileKeys),
      stageTags: splitCsv(itemForm.stageTags),
      retrievalTags: splitCsv(itemForm.retrievalTags),
      status: 'proposed',
    })
    setItemForm({ itemType: 'concept_card', title: '', summary: '', body: '', profileKeys: '', stageTags: '', retrievalTags: '' })
  }

  async function submitBinding(event: FormEvent) {
    event.preventDefault()
    if (!selectedPack) return
    await onSaveBinding({
      packId: selectedPack.id,
      organizationId: bindingForm.organizationId,
      profileKey: bindingForm.profileKey,
      moduleKey: bindingForm.moduleKey,
      channel: bindingForm.channel,
      workflowKey: bindingForm.workflowKey,
      status: 'active',
      priority: 20,
      config: { source: 'admin_strategy_packs_panel' },
    })
    setBindingForm(current => ({ ...current, profileKey: '', moduleKey: '', channel: '', workflowKey: '' }))
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-yux-200 bg-yux-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-yux-700" />
            <div>
              <p className="text-xs font-medium uppercase text-yux-700">Ponte operacional</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-950">Admin governa. Crescimento YUX executa.</h2>
              <p className="mt-1 max-w-4xl text-sm text-gray-700">
                Use esta area para alimentar, revisar, publicar e vincular a doutrina estrategica. O uso diario acontece no workspace interno da YUX, onde CRM, atendimento, marketing e relatorios recebem os packs ativos.
              </p>
            </div>
          </div>
          {yuxWorkspace ? (
            <Button asChild>
              <Link to={`/client-workspaces/${yuxWorkspace.id}`}>
                Abrir Crescimento YUX
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Aplique a migration do workspace interno para liberar o Crescimento YUX.
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Packs" value={packs.length} detail="Pacotes de doutrina e RAG" />
        <Metric label="Aprovados com fonte" value={publishableApprovedItems.length} detail="Elegíveis para publicação" />
        <Metric label="Packs publicados" value={publishedPacks.length} detail="Release atual elegível" />
        <Metric label="Em revisao" value={pendingItems.length} detail="Aguardam curadoria humana" />
        <Metric label="Bindings" value={packBindings.length} detail="Agente, modulo e workspace" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <section className="space-y-4">
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-yux-700" />
              <h2 className="text-base font-semibold text-gray-900">Strategy Packs</h2>
            </div>
            <div className="mt-3 space-y-2">
              {packs.length === 0 && <p className="rounded-md border border-dashed p-3 text-sm text-gray-500">Nenhum Strategy Pack cadastrado.</p>}
              {packs.map(pack => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setSelectedPackId(pack.id)}
                  className={`w-full rounded-md border p-3 text-left ${selectedPack?.id === pack.id ? 'border-yux-300 bg-yux-50' : 'bg-white hover:bg-gray-50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-950">{pack.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-gray-600">{pack.description}</p>
                    </div>
                    <Pill value={pack.status} />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">v{pack.version} / {pack.sourceTitle || pack.sourceKind}</p>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={submitPack} className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-yux-700" />
              <h2 className="text-base font-semibold text-gray-900">Novo pack</h2>
            </div>
            <div className="mt-3 space-y-3">
              <Input placeholder="chave_do_pack" value={packForm.packKey} onChange={event => setPackForm({ ...packForm, packKey: event.target.value })} required />
              <Input placeholder="Nome" value={packForm.name} onChange={event => setPackForm({ ...packForm, name: event.target.value })} required />
              <Input placeholder="Fonte / titulo" value={packForm.sourceTitle} onChange={event => setPackForm({ ...packForm, sourceTitle: event.target.value })} />
              <Textarea placeholder="Descricao operacional" value={packForm.description} onChange={event => setPackForm({ ...packForm, description: event.target.value })} rows={3} />
              <Input placeholder="Perfis alvo separados por virgula" value={packForm.targetProfileKeys} onChange={event => setPackForm({ ...packForm, targetProfileKeys: event.target.value })} />
              <Input placeholder="Modulos alvo separados por virgula" value={packForm.targetModules} onChange={event => setPackForm({ ...packForm, targetModules: event.target.value })} />
              <Button type="submit" className="w-full">Criar pack</Button>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          {selectedPack && (
            <div className="rounded-lg border bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">{selectedPack.name}</h2>
                  <p className="mt-1 text-sm text-gray-600">{selectedPack.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pill value={selectedPack.status} />
                    <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">{selectedPack.scope}</span>
                    <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">{selectedPack.visibility}</span>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setPublicationOpen(true)} disabled={!publishableApprovedItems.length}>
                  Publicar pack
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <form onSubmit={submitJob} className="rounded-lg border bg-white p-4">
              <div className="flex items-center gap-2">
                <FileUp className="h-4 w-4 text-yux-700" />
                <h2 className="text-base font-semibold text-gray-900">Ingestao guiada</h2>
              </div>
              <ol className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
                {['Upload', 'Extracao', 'Propostas', 'Revisao', 'Publicacao', 'Binding'].map(step => (
                  <li key={step} className="rounded-md border bg-gray-50 px-2 py-2">{step}</li>
                ))}
              </ol>
              <div className="mt-3 space-y-3">
                <Input placeholder="Nome da fonte" value={jobForm.sourceName} onChange={event => setJobForm({ ...jobForm, sourceName: event.target.value })} required />
                <select className="h-10 w-full rounded-md border px-3 text-sm" value={jobForm.sourceKind} onChange={event => setJobForm({ ...jobForm, sourceKind: event.target.value })}>
                  <option value="private_book">Livro privado</option>
                  <option value="internal_playbook">Playbook interno</option>
                  <option value="client_material">Material de cliente</option>
                  <option value="meeting_notes">Notas de reuniao</option>
                </select>
                <Input
                  type="file"
                  accept=".pdf,.txt,.md,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={event => selectUploadFile(event.target.files?.[0] || null)}
                  required
                />
                <p className="text-xs text-gray-500">PDF, TXT, Markdown ou DOCX, até {ingestionCapabilities.maxMb} MB.</p>
                {missingReadiness.length ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    {missingReadiness.join(' · ')}
                  </p>
                ) : (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                    Curadoria, harness e embeddings estão configurados.
                  </p>
                )}
                {uploadError ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{uploadError}</p> : null}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!selectedPack || !jobForm.file || uploading || !ingestionCapabilities.structuredIngestion.ready || Boolean(jobForm.file && jobForm.file.size > ingestionCapabilities.maxBytes)}
                >
                  {uploading ? 'Enviando arquivo…' : 'Enviar e processar'}
                </Button>
              </div>
            </form>

            <form onSubmit={submitBinding} className="rounded-lg border bg-white p-4">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-yux-700" />
                <h2 className="text-base font-semibold text-gray-900">Binding operacional</h2>
              </div>
              <div className="mt-3 space-y-3">
                <select className="h-10 w-full rounded-md border px-3 text-sm" value={bindingForm.organizationId} onChange={event => setBindingForm({ ...bindingForm, organizationId: event.target.value })}>
                  <option value="">Global</option>
                  {organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                </select>
                <select className="h-10 w-full rounded-md border px-3 text-sm" value={bindingForm.profileKey} onChange={event => setBindingForm({ ...bindingForm, profileKey: event.target.value })}>
                  <option value="">Todos os perfis</option>
                  {profiles.map(profile => <option key={profile.id} value={profile.profileKey}>{profile.name}</option>)}
                </select>
                <select className="h-10 w-full rounded-md border px-3 text-sm" value={bindingForm.moduleKey} onChange={event => setBindingForm({ ...bindingForm, moduleKey: event.target.value })}>
                  <option value="">Todos os modulos</option>
                  {moduleOptions.map(module => <option key={module} value={module}>{module}</option>)}
                </select>
                <Input placeholder="Canal opcional: whatsapp, email, admin" value={bindingForm.channel} onChange={event => setBindingForm({ ...bindingForm, channel: event.target.value })} />
                <Input placeholder="Workflow opcional" value={bindingForm.workflowKey} onChange={event => setBindingForm({ ...bindingForm, workflowKey: event.target.value })} />
                <Button type="submit" className="w-full" disabled={!selectedPack}>Ativar binding</Button>
              </div>
            </form>
          </div>

          <form onSubmit={submitItem} className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-yux-700" />
              <h2 className="text-base font-semibold text-gray-900">Criar item curado</h2>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <select className="h-10 rounded-md border px-3 text-sm" value={itemForm.itemType} onChange={event => setItemForm({ ...itemForm, itemType: event.target.value })}>
                {itemTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
              <Input placeholder="Titulo" value={itemForm.title} onChange={event => setItemForm({ ...itemForm, title: event.target.value })} required />
              <Input placeholder="Perfis: ai_sdr_comercial_1, crm_controller" value={itemForm.profileKeys} onChange={event => setItemForm({ ...itemForm, profileKeys: event.target.value })} />
              <Input placeholder="Tags de etapa" value={itemForm.stageTags} onChange={event => setItemForm({ ...itemForm, stageTags: event.target.value })} />
              <Input className="md:col-span-2" placeholder="Tags de retrieval" value={itemForm.retrievalTags} onChange={event => setItemForm({ ...itemForm, retrievalTags: event.target.value })} />
              <Textarea className="md:col-span-2" placeholder="Resumo operacional" value={itemForm.summary} onChange={event => setItemForm({ ...itemForm, summary: event.target.value })} rows={2} />
              <Textarea className="md:col-span-2" placeholder="Regra, procedimento, rubrica ou contexto derivado" value={itemForm.body} onChange={event => setItemForm({ ...itemForm, body: event.target.value })} rows={4} />
            </div>
            <Button type="submit" className="mt-3" disabled={!selectedPack}>Enviar para revisao</Button>
          </form>

          <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-white p-4">
            <div><h2 className="font-semibold text-gray-950">Revisão por grupos</h2><p className="text-sm text-gray-600">Priorize duplicados e conflitos sem perder a evidência original.</p></div>
            <label className="grid gap-1 text-xs font-medium text-gray-700" htmlFor="strategy-review-group">Grupo<select id="strategy-review-group" className="h-9 rounded-md border bg-white px-3 text-sm" value={reviewGroup} onChange={event => setReviewGroup(event.target.value as typeof reviewGroup)}><option value="all">Todos os pendentes</option><option value="duplicates">Possíveis duplicados</option><option value="conflicts">Possíveis conflitos</option></select></label>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ListSection
              title="Itens em revisao"
              empty={reviewGroup === 'all' ? 'Nenhum item pendente.' : 'Nenhum item neste grupo.'}
              items={visiblePendingItems}
              render={item => (
                <article key={item.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-950">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">{item.summary}</p>
                      {typeof item.confidence === 'number' ? <p className="mt-1 text-xs text-gray-500">Confiança: {Math.round(item.confidence * 100)}%</p> : null}
                    </div>
                    <Pill value={item.status} />
                  </div>
                  {Array.isArray(item.payload.evidence) ? (
                    <div className="mt-3 rounded-md bg-gray-50 p-2 text-xs text-gray-700">
                      <p className="font-semibold">Evidência da fonte</p>
                      {(item.payload.evidence as Array<Record<string, unknown>>).slice(0, 2).map((evidence, index) => (
                        <p key={`${item.id}-evidence-${index}`} className="mt-1">{String(evidence.locator || 'seção')}: “{String(evidence.excerpt || '')}”</p>
                      ))}
                    </div>
                  ) : null}
                  <details className="mt-3 rounded-md border bg-white p-2">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700">Editar proposta</summary>
                    <div className="mt-2 space-y-2">
                      <Input
                        aria-label={`Título da proposta ${item.title}`}
                        value={reviewEdits[item.id]?.title ?? item.title}
                        onChange={event => setReviewEdits(current => ({
                          ...current,
                          [item.id]: { title: event.target.value, principle: current[item.id]?.principle ?? item.body },
                        }))}
                      />
                      <Textarea
                        aria-label={`Princípio da proposta ${item.title}`}
                        rows={3}
                        value={reviewEdits[item.id]?.principle ?? item.body}
                        onChange={event => setReviewEdits(current => ({
                          ...current,
                          [item.id]: { title: current[item.id]?.title ?? item.title, principle: event.target.value },
                        }))}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!reviewReasons[item.id]?.trim() || !(reviewEdits[item.id]?.title.trim()) || !(reviewEdits[item.id]?.principle.trim())}
                        onClick={() => onReviewItem(item.id, 'proposed', reviewReasons[item.id], reviewEdits[item.id])}
                      >
                        Salvar ajuste
                      </Button>
                    </div>
                  </details>
                  <Input
                    className="mt-3"
                    placeholder="Motivo da decisão ou ajuste"
                    value={reviewReasons[item.id] || ''}
                    onChange={event => setReviewReasons(current => ({ ...current, [item.id]: event.target.value }))}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" disabled={!reviewReasons[item.id]?.trim()} onClick={() => onReviewItem(item.id, 'approved', reviewReasons[item.id])}>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Aprovar
                    </Button>
                    <Button size="sm" variant="outline" disabled={!reviewReasons[item.id]?.trim()} onClick={() => onReviewItem(item.id, 'rejected', reviewReasons[item.id])}>Rejeitar</Button>
                  </div>
                </article>
              )}
            />

            <ListSection
              title="Ultimas ingestoes"
              empty="Nenhum job de ingestao registrado."
              items={packJobs}
              render={job => (
                <article key={job.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-950">{job.sourceName}</p>
                      <p className="mt-1 text-xs text-gray-600">{job.sourceKind} / {job.fileName || 'sem arquivo'}</p>
                    </div>
                    <Pill value={job.status} />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Etapa atual: {job.currentStep}</p>
                  <p className="mt-1 text-xs text-gray-600">{jobStageLabel(job)}</p>
                  <p className="mt-1 text-xs text-gray-500">Tentativa: {job.attempt}</p>
                  {isLegacyMetadataOnly(job) ? (
                    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      Reenvio necessário: este registro antigo guardou somente o nome do arquivo.
                    </p>
                  ) : null}
                  {Number(job.proposedCounts.chunks || 0) > 0 ? <p className="mt-1 text-xs text-gray-500">Trechos extraídos: {Number(job.proposedCounts.chunks)}</p> : null}
                  {Number(job.proposedCounts.items || 0) > 0 ? <p className="mt-1 text-xs text-gray-500">Artefatos propostos: {Number(job.proposedCounts.items)}</p> : null}
                  {Number(job.proposedCounts.curationBatchesTotal || 0) > 0 ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Lotes de curadoria: {Number(job.proposedCounts.curationBatchesCompleted || 0)} de {Number(job.proposedCounts.curationBatchesTotal)}
                    </p>
                  ) : null}
                  {job.recoverableError ? (
                    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      {job.recoverableError.message}{job.recoverableError.recoverable ? ' — o processamento pode ser retomado.' : ''}
                    </p>
                  ) : null}
                  {job.documentId && (job.status === 'failed' || job.status === 'curation_unavailable') ? (
                    <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void onRetryJob(job.id)}>
                      Retomar processamento
                    </Button>
                  ) : null}
                </article>
              )}
            />
          </div>
        </section>
      </div>
      {selectedPack && publicationOpen ? (
        <StrategyPublicationDialog
          pack={selectedPack}
          approvedItems={publishableApprovedItems}
          onClose={() => setPublicationOpen(false)}
          onPublish={input => onPublishPack(selectedPack.id, input)}
        />
      ) : null}
      {legacyApprovedItems > 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {legacyApprovedItems} item(ns) aprovado(s) de exemplo não possuem documento e evidência verificável; por segurança, não entram na nova publicação.
        </p>
      ) : null}
    </div>
  )
}

function StrategyPublicationDialog({
  pack,
  approvedItems,
  onClose,
  onPublish,
}: {
  pack: StrategyPack
  approvedItems: StrategyPackItem[]
  onClose: () => void
  onPublish: (input: StrategyPackPublicationInput) => Promise<StrategyPackPublicationResult>
}) {
  const [visibility, setVisibility] = useState<'internal_only' | 'client_safe'>(pack.visibility === 'client_safe' ? 'client_safe' : 'internal_only')
  const [allowed, setAllowed] = useState(pack.allowedAgentProfileKeys.join(', '))
  const [blocked, setBlocked] = useState(pack.blockedAgentProfileKeys.join(', '))
  const [selectedIds, setSelectedIds] = useState(() => approvedItems.map(item => item.id))
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<StrategyPackPublicationResult | null>(null)

  async function publish() {
    setPublishing(true)
    setError('')
    try {
      setResult(await onPublish({
        expectedVersion: pack.governanceVersion,
        visibility,
        allowedAgentProfileKeys: splitCsv(allowed),
        blockedAgentProfileKeys: splitCsv(blocked),
        approvedItemIds: selectedIds,
      }))
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Não foi possível publicar o pack.')
    } finally { setPublishing(false) }
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Confirmar publicação estratégica</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="strategy-publication-visibility">Público efetivo</Label>
            <select id="strategy-publication-visibility" className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={visibility} onChange={event => setVisibility(event.target.value as 'internal_only' | 'client_safe')}>
              <option value="internal_only">Somente equipe interna</option>
              <option value="client_safe">Permitido no contexto do cliente</option>
            </select>
          </div>
          <div className="space-y-2"><Label htmlFor="strategy-publication-allowed">Perfis permitidos</Label><Input id="strategy-publication-allowed" value={allowed} onChange={event => setAllowed(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="strategy-publication-blocked">Perfis bloqueados</Label><Input id="strategy-publication-blocked" value={blocked} onChange={event => setBlocked(event.target.value)} /></div>
          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-semibold">Itens aprovados incluídos</legend>
            {approvedItems.map(item => (
              <label key={item.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedIds.includes(item.id)}
                  onChange={event => setSelectedIds(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))}
                />
                <span><span className="font-medium">{item.title}</span><span className="block text-xs text-gray-500">{item.sourceReference || 'Fonte estruturada anexada à proposta'}</span></span>
              </label>
            ))}
          </fieldset>
          <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
            Será publicada a versão confirmada para {visibility === 'internal_only' ? 'a equipe interna' : 'o contexto seguro do cliente'}, com {splitCsv(allowed).length || 'todos os'} perfil(is) permitido(s) e {splitCsv(blocked).length} bloqueado(s).
          </p>
          {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {result ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Publicação v{result.version} salva. Identidade: {result.contentHash.slice(0, 12)}…</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
          <Button type="button" onClick={() => void publish()} disabled={publishing || !selectedIds.length || Boolean(result)}>{publishing ? 'Publicando…' : 'Publicar versão confirmada'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function strategyItemMatchesFilter(item: StrategyPackItem, filter: 'all' | 'duplicates' | 'conflicts') {
  if (filter === 'all') return true
  const flags = Array.isArray(item.payload.flags) ? item.payload.flags.map(String) : []
  if (filter === 'duplicates') return Boolean(item.payload.duplicateOf) || flags.includes('duplicate')
  return Boolean(item.payload.conflictsWith) || flags.includes('conflict')
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-sm font-semibold text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-950">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  )
}

function ListSection<T extends { id: string }>({
  title,
  empty,
  items,
  render,
}: {
  title: string
  empty: string
  items: T[]
  render: (item: T) => ReactNode
}) {
  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {items.length === 0
        ? <p className="mt-3 rounded-md border border-dashed p-3 text-sm text-gray-500">{empty}</p>
        : <div className="mt-3 space-y-2">{items.slice(0, 8).map(render)}</div>}
    </section>
  )
}
