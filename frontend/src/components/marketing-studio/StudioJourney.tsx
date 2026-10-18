import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertCircle, ArrowRight, CheckCircle2, Megaphone, RefreshCw } from 'lucide-react'
import { PortalPage } from '@/components/client-portal/PortalPage'
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SectionCard,
  SkeletonCard,
  StatusChip,
  portalButtonClasses,
  portalFocusRing,
  sectionLinkClasses,
  type StatusChipVariant,
} from '@/components/portal-ui'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { clearSessionDraft, readSessionDraft, writeSessionDraft } from '@/lib/sessionDraft'
import { cn } from '@/lib/utils'
import { marketingStudioService } from '@/services/marketingStudioService'
import type { WorkspaceContextV1 } from '@/types/generated/workspace'
import type { MarketingCampaignObjective, MarketingChannel, StudioJourneyContent, StudioJourneySummary } from '@/types/marketingStudio'
import { EditorialAgenda } from './EditorialAgenda'
import { channelLabel } from './editorialCalendar'

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
  active: 'Ativo', paused: 'Pausado', planned: 'Planejado', completed: 'Concluído',
}

const providerLabels: Record<string, string> = {
  wordpress: 'WordPress', meta_facebook: 'Facebook', meta_instagram: 'Instagram', google_business_profile: 'Google Meu Negócio',
}

const statusVariants: Record<string, StatusChipVariant> = {
  in_review: 'warn', changes_requested: 'warn', queued: 'warn', running: 'warn',
  approved: 'ok', scheduled: 'ok', published: 'ok', succeeded: 'ok', active: 'ok',
  rejected: 'crit', failed: 'crit', blocked: 'crit',
}

const statusVariant = (status: string): StatusChipVariant => statusVariants[status] ?? 'neutral'

const objectiveLabels: Record<string, string> = {
  lead_generation: 'Gerar leads', traffic: 'Gerar tráfego', conversions: 'Conversões', awareness: 'Reconhecimento',
}

const fieldClasses = cn(
  'min-h-10 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-3 py-2 text-sm font-normal text-yx-fg placeholder:text-yx-fg-3',
  portalFocusRing,
)

const helpItems = [
  'Planeje: informe objetivo, público, oferta e canal para criar a campanha e o primeiro rascunho.',
  'Produza: crie novas versões do texto e envie para revisão.',
  'Aprove e publique: aprove, peça ajustes ou rejeite; só versões aprovadas podem ser publicadas.',
  'Para revisar tudo em um só lugar, use a Central de conteúdo; para ver as datas de saída, o Calendário editorial.',
]

export function StudioJourney({ workspaceContext }: { workspaceContext: WorkspaceContextV1 }) {
  const portalPath = usePortalWorkspacePath()
  const { hash } = useLocation()
  const contractId = workspaceContext.contractId
  const canWrite = workspaceContext.canConfigure && workspaceContext.role !== 'client_member'
  const [summary, setSummary] = useState<StudioJourneySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const draftScope = `marketing-studio:${workspaceContext.organizationId}:${contractId ?? 'no-contract'}`
  const initialDraft = useMemo(() => readSessionDraft<{
    showPlan: boolean
    plan: PlanForm
    editing: { id: string; title: string; body: string } | null
  }>(draftScope), [draftScope])
  const [showPlan, setShowPlan] = useState(initialDraft?.showPlan ?? false)
  const [plan, setPlan] = useState<PlanForm>(initialDraft?.plan ?? emptyPlan)
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({})
  const [publishConnectionId, setPublishConnectionId] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<{ id: string; title: string; body: string } | null>(initialDraft?.editing ?? null)
  const [rejecting, setRejecting] = useState<StudioJourneyContent | null>(null)
  const [publishing, setPublishing] = useState<StudioJourneyContent | null>(null)

  useEffect(() => {
    const hasPlanDraft = showPlan || Object.values(plan).some(value => String(value).trim() && value !== emptyPlan.objective && value !== emptyPlan.channel)
    if (!hasPlanDraft && !editing) {
      clearSessionDraft(draftScope)
      return
    }
    writeSessionDraft(draftScope, { showPlan, plan, editing })
  }, [draftScope, editing, plan, showPlan])

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

  // Os indicadores apontam para blocos desta página (#fluxos, #conteúdos…); o Link do roteador não rola sozinho.
  useEffect(() => {
    if (!hash || !summary) return
    document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'start' })
  }, [hash, summary])

  const connectedConnections = useMemo(
    () => summary?.connections.filter(connection => connection.status === 'connected') ?? [],
    [summary?.connections],
  )

  if (!contractId) return <StudioUnavailable message="O Marketing Studio precisa de um contrato ativo neste workspace." />
  if (loading && !summary) return <StudioLoading />
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
    return run(`review:${content.id}`, () => marketingStudioService.decideJourneyContentReview(content.id, {
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
    return run(`publish:${content.id}`, () => marketingStudioService.createJourneyPublishingIntent(content.id, {
      organizationId: workspaceContext.organizationId, contractId,
      approvedContentVersionId: content.latestVersionId!, connectionId: connection.id,
      action: 'publish', idempotencyKey: `studio-publish:${content.id}:${content.latestVersionId}`,
    }), 'Publicação controlada adicionada à fila.')
  }

  const counts = summary?.counts ?? { activeFlows: 0, generatedAssets: 0, pendingReviews: 0, scheduledAssets: 0, failedPublications: 0 }
  const links = summary?.links
  const metrics = [
    { label: 'Fluxos ativos', value: String(counts.activeFlows), href: links?.activeFlows },
    { label: 'Conteúdos no período', value: String(counts.generatedAssets), href: links?.generatedAssets },
    { label: 'Em revisão', value: String(counts.pendingReviews), href: links?.pendingReviews },
    { label: 'Agendados', value: String(counts.scheduledAssets), href: links?.scheduledAssets },
    { label: 'Publicações com falha', value: String(counts.failedPublications), href: links?.failedPublications },
    { label: 'Campanhas planejadas', value: String(summary?.campaigns.length ?? 0), href: links ? '/portal/marketing/studio#campaigns' : undefined },
  ]

  return (
    <PortalPage
      eyebrow="Marketing"
      title="Marketing Studio"
      description="Aqui você planeja e produz: defina a campanha, escreva as versões e envie para revisão. Para revisar e aprovar, use a Central de conteúdo; para ver as datas, o Calendário editorial."
      primaryAction={canWrite ? (
        <button type="button" className={portalButtonClasses('primary')} onClick={() => setShowPlan(value => !value)}>
          <Megaphone aria-hidden="true" />Planejar campanha
        </button>
      ) : undefined}
      metrics={metrics}
      help={helpItems}
      related={[
        { label: 'Central de conteúdo', href: '/portal/marketing/conteudo' },
        { label: 'Calendário editorial', href: '/portal/marketing/calendario' },
        { label: 'Criativos e inspirações', href: '/portal/marketing/criativos' },
        { label: 'Campanhas', href: '/portal/marketing/campanhas' },
      ]}
    >
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-[10px] border border-yx-warn-line bg-yx-warn-soft p-3 text-sm text-yx-warn">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {showPlan && canWrite && <PlanCampaignForm value={plan} busy={busy === 'plan'} onChange={setPlan} onSubmit={submitPlan} />}

      {!!summary?.campaigns.length && (
        <SectionCard id="campaigns" title="Campanhas planejadas" description="Planejamentos salvos neste contrato." className="scroll-mt-6">
          <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
            {summary.campaigns.map(campaign => (
              <li key={campaign.id} className="rounded-lg border border-yx-line bg-yx-surface-2 p-3 text-sm">
                <strong className="text-yx-fg">{campaign.name}</strong>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-yx-fg-2">
                  <span>{objectiveLabels[campaign.objective] ?? campaign.objective}</span>
                  <StatusChip variant={statusVariant(campaign.status)}>{statusLabels[campaign.status] ?? campaign.status}</StatusChip>
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {!summary?.contents.length ? (
        <section id="contents" className="scroll-mt-6">
          <span id="reviews" className="scroll-mt-6" />
          <EmptyState
            icon={Megaphone}
            title="Nenhuma campanha planejada"
            description="Comece por objetivo, público, oferta, canal e restrições."
            action={canWrite ? { label: 'Planejar campanha', onClick: () => setShowPlan(true) } : undefined}
          />
        </section>
      ) : (
        <SectionCard
          id="contents"
          title="Conteúdos"
          description="Da versão ao resultado publicado."
          className="scroll-mt-6"
          action={
            <button type="button" className={portalButtonClasses('ghost')} onClick={() => void load()} disabled={loading}>
              <RefreshCw aria-hidden="true" />Atualizar
            </button>
          }
        >
          <span id="reviews" className="scroll-mt-6" />
          <div className="grid gap-3">
            {summary.contents.map(content => (
              <article key={content.id} className="rounded-[10px] border border-yx-line bg-yx-surface p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-yx-blue">{channelLabel(content.channel)} · versão {content.latestVersionNumber ?? '—'}</p>
                    <h3 className="mt-1 font-semibold text-yx-fg">{content.title}</h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-yx-fg-2">{content.body || 'Conteúdo ainda sem texto.'}</p>
                  </div>
                  <StatusChip variant={statusVariant(content.status)} className="w-fit shrink-0">{statusLabels[content.status] ?? content.status}</StatusChip>
                </div>
                {content.reviewComments && <p className="mt-3 border-l-2 border-yx-warn pl-3 text-sm text-yx-fg-2">{content.reviewComments}</p>}
                {content.publishedUrl && <a className={cn(sectionLinkClasses, 'mt-3')} href={content.publishedUrl} target="_blank" rel="noreferrer">Abrir publicação <ArrowRight aria-hidden="true" /></a>}
                {canWrite && <div className="mt-4 flex flex-wrap items-center gap-2">
                  {['draft', 'changes_requested', 'rejected'].includes(content.status) && <>
                    <button type="button" className={portalButtonClasses('ghost')} onClick={() => setEditing({ id: content.id, title: content.title, body: content.body ?? '' })}>Criar nova versão</button>
                    <button type="button" className={portalButtonClasses('primary')} disabled={!content.latestVersionId || busy === `submit:${content.id}`} onClick={() => submitReview(content)}>Enviar para revisão</button>
                  </>}
                  {content.status === 'in_review' && <>
                    <input
                      aria-label={`Comentário para ${content.title}`}
                      className={cn(fieldClasses, 'sm:w-auto sm:min-w-56')}
                      placeholder="Comentário opcional"
                      value={reviewComment[content.id] ?? ''}
                      onChange={event => setReviewComment(current => ({ ...current, [content.id]: event.target.value }))}
                    />
                    <button type="button" className={portalButtonClasses('primary')} disabled={busy === `review:${content.id}`} onClick={() => void decide(content, 'approved')}><CheckCircle2 aria-hidden="true" />Aprovar</button>
                    <button type="button" className={portalButtonClasses('ghost')} disabled={busy === `review:${content.id}`} onClick={() => void decide(content, 'changes_requested')}>Pedir ajustes</button>
                    <button type="button" className={portalButtonClasses('ghost')} disabled={busy === `review:${content.id}`} onClick={() => setRejecting(content)}>Rejeitar</button>
                  </>}
                  {content.status === 'approved' && <>
                    <select
                      aria-label={`Conexão de publicação para ${content.title}`}
                      className={cn(fieldClasses, 'sm:w-auto')}
                      disabled={!connectedConnections.length || busy === `publish:${content.id}`}
                      value={publishConnectionId[content.id] ?? connectedConnections[0]?.id ?? ''}
                      onChange={event => setPublishConnectionId(current => ({ ...current, [content.id]: event.target.value }))}
                    >
                      {!connectedConnections.length && <option value="">Nenhuma conexão validada</option>}
                      {connectedConnections.map(connection => <option key={connection.id} value={connection.id}>{connection.name} · {providerLabels[connection.provider] ?? connection.provider}</option>)}
                    </select>
                    <button type="button" className={portalButtonClasses('primary')} disabled={!connectedConnections.length || busy === `publish:${content.id}`} onClick={() => setPublishing(content)}>Publicar versão aprovada</button>
                  </>}
                </div>}
                {content.status === 'approved' && !connectedConnections.length && <p className="mt-2 text-xs text-yx-warn">Conecte e valide um provedor antes de publicar.</p>}
              </article>
            ))}
          </div>
        </SectionCard>
      )}

      {editing && (
        <SectionCard title="Nova versão" description="Ajuste o título e o texto. A versão é salva como rascunho." className="border-yx-blue">
          <div className="grid gap-3">
            <input aria-label="Título da nova versão" className={fieldClasses} value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} />
            <textarea aria-label="Texto da nova versão" className={cn(fieldClasses, 'min-h-40')} value={editing.body} onChange={event => setEditing({ ...editing, body: event.target.value })} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={portalButtonClasses('primary')} onClick={saveVersion} disabled={busy === `version:${editing.id}`}>Salvar nova versão</button>
              <button type="button" className={portalButtonClasses('ghost')} onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        </SectionCard>
      )}

      <span id="flows" className="scroll-mt-6" />
      {!!summary?.workflows.length && (
        <SectionCard title="Fluxos salvos" description="Editor avançado dos fluxos que preparam e publicam seus conteúdos.">
          <ul className="m-0 grid list-none gap-2 p-0">
            {summary.workflows.map(flow => (
              <li key={flow.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-yx-line bg-yx-surface-2 p-3 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-yx-fg">{flow.name}</strong>
                  <StatusChip variant={statusVariant(flow.status)}>{statusLabels[flow.status] ?? flow.status}</StatusChip>
                </span>
                <Link className={sectionLinkClasses} to={portalPath('/portal/automacoes')}>Editar fluxo</Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard id="calendar" title="Agenda editorial" description="Os próximos itens a sair." className="scroll-mt-6">
        <EditorialAgenda entries={summary?.calendarItems ?? []} emptyDescription="Nenhum conteúdo agendado neste workspace. Quando houver, os próximos itens aparecem aqui." />
      </SectionCard>

      <SectionCard id="publishing" title="Histórico de publicação" className="scroll-mt-6">
        {summary?.publishingRuns.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {summary.publishingRuns.map(runItem => (
              <li key={runItem.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-yx-line pb-2 text-sm last:border-b-0">
                <span className="flex flex-wrap items-center gap-2 text-yx-fg">
                  {runItem.connectionName}
                  <StatusChip variant={statusVariant(runItem.status)}>{statusLabels[runItem.status] ?? runItem.status}</StatusChip>
                </span>
                {runItem.publishedUrl && <a className={sectionLinkClasses} href={runItem.publishedUrl} target="_blank" rel="noreferrer">Abrir resultado</a>}
                {runItem.protectedError && <span className="text-yx-crit">Falha recuperável</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-yx-fg-2">Nenhuma tentativa de publicação registrada.</p>}
      </SectionCard>

      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={open => { if (!open) setRejecting(null) }}
        title="Rejeitar esta versão?"
        description={rejecting ? `A versão de "${rejecting.title}" volta para a equipe como rejeitada. Para só pedir mudanças, use "Pedir ajustes".` : ''}
        confirmLabel="Rejeitar versão"
        tone="danger"
        onConfirm={async () => { if (rejecting) await decide(rejecting, 'rejected') }}
      />
      <ConfirmDialog
        open={publishing !== null}
        onOpenChange={open => { if (!open) setPublishing(null) }}
        title="Publicar esta versão?"
        description={publishing ? `A versão aprovada de "${publishing.title}" entra na fila de publicação.` : ''}
        confirmLabel="Publicar"
        onConfirm={async () => { if (publishing) await publish(publishing) }}
      />
    </PortalPage>
  )
}

function PlanCampaignForm({ value, busy, onChange, onSubmit }: { value: PlanForm; busy: boolean; onChange: (value: PlanForm) => void; onSubmit: (event: FormEvent) => void }) {
  const field = (key: keyof PlanForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ ...value, [key]: event.target.value })
  return (
    <form onSubmit={onSubmit}>
      <SectionCard title="Contexto da campanha" description="Novo planejamento: conte o que a campanha precisa alcançar." className="border-yx-blue">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome"><input aria-label="Nome" required className={fieldClasses} value={value.name} onChange={field('name')} /></Field>
          <Field label="Objetivo">
            <select aria-label="Objetivo" className={fieldClasses} value={value.objective} onChange={field('objective')}>
              <option value="lead_generation">Gerar leads</option>
              <option value="traffic">Gerar tráfego</option>
              <option value="conversions">Conversões</option>
              <option value="awareness">Reconhecimento</option>
            </select>
          </Field>
          <Field label="Público"><textarea aria-label="Público" required className={cn(fieldClasses, 'min-h-24')} value={value.audience} onChange={field('audience')} /></Field>
          <Field label="Oferta"><textarea aria-label="Oferta" required className={cn(fieldClasses, 'min-h-24')} value={value.offer} onChange={field('offer')} /></Field>
          <Field label="Canal">
            <select aria-label="Canal" className={fieldClasses} value={value.channel} onChange={field('channel')}>
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
              <option value="blog">Blog</option>
              <option value="newsletter">Newsletter</option>
              <option value="email">E-mail</option>
            </select>
          </Field>
          <Field label="Restrições"><textarea aria-label="Restrições" className={cn(fieldClasses, 'min-h-24')} placeholder="Palavras proibidas, limites legais, prazo ou outras condições" value={value.constraints} onChange={field('constraints')} /></Field>
        </div>
        <button className={portalButtonClasses('primary', 'mt-4')} type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Salvar planejamento'}</button>
      </SectionCard>
    </form>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm font-semibold text-yx-fg-2"><span>{label}</span>{children}</label>
}

function StudioLoading() {
  return (
    <PortalPage eyebrow="Marketing" title="Marketing Studio">
      <SkeletonCard lines={6} />
    </PortalPage>
  )
}

function StudioUnavailable({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <PortalPage eyebrow="Marketing" title="Marketing Studio">
      {retry
        ? <ErrorState title="Não foi possível carregar o Marketing Studio." description={message} onRetry={() => void retry()} />
        : <EmptyState icon={Megaphone} title="Marketing Studio indisponível" description={message} />}
    </PortalPage>
  )
}
