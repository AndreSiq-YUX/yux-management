import { StrategyProposalReview } from '@/components/company-strategy/StrategyProposalReview'

import { useEffect, useRef, useState } from 'react'

import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom'

import { BookOpen, Plus } from 'lucide-react'

import { PortalPage } from '@/components/client-portal/PortalPage'

import { ConfirmDialog, EmptyState, ErrorState, SectionCard, SkeletonCard, portalButtonClasses, useUnsavedChangesWarning } from '@/components/portal-ui'

import { StrategyEditor } from '@/components/company-strategy/StrategyEditor'

import { StrategyOverview } from '@/components/company-strategy/StrategyOverview'

import { companyStrategyService } from '@/services/companyStrategyService'

import { ApiClientError } from '@/lib/apiClient'

import { usePlatformStore } from '@/stores/platformStore'

import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'

import { emptyCompanyStrategy, type CompanyStrategyProposal, type CompanyStrategy, type CompanyStrategyContentV1, type CompanyStrategyRevision } from '@/types/companyStrategy'



export function PortalCompanyStrategyPage() {

  const organizationId = usePlatformStore(state => state.organization?.id)

  const canWrite = usePlatformStore(state => state.workspaceContext?.canConfigure ?? ['yux_admin', 'yux_manager', 'yux_operator', 'client_admin'].includes(state.role?.key ?? ''))

  const hasMissions = usePlatformStore(state => state.enabledModuleKeys.includes('action_engine'))

  const portalPath = usePortalWorkspacePath()

  const { strategyId } = useParams()

  const navigate=useNavigate()

  const [search,setSearch]=useSearchParams()

  const proposalId=search.get('proposalId')

  const [proposal,setProposal]=useState<CompanyStrategyProposal|null>(null)

  const proposalAttempt=useRef<{fingerprint:string;key:string}|null>(null)

  const reviewAttempt=useRef<{fingerprint:string;key:string}|null>(null)

  const [strategies, setStrategies] = useState<CompanyStrategy[]>([])

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [editor, setEditor] = useState<CompanyStrategyContentV1 | null>(null)

  const [editingStrategyId, setEditingStrategyId] = useState<string | null>(null)

  const [baseline, setBaseline] = useState('')

  const [loading, setLoading] = useState(true)

  const [busy, setBusy] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const [conflict, setConflict] = useState<CompanyStrategy | null>(null)

  const [history, setHistory] = useState<CompanyStrategyRevision[] | null>(null)

  const [historyRevision, setHistoryRevision] = useState<CompanyStrategyRevision | null>(null)

  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null)

  const saveAttempt = useRef<{ fingerprint: string; key: string } | null>(null)

  const publishAttempt = useRef<{ fingerprint: string; key: string } | null>(null)

  const requestScope = useRef(organizationId)

  requestScope.current = organizationId

  const selected = strategies.find(item => item.id === (selectedId ?? strategyId)) ?? strategies.find(item => item.isPrimary && !item.archivedAt) ?? strategies.find(item => !item.archivedAt) ?? strategies[0] ?? null

  const visibleSelected = selected && !canWrite ? { ...selected, draftRevision: null } : selected

  const dirty = editor !== null && JSON.stringify(editor) !== baseline

  useUnsavedChangesWarning(dirty)

  useEffect(() => {

    let active = true

    setStrategies([]); setEditor(null); setEditingStrategyId(null); setSelectedId(null); setError(null); setLoading(true); setBusy(false); setConflict(null); setHistory(null); setHistoryRevision(null)

    if (!organizationId) { setLoading(false); return }

    companyStrategyService.list(organizationId).then(items => { if (active) setStrategies(items) }).catch(() => { if (active) setError('Não foi possível carregar as estratégias.') }).finally(() => { if (active) setLoading(false) })

    return () => { active = false }

  }, [organizationId])

  useEffect(()=>{

    let active=true

    setProposal(null)

    if(organizationId && proposalId && canWrite) companyStrategyService.getProposal(organizationId,proposalId).then(value=>{if(active)setProposal(value)}).catch(()=>{if(active)setError('Não foi possível carregar a proposta para revisão.')})

    return ()=>{active=false}

  },[organizationId,proposalId,canWrite])

  const applyProposal=async(content:CompanyStrategyContentV1)=>{

    if(!organizationId || !proposal) return

    const fingerprint=JSON.stringify({id:proposal.proposalId,content})

    if(proposalAttempt.current?.fingerprint!==fingerprint) proposalAttempt.current={fingerprint,key:crypto.randomUUID()}

    try {

      const saved=await companyStrategyService.applyProposal(organizationId,proposal.proposalId,{expectedStrategyVersion:proposal.baseStrategyVersion,idempotencyKey:proposalAttempt.current.key,reviewedContent:content})

      if(requestScope.current!==organizationId)return

      replace(saved);setProposal(null);setSearch({});proposalAttempt.current=null

    } catch(cause){throw new Error(cause instanceof ApiClientError && cause.status===409?'A estratégia foi alterada desde a proposta. Sua revisão foi preservada; compare a versão atual antes de continuar.':'Não foi possível salvar. Sua revisão foi preservada para tentar novamente.')}

  }

  const requestReview=async()=>{

    if(!organizationId || !selected || busy) return

    const fingerprint=`${selected.id}:${selected.version}`

    if(reviewAttempt.current?.fingerprint!==fingerprint)reviewAttempt.current={fingerprint,key:crypto.randomUUID()}

    setBusy(true);setError(null)

    try {const result=await companyStrategyService.reviewConversation(organizationId,selected,reviewAttempt.current.key);if(requestScope.current===organizationId)navigate(portalPath(`/portal/missoes/conversas/${result.conversation.id}`))}

    catch{if(requestScope.current===organizationId)setError('Não foi possível abrir a revisão. Tente novamente.')}

    finally{if(requestScope.current===organizationId)setBusy(false)}

  }

  const replace = (next: CompanyStrategy) => {

    setStrategies(current => current.some(item => item.id === next.id) ? current.map(item => item.id === next.id ? next : { ...item, isPrimary: next.isPrimary ? false : item.isPrimary }) : [...current, next])

    setSelectedId(next.id)

  }

  const switchView = (action: () => void) => { if (dirty) setDiscardAction(() => action); else action() }

  const startEditing = (content?: CompanyStrategyContentV1, targetId: string | null = null) => { const next = content ?? emptyCompanyStrategy(); setEditingStrategyId(targetId); setEditor(structuredClone(next)); setBaseline(JSON.stringify(next)); setConflict(null); setHistoryRevision(null); setError(null); saveAttempt.current = null }

  const save = async () => {

    if (!organizationId || !editor || busy || !canWrite) return

    if (editor.title.trim().length < 3 || editor.objective.trim().length < 10 || editor.summary.trim().length < 20 || editor.sections.some(section => !section.title.trim() || !section.body.trim())) { setError('Preencha título, objetivo e resumo. Complete ou remova as seções vazias.'); return }

    setBusy(true); setError(null)

    const fingerprint = JSON.stringify({ content: editor, strategyId: selectedId, version: selected?.version })

    if (saveAttempt.current?.fingerprint !== fingerprint) saveAttempt.current = { fingerprint, key: crypto.randomUUID() }

    try {

      const editingExisting = editingStrategyId !== null

      const input = { content: editor, expectedVersion: editingExisting && selected ? selected.version : null, idempotencyKey: saveAttempt.current!.key }

      const saved = editingExisting && selected ? await companyStrategyService.saveDraft(organizationId, selected.id, input) : await companyStrategyService.createDraft(organizationId, input)

      if (requestScope.current !== organizationId) return

      replace(saved); setEditor(null); setBaseline(''); setConflict(null); saveAttempt.current = null

    } catch (cause) {

      if (requestScope.current !== organizationId) return

      setError(cause instanceof ApiClientError && cause.status === 409 ? 'Outra pessoa atualizou esta estratégia. Compare as versões antes de salvar novamente.' : 'Não foi possível salvar. Seu texto continua disponível para tentar novamente.')

      if (cause instanceof ApiClientError && cause.status === 409 && selected) {const current=await companyStrategyService.get(organizationId, selected.id).catch(() => null);if(requestScope.current===organizationId)setConflict(current)}

    } finally { if (requestScope.current === organizationId) setBusy(false) }

  }

  const run = async (operation: () => Promise<CompanyStrategy>) => {

    if (busy) return

    setBusy(true); setError(null)

    try { const result = await operation(); if (requestScope.current !== organizationId) return; replace(result); setHistory(null); setHistoryRevision(null) }

    catch (cause) { if (requestScope.current === organizationId) setError(cause instanceof ApiClientError && cause.status === 409 ? 'A estratégia mudou. Atualize a página para revisar a versão atual.' : 'Não foi possível concluir. Tente novamente.') }

    finally { if (requestScope.current === organizationId) setBusy(false) }

  }

  const publish = () => {

    if (!organizationId || !selected?.draftRevision) return

    const fingerprint = `${selected.id}:${selected.version}:${selected.draftRevision.id}`

    if (publishAttempt.current?.fingerprint !== fingerprint) publishAttempt.current = { fingerprint, key: crypto.randomUUID() }

    void run(() => companyStrategyService.publish(organizationId, selected, publishAttempt.current!.key))

  }

  return <PortalPage eyebrow="Empresa" title="Estratégia" description="As decisões e prioridades da empresa que orientam as missões, o conteúdo e o atendimento."

    primaryAction={canWrite ? <button type="button" className={portalButtonClasses('primary')} disabled={busy} onClick={() => switchView(() => { setSelectedId(null); startEditing() })}><Plus aria-hidden="true" />Criar estratégia</button> : undefined}

    related={[{ label: 'Base de conhecimento', href: '/portal/empresa/conhecimento' }]}

    help={['Converse em Missões ou comece manualmente.', 'Salve alterações em rascunho e publique quando estiverem prontas para orientar os agentes.', 'Publicar a estratégia não inicia campanhas nem contatos.']}>

    {error && <ErrorState title="Atenção" description={error} />}

    {loading ? <SkeletonCard lines={5} /> : <>

      {proposal && (proposal.status==='applied' ? <SectionCard title="Proposta já salva como rascunho"><Link className={portalButtonClasses('primary')} to={`${portalPath('/portal/empresa/estrategia')}/${proposal.appliedStrategyId}`}>Abrir estratégia</Link></SectionCard> : <StrategyProposalReview key={proposal.proposalId} proposal={proposal} onApply={applyProposal} />)}

      {!proposal && !strategies.length && !editor && <EmptyState icon={BookOpen} title="Uma direção clara para a empresa" description="Registre objetivos, públicos, ofertas e frentes de atuação. A versão publicada passa a orientar os agentes." />}

      {hasMissions && canWrite && !editor && !proposal && <Link className={portalButtonClasses('ghost')} to={portalPath('/portal/missoes')}>Construir com o agente</Link>}

      {!proposal && !!strategies.length && !editor && <div className="flex flex-col gap-2 rounded-lg border border-yx-line bg-yx-surface p-4 sm:flex-row sm:items-center sm:gap-4">

        <label htmlFor="company-strategy-focus" className="shrink-0 text-sm font-medium text-yx-fg">Estratégia em foco</label>

        <select id="company-strategy-focus" aria-label="Estratégia em foco" className="min-h-10 w-full min-w-0 flex-1 rounded-lg border border-yx-line-strong bg-yx-surface px-3 text-sm text-yx-fg" value={selected?.id ?? ''} onChange={event => { setSelectedId(event.target.value); setHistory(null); setHistoryRevision(null) }}>

          {strategies.map(item => <option key={item.id} value={item.id}>{(canWrite ? item.draftRevision ?? item.publishedRevision : item.publishedRevision)?.content.title ?? 'Estratégia'}{item.isPrimary ? ' · Principal' : ''}{item.archivedAt ? ' · Arquivada' : ''}</option>)}

        </select>

        <span className="shrink-0 text-xs text-yx-fg-3">{strategies.length} {strategies.length === 1 ? 'estratégia' : 'estratégias'}</span>

      </div>}

      {!proposal && (editor ? <div className="flex flex-col gap-5">

        <StrategyEditor organizationId={organizationId} content={editor} onChange={setEditor} saving={busy} />

        {conflict && <SectionCard title="Versão atual para comparação" description="Seu texto foi preservado. Compare e escolha como reconciliar as alterações."><StrategyOverview strategy={conflict} revision={conflict.draftRevision ?? conflict.publishedRevision} /><button className={portalButtonClasses('ghost')} type="button" onClick={() => { replace(conflict); setConflict(null); saveAttempt.current = null }}>Usar a versão atual como base e manter meu texto</button></SectionCard>}

        <div className="flex flex-wrap gap-3"><button className={portalButtonClasses('primary')} type="button" disabled={busy} onClick={() => void save()}>Salvar rascunho</button><button className={portalButtonClasses('ghost')} type="button" disabled={busy} onClick={() => switchView(() => { setEditor(null); setConflict(null) })}>Cancelar edição</button></div>

      </div> : visibleSelected && <div className="flex flex-col gap-5">

        {canWrite && visibleSelected.draftRevision && visibleSelected.publishedRevision && <p role="status" className="rounded-lg border border-yx-line bg-yx-surface p-4 text-sm text-yx-fg-2">Publicada com alterações em rascunho. Os agentes continuam seguindo a versão publicada.</p>}

        <div className="flex flex-wrap gap-2">

          {canWrite && !visibleSelected.archivedAt && <button className={portalButtonClasses('ghost')} type="button" disabled={busy} onClick={() => { setSelectedId(visibleSelected.id); startEditing((visibleSelected.draftRevision ?? visibleSelected.publishedRevision)?.content, visibleSelected.id) }}>Editar</button>}

          {canWrite && hasMissions && !visibleSelected.archivedAt && <button className={portalButtonClasses('ghost')} type="button" disabled={busy} onClick={()=>void requestReview()}>Pedir revisão ao agente</button>}

          {canWrite && visibleSelected.draftRevision && !visibleSelected.archivedAt && <button className={portalButtonClasses('primary')} type="button" disabled={busy} onClick={publish}>Publicar para os agentes</button>}

          {canWrite && !visibleSelected.isPrimary && !visibleSelected.archivedAt && <button className={portalButtonClasses('ghost')} type="button" disabled={busy} onClick={() => void run(() => companyStrategyService.setPrimary(organizationId!, visibleSelected))}>Definir como principal</button>}

          {canWrite && <button className={portalButtonClasses('ghost')} type="button" disabled={busy} onClick={() => void run(() => visibleSelected.archivedAt ? companyStrategyService.restore(organizationId!, visibleSelected) : companyStrategyService.archive(organizationId!, visibleSelected))}>{visibleSelected.archivedAt ? 'Restaurar rascunho' : 'Arquivar'}</button>}

          <button className={portalButtonClasses('ghost')} type="button" onClick={() => { companyStrategyService.history(organizationId!, visibleSelected.id).then(value=>{if(requestScope.current===organizationId)setHistory(value)}).catch(() => requestScope.current===organizationId && setError('Não foi possível carregar o histórico.')) }}>Histórico de versões</button>

        </div>

        {history && <SectionCard title="Histórico de versões"><div className="flex flex-wrap gap-2">{history.map(item => <button key={item.id} type="button" className={portalButtonClasses('ghost')} onClick={() => setHistoryRevision(item)}>Versão {item.revisionNumber} · {new Date(item.createdAt).toLocaleDateString('pt-BR')}</button>)}{historyRevision && <button type="button" className={portalButtonClasses('ghost')} onClick={() => setHistoryRevision(null)}>Voltar à versão vigente</button>}</div></SectionCard>}

        <StrategyOverview strategy={visibleSelected} revision={historyRevision} />

      </div>)}

    </>}

    <ConfirmDialog open={discardAction !== null} onOpenChange={open => { if (!open) setDiscardAction(null) }} title="Descartar alterações não salvas?" description="O texto desta edição ainda não foi salvo." confirmLabel="Descartar alterações" onConfirm={() => { discardAction?.(); setDiscardAction(null) }} />

  </PortalPage>

}

