import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Calendar,
  CheckCircle2,
  Clock3,
  ExternalLink,
  History,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { validateApprovalDecision } from '@/lib/projects/approvalRules'
import { ApiClientError } from '@/lib/apiClient'
import {
  APPROVAL_LABELS,
  DELIVERABLE_LABELS,
  formatDeliveryDate,
  isDeliveryOverdue,
  safeDeliveryUrl,
} from '@/lib/projects/deliveryPresentation'
import {
  projectDeliveryService,
  ProjectDeliverySnapshot,
} from '@/services/projectDeliveryService'
import { usePlatformStore } from '@/stores/platformStore'
import {
  ApprovalDecisionValue,
  ApprovalRequest,
  Project,
  PHASE_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from '@/types/project'

export function PortalProjectsPage() {
  const [search] = useSearchParams()
  const organizationId = usePlatformStore((state) => state.organization?.id)
  const isPlatformLoading = usePlatformStore((state) => state.isLoading)
  if (isPlatformLoading) return <p role="status">Carregando projetos...</p>
  if (!organizationId)
    return <p>Selecione um espaço de trabalho para acompanhar seus projetos.</p>
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Projetos e entregas
        </h1>
        <p className="mt-1 text-muted-foreground">
          Veja o que avançou, confira os prazos e aprove as próximas entregas.
        </p>
      </div>
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando projetos...
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border p-4"
        >
          <p>Não foi possível carregar seus projetos.</p>
          <Button
            variant="outline"
            onClick={() => setReload((value) => value + 1)}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {!loading && !error && projects.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Seus projetos aparecerão aqui</CardTitle>
            <CardDescription>
              Quando a equipe iniciar um projeto, você poderá acompanhar etapas,
              entregas e aprovações neste espaço.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {!error && projects.length > 0 && (
        <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside
            aria-label="Selecionar projeto"
            className="flex flex-col gap-2"
          >
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                aria-pressed={selectedId === project.id}
                disabled={loading}
                className="flex w-full flex-col gap-2 rounded-lg border bg-background p-4 text-left transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-accent"
                onClick={() => setSelectedId(project.id)}
              >
                <span className="break-words font-medium">{project.name}</span>
                <span className="text-xs text-muted-foreground">
                  {PROJECT_STATUS_LABELS[project.status]} · {project.progress}%
                  concluído
                </span>
                <Progress value={project.progress} className="h-1.5" />
              </button>
            ))}
          </aside>
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

  const decide = async (
    approval: ApprovalRequest,
    decision: ApprovalDecisionValue
  ) => {
    if (mutationLock.current) return
    const comment = comments[approval.id] || ''
    const validationError = validateApprovalDecision(decision, comment)
    if (validationError) {
      toast.error(validationError)
      return
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
      if (!mounted.current) return
      toast.success('Decisão registrada')
      setComments((previous) => {
        const next = { ...previous }
        delete next[approval.id]
        return next
      })
      await load()
    } catch (error) {
      if (!mounted.current) return
      if (error instanceof ApiClientError && error.status === 409) {
        toast.error(
          'Esta solicitação já foi respondida. O acompanhamento será atualizado.'
        )
        await load()
      } else
        toast.error(
          'Não foi possível registrar sua decisão. O comentário foi mantido; tente novamente.'
        )
    } finally {
      mutationLock.current = false
      if (mounted.current) setSubmittingId(undefined)
    }
  }
  const pending =
    snapshot?.approvals.filter((a) => a.status === 'pending').length || 0
  const completedTasks =
    snapshot?.tasks.filter((t) => t.status === 'completed').length || 0
  const overdue = isDeliveryOverdue(project.expectedEndDate, project.status)

  return (
    <main className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="break-words">{project.name}</CardTitle>
            <Badge variant="outline">
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
          </div>
          {project.description && (
            <CardDescription className="whitespace-pre-wrap break-words">
              {project.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Progress
              value={project.progress}
              className="h-2 flex-1"
              aria-label="Progresso do projeto"
            />
            <span className="text-sm font-medium">{project.progress}%</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="size-4" />
              Previsão: {formatDeliveryDate(project.expectedEndDate)}
            </span>
            {overdue && <Badge variant="destructive">Prazo vencido</Badge>}
          </div>
          {snapshot && !error && !loading && (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">
                {completedTasks}/
                {snapshot.tasks.filter((t) => t.status !== 'cancelled').length}{' '}
                tarefas publicadas concluídas
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTab('approvals')}
              >
                {pending > 0
                  ? `${pending} ${pending === 1 ? 'aprovação' : 'aprovações'} aguardando você`
                  : 'Ver aprovações'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {loading && (
        <p role="status" className="py-6 text-sm text-muted-foreground">
          Carregando acompanhamento...
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border p-4"
        >
          <p>Não foi possível atualizar o acompanhamento deste projeto.</p>
          <Button variant="outline" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!loading && !error && snapshot && (
        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex flex-col gap-4"
        >
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
            <TabsTrigger value="overview">Andamento</TabsTrigger>
            <TabsTrigger value="deliverables">
              Entregas ({snapshot.deliverables.length})
            </TabsTrigger>
            <TabsTrigger value="approvals">Aprovações ({pending})</TabsTrigger>
            <TabsTrigger value="timeline">Histórico</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Etapas do projeto</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {snapshot.phases.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    As etapas serão publicadas pela equipe.
                  </p>
                )}
                {snapshot.phases.map((phase) => (
                  <div key={phase.id} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-medium">{phase.name}</h3>
                      <Badge variant="outline">
                        {PHASE_STATUS_LABELS[phase.status]}
                      </Badge>
                    </div>
                    <Progress
                      value={phase.progress}
                      className="h-1.5"
                      aria-label={`Progresso: ${phase.name}`}
                    />
                    <p className="text-xs text-muted-foreground">
                      {phase.progress}% concluído
                      {phase.endDate &&
                        ` · Previsão: ${formatDeliveryDate(phase.endDate)}`}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tarefas publicadas</CardTitle>
                <CardDescription>
                  Atividades compartilhadas pela equipe para você acompanhar.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {snapshot.tasks.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma tarefa publicada por enquanto.
                  </p>
                )}
                {snapshot.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-0"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      {task.status === 'completed' ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      ) : (
                        <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div>
                        <p className="break-words text-sm">{task.title}</p>
                        {task.dueDate && (
                          <p className="text-xs text-muted-foreground">
                            Prazo: {formatDeliveryDate(task.dueDate)}
                            {isDeliveryOverdue(task.dueDate, task.status)
                              ? ' · Prazo vencido'
                              : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {TASK_STATUS_LABELS[task.status]}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="deliverables" className="flex flex-col gap-3">
            {snapshot.deliverables.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma entrega publicada por enquanto.
              </p>
            )}
            {snapshot.deliverables.map((d) => (
              <Card key={d.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="break-words">{d.title}</CardTitle>
                    <Badge variant="outline">
                      {DELIVERABLE_LABELS[d.status]}
                    </Badge>
                  </div>
                  {d.description && (
                    <CardDescription className="whitespace-pre-wrap break-words">
                      {d.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground">
                    Prazo: {formatDeliveryDate(d.dueDate)}
                    {isDeliveryOverdue(d.dueDate, d.status)
                      ? ' · Prazo vencido'
                      : ''}
                  </p>
                  {safeDeliveryUrl(d.externalUrl) && (
                    <a
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                      href={safeDeliveryUrl(d.externalUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="size-4" />
                      Abrir entrega
                    </a>
                  )}
                  {snapshot.approvals.some(
                    (a) => a.targetId === d.id && a.status === 'pending'
                  ) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTab('approvals')}
                    >
                      Revisar e aprovar
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="approvals" className="flex flex-col gap-3">
            {snapshot.approvals.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma aprovação solicitada por enquanto.
              </p>
            )}
            {snapshot.approvals.map((a) => {
              const deliverable = snapshot.deliverables.find(
                (d) => d.id === a.targetId
              )
              const url = safeDeliveryUrl(deliverable?.externalUrl)
              return (
                <Card key={a.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="break-words">{a.title}</CardTitle>
                      <Badge variant="outline">
                        {APPROVAL_LABELS[a.status]}
                      </Badge>
                    </div>
                    <CardDescription>
                      Enviada em {formatDeliveryDate(a.submittedAt)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {a.instructions && (
                      <p className="whitespace-pre-wrap text-sm">
                        {a.instructions}
                      </p>
                    )}
                    {url && (
                      <a
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="size-4" />
                        Abrir entrega para revisão
                      </a>
                    )}
                    {a.decisions?.map((d) => (
                      <p
                        key={d.id}
                        className="whitespace-pre-wrap break-words text-sm text-muted-foreground"
                      >
                        {formatDeliveryDate(d.createdAt)} ·{' '}
                        {APPROVAL_LABELS[d.decision]}
                        {d.comment ? `: ${d.comment}` : ''}
                      </p>
                    ))}
                    {a.status === 'pending' && (
                      <fieldset
                        disabled={Boolean(submittingId)}
                        className="flex flex-col gap-3"
                      >
                        <Label htmlFor={`comment-${a.id}`}>Comentário</Label>
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
                        <p className="text-xs text-muted-foreground">
                          Obrigatório para solicitar ajustes ou rejeitar.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => void decide(a, 'approved')}
                          >
                            {submittingId === a.id
                              ? 'Registrando...'
                              : 'Aprovar'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void decide(a, 'changes_requested')}
                          >
                            Solicitar ajustes
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void decide(a, 'rejected')}
                          >
                            Rejeitar
                          </Button>
                        </div>
                      </fieldset>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </TabsContent>
          <TabsContent value="timeline" className="flex flex-col gap-4">
            {snapshot.timeline.length === 0 && (
              <p className="text-sm text-muted-foreground">
                As atualizações da equipe aparecerão aqui.
              </p>
            )}
            {snapshot.timeline.map((entry) => (
              <div key={entry.id} className="flex gap-3 border-l-2 py-2 pl-4">
                <History className="mt-1 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{entry.title}</h3>
                  {entry.body && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {entry.body}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDeliveryDate(entry.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </main>
  )
}
