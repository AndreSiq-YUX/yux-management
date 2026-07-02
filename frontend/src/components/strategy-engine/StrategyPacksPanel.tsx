import { FormEvent, ReactNode, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Database, FileUp, GitBranch, PackageCheck, Plus, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type {
  StrategyAgentProfile,
  StrategyIngestionJob,
  StrategyIngestionJobInput,
  StrategyOrganization,
  StrategyPack,
  StrategyPackBinding,
  StrategyPackBindingInput,
  StrategyPackInput,
  StrategyPackItem,
  StrategyPackItemInput,
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

export function StrategyPacksPanel({
  packs,
  items,
  jobs,
  bindings,
  profiles,
  organizations,
  onSavePack,
  onSaveItem,
  onUpdateItemStatus,
  onCreateJob,
  onSaveBinding,
}: {
  packs: StrategyPack[]
  items: StrategyPackItem[]
  jobs: StrategyIngestionJob[]
  bindings: StrategyPackBinding[]
  profiles: StrategyAgentProfile[]
  organizations: StrategyOrganization[]
  onSavePack: (input: StrategyPackInput) => Promise<unknown>
  onSaveItem: (input: StrategyPackItemInput) => Promise<unknown>
  onUpdateItemStatus: (id: string, status: string) => Promise<unknown>
  onCreateJob: (input: StrategyIngestionJobInput) => Promise<unknown>
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

  const [packForm, setPackForm] = useState({
    packKey: '',
    name: '',
    description: '',
    sourceTitle: '',
    targetProfileKeys: '',
    targetModules: '',
  })
  const [jobForm, setJobForm] = useState({ sourceName: '', sourceKind: 'private_book', fileName: '' })
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
    if (!selectedPack) return
    await onCreateJob({
      packId: selectedPack.id,
      sourceName: jobForm.sourceName,
      sourceKind: jobForm.sourceKind,
      fileName: jobForm.fileName,
      status: 'uploaded',
      currentStep: 'upload',
      metadata: { intendedOutput: ['concept_cards', 'playbooks', 'chunks', 'rubrics'] },
    })
    setJobForm({ sourceName: '', sourceKind: 'private_book', fileName: '' })
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

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Packs" value={packs.length} detail="Pacotes de doutrina e RAG" />
        <Metric label="Itens aprovados" value={approvedItems.length} detail="Entram em runtime" />
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
                <Button variant="outline" onClick={() => onSavePack({ ...selectedPack, packKey: selectedPack.packKey, status: 'published', version: selectedPack.version })}>
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
                <Input type="file" onChange={event => setJobForm({ ...jobForm, fileName: event.target.files?.[0]?.name || '' })} />
                <Button type="submit" className="w-full" disabled={!selectedPack}>Registrar ingestao</Button>
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

          <div className="grid gap-4 xl:grid-cols-2">
            <ListSection
              title="Itens em revisao"
              empty="Nenhum item pendente."
              items={pendingItems}
              render={item => (
                <article key={item.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-950">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">{item.summary}</p>
                    </div>
                    <Pill value={item.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onUpdateItemStatus(item.id, 'approved')}>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onUpdateItemStatus(item.id, 'archived')}>Arquivar</Button>
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
                </article>
              )}
            />
          </div>
        </section>
      </div>
    </div>
  )
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
