import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, FileText, Megaphone, RefreshCw, Send, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { marketingStudioService } from '@/services/marketingStudioService'
import type { WorkspaceContextV1 } from '@/types/generated/workspace'
import type { MarketingCampaignObjective, MarketingChannel, StudioJourneyContent, StudioJourneySummary } from '@/types/marketingStudio'

type PlanForm = {
  name: string
  objective: MarketingCampaignObjective
  audience: string
  offer: string
  channel: MarketingChannel
  constraints: string
}

const emptyPlan: PlanForm = {
  name: '', objective: 'lead_generation', audience: '', offer: '', channel: 'linkedin', constraints: '',
}

const statusLabels: Record<string, string> = {
  draft: 'Rascunho', in_review: 'Em revisão', changes_requested: 'Ajustes solicitados', approved: 'Aprovado',
  scheduled: 'Agendado', published: 'Publicado', rejected: 'Rejeitado', archived: 'Arquivado',
  queued: 'Na fila', running: 'Publicando', succeeded: 'Publicado', failed: 'Falhou', blocked: 'Bloqueado', cancelled: 'Cancelado',
}

export function StudioJourney({ workspaceContext }: { workspaceContext: WorkspaceContextV1 }) {
  const portalPath = usePortalWorkspacePath()
  const contractId = workspaceContext.contractId
  const canWrite = workspaceContext.canConfigure && workspaceContext.role !== 'client_member'
  const [summary, setSummary] = useState<StudioJourneySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPlan, setShowPlan] = useState(false)
  const [plan, setPlan] = useState<PlanForm>(emptyPlan)
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({})
  const [publishConnectionId, setPublishConnectionId] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<{ id: string; title: string; body: string } | null>(null)

  const load = useCallback(async () => {
    if (!contractId) return
    setLoading(true)
    setError(null)
    try {
      setSummary(await marketingStudioService.getJourneySummary(workspaceContext.organizationId, contractId))
    } catch (loadError) {
      console.error('Erro ao carregar jornada do Marketing Studio:', loadError)
      setError('Não foi possível carregar os registros do Marketing Studio. Tente novamente.')
    } finally { setLoading(false) }
  }, [contractId, workspaceContext.organizationId])

  useEffect(() => { void load() }, [load])

  const connectedConnections = useMemo(
    () => summary?.connections.filter(connection => connection.status === 'connected') ?? [],
    [summary?.connections],
  )

  if (!contractId) return <StudioUnavailable message="O Marketing Studio precisa de um contrato ativo neste workspace." />
  if (loading && !summary) return <p className="text-sm text-slate-600">Carregando Marketing Studio...</p>
  if (error && !summary) return <StudioUnavailable message={error} retry={load} />

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key)
    try {
      await action()
      toast.success(success)
      await load()
    } catch (actionError) {
      console.error('Falha na jornada do Marketing Studio:', actionError)
      toast.error('A ação não foi concluída. Revise os dados e tente novamente.')
    } finally { setBusy(null) }
  }

  const submitPlan = (event: FormEvent) => {
    event.preventDefault()
    if (!contractId) return
    void run('plan', async () => {
      await marketingStudioService.createJourneyPlan({
        organizationId: workspaceContext.organizationId,
        contractId,
        idempotencyKey: `studio-plan:${Date.now()}:${plan.name.trim().toLowerCase()}`,
        ...plan,
        sourceIds: [],
        provider: plan.channel === 'blog' ? 'google' : 'meta',
      })
      setPlan(emptyPlan)
      setShowPlan(false)
    }, 'Planejamento salvo como campanha e conteúdo em rascunho.')
  }

  const submitReview = (content: StudioJourneyContent) => {
    if (!contractId || !content.latestVersionId) return
    void run(`submit:${content.id}`, () => marketingStudioService.submitJourneyContentForReview(content.id, {
      organizationId: workspaceContext.organizationId, contractId, contentVersionId: content.latestVersionId!,
    }), 'Conteúdo enviado para revisão.')
  }

  const decide = (content: StudioJourneyContent, status: 'approved' | 'changes_requested' | 'rejected') => {
    if (!contractId || !content.reviewVersionId) return
    void run(`review:${content.id}`, () => marketingStudioService.decideJourneyContentReview(content.id, {
      organizationId: workspaceContext.organizationId, contractId, contentVersionId: content.reviewVersionId!,
      status, comments: reviewComment[content.id],
    }), status === 'approved' ? 'Versão aprovada.' : 'Decisão registrada.')
  }

  const saveVersion = () => {
    if (!contractId || !editing) return
    void run(`version:${editing.id}`, async () => {
      await marketingStudioService.createJourneyContentVersion(editing.id, {
        organizationId: workspaceContext.organizationId, contractId,
        title: editing.title, body: editing.body, changeSummary: 'Nova versão após revisão.',
      })
      setEditing(null)
    }, 'Nova versão salva em rascunho.')
  }

  const publish = (content: StudioJourneyContent) => {
    const connection = connectedConnections.find(item => item.id === publishConnectionId[content.id]) ?? connectedConnections[0]
    if (!contractId || !content.latestVersionId || !connection) return
    void run(`publish:${content.id}`, () => marketingStudioService.createJourneyPublishingIntent(content.id, {
      organizationId: workspaceContext.organizationId, contractId,
      approvedContentVersionId: content.latestVersionId!, connectionId: connection.id,
      action: 'publish', idempotencyKey: `studio-publish:${content.id}:${content.latestVersionId}`,
    }), 'Publicação controlada adicionada à fila.')
  }

  const counts = summary?.counts ?? { activeFlows: 0, generatedAssets: 0, pendingReviews: 0, scheduledAssets: 0, failedPublications: 0 }

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Marketing Studio</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Planeje, revise e publique com controle</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Todos os indicadores abaixo vêm dos registros deste workspace e da janela informada.</p>
        </div>
        {canWrite && <Button onClick={() => setShowPlan(value => !value)}><Megaphone className="mr-2 h-4 w-4" />Planejar campanha</Button>}
      </header>

      {error && <div role="alert" className="flex items-center gap-2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="h-4 w-4" />{error}</div>}

      <section aria-label="Resumo operacional" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Fluxos ativos" value={counts.activeFlows} icon={Workflow} href={portalPath(summary?.links.activeFlows)} />
        <Metric label="Conteúdos no período" value={counts.generatedAssets} icon={FileText} href={portalPath(summary?.links.generatedAssets)} />
        <Metric label="Em revisão" value={counts.pendingReviews} icon={Clock3} href={portalPath(summary?.links.pendingReviews)} />
        <Metric label="Agendados" value={counts.scheduledAssets} icon={Send} href={portalPath(summary?.links.scheduledAssets)} />
        <Metric label="Publicações com falha" value={counts.failedPublications} icon={AlertCircle} href={portalPath(summary?.links.failedPublications)} />
      </section>

      {showPlan && canWrite && <PlanCampaignForm value={plan} busy={busy === 'plan'} onChange={setPlan} onSubmit={submitPlan} />}

      {!!summary?.campaigns.length && (
        <section id="campaigns" className="border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Campanhas</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Planejamentos persistidos</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {summary.campaigns.map(campaign => (
              <div key={campaign.id} className="border border-slate-100 p-3 text-sm">
                <strong className="text-slate-950">{campaign.name}</strong>
                <p className="mt-1 text-slate-600">{campaign.objective} · {statusLabels[campaign.status] ?? campaign.status}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!summary?.contents.length ? (
        <section id="contents" className="border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <span id="reviews" className="scroll-mt-6" />
          <Megaphone className="mx-auto h-8 w-8 text-slate-400" />
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Nenhuma campanha planejada</h2>
          <p className="mt-1 text-sm text-slate-600">Comece por objetivo, público, oferta, canal e restrições.</p>
          {canWrite && <Button className="mt-4" onClick={() => setShowPlan(true)}>Planejar campanha</Button>}
        </section>
      ) : (
        <section id="contents" className="space-y-3">
          <span id="reviews" className="scroll-mt-6" />
          <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Conteúdo</p><h2 className="text-xl font-semibold text-slate-950">Da versão ao resultado publicado</h2></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div>
          {summary.contents.map(content => (
            <article key={content.id} className="border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{content.channel} · versão {content.latestVersionNumber ?? '—'}</p><h3 className="mt-1 font-semibold text-slate-950">{content.title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{content.body || 'Conteúdo ainda sem texto.'}</p></div>
                <span className="w-fit border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">{statusLabels[content.status] ?? content.status}</span>
              </div>
              {content.reviewComments && <p className="mt-3 border-l-2 border-amber-400 pl-3 text-sm text-slate-700">{content.reviewComments}</p>}
              {content.publishedUrl && <a className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline" href={content.publishedUrl} target="_blank" rel="noreferrer">Abrir publicação <ArrowRight className="h-3 w-3" /></a>}
              {canWrite && <div className="mt-4 flex flex-wrap gap-2">
                {['draft', 'changes_requested', 'rejected'].includes(content.status) && <>
                  <Button variant="outline" size="sm" onClick={() => setEditing({ id: content.id, title: content.title, body: content.body ?? '' })}>Criar nova versão</Button>
                  <Button size="sm" disabled={!content.latestVersionId || busy === `submit:${content.id}`} onClick={() => submitReview(content)}>Enviar para revisão</Button>
                </>}
                {content.status === 'in_review' && <>
                  <input aria-label={`Comentário para ${content.title}`} className="h-9 min-w-56 border border-slate-300 px-3 text-sm" placeholder="Comentário opcional" value={reviewComment[content.id] ?? ''} onChange={event => setReviewComment(current => ({ ...current, [content.id]: event.target.value }))} />
                  <Button size="sm" disabled={busy === `review:${content.id}`} onClick={() => decide(content, 'approved')}><CheckCircle2 className="mr-1 h-4 w-4" />Aprovar</Button>
                  <Button variant="outline" size="sm" disabled={busy === `review:${content.id}`} onClick={() => decide(content, 'changes_requested')}>Pedir ajustes</Button>
                  <Button variant="outline" size="sm" disabled={busy === `review:${content.id}`} onClick={() => decide(content, 'rejected')}>Rejeitar</Button>
                </>}
                {content.status === 'approved' && <>
                  <select
                    aria-label={`Conexão de publicação para ${content.title}`}
                    className="h-9 border border-slate-300 bg-white px-2 text-sm"
                    disabled={!connectedConnections.length || busy === `publish:${content.id}`}
                    value={publishConnectionId[content.id] ?? connectedConnections[0]?.id ?? ''}
                    onChange={event => setPublishConnectionId(current => ({ ...current, [content.id]: event.target.value }))}
                  >
                    {!connectedConnections.length && <option value="">Nenhuma conexão validada</option>}
                    {connectedConnections.map(connection => <option key={connection.id} value={connection.id}>{connection.name} · {connection.provider}</option>)}
                  </select>
                  <Button size="sm" disabled={!connectedConnections.length || busy === `publish:${content.id}`} onClick={() => publish(content)}>Publicar versão aprovada</Button>
                </>}
              </div>}
              {content.status === 'approved' && !connectedConnections.length && <p className="mt-2 text-xs text-amber-700">Conecte e valide um provedor antes de publicar.</p>}
            </article>
          ))}
        </section>
      )}

      {editing && <section className="border border-blue-200 bg-blue-50 p-5"><h2 className="font-semibold text-slate-950">Nova versão</h2><div className="mt-3 grid gap-3"><input aria-label="Título da nova versão" className="h-10 border border-slate-300 bg-white px-3 text-sm" value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} /><textarea aria-label="Texto da nova versão" className="min-h-40 border border-slate-300 bg-white p-3 text-sm" value={editing.body} onChange={event => setEditing({ ...editing, body: event.target.value })} /><div className="flex gap-2"><Button onClick={saveVersion} disabled={busy === `version:${editing.id}`}>Salvar nova versão</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button></div></div></section>}

      <span id="flows" className="scroll-mt-6" />
      {!!summary?.workflows.length && <section className="border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Builder avançado</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Fluxos persistidos</h2><div className="mt-3 space-y-2">{summary.workflows.map(flow => <div key={flow.id} className="flex items-center justify-between border border-slate-100 p-3 text-sm"><span><strong>{flow.name}</strong><span className="ml-2 text-slate-500">{statusLabels[flow.status] ?? flow.status}</span></span><a className="font-semibold text-blue-700" href={portalPath('/portal/automacoes')}>Editar fluxo</a></div>)}</div></section>}

      <section id="calendar" className="border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-950">Agenda editorial</h2>
        {summary?.calendarItems.length ? <div className="mt-3 space-y-2">{summary.calendarItems.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm"><strong>{item.title}</strong><span className="text-slate-600">{item.channel} · {statusLabels[item.status] ?? item.status} · {new Date(item.startsAt).toLocaleString('pt-BR')}</span></div>)}</div> : <p className="mt-2 text-sm text-slate-600">Nenhum conteúdo agendado neste workspace.</p>}
      </section>

      <section id="publishing" className="border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-950">Histórico de publicação</h2>
        {summary?.publishingRuns.length ? <div className="mt-3 space-y-2">{summary.publishingRuns.map(runItem => <div key={runItem.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm"><span>{runItem.connectionName} · {statusLabels[runItem.status] ?? runItem.status}</span>{runItem.publishedUrl && <a className="font-semibold text-blue-700" href={runItem.publishedUrl} target="_blank" rel="noreferrer">Abrir resultado</a>}{runItem.protectedError && <span className="text-red-700">Falha recuperável</span>}</div>)}</div> : <p className="mt-2 text-sm text-slate-600">Nenhuma tentativa de publicação registrada.</p>}
      </section>
    </div>
  )
}

function Metric({ label, value, icon: Icon, href }: { label: string; value: number; icon: typeof Workflow; href: string }) {
  return <a href={href} className="group border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-300"><div className="flex items-center justify-between"><Icon className="h-4 w-4 text-blue-600" /><ArrowRight className="h-3 w-3 text-slate-400 group-hover:text-blue-600" /></div><p className="mt-4 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-600">{label}</p></a>
}

function PlanCampaignForm({ value, busy, onChange, onSubmit }: { value: PlanForm; busy: boolean; onChange: (value: PlanForm) => void; onSubmit: (event: FormEvent) => void }) {
  const field = (key: keyof PlanForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ ...value, [key]: event.target.value })
  const inputClass = 'w-full border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-500'
  return <form onSubmit={onSubmit} className="border border-blue-200 bg-blue-50 p-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Novo planejamento</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Contexto autorizado da campanha</h2></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Nome"><input aria-label="Nome" required className={inputClass} value={value.name} onChange={field('name')} /></Field><Field label="Objetivo"><select aria-label="Objetivo" className={inputClass} value={value.objective} onChange={field('objective')}><option value="lead_generation">Gerar leads</option><option value="traffic">Gerar tráfego</option><option value="conversions">Conversões</option><option value="awareness">Reconhecimento</option></select></Field><Field label="Público"><textarea aria-label="Público" required className={`${inputClass} min-h-24`} value={value.audience} onChange={field('audience')} /></Field><Field label="Oferta"><textarea aria-label="Oferta" required className={`${inputClass} min-h-24`} value={value.offer} onChange={field('offer')} /></Field><Field label="Canal"><select aria-label="Canal" className={inputClass} value={value.channel} onChange={field('channel')}><option value="linkedin">LinkedIn</option><option value="instagram">Instagram</option><option value="blog">Blog</option><option value="newsletter">Newsletter</option><option value="email">E-mail</option></select></Field><Field label="Restrições"><textarea aria-label="Restrições" className={`${inputClass} min-h-24`} placeholder="Palavras proibidas, limites legais, prazo ou outras condições" value={value.constraints} onChange={field('constraints')} /></Field></div><Button className="mt-4" type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Salvar planejamento'}</Button></form>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1 text-sm font-semibold text-slate-800"><span>{label}</span>{children}</label> }

function StudioUnavailable({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="border border-slate-200 bg-white p-6"><h1 className="text-xl font-semibold text-slate-950">Marketing Studio</h1><p className="mt-2 text-sm text-slate-600">{message}</p>{retry && <Button className="mt-4" variant="outline" onClick={() => void retry()}>Tentar novamente</Button>}</div>
}
