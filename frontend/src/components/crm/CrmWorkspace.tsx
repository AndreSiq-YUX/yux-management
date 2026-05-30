import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CircleDollarSign, Mail, MessageCircle, Pause, Play, Plus, RefreshCw, UserRoundCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { isPersistedOrganizationId, sortPipelineStages } from '@/lib/crm/followUpRules'
import { LeadCommercialPanel } from '@/components/proposals/LeadCommercialPanel'
import { crmService } from '@/services/crmService'
import { usePlatformStore } from '@/stores/platformStore'
import type { AutomationExecution, CrmInteraction, CrmLead, CrmPipeline, CrmSequence, CrmSequenceEnrollment, CrmTask } from '@/types/crm'

const initialLeadForm = { name: '', email: '', phone: '', company: '', source: 'Manual', score: 0, value: '' }

export function CrmWorkspace() {
  const organization = usePlatformStore(state => state.organization)
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([])
  const [pipelineId, setPipelineId] = useState<string>()
  const [leads, setLeads] = useState<CrmLead[]>([])
  const [selectedLead, setSelectedLead] = useState<CrmLead>()
  const [createOpen, setCreateOpen] = useState(false)
  const [leadForm, setLeadForm] = useState(initialLeadForm)
  const [loading, setLoading] = useState(true)
  const pipeline = pipelines.find(item => item.id === pipelineId)
  const stages = useMemo(() => sortPipelineStages(pipeline?.stages || []), [pipeline])

  const loadPipelines = useCallback(async () => {
    const organizationId = organization?.id
    if (!isPersistedOrganizationId(organizationId)) return
    try {
      setLoading(true)
      const nextPipelines = await crmService.getPipelines(organizationId)
      setPipelines(nextPipelines)
      setPipelineId(current => current || nextPipelines.find(item => item.isDefault)?.id || nextPipelines[0]?.id)
    } catch (error) {
      console.error('Erro ao carregar pipelines:', error)
      toast.error('Erro ao carregar CRM')
    } finally {
      setLoading(false)
    }
  }, [organization?.id])

  const loadLeads = useCallback(async () => {
    const organizationId = organization?.id
    if (!isPersistedOrganizationId(organizationId) || !pipelineId) return
    try {
      setLeads(await crmService.getLeads(organizationId, pipelineId))
    } catch (error) {
      console.error('Erro ao carregar leads:', error)
      toast.error('Erro ao carregar leads')
    }
  }, [organization?.id, pipelineId])

  useEffect(() => { loadPipelines() }, [loadPipelines])
  useEffect(() => { loadLeads() }, [loadLeads])

  const createLead = async (event: FormEvent) => {
    event.preventDefault()
    if (!organization?.id || !pipelineId || !stages[0]) return
    try {
      await crmService.createLead({
        organizationId: organization.id, pipelineId, stageId: stages[0].id,
        name: leadForm.name.trim(), email: leadForm.email.trim(),
        phone: leadForm.phone.trim() || undefined, company: leadForm.company.trim() || undefined,
        source: leadForm.source.trim() || 'Manual', score: Number(leadForm.score),
        value: leadForm.value ? Number(leadForm.value) : undefined,
      })
      setLeadForm(initialLeadForm); setCreateOpen(false); toast.success('Lead criado'); loadLeads()
    } catch (error) {
      console.error('Erro ao criar lead:', error); toast.error('Erro ao criar lead')
    }
  }

  const moveLead = async (lead: CrmLead, stageId: string) => {
    const stage = stages.find(item => item.id === stageId)
    if (!stage) return
    try {
      await crmService.moveLead(lead.id, stage); loadLeads(); toast.success('Etapa atualizada')
    } catch (error) {
      console.error('Erro ao mover lead:', error); toast.error('Erro ao atualizar etapa')
    }
  }

  if (!organization) return <p className="text-sm text-gray-600">Carregando contexto do CRM...</p>
  if (loading) return <p className="text-sm text-gray-600">Carregando pipeline...</p>

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900">CRM</h1><p className="text-gray-600">Pipeline comercial de {organization.name}</p></div>
      <div className="flex gap-2">
        <Select value={pipelineId} onValueChange={setPipelineId}><SelectTrigger className="w-52"><SelectValue placeholder="Pipeline" /></SelectTrigger><SelectContent>{pipelines.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo lead</Button>
      </div>
    </div>
    <div className="grid gap-3 overflow-x-auto pb-3" style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(230px, 1fr))` }}>
      {stages.map(stage => <section key={stage.id} className="min-h-[420px] rounded-md border bg-gray-50">
        <header className="flex items-center justify-between border-b bg-white p-3"><span className="flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />{stage.name}</span><Badge variant="secondary">{leads.filter(lead => lead.stageId === stage.id).length}</Badge></header>
        <div className="space-y-2 p-2">{leads.filter(lead => lead.stageId === stage.id).map(lead => <Card key={lead.id} className="hover:border-yux-300"><CardContent className="space-y-2 p-3">
          <div><button type="button" className="text-left text-sm font-medium hover:text-yux-700" onClick={() => setSelectedLead(lead)}>{lead.name}</button><p className="text-xs text-gray-500">{lead.company || lead.email}</p></div>
          <div className="flex items-center justify-between text-xs text-gray-500"><span>Score {lead.score}</span>{lead.value !== undefined && <span>R$ {lead.value.toLocaleString('pt-BR')}</span>}</div>
          <Select value={lead.stageId} onValueChange={value => moveLead(lead, value)}><SelectTrigger onClick={event => event.stopPropagation()} className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{stages.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
        </CardContent></Card>)}</div>
      </section>)}
    </div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={createLead}>
      <Input placeholder="Nome" required value={leadForm.name} onChange={event => setLeadForm({ ...leadForm, name: event.target.value })} /><Input placeholder="Email" required type="email" value={leadForm.email} onChange={event => setLeadForm({ ...leadForm, email: event.target.value })} />
      <div className="grid grid-cols-2 gap-3"><Input placeholder="Telefone" value={leadForm.phone} onChange={event => setLeadForm({ ...leadForm, phone: event.target.value })} /><Input placeholder="Empresa" value={leadForm.company} onChange={event => setLeadForm({ ...leadForm, company: event.target.value })} /></div>
      <div className="grid grid-cols-3 gap-3"><Input placeholder="Origem" value={leadForm.source} onChange={event => setLeadForm({ ...leadForm, source: event.target.value })} /><Input placeholder="Score" type="number" min="0" max="100" value={leadForm.score} onChange={event => setLeadForm({ ...leadForm, score: Number(event.target.value) })} /><Input placeholder="Valor" type="number" min="0" value={leadForm.value} onChange={event => setLeadForm({ ...leadForm, value: event.target.value })} /></div>
      <Button type="submit">Criar lead</Button>
    </form></DialogContent></Dialog>
    <LeadOperationsModal organizationId={organization.id} lead={selectedLead} onClose={() => setSelectedLead(undefined)} />
  </div>
}

function LeadOperationsModal({ organizationId, lead, onClose }: { organizationId: string; lead?: CrmLead; onClose: () => void }) {
  const [interactions, setInteractions] = useState<CrmInteraction[]>([]), [tasks, setTasks] = useState<CrmTask[]>([]), [sequences, setSequences] = useState<CrmSequence[]>([]), [enrollments, setEnrollments] = useState<CrmSequenceEnrollment[]>([]), [executions, setExecutions] = useState<AutomationExecution[]>([])
  const [note, setNote] = useState(''), [taskTitle, setTaskTitle] = useState(''), [dueAt, setDueAt] = useState(''), [sequenceId, setSequenceId] = useState<string>(), [rescheduleAt, setRescheduleAt] = useState('')
  const refresh = useCallback(async () => { if (!lead) return; const [i, t, s, e, x] = await Promise.all([crmService.getInteractions(lead.id), crmService.getTasks(lead.id), crmService.getSequences(organizationId), crmService.getEnrollments(lead.id), crmService.getExecutions(lead.id)]); setInteractions(i); setTasks(t); setSequences(s); setEnrollments(e); setExecutions(x); setSequenceId(current => current || s[0]?.id) }, [lead, organizationId])
  useEffect(() => { refresh() }, [refresh])
  const addNote = async () => { if (!lead || !note.trim()) return; await crmService.createInteraction(organizationId, lead.id, { type: 'note', title: 'Atualizacao comercial', description: note.trim() }); setNote(''); refresh() }
  const addTask = async () => { if (!lead || !taskTitle.trim() || !dueAt) return; await crmService.createTask(organizationId, lead.id, taskTitle.trim(), new Date(dueAt).toISOString()); setTaskTitle(''); setDueAt(''); refresh() }
  const enroll = async () => { if (!lead || !sequenceId) return; await crmService.enrollLead(organizationId, lead.id, sequenceId); toast.success('Sequencia iniciada'); refresh() }
  const setStatus = async (item: CrmSequenceEnrollment, status: CrmSequenceEnrollment['status']) => { await crmService.updateEnrollment(item.id, { status, manualNote: status === 'manual' ? 'Atendimento assumido manualmente.' : undefined }); refresh() }
  const reschedule = async (item: CrmSequenceEnrollment) => { if (!rescheduleAt) return; await crmService.updateEnrollment(item.id, { status: 'active', nextExecutionAt: new Date(rescheduleAt).toISOString() }); setRescheduleAt(''); toast.success('Follow-up reagendado'); refresh() }
  return <Dialog open={Boolean(lead)} onOpenChange={open => !open && onClose()}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{lead?.name}</DialogTitle></DialogHeader>{lead && <Tabs defaultValue="follow-up">
    <TabsList className="grid w-full grid-cols-5"><TabsTrigger value="follow-up">Follow-up</TabsTrigger><TabsTrigger value="history">Historico</TabsTrigger><TabsTrigger value="tasks">Tarefas</TabsTrigger><TabsTrigger value="automations">Execucoes</TabsTrigger><TabsTrigger value="commercial">Comercial</TabsTrigger></TabsList>
    <TabsContent value="follow-up" className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><Info icon={Mail} label="Email" value={lead.email} /><Info icon={MessageCircle} label="Telefone" value={lead.phone || 'Nao informado'} /><Info icon={CircleDollarSign} label="Valor estimado" value={lead.value ? `R$ ${lead.value.toLocaleString('pt-BR')}` : 'Nao informado'} /></div><div className="flex gap-2"><Select value={sequenceId} onValueChange={setSequenceId}><SelectTrigger><SelectValue placeholder="Escolha uma sequencia" /></SelectTrigger><SelectContent>{sequences.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select><Button disabled={!sequenceId} onClick={enroll}>Iniciar sequencia</Button></div>{sequences.length === 0 && <p className="text-sm text-gray-500">Nenhuma sequencia configurada.</p>}{enrollments.map(item => <div key={item.id} className="space-y-3 rounded-md border p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm">{item.status}{item.nextExecutionAt ? ` - proximo envio ${new Date(item.nextExecutionAt).toLocaleString('pt-BR')}` : ''}</span><div className="flex gap-2"><Button size="sm" variant="outline" title="Pausar automacao" onClick={() => setStatus(item, 'paused')}><Pause className="h-3 w-3" /></Button><Button size="sm" variant="outline" title="Retomar automacao" onClick={() => setStatus(item, 'active')}><Play className="h-3 w-3" /></Button><Button size="sm" variant="outline" onClick={() => setStatus(item, 'manual')}><UserRoundCheck className="mr-1 h-3 w-3" />Assumir</Button></div></div><div className="flex gap-2"><Input type="datetime-local" value={rescheduleAt} onChange={event => setRescheduleAt(event.target.value)} /><Button size="sm" variant="outline" disabled={!rescheduleAt} onClick={() => reschedule(item)}>Reagendar</Button></div></div>)}</TabsContent>
    <TabsContent value="history" className="space-y-3"><div className="flex gap-2"><Textarea placeholder="Registrar atualizacao" value={note} onChange={event => setNote(event.target.value)} /><Button onClick={addNote}>Registrar</Button></div>{interactions.map(item => <div key={item.id} className="border-l-2 pl-3"><p className="text-sm font-medium">{item.title}</p><p className="text-sm text-gray-600">{item.description}</p></div>)}</TabsContent>
    <TabsContent value="tasks" className="space-y-3"><div className="grid gap-2 md:grid-cols-[1fr_220px_auto]"><Input placeholder="Proxima acao" value={taskTitle} onChange={event => setTaskTitle(event.target.value)} /><Input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /><Button onClick={addTask}><Plus className="mr-1 h-4 w-4" />Criar</Button></div>{tasks.map(item => <div key={item.id} className="flex justify-between rounded-md border p-3 text-sm"><span>{item.title}</span><span>{new Date(item.dueAt).toLocaleString('pt-BR')}</span></div>)}</TabsContent>
    <TabsContent value="automations" className="space-y-3">{executions.length === 0 && <p className="text-sm text-gray-500">Nenhuma execucao registrada.</p>}{executions.map(item => <div key={item.id} className="flex justify-between gap-3 rounded-md border p-3 text-sm"><div><p>{item.actionType} - {item.status}</p><p className="text-xs text-gray-500">Agendado para {new Date(item.scheduledAt).toLocaleString('pt-BR')}</p>{item.lastError && <p className="mt-1 text-xs text-red-600">{item.lastError}</p>}</div>{item.status === 'failed' && <Button size="sm" variant="outline" onClick={() => crmService.retryExecution(item.id).then(refresh)}><RefreshCw className="mr-1 h-3 w-3" />Tentar novamente</Button>}</div>)}</TabsContent>
    <TabsContent value="commercial"><LeadCommercialPanel lead={lead} /></TabsContent>
  </Tabs>}</DialogContent></Dialog>
}

function Info({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return <div className="rounded-md border p-3"><Icon className="h-4 w-4 text-gray-500" /><p className="mt-2 text-xs text-gray-500">{label}</p><p className="text-sm font-medium">{value}</p></div>
}
