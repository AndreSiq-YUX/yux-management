import { useEffect, useState } from 'react'
import { Calendar, CheckCircle2, Clock3, ExternalLink, FileCheck2, FolderKanban, History } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { validateApprovalDecision } from '@/lib/projects/approvalRules'
import { supabaseService } from '@/services/supabaseService'
import {
  ApprovalDecisionValue,
  ApprovalRequest,
  Project,
  ProjectDeliverable,
  ProjectPhase,
  ProjectTask,
  ProjectTimelineEntry,
} from '@/types/project'

const approvalLabels: Record<ApprovalRequest['status'], string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  changes_requested: 'Ajustes solicitados',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
}

export function PortalProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>()
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [phases, setPhases] = useState<ProjectPhase[]>([])
  const [deliverables, setDeliverables] = useState<ProjectDeliverable[]>([])
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [timeline, setTimeline] = useState<ProjectTimelineEntry[]>([])
  const [comments, setComments] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [submittingId, setSubmittingId] = useState<string>()

  const selectedProject = projects.find(project => project.id === selectedProjectId)

  useEffect(() => {
    supabaseService.getProjects({ limit: 100 })
      .then(response => {
        setProjects(response.projects)
        setSelectedProjectId(response.projects[0]?.id)
      })
      .catch(error => {
        console.error('Erro ao carregar projetos do portal:', error)
        toast.error('Erro ao carregar projetos')
      })
      .finally(() => setLoading(false))
  }, [])

  const loadProjectDetails = async (projectId: string) => {
    try {
      setLoading(true)
      const [tasksResponse, phasesResponse, deliverablesResponse, approvalsResponse, timelineResponse] = await Promise.all([
        supabaseService.getProjectTasks(projectId),
        supabaseService.getProjectPhases(projectId),
        supabaseService.getProjectDeliverables(projectId),
        supabaseService.getProjectApprovalRequests(projectId),
        supabaseService.getProjectTimeline(projectId),
      ])
      setTasks(tasksResponse.tasks)
      setPhases(phasesResponse.phases)
      setDeliverables(deliverablesResponse.deliverables)
      setApprovals(approvalsResponse.approvals)
      setTimeline(timelineResponse.entries)
    } catch (error) {
      console.error('Erro ao carregar detalhes do projeto:', error)
      toast.error('Erro ao carregar detalhes do projeto')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedProjectId) loadProjectDetails(selectedProjectId)
  }, [selectedProjectId])

  const submitDecision = async (approval: ApprovalRequest, decision: ApprovalDecisionValue) => {
    const comment = comments[approval.id] || ''
    const validationError = validateApprovalDecision(decision, comment)
    if (validationError) {
      toast.error(validationError)
      return
    }

    try {
      setSubmittingId(approval.id)
      await supabaseService.submitApprovalDecision(approval.id, decision, comment)
      toast.success('Decisao registrada')
      if (selectedProjectId) loadProjectDetails(selectedProjectId)
    } catch (error) {
      console.error('Erro ao registrar decisao:', error)
      toast.error('Erro ao registrar decisao')
    } finally {
      setSubmittingId(undefined)
    }
  }

  if (loading && projects.length === 0) {
    return <p className="text-sm text-gray-600">Carregando projetos...</p>
  }

  if (projects.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Projetos</h1>
        <p className="mt-2 text-gray-600">Nenhum projeto disponivel para este contrato.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Projetos e entregas</h1>
        <p className="text-gray-600">Acompanhe o andamento e registre aprovacoes pendentes.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-2">
          {projects.map(project => (
            <button
              key={project.id}
              type="button"
              className={`w-full rounded-md border p-3 text-left transition-colors ${selectedProjectId === project.id ? 'border-yux-400 bg-yux-50' : 'bg-white hover:bg-gray-50'}`}
              onClick={() => setSelectedProjectId(project.id)}
            >
              <span className="block font-medium text-gray-900">{project.name}</span>
              <span className="mt-1 block text-xs text-gray-500">{project.progress}% concluido</span>
            </button>
          ))}
        </aside>

        {selectedProject && (
          <main className="space-y-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">{selectedProject.name}</h2>
                    <p className="mt-1 text-sm text-gray-600">{selectedProject.description}</p>
                  </div>
                  <Badge>{selectedProject.status}</Badge>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Progress value={selectedProject.progress} className="h-2 flex-1" />
                  <span className="text-sm font-medium">{selectedProject.progress}%</span>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="overview">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Andamento</TabsTrigger>
                <TabsTrigger value="deliverables">Entregaveis</TabsTrigger>
                <TabsTrigger value="approvals">Aprovacoes</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Fases</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {phases.map(phase => (
                      <div key={phase.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                        <span className="text-sm font-medium">{phase.name}</span>
                        <Badge variant="outline">{phase.status}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Tarefas publicadas</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {tasks.length === 0 && <p className="text-sm text-gray-500">Nenhuma tarefa publicada.</p>}
                    {tasks.map(task => (
                      <div key={task.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                        <div className="flex items-center gap-2">
                          {task.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock3 className="h-4 w-4 text-gray-400" />}
                          <span className="text-sm">{task.title}</span>
                        </div>
                        <Badge variant="outline">{task.status}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="deliverables" className="space-y-3">
                {deliverables.length === 0 && <p className="text-sm text-gray-500">Nenhum entregavel publicado.</p>}
                {deliverables.map(deliverable => (
                  <Card key={deliverable.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <FolderKanban className="h-4 w-4" />
                          <h3 className="font-medium">{deliverable.title}</h3>
                        </div>
                        <Badge variant="outline">{deliverable.status}</Badge>
                      </div>
                      {deliverable.description && <p className="mt-2 text-sm text-gray-600">{deliverable.description}</p>}
                      {deliverable.externalUrl && (
                        <a className="mt-3 flex items-center gap-1 text-sm text-blue-600 hover:underline" href={deliverable.externalUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3" />Abrir entregavel
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="approvals" className="space-y-3">
                {approvals.length === 0 && <p className="text-sm text-gray-500">Nenhuma aprovacao pendente.</p>}
                {approvals.map(approval => (
                  <Card key={approval.id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <FileCheck2 className="h-4 w-4" />
                          <h3 className="font-medium">{approval.title}</h3>
                        </div>
                        <Badge>{approvalLabels[approval.status]}</Badge>
                      </div>
                      {approval.instructions && <p className="text-sm text-gray-600">{approval.instructions}</p>}
                      {approval.decisions?.map(decision => (
                        <p key={decision.id} className="text-sm text-gray-500">
                          {approvalLabels[decision.decision]}{decision.comment ? `: ${decision.comment}` : ''}
                        </p>
                      ))}
                      {approval.status === 'pending' && (
                        <>
                          <Textarea
                            placeholder="Comentario para ajustes ou rejeicao"
                            value={comments[approval.id] || ''}
                            onChange={event => setComments({ ...comments, [approval.id]: event.target.value })}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" disabled={submittingId === approval.id} onClick={() => submitDecision(approval, 'approved')}>Aprovar</Button>
                            <Button size="sm" variant="outline" disabled={submittingId === approval.id} onClick={() => submitDecision(approval, 'changes_requested')}>Solicitar ajustes</Button>
                            <Button size="sm" variant="destructive" disabled={submittingId === approval.id} onClick={() => submitDecision(approval, 'rejected')}>Rejeitar</Button>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="timeline" className="space-y-3">
                {timeline.length === 0 && <p className="text-sm text-gray-500">Nenhuma atualizacao publicada.</p>}
                {timeline.map(entry => (
                  <div key={entry.id} className="flex gap-3 border-l-2 border-gray-200 py-2 pl-4">
                    {entry.origin === 'automatic' ? <Clock3 className="mt-1 h-4 w-4 text-gray-500" /> : <History className="mt-1 h-4 w-4 text-gray-500" />}
                    <div>
                      <h3 className="text-sm font-medium">{entry.title}</h3>
                      {entry.body && <p className="text-sm text-gray-600">{entry.body}</p>}
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-400"><Calendar className="h-3 w-3" />{new Date(entry.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </main>
        )}
      </div>
    </div>
  )
}
