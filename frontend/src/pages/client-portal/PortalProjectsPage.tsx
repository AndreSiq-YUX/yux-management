import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  FolderKanban,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  ConfirmDialog,
  DecisionCard,
  EmptyState,
  ErrorState,
  PageHeader,
  portalButtonClasses,
  ProgressRow,
  SectionCard,
  SkeletonCard,
  StatusChip,
  Timeline,
  TimelineItem,
  type StatusChipVariant,
} from '@/components/portal-ui'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  formatRelativeTime,
  formatShortDate,
} from '@/lib/client-portal/portalDisplay'
import { validateApprovalDecision } from '@/lib/projects/approvalRules'
import { ApiClientError } from '@/lib/apiClient'
import {
  APPROVAL_LABELS,
  DELIVERABLE_LABELS,
  formatDeliveryDate,
  isDeliveryOverdue,
  safeDeliveryUrl,
} from '@/lib/projects/deliveryPresentation'
import { cn } from '@/lib/utils'
import {
  projectDeliveryService,
  ProjectDeliverySnapshot,
} from '@/services/projectDeliveryService'
import { usePlatformStore } from '@/stores/platformStore'
import {
  ApprovalDecisionValue,
  ApprovalRequest,
  ApprovalRequestStatus,
  DeliverableStatus,
  PhaseStatus,
  Project,
  ProjectPhase,
  ProjectStatus,
  TaskStatus,
  TimelineEntryType,
} from '@/types/project'

const PROJECT_STATUS_TEXT: Record<ProjectStatus, string> = {
  PLANNING: 'Planejamento',
  ACTIVE: 'Em andamento',
  REVIEW: 'Em revisão',
  COMPLETED: 'Concluído',
  PAUSED: 'Pausado',
  CANCELLED: 'Cancelado',
  ARCHIVED: 'Arquivado',
}
const PROJECT_STATUS_VARIANT: Record<ProjectStatus, StatusChipVariant> = {
  PLANNING: 'neutral',
  ACTIVE: 'ok',
  REVIEW: 'warn',
  COMPLETED: 'ok',
  PAUSED: 'warn',
  CANCELLED: 'crit',
  ARCHIVED: 'neutral',
}
const PHASE_STATUS_TEXT: Record<PhaseStatus, string> = {
  planning: 'Planejamento',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  on_hold: 'Em espera',
}
const PHASE_STATUS_VARIANT: Record<PhaseStatus, StatusChipVariant> = {
  planning: 'neutral',
  in_progress: 'ok',
  completed: 'ok',
  on_hold: 'warn',
}
const TASK_STATUS_TEXT: Record<TaskStatus, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}
const TASK_STATUS_VARIANT: Record<TaskStatus, StatusChipVariant> = {
  pending: 'neutral',
  in_progress: 'ok',
  completed: 'ok',
  cancelled: 'neutral',
}
const DELIVERABLE_VARIANT: Record<DeliverableStatus, StatusChipVariant> = {
  draft: 'neutral',
  delivered: 'neutral',
  in_review: 'warn',
  approved: 'ok',
  changes_requested: 'warn',
  rejected: 'crit',
}
const APPROVAL_VARIANT: Record<ApprovalRequestStatus, StatusChipVariant> = {
  pending: 'warn',
  approved: 'ok',
  changes_requested: 'warn',
  rejected: 'crit',
  cancelled: 'neutral',
}
const TIMELINE_TAGS: Partial<Record<TimelineEntryType, string>> = {
  manual_update: 'Atualização da equipe',
  deliverable_created: 'Nova entrega',
  approval_requested: 'Aprovação solicitada',
  approval_decided: 'Decisão registrada',
  status_changed: 'Status alterado',
}

const IMAGE_URL = /\.(png|jpe?g|webp|gif)$/i
function imageUrl(value?: string) {
  const url = safeDeliveryUrl(value)
  if (!url) return undefined
  try {
    return IMAGE_URL.test(new URL(url).pathname) ? url : undefined
  } catch {
    return undefined
  }
}
const waitLabel = (value?: string) => {
  const relative = formatRelativeTime(value)
  return relative === 'Sem data' ? undefined : `enviada ${relative}`
}

function LoadingBlock({ label, lines = 4 }: { label: string; lines?: number }) {
  return (
    <div>
      <p role="status" className="sr-only">
        {label}
      </p>
      <div aria-hidden="true">
        <SkeletonCard lines={lines} />
      </div>
    </div>
  )
}

export function PortalProjectsPage() {
  const [search] = useSearchParams()
  const organizationId = usePlatformStore((state) => state.organization?.id)
  const isPlatformLoading = usePlatformStore((state) => state.isLoading)
  if (isPlatformLoading)
    return <LoadingBlock label="Carregando projetos..." lines={3} />
  if (!organizationId)
    return (
      <EmptyState
        icon={FolderKanban}
        title="Selecione um espaço de trabalho"
        description="Escolha um espaço de trabalho para acompanhar seus projetos."
      />
    )
  return (
    <PortalProjectsWorkspace
      key={organizationId}
      organizationId={organizationId}
      requestedProjectId={search.get('projectId') || undefined}
      requestedTab={search.get('tab') || undefined}
    />
  )
}

function PortalProjectsWorkspace({
  organizationId,
  requestedProjectId,
  requestedTab,
}: {
  organizationId: string
  requestedProjectId?: string
  requestedTab?: string
}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)
    projectDeliveryService
      .list(organizationId)
      .then((response) => {
        if (!active) return
        setProjects(response.projects)
        setSelectedId((previous) =>
          response.projects.some((p) => p.id === requestedProjectId)
            ? requestedProjectId
            : response.projects.some((p) => p.id === previous)
              ? previous
              : response.projects[0]?.id
        )
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [organizationId, reload, requestedProjectId])
  const selectedProject = projects.find((p) => p.id === selectedId)

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Projetos e entregas"
        lead="Veja o que avançou, confira os prazos e aprove as próximas entregas."
      />
      {loading && <LoadingBlock label="Carregando projetos..." lines={3} />}
      {error && (
        <ErrorState
          title="Não foi possível carregar seus projetos."
          description="Verifique sua conexão e tente de novo."
          onRetry={() => setReload((value) => value + 1)}
        />
      )}
      {!loading && !error && projects.length === 0 && (
        <EmptyState
          icon={FolderKanban}
          title="Seus projetos aparecerão aqui"
          description="Quando a equipe iniciar um projeto, você poderá acompanhar etapas, entregas e aprovações neste espaço."
        />
      )}
      {!error && projects.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6">
          <div className="min-w-0">
            <div className="grid gap-1.5 lg:hidden">
              <label
                htmlFor="portal-project-select"
                className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3"
              >
                Projeto
              </label>
              <select
                id="portal-project-select"
                value={selectedId || ''}
                disabled={loading}
                onChange={(event) => setSelectedId(event.target.value)}
                className="min-h-10 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-3 text-sm text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} · {project.progress}%
                  </option>
                ))}
              </select>
            </div>
            <aside
              aria-label="Selecionar projeto"
              className="hidden flex-col gap-2 lg:flex"
            >
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  aria-pressed={selectedId === project.id}
                  disabled={loading}
                  className="flex w-full flex-col gap-2 rounded-lg border border-yx-line bg-yx-surface p-3.5 text-left transition-colors hover:border-yx-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue aria-pressed:border-yx-blue aria-pressed:bg-yx-blue-soft"
                  onClick={() => setSelectedId(project.id)}
                >
                  <span className="break-words font-display text-sm font-semibold text-yx-fg">
                    {project.name}
                  </span>
                  <span className="font-mono text-[11.5px] text-yx-fg-3">
                    {PROJECT_STATUS_TEXT[project.status]} · {project.progress}%
                    concluído
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-full overflow-hidden rounded-[3px] bg-yx-bar-track"
                  >
                    <span
                      className="block h-full rounded-[3px] bg-brand-gradient"
                      style={{
                        width: `${Math.min(100, Math.max(0, project.progress || 0))}%`,
                      }}
                    />
                  </span>
                </button>
              ))}
            </aside>
          </div>
          {selectedProject && (
            <ProjectTracking
              key={`${selectedProject.id}:${requestedTab || ''}`}
              organizationId={organizationId}
              project={selectedProject}
              initialTab={requestedTab}
            />
          )}
        </div>
      )}
    </div>
  )
}

const tabTriggerClass =
  'min-h-10 shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-[13.5px] font-semibold text-yx-fg-3 shadow-none hover:text-yx-fg data-[state=active]:border-yx-blue data-[state=active]:bg-transparent data-[state=active]:text-yx-fg data-[state=active]:shadow-none'

function ProjectTracking({
  organizationId,
  project,
  initialTab,
}: {
  organizationId: string
  project: Project
  initialTab?: string
}) {
  const [snapshot, setSnapshot] = useState<ProjectDeliverySnapshot>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [comments, setComments] = useState<Record<string, string>>({})
  const [submittingId, setSubmittingId] = useState<string>()
  const [confirming, setConfirming] = useState<ApprovalRequest>()
  const [tab, setTab] = useState(
    initialTab === 'approvals' ? 'approvals' : 'overview'
  )
  const sequence = useRef(0)
  const mutationLock = useRef(false)
  const mounted = useRef(true)
  const load = useCallback(async () => {
    const version = ++sequence.current
    setLoading(true)
    setError(false)
    try {
      const response = await projectDeliveryService.details(
        organizationId,
        project.id
      )
      if (version === sequence.current) setSnapshot(response)
    } catch {
      if (version === sequence.current) setError(true)
    } finally {
      if (version === sequence.current) setLoading(false)
    }
  }, [organizationId, project.id])
  const invalidateRequests = useCallback(() => {
    sequence.current++
  }, [])
  useEffect(() => {
    mounted.current = true
    void load()
    return () => {
      mounted.current = false
      invalidateRequests()
    }
  }, [load, invalidateRequests])

  /** Registra a decisão. Devolve a mensagem de erro quando não foi possível registrar. */
  const decide = async (
    approval: ApprovalRequest,
    decision: ApprovalDecisionValue
  ): Promise<string | undefined> => {
    if (mutationLock.current) return 'Aguarde o envio anterior terminar.'
    const comment = comments[approval.id] || ''
    const validationError = validateApprovalDecision(decision, comment)
    if (validationError) {
      toast.error(validationError)
      return validationError
    }
    mutationLock.current = true
    setSubmittingId(approval.id)
    try {
      await projectDeliveryService.decide(
        organizationId,
        project.id,
        approval.id,
        decision,
        comment
      )
      if (!mounted.current) return undefined
      toast.success('Decisão registrada')
      setComments((previous) => {
        const next = { ...previous }
        delete next[approval.id]
        return next
      })
      await load()
      return undefined
    } catch (error) {
      if (!mounted.current) return undefined
      if (error instanceof ApiClientError && error.status === 409) {
        toast.error(
          'Esta solicitação já foi respondida. O acompanhamento será atualizado.'
        )
        await load()
        return undefined
      }
      const message =
        'Não foi possível registrar sua decisão. O comentário foi mantido; tente novamente.'
      toast.error(message)
      return message
    } finally {
      mutationLock.current = false
      if (mounted.current) setSubmittingId(undefined)
    }
  }
  const pending =
    snapshot?.approvals.filter((a) => a.status === 'pending').length || 0
  const completedTasks =
    snapshot?.tasks.filter((t) => t.status === 'completed').length || 0
  const totalTasks =
    snapshot?.tasks.filter((t) => t.status !== 'cancelled').length || 0
  const overdue = isDeliveryOverdue(project.expectedEndDate, project.status)
  const approvals = snapshot
    ? [...snapshot.approvals].sort((a, b) => {
        const byStatus =
          Number(b.status === 'pending') - Number(a.status === 'pending')
        if (byStatus) return byStatus
        return (b.submittedAt || '').localeCompare(a.submittedAt || '')
      })
    : []
  const phases = snapshot
    ? [...snapshot.phases].sort(
        (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
      )
    : []

  return (
    <section
      aria-label="Acompanhamento do projeto"
      className="flex min-w-0 flex-col gap-4"
    >
      <SectionCard
        title={project.name}
        description={
          project.description ? (
            <span className="whitespace-pre-wrap break-words">
              {project.description}
            </span>
          ) : undefined
        }
        action={
          <StatusChip variant={PROJECT_STATUS_VARIANT[project.status]}>
            {PROJECT_STATUS_TEXT[project.status]}
          </StatusChip>
        }
      >
        <div className="grid gap-4">
          <ProgressRow
            title="Progresso do projeto"
            subtitle={`Previsão: ${formatDeliveryDate(project.expectedEndDate)}`}
            percent={project.progress}
            status={
              overdue ? (
                <StatusChip variant="crit" icon={Calendar}>
                  Prazo vencido
                </StatusChip>
              ) : undefined
            }
          />
          {snapshot && !error && !loading && (
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip>
                {completedTasks}/{totalTasks} tarefas publicadas concluídas
              </StatusChip>
              <button
                type="button"
                className={portalButtonClasses(pending > 0 ? 'primary' : 'ghost')}
                onClick={() => setTab('approvals')}
              >
                {pending > 0
                  ? `${pending} ${pending === 1 ? 'aprovação' : 'aprovações'} aguardando você`
                  : 'Ver aprovações'}
              </button>
            </div>
          )}
        </div>
      </SectionCard>
      {loading && (
        <LoadingBlock label="Carregando acompanhamento..." lines={5} />
      )}
      {error && (
        <ErrorState
          title="Não foi possível atualizar o acompanhamento deste projeto."
          onRetry={() => void load()}
        />
      )}
      {!loading && !error && snapshot && (
        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex min-w-0 flex-col gap-4"
        >
          <div className="overflow-x-auto">
            <TabsList className="h-auto w-max min-w-full justify-start gap-1 rounded-none border-b border-yx-line bg-transparent p-0 text-yx-fg-3">
              <TabsTrigger value="overview" className={tabTriggerClass}>
                Andamento
              </TabsTrigger>
              <TabsTrigger value="deliverables" className={tabTriggerClass}>
                Entregas ({snapshot.deliverables.length})
              </TabsTrigger>
              <TabsTrigger value="approvals" className={tabTriggerClass}>
                Aprovações ({pending})
              </TabsTrigger>
              <TabsTrigger value="timeline" className={tabTriggerClass}>
                Histórico
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overview" className="mt-0 flex flex-col gap-4">
            <SectionCard title="Etapas do projeto">
              {phases.length === 0 ? (
                <p className="text-sm text-yx-fg-3">
                  As etapas serão publicadas pela equipe.
                </p>
              ) : (
                <ol
                  aria-label="Etapas"
                  className="m-0 grid list-none gap-0 p-0 md:grid-flow-col md:auto-cols-fr"
                >
                  {phases.map((phase, index) => (
                    <PhaseStep key={phase.id} phase={phase} index={index} />
                  ))}
                </ol>
              )}
            </SectionCard>
            <SectionCard
              title="Tarefas publicadas"
              description="Atividades compartilhadas pela equipe para você acompanhar."
            >
              {snapshot.tasks.length === 0 ? (
                <p className="text-sm text-yx-fg-3">
                  Nenhuma tarefa publicada por enquanto.
                </p>
              ) : (
                <ul className="m-0 grid list-none p-0">
                  {snapshot.tasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-start justify-between gap-2 border-b border-yx-line py-3 first:pt-0 last:border-0 last:pb-0"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        {task.status === 'completed' ? (
                          <CheckCircle2
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-yx-ok"
                          />
                        ) : (
                          <Clock3
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-yx-fg-3"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="break-words text-sm text-yx-fg">
                            {task.title}
                          </p>
                          {task.dueDate && (
                            <p className="text-xs text-yx-fg-3">
                              Prazo: {formatDeliveryDate(task.dueDate)}
                              {isDeliveryOverdue(task.dueDate, task.status)
                                ? ' · Prazo vencido'
                                : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      <StatusChip variant={TASK_STATUS_VARIANT[task.status]}>
                        {TASK_STATUS_TEXT[task.status]}
                      </StatusChip>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </TabsContent>
          <TabsContent
            value="deliverables"
            className="mt-0 flex flex-col gap-3"
          >
            {snapshot.deliverables.length === 0 && (
              <EmptyState
                icon={FileText}
                title="Nenhuma entrega publicada por enquanto."
                description="Quando a equipe publicar uma entrega, você poderá abri-la e aprová-la aqui."
              />
            )}
            {snapshot.deliverables.map((d) => {
              const url = safeDeliveryUrl(d.externalUrl)
              const hasPending = snapshot.approvals.some(
                (a) => a.targetId === d.id && a.status === 'pending'
              )
              return (
                <article
                  key={d.id}
                  className="flex gap-3.5 rounded-lg border border-yx-line bg-yx-surface p-3.5 sm:gap-4"
                >
                  <DeliverableThumb url={d.externalUrl} />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="break-words font-display text-[15px] font-semibold leading-snug text-yx-fg">
                        {d.title}
                      </h3>
                      <StatusChip variant={DELIVERABLE_VARIANT[d.status]}>
                        {DELIVERABLE_LABELS[d.status]}
                      </StatusChip>
                    </div>
                    {d.description && (
                      <p className="whitespace-pre-wrap break-words text-[13px] text-yx-fg-2">
                        {d.description}
                      </p>
                    )}
                    <p className="text-xs text-yx-fg-3">
                      Prazo: {formatDeliveryDate(d.dueDate)}
                      {isDeliveryOverdue(d.dueDate, d.status)
                        ? ' · Prazo vencido'
                        : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {url && (
                        <a
                          className={portalButtonClasses('ghost')}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink aria-hidden="true" />
                          Abrir entrega
                        </a>
                      )}
                      {hasPending && (
                        <button
                          type="button"
                          className={portalButtonClasses('primary')}
                          onClick={() => setTab('approvals')}
                        >
                          Revisar e aprovar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </TabsContent>
          <TabsContent value="approvals" className="mt-0 flex flex-col gap-3">
            {approvals.length === 0 && (
              <EmptyState
                icon={CheckCircle2}
                title="Nenhuma aprovação solicitada por enquanto."
                description="Quando a equipe precisar da sua decisão sobre uma entrega, ela aparecerá aqui."
              />
            )}
            {approvals.map((a) => {
              const deliverable = snapshot.deliverables.find(
                (d) => d.id === a.targetId
              )
              const url = safeDeliveryUrl(deliverable?.externalUrl)
              const details = (
                <>
                  {url && (
                    <a
                      className={portalButtonClasses('ghost', 'w-fit')}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink aria-hidden="true" />
                      Abrir entrega para revisão
                    </a>
                  )}
                  {a.decisions?.map((d) => (
                    <p
                      key={d.id}
                      className="whitespace-pre-wrap break-words text-[13px] text-yx-fg-3"
                    >
                      {formatDeliveryDate(d.createdAt)} ·{' '}
                      {APPROVAL_LABELS[d.decision]}
                      {d.comment ? `: ${d.comment}` : ''}
                    </p>
                  ))}
                </>
              )
              if (a.status !== 'pending')
                return (
                  <article
                    key={a.id}
                    className="grid gap-2.5 rounded-lg border border-yx-line bg-yx-surface p-3.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="break-words font-display text-[15px] font-semibold leading-snug text-yx-fg">
                        {a.title}
                      </h3>
                      <StatusChip variant={APPROVAL_VARIANT[a.status]}>
                        {APPROVAL_LABELS[a.status]}
                      </StatusChip>
                    </div>
                    <p className="text-xs text-yx-fg-3">
                      Enviada em {formatDeliveryDate(a.submittedAt)}
                    </p>
                    {a.instructions && (
                      <p className="whitespace-pre-wrap break-words text-[13px] text-yx-fg-2">
                        {a.instructions}
                      </p>
                    )}
                    {details}
                  </article>
                )
              return (
                <DecisionCard
                  key={a.id}
                  tone="warn"
                  module={{ label: 'Aguardando você', icon: Clock3 }}
                  wait={waitLabel(a.submittedAt)}
                  title={a.title}
                  description={
                    a.instructions ? (
                      <span className="whitespace-pre-wrap break-words">
                        {a.instructions}
                      </span>
                    ) : undefined
                  }
                  actions={
                    <div className="grid w-full gap-3">
                      {details}
                      <fieldset
                        disabled={Boolean(submittingId)}
                        className="m-0 grid gap-2 border-0 p-0"
                      >
                        <Label
                          htmlFor={`comment-${a.id}`}
                          className="text-[13px] font-semibold text-yx-fg"
                        >
                          Comentário
                        </Label>
                        <Textarea
                          id={`comment-${a.id}`}
                          maxLength={10000}
                          placeholder="Descreva os ajustes ou o motivo da rejeição"
                          value={comments[a.id] || ''}
                          onChange={(e) =>
                            setComments((previous) => ({
                              ...previous,
                              [a.id]: e.target.value,
                            }))
                          }
                        />
                        <p className="text-xs text-yx-fg-3">
                          Obrigatório para solicitar ajustes ou rejeitar.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={portalButtonClasses('primary')}
                            onClick={() => setConfirming(a)}
                          >
                            Aprovar
                          </button>
                          <button
                            type="button"
                            className={portalButtonClasses('ghost')}
                            onClick={() => void decide(a, 'changes_requested')}
                          >
                            Solicitar ajustes
                          </button>
                          <button
                            type="button"
                            className={portalButtonClasses(
                              'ghost',
                              'text-yx-crit hover:border-yx-crit hover:text-yx-crit'
                            )}
                            onClick={() => void decide(a, 'rejected')}
                          >
                            Rejeitar
                          </button>
                        </div>
                      </fieldset>
                    </div>
                  }
                />
              )
            })}
          </TabsContent>
          <TabsContent value="timeline" className="mt-0">
            {snapshot.timeline.length === 0 ? (
              <EmptyState
                title="As atualizações da equipe aparecerão aqui."
                description="Cada novidade do projeto fica registrada neste histórico."
              />
            ) : (
              <SectionCard title="Histórico do projeto">
                <Timeline aria-label="Histórico do projeto">
                  {snapshot.timeline.map((entry) => (
                    <TimelineItem
                      key={entry.id}
                      when={formatShortDate(entry.createdAt)}
                      title={entry.title}
                      description={
                        entry.body ? (
                          <span className="whitespace-pre-wrap break-words">
                            {entry.body}
                          </span>
                        ) : undefined
                      }
                      tag={TIMELINE_TAGS[entry.entryType]}
                    />
                  ))}
                </Timeline>
              </SectionCard>
            )}
          </TabsContent>
        </Tabs>
      )}
      <ConfirmDialog
        open={Boolean(confirming)}
        onOpenChange={(open) => {
          if (!open) setConfirming(undefined)
        }}
        title="Aprovar esta entrega?"
        description={
          confirming
            ? `Você está aprovando “${confirming.title}”. A equipe será avisada e a decisão não poderá ser desfeita.${
                comments[confirming.id]?.trim()
                  ? ' Seu comentário será enviado junto.'
                  : ''
              }`
            : ''
        }
        confirmLabel="Confirmar aprovação"
        onConfirm={async () => {
          if (!confirming) return
          const failure = await decide(confirming, 'approved')
          if (failure) throw new Error(failure)
        }}
      />
    </section>
  )
}

function PhaseStep({ phase, index }: { phase: ProjectPhase; index: number }) {
  const done = phase.status === 'completed'
  const active = phase.status === 'in_progress'
  const progress = Math.min(100, Math.max(0, phase.progress || 0))
  return (
    <li className="group relative pb-5 pl-10 last:pb-0 md:pb-0 md:pl-0 md:pr-4 md:pt-10">
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-[13px] top-7 w-px bg-yx-line-strong group-last:hidden md:bottom-auto md:left-9 md:right-1 md:top-[13px] md:h-px md:w-auto"
      />
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-0 z-[1] grid h-[27px] w-[27px] place-items-center rounded-full font-mono text-xs font-semibold',
          done && 'bg-yx-ok text-white',
          active && 'bg-brand-gradient text-white',
          !done &&
            !active &&
            'border-2 border-yx-line-strong bg-yx-surface text-yx-fg-3'
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
      </span>
      <div className="grid gap-1.5">
        <h3 className="break-words font-sans text-sm font-semibold leading-snug text-yx-fg">
          {phase.name}
        </h3>
        <div>
          <StatusChip variant={PHASE_STATUS_VARIANT[phase.status]}>
            {PHASE_STATUS_TEXT[phase.status]}
          </StatusChip>
        </div>
        <div
          role="progressbar"
          aria-label={`Progresso: ${phase.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-1.5 w-full overflow-hidden rounded-[3px] bg-yx-bar-track"
        >
          <div
            className="h-full rounded-[3px] bg-brand-gradient"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-yx-fg-3">
          {phase.progress}% concluído
          {phase.endDate && ` · Previsão: ${formatDeliveryDate(phase.endDate)}`}
        </p>
      </div>
    </li>
  )
}

function DeliverableThumb({ url }: { url?: string }) {
  const image = imageUrl(url)
  const [failed, setFailed] = useState(false)
  return (
    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-yx-line bg-yx-surface-2 text-yx-fg-3 sm:h-20 sm:w-20">
      {image && !failed ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <FileText aria-hidden="true" className="h-6 w-6" />
      )}
    </div>
  )
}
