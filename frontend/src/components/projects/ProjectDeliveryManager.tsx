import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  Calendar,
  Edit,
  FileCheck2,
  History,
  Link2,
  Plus,
  Send,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  APPROVAL_LABELS,
  DELIVERABLE_LABELS,
  formatDeliveryDate,
  isDeliveryOverdue,
  safeDeliveryUrl,
} from '@/lib/projects/deliveryPresentation'
import { backendDataService } from '@/services/backendDataService'
import type {
  ApprovalRequest,
  Project,
  ProjectDeliverable,
  ProjectPhase,
  ProjectTimelineEntry,
} from '@/types/project'

const emptyForm = {
  title: '',
  description: '',
  externalUrl: '',
  phaseId: '',
  dueDate: '',
  isClientVisible: false,
  status: 'draft' as ProjectDeliverable['status'],
}

export function ProjectDeliveryManager({ project }: { project: Project }) {
  const [deliverables, setDeliverables] = useState<ProjectDeliverable[]>([])
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [timeline, setTimeline] = useState<ProjectTimelineEntry[]>([])
  const [phases, setPhases] = useState<ProjectPhase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string>()
  const mutationLock = useRef(false)
  const sequence = useRef(0)
  const [editingId, setEditingId] = useState<string>()
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [timelineForm, setTimelineForm] = useState({
    title: '',
    body: '',
    isClientVisible: true,
  })

  const loadData = useCallback(async () => {
    const version = ++sequence.current
    setLoading(true)
    setError(false)
    try {
      const [d, a, t, p] = await Promise.all([
        backendDataService.getProjectDeliverables(project.id),
        backendDataService.getProjectApprovalRequests(project.id),
        backendDataService.getProjectTimeline(project.id),
        backendDataService.getProjectPhases(project.id),
      ])
      if (version !== sequence.current) return
      setDeliverables(d.deliverables)
      setApprovals(a.approvals)
      setTimeline(t.entries)
      setPhases(p.phases)
    } catch {
      if (version === sequence.current) setError(true)
    } finally {
      if (version === sequence.current) setLoading(false)
    }
  }, [project.id])
  const invalidateRequests = useCallback(() => {
    sequence.current++
  }, [])
  useEffect(() => {
    void loadData()
    return invalidateRequests
  }, [loadData, invalidateRequests])

  const mutate = async (
    id: string,
    action: () => Promise<void>,
    message: string
  ) => {
    if (mutationLock.current) return
    mutationLock.current = true
    setBusy(id)
    try {
      await action()
      toast.success(message)
      await loadData()
    } catch {
      toast.error(
        'Não foi possível salvar. Seus dados foram mantidos; tente novamente.'
      )
    } finally {
      mutationLock.current = false
      setBusy(undefined)
    }
  }
  const edit = (deliverable?: ProjectDeliverable) => {
    setEditingId(deliverable?.id)
    setForm(
      deliverable
        ? {
            title: deliverable.title,
            description: deliverable.description || '',
            externalUrl: deliverable.externalUrl || '',
            phaseId: deliverable.phaseId || '',
            dueDate: deliverable.dueDate?.slice(0, 10) || '',
            isClientVisible: deliverable.isClientVisible,
            status: deliverable.status,
          }
        : emptyForm
    )
    setFormOpen(true)
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!form.title.trim()) return
    if (form.externalUrl && !safeDeliveryUrl(form.externalUrl.trim())) {
      toast.error('Informe um link válido começando com https:// ou http://.')
      return
    }
    void mutate(
      'form',
      async () => {
        const data = {
          ...form,
          title: form.title.trim(),
          externalUrl: form.externalUrl.trim(),
        }
        if (editingId)
          await backendDataService.updateProjectDeliverable(
            project.id,
            editingId,
            data
          )
        else await backendDataService.createProjectDeliverable(project.id, data)
        setFormOpen(false)
        setForm(emptyForm)
        setEditingId(undefined)
      },
      editingId ? 'Entrega atualizada' : 'Entrega criada'
    )
  }
  const pendingCount = approvals.filter((a) => a.status === 'pending').length
  const overdueCount = deliverables.filter((d) =>
    isDeliveryOverdue(d.dueDate, d.status)
  ).length

  return (
    <div className="flex flex-col gap-4" aria-busy={loading}>
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Entregas', deliverables.length],
          ['Aguardando cliente', pendingCount],
          ['Prazo vencido', overdueCount],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="flex flex-col gap-1 p-3">
              <span className="text-xl font-semibold">{value}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </CardContent>
          </Card>
        ))}
      </div>
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
        >
          <p>Não foi possível atualizar as entregas.</p>
          <Button variant="outline" onClick={() => void loadData()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Atualizando entregas...
        </p>
      )}
      <Tabs defaultValue="deliverables" className="flex flex-col gap-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="deliverables">Entregas</TabsTrigger>
          <TabsTrigger value="approvals">
            Aprovações ({pendingCount})
          </TabsTrigger>
          <TabsTrigger value="timeline">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="deliverables" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Organize arquivos, prazos e revisões do projeto.
            </p>
            <Button
              disabled={Boolean(busy) || loading || error}
              onClick={() => edit()}
            >
              <Plus className="mr-2 size-4" />
              Nova entrega
            </Button>
          </div>
          {formOpen && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {editingId ? 'Editar entrega' : 'Nova entrega'}
                </CardTitle>
                <CardDescription>
                  Publique no portal quando estiver pronta para o cliente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={save}>
                  <fieldset
                    disabled={Boolean(busy)}
                    className="flex flex-col gap-4"
                  >
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="delivery-title">Título</Label>
                      <Input
                        id="delivery-title"
                        required
                        maxLength={300}
                        value={form.title}
                        onChange={(e) =>
                          setForm({ ...form, title: e.target.value })
                        }
                        autoFocus
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="delivery-description">Descrição</Label>
                      <Textarea
                        id="delivery-description"
                        maxLength={10000}
                        value={form.description}
                        onChange={(e) =>
                          setForm({ ...form, description: e.target.value })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="delivery-url">
                        Link do arquivo ou apresentação
                      </Label>
                      <Input
                        id="delivery-url"
                        type="url"
                        placeholder="https://"
                        maxLength={2048}
                        value={form.externalUrl}
                        onChange={(e) =>
                          setForm({ ...form, externalUrl: e.target.value })
                        }
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="delivery-due">Prazo de entrega</Label>
                        <Input
                          id="delivery-due"
                          type="date"
                          value={form.dueDate}
                          onChange={(e) =>
                            setForm({ ...form, dueDate: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="delivery-phase">Fase do projeto</Label>
                        <Select
                          value={form.phaseId || 'none'}
                          onValueChange={(value) =>
                            setForm({
                              ...form,
                              phaseId: value === 'none' ? '' : value,
                            })
                          }
                        >
                          <SelectTrigger id="delivery-phase">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="none">Sem fase</SelectItem>
                              {phases.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {editingId && (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="delivery-status">Status</Label>
                        <Select
                          value={form.status}
                          onValueChange={(value) =>
                            setForm({
                              ...form,
                              status: value as ProjectDeliverable['status'],
                            })
                          }
                        >
                          <SelectTrigger id="delivery-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {Object.entries(DELIVERABLE_LABELS).map(
                                ([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                )
                              )}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="delivery-visible">
                        Visível no portal do cliente
                      </Label>
                      <Switch
                        id="delivery-visible"
                        checked={form.isClientVisible}
                        onCheckedChange={(value) =>
                          setForm({ ...form, isClientVisible: value })
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={!form.title.trim()}>
                        {busy === 'form' ? 'Salvando...' : 'Salvar entrega'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setFormOpen(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </fieldset>
                </form>
              </CardContent>
            </Card>
          )}
          {!loading && !error && deliverables.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma entrega cadastrada. Adicione a primeira para começar o
              acompanhamento.
            </p>
          )}
          {deliverables.map((d) => {
            const pending = approvals.some(
              (a) =>
                a.targetId === d.id &&
                a.targetType === 'deliverable' &&
                a.status === 'pending'
            )
            const url = safeDeliveryUrl(d.externalUrl)
            return (
              <Card key={d.id}>
                <CardHeader className="flex flex-col gap-2 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{d.title}</CardTitle>
                    <Badge variant="outline">
                      {DELIVERABLE_LABELS[d.status]}
                    </Badge>
                    <Badge variant="secondary">
                      {d.isClientVisible ? 'Publicado no portal' : 'Interno'}
                    </Badge>
                    {isDeliveryOverdue(d.dueDate, d.status) && (
                      <Badge variant="destructive">Prazo vencido</Badge>
                    )}
                  </div>
                  {d.description && (
                    <CardDescription className="whitespace-pre-wrap break-words">
                      {d.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="size-4" />
                    {formatDeliveryDate(d.dueDate)}
                    {d.phaseId && (
                      <span>
                        ·{' '}
                        {phases.find((p) => p.id === d.phaseId)?.name ||
                          'Fase do projeto'}
                      </span>
                    )}
                  </p>
                  {url && (
                    <a
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Link2 className="size-4" />
                      Abrir entrega
                    </a>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Boolean(busy) || loading || error || pending}
                      onClick={() => edit(d)}
                    >
                      <Edit className="mr-2 size-4" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        Boolean(busy) ||
                        loading ||
                        error ||
                        pending ||
                        d.status === 'approved'
                      }
                      onClick={() =>
                        void mutate(
                          d.id,
                          async () => {
                            await backendDataService.createApprovalRequest(
                              project.id,
                              {
                                targetType: 'deliverable',
                                targetId: d.id,
                                title: d.title,
                                instructions:
                                  'Revise a entrega e registre sua decisão.',
                              }
                            )
                          },
                          'Entrega publicada e aprovação solicitada'
                        )
                      }
                    >
                      <Send className="mr-2 size-4" />
                      {pending
                        ? 'Aguardando cliente'
                        : busy === d.id
                          ? 'Enviando...'
                          : 'Solicitar aprovação'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>
        <TabsContent value="approvals" className="flex flex-col gap-3">
          {!loading && !error && approvals.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma aprovação solicitada. Envie uma entrega para revisão na
              aba Entregas.
            </p>
          )}
          {approvals.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck2 className="size-4" />
                    {a.title}
                  </CardTitle>
                  <Badge variant="outline">{APPROVAL_LABELS[a.status]}</Badge>
                </div>
                <CardDescription>
                  Solicitada em {formatDeliveryDate(a.submittedAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {a.instructions && <p className="text-sm">{a.instructions}</p>}
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
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="timeline" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Registrar atualização</CardTitle>
              <CardDescription>
                Informe avanços, próximos passos ou dependências.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!timelineForm.title.trim()) return
                  void mutate(
                    'timeline',
                    async () => {
                      await backendDataService.createProjectTimelineEntry(
                        project.id,
                        { ...timelineForm, title: timelineForm.title.trim() }
                      )
                      setTimelineForm({
                        title: '',
                        body: '',
                        isClientVisible: true,
                      })
                    },
                    'Atualização registrada'
                  )
                }}
              >
                <fieldset
                  disabled={Boolean(busy) || loading || error}
                  className="flex flex-col gap-3"
                >
                  <Label htmlFor="timeline-title">Título da atualização</Label>
                  <Input
                    id="timeline-title"
                    required
                    maxLength={300}
                    value={timelineForm.title}
                    onChange={(e) =>
                      setTimelineForm({
                        ...timelineForm,
                        title: e.target.value,
                      })
                    }
                  />
                  <Label htmlFor="timeline-body">Detalhes</Label>
                  <Textarea
                    id="timeline-body"
                    value={timelineForm.body}
                    onChange={(e) =>
                      setTimelineForm({ ...timelineForm, body: e.target.value })
                    }
                  />
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="timeline-visible">
                      Visível no portal do cliente
                    </Label>
                    <Switch
                      id="timeline-visible"
                      checked={timelineForm.isClientVisible}
                      onCheckedChange={(value) =>
                        setTimelineForm({
                          ...timelineForm,
                          isClientVisible: value,
                        })
                      }
                    />
                  </div>
                  <Button type="submit" disabled={!timelineForm.title.trim()}>
                    {busy === 'timeline'
                      ? 'Salvando...'
                      : 'Registrar atualização'}
                  </Button>
                </fieldset>
              </form>
            </CardContent>
          </Card>
          {!loading && !error && timeline.length === 0 && (
            <p className="text-sm text-muted-foreground">
              O histórico aparecerá aqui conforme o projeto avançar.
            </p>
          )}
          {timeline.map((entry) => (
            <div key={entry.id} className="flex gap-3 border-l-2 py-2 pl-4">
              <History className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">{entry.title}</h3>
                  <Badge variant="outline">
                    {entry.isClientVisible ? 'Portal' : 'Interno'}
                  </Badge>
                </div>
                {entry.body && (
                  <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {entry.body}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatDeliveryDate(entry.createdAt)} ·{' '}
                  {entry.origin === 'automatic'
                    ? 'Atualização automática'
                    : 'Atualização da equipe'}
                </p>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
