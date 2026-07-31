import { FormEvent, useEffect, useState } from 'react'
import { CheckCircle2, Clock3, FileCheck2, History, Link2, Plus, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { backendDataService } from '@/services/backendDataService'
import { ApprovalRequest, Project, ProjectDeliverable, ProjectTimelineEntry } from '@/types/project'

const approvalLabels: Record<ApprovalRequest['status'], string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  changes_requested: 'Ajustes solicitados',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
}

const deliverableLabels: Record<ProjectDeliverable['status'], string> = {
  draft: 'Rascunho',
  delivered: 'Entregue',
  in_review: 'Em revisao',
  approved: 'Aprovado',
  changes_requested: 'Ajustes solicitados',
  rejected: 'Rejeitado',
}

export function ProjectDeliveryManager({ project }: { project: Project }) {
  const [deliverables, setDeliverables] = useState<ProjectDeliverable[]>([])
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [timeline, setTimeline] = useState<ProjectTimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [deliverableForm, setDeliverableForm] = useState({
    title: '',
    description: '',
    externalUrl: '',
    isClientVisible: true,
  })
  const [timelineForm, setTimelineForm] = useState({
    title: '',
    body: '',
    isClientVisible: true,
  })

  const loadData = async () => {
    try {
      setLoading(true)
      const [deliverablesResponse, approvalsResponse, timelineResponse] = await Promise.all([
        backendDataService.getProjectDeliverables(project.id),
        backendDataService.getProjectApprovalRequests(project.id),
        backendDataService.getProjectTimeline(project.id),
      ])
      setDeliverables(deliverablesResponse.deliverables)
      setApprovals(approvalsResponse.approvals)
      setTimeline(timelineResponse.entries)
    } catch (error) {
      console.error('Erro ao carregar entregas:', error)
      toast.error('Erro ao carregar entregas do projeto')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [project.id])

  const createDeliverable = async (event: FormEvent) => {
    event.preventDefault()
    if (!deliverableForm.title.trim()) return
    try {
      await backendDataService.createProjectDeliverable(project.id, {
        ...deliverableForm,
        title: deliverableForm.title.trim(),
      })
      setDeliverableForm({ title: '', description: '', externalUrl: '', isClientVisible: true })
      toast.success('Entregavel criado')
      loadData()
    } catch (error) {
      console.error('Erro ao criar entregavel:', error)
      toast.error('Erro ao criar entregavel')
    }
  }

  const requestApproval = async (deliverable: ProjectDeliverable) => {
    try {
      await backendDataService.updateProjectDeliverable(project.id, deliverable.id, {
        status: 'in_review',
        isClientVisible: true,
      })
      await backendDataService.createApprovalRequest(project.id, {
        targetType: 'deliverable',
        targetId: deliverable.id,
        title: deliverable.title,
        instructions: 'Revise o entregavel e registre sua decisao.',
      })
      toast.success('Aprovacao solicitada')
      loadData()
    } catch (error) {
      console.error('Erro ao solicitar aprovacao:', error)
      toast.error('Erro ao solicitar aprovacao')
    }
  }

  const createTimelineEntry = async (event: FormEvent) => {
    event.preventDefault()
    if (!timelineForm.title.trim()) return
    try {
      await backendDataService.createProjectTimelineEntry(project.id, {
        ...timelineForm,
        title: timelineForm.title.trim(),
      })
      setTimelineForm({ title: '', body: '', isClientVisible: true })
      toast.success('Atualizacao registrada')
      loadData()
    } catch (error) {
      console.error('Erro ao registrar atualizacao:', error)
      toast.error('Erro ao registrar atualizacao')
    }
  }

  if (loading) {
    return <p className="py-8 text-sm text-muted-foreground">Carregando entregas...</p>
  }

  return (
    <Tabs defaultValue="deliverables" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="deliverables">Entregaveis</TabsTrigger>
        <TabsTrigger value="approvals">Aprovacoes</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
      </TabsList>

      <TabsContent value="deliverables" className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Novo entregavel</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={createDeliverable}>
              <Input
                placeholder="Titulo do entregavel"
                value={deliverableForm.title}
                onChange={event => setDeliverableForm({ ...deliverableForm, title: event.target.value })}
              />
              <Textarea
                placeholder="Descricao"
                value={deliverableForm.description}
                onChange={event => setDeliverableForm({ ...deliverableForm, description: event.target.value })}
              />
              <Input
                placeholder="URL externa opcional"
                value={deliverableForm.externalUrl}
                onChange={event => setDeliverableForm({ ...deliverableForm, externalUrl: event.target.value })}
              />
              <div className="flex items-center justify-between">
                <Label htmlFor="deliverable-visible">Visivel no portal</Label>
                <Switch
                  id="deliverable-visible"
                  checked={deliverableForm.isClientVisible}
                  onCheckedChange={checked => setDeliverableForm({ ...deliverableForm, isClientVisible: checked })}
                />
              </div>
              <Button type="submit"><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
            </form>
          </CardContent>
        </Card>

        {deliverables.map(deliverable => (
          <Card key={deliverable.id}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{deliverable.title}</h3>
                  <Badge variant="outline">{deliverableLabels[deliverable.status]}</Badge>
                  {deliverable.isClientVisible && <Badge variant="secondary">Portal</Badge>}
                </div>
                {deliverable.description && <p className="mt-1 text-sm text-muted-foreground">{deliverable.description}</p>}
                {deliverable.externalUrl && (
                  <a className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:underline" href={deliverable.externalUrl} target="_blank" rel="noreferrer">
                    <Link2 className="h-3 w-3" />Abrir arquivo
                  </a>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => requestApproval(deliverable)}>
                <Send className="mr-2 h-4 w-4" />Solicitar aprovacao
              </Button>
            </CardContent>
          </Card>
        ))}
      </TabsContent>

      <TabsContent value="approvals" className="space-y-3">
        {approvals.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma aprovacao solicitada.</p>}
        {approvals.map(approval => (
          <Card key={approval.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4" />
                  <h3 className="font-medium">{approval.title}</h3>
                </div>
                <Badge>{approvalLabels[approval.status]}</Badge>
              </div>
              {approval.decisions?.map(decision => (
                <p key={decision.id} className="mt-2 text-sm text-muted-foreground">
                  {approvalLabels[decision.decision]}{decision.comment ? `: ${decision.comment}` : ''}
                </p>
              ))}
            </CardContent>
          </Card>
        ))}
      </TabsContent>

      <TabsContent value="timeline" className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Registrar atualizacao</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={createTimelineEntry}>
              <Input
                placeholder="Titulo da atualizacao"
                value={timelineForm.title}
                onChange={event => setTimelineForm({ ...timelineForm, title: event.target.value })}
              />
              <Textarea
                placeholder="Detalhes"
                value={timelineForm.body}
                onChange={event => setTimelineForm({ ...timelineForm, body: event.target.value })}
              />
              <div className="flex items-center justify-between">
                <Label htmlFor="timeline-visible">Visivel no portal</Label>
                <Switch
                  id="timeline-visible"
                  checked={timelineForm.isClientVisible}
                  onCheckedChange={checked => setTimelineForm({ ...timelineForm, isClientVisible: checked })}
                />
              </div>
              <Button type="submit"><Plus className="mr-2 h-4 w-4" />Registrar</Button>
            </form>
          </CardContent>
        </Card>

        {timeline.map(entry => (
          <div key={entry.id} className="flex gap-3 border-l-2 border-gray-200 py-2 pl-4">
            {entry.origin === 'automatic' ? <Clock3 className="mt-1 h-4 w-4 text-gray-500" /> : <History className="mt-1 h-4 w-4 text-gray-500" />}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">{entry.title}</h3>
                {entry.isClientVisible && <CheckCircle2 className="h-4 w-4 text-green-600" />}
              </div>
              {entry.body && <p className="text-sm text-muted-foreground">{entry.body}</p>}
            </div>
          </div>
        ))}
      </TabsContent>
    </Tabs>
  )
}
