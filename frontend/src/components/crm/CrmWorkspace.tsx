import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Pause, Play, Plus, RefreshCw, Upload, UserRoundCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { isPersistedOrganizationId } from '@/lib/crm/followUpRules'
import { buildAttributionDashboard } from '@/lib/crm/attributionRules'
import { applyCockpitFilters } from '@/lib/crm/cockpitRules'
import { calculatePipelineSummary, sortPipelineStages } from '@/lib/crm/pipelineRules'
import { CockpitTabs, type CockpitTab } from '@/components/crm/CockpitTabs'
import { LeadAdvancedFilters } from '@/components/crm/LeadAdvancedFilters'
import { LeadCsvImportPanel } from '@/components/crm/LeadCsvImportPanel'
import { Lead360Panel } from '@/components/crm/Lead360Panel'
import { LeadSourcesDashboard } from '@/components/crm/LeadSourcesDashboard'
import { LeadDetailPanel } from '@/components/crm/LeadDetailPanel'
import { LeadKanbanBoard } from '@/components/crm/LeadKanbanBoard'
import { LeadTaskPanel } from '@/components/crm/LeadTaskPanel'
import { LeadTimeline } from '@/components/crm/LeadTimeline'
import { TodayWorkQueue } from '@/components/crm/TodayWorkQueue'
import { LeadCommercialPanel } from '@/components/proposals/LeadCommercialPanel'
import { crmConversationService } from '@/services/crmConversationService'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { crmService } from '@/services/crmService'
import { usePlatformStore } from '@/stores/platformStore'
import type { AutomationExecution, CrmGovernanceContext, CrmInteraction, CrmLead, CrmPipeline, CrmSequence, CrmSequenceEnrollment, CrmTask } from '@/types/crm'
import type { LeadConversationView } from '@/components/crm/LeadConversationPanel'
import type { CrmCockpitFilterState, CrmCockpitLead } from '@/types/crmCockpit'
import type { CrmMessageTemplate, CrmQuickReply, LeadAiFieldSuggestion, LeadAiInsight, LeadResponseSuggestion, LeadSlaEvent } from '@/types/crmAi'
import type { LeadSourceRollup } from '@/types/crmAttribution'

const initialLeadForm = { name: '', email: '', phone: '', company: '', source: 'Manual', score: 0, value: '' }

export function CrmWorkspace() {
  const organization = usePlatformStore(state => state.organization)
  const platformLoading = usePlatformStore(state => state.isLoading)
  const platformError = usePlatformStore(state => state.error)
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([])
  const [pipelineId, setPipelineId] = useState<string>()
  const [leads, setLeads] = useState<CrmLead[]>([])
  const [governance, setGovernance] = useState<CrmGovernanceContext | null>(null)
  const [crmUnavailable, setCrmUnavailable] = useState(false)
  const [selectedLead, setSelectedLead] = useState<CrmLead>()
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [leadForm, setLeadForm] = useState(initialLeadForm)
  const [activeTab, setActiveTab] = useState<CockpitTab>('kanban')
  const [filters, setFilters] = useState<CrmCockpitFilterState>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const pipeline = pipelines.find(item => item.id === pipelineId)
  const stages = useMemo(() => sortPipelineStages(pipeline?.stages || []), [pipeline])
  const stageById = useMemo(() => new Map(stages.map(stage => [stage.id, stage])), [stages])
  const sources = useMemo(() => Array.from(new Set(leads.map(lead => lead.source).filter(Boolean))).sort(), [leads])
  const filteredLeads = useMemo(() => applyCockpitFilters(leads as CrmCockpitLead[], filters), [leads, filters])
  const summary = useMemo(() => calculatePipelineSummary(filteredLeads.map(lead => ({
    ...lead,
    stageKey: stageById.get(lead.stageId)?.key,
  }))), [filteredLeads, stageById])
  const sourceDashboard = useMemo(() => buildLeadSourcesDashboardFromLeads({
    organizationId: organization?.id || '',
    crmInstanceId: governance?.instance.id,
    leads: filteredLeads,
    stageById,
  }), [organization?.id, governance?.instance.id, filteredLeads, stageById])

  const loadPipelines = useCallback(async () => {
    const organizationId = organization?.id
    if (!isPersistedOrganizationId(organizationId)) {
      setPipelines([])
      setPipelineId(undefined)
      setLeads([])
      setGovernance(null)
      setCrmUnavailable(false)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setLoadError(null)
      setCrmUnavailable(false)

      let activeGovernance: CrmGovernanceContext | null = null

      if (organization?.kind === 'client') {
        const instance = await crmGovernanceService.getActiveInstanceForOrganization(organizationId)

        if (!instance) {
          setPipelines([])
          setPipelineId(undefined)
          setLeads([])
          setGovernance(null)
          setCrmUnavailable(true)
          return
        }

        activeGovernance = await crmGovernanceService.getGovernanceContext(instance.id)
        setGovernance(activeGovernance)
      } else {
        setGovernance(null)
      }

      const nextPipelines = await crmService.getPipelines(organizationId)
      const scopedPipelines = activeGovernance
        ? nextPipelines.filter(item => !item.crmInstanceId || item.crmInstanceId === activeGovernance?.instance.id)
        : nextPipelines
      setPipelines(scopedPipelines)
      setPipelineId(current => current || scopedPipelines.find(item => item.isDefault)?.id || scopedPipelines[0]?.id)
    } catch (error) {
      console.error('Erro ao carregar pipelines:', error)
      setLoadError('Nao foi possivel carregar os pipelines do CRM.')
      toast.error('Erro ao carregar CRM')
    } finally {
      setLoading(false)
    }
  }, [organization?.id, organization?.kind])

  const loadLeads = useCallback(async () => {
    const organizationId = organization?.id
    if (!isPersistedOrganizationId(organizationId) || !pipelineId || crmUnavailable) {
      setLeads([])
      return
    }
    try {
      setLoadError(null)
      setLeads(governance?.instance.id
        ? await crmService.getLeadsForInstance(governance.instance.id, pipelineId)
        : await crmService.getLeads(organizationId, pipelineId))
    } catch (error) {
      console.error('Erro ao carregar leads:', error)
      setLoadError('Nao foi possivel carregar os leads deste pipeline.')
      toast.error('Erro ao carregar leads')
    }
  }, [organization?.id, pipelineId, governance?.instance.id, crmUnavailable])

  useEffect(() => { loadPipelines() }, [loadPipelines])
  useEffect(() => { loadLeads() }, [loadLeads])

  const createLead = async (event: FormEvent) => {
    event.preventDefault()
    if (!organization?.id || !pipelineId || !stages[0]) return
    try {
      const baseLead = {
        organizationId: organization.id, pipelineId, stageId: stages[0].id,
        name: leadForm.name.trim(), email: leadForm.email.trim(),
        phone: leadForm.phone.trim() || undefined, company: leadForm.company.trim() || undefined,
        source: leadForm.source.trim() || 'Manual', score: Number(leadForm.score),
        value: leadForm.value ? Number(leadForm.value) : undefined,
      }

      if (governance?.instance.id) {
        await crmService.createGovernedLead({
          ...baseLead,
          crmInstanceId: governance.instance.id,
          assignmentMode: governance.instance.defaultAssignmentMode,
        })
      } else {
        await crmService.createLead(baseLead)
      }
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

  if (platformLoading) return <p className="text-sm text-gray-600">Carregando contexto do CRM...</p>
  if (!organization || !isPersistedOrganizationId(organization.id)) {
    return (
      <CrmNotice
        title="CRM indisponivel neste contexto"
        description={platformError || 'Nao foi possivel carregar uma organizacao real para o CRM. Verifique a sessao do usuario, as permissoes de organizations na Data API e se as migracoes do Supabase foram aplicadas.'}
      />
    )
  }
  if (loading) return <p className="text-sm text-gray-600">Carregando pipeline...</p>
  if (loadError) return <CrmNotice title="Erro ao carregar CRM" description={loadError} onRetry={loadPipelines} />
  if (crmUnavailable) return <CrmNotice title="CRM nao contratado ou inativo" description="Este contrato nao possui uma instancia CRM ativa. Fale com a YUX para habilitar ou revisar a implantacao do modulo." />
  if (pipelines.length === 0) return <CrmNotice title="Nenhum pipeline configurado" description="A organizacao atual nao possui pipeline comercial ativo." />

  const workspaceTitle = governance?.currentMember?.role === 'seller'
    ? 'Meus leads'
    : governance?.currentMember?.role === 'manager'
      ? 'Leads da equipe'
      : governance
        ? 'Operacao CRM'
        : 'CRM Cockpit'

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900">{workspaceTitle}</h1><p className="text-gray-600">Pipeline comercial de {organization.name}</p></div>
      <div className="flex gap-2">
        <Select value={pipelineId} onValueChange={setPipelineId}><SelectTrigger className="w-52"><SelectValue placeholder="Pipeline" /></SelectTrigger><SelectContent>{pipelines.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="mr-2 h-4 w-4" />Importar CSV</Button>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo lead</Button>
      </div>
    </div>
    <div className="grid gap-3 md:grid-cols-4">
      <Metric label="Novos leads" value={summary.newLeads.toString()} />
      <Metric label="Leads parados" value={summary.staleLeads.toString()} />
      <Metric label="Conversao" value={`${summary.conversionRate}%`} />
      <Metric label="Pipeline aberto" value={summary.openPipelineValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
    </div>
    <LeadAdvancedFilters
      filters={filters}
      stages={stages}
      sources={sources}
      onChange={setFilters}
      showSmartSegmentBuilder
      onSaveSmartSegment={segment => toast.success(`Segmento salvo: ${segment.name}`)}
      onCreateSegmentTask={segment => toast.success(`Tarefa criada para ${segment.estimatedSize} leads estimados`)}
      onStartSegmentAutomation={segment => toast.success(`Automacao preparada para ${segment.name}`)}
      onCreateSegmentCampaign={segment => toast.success(`Campanha preparada para ${segment.name}`)}
      onExportSegment={segment => toast.success(`Exportacao preparada para ${segment.estimatedSize} leads estimados`)}
    />
    <CockpitTabs activeTab={activeTab} onTabChange={setActiveTab} />
    {activeTab === 'kanban' && <LeadKanbanBoard stages={stages} leads={filteredLeads} onSelectLead={setSelectedLead} onMoveLead={moveLead} />}
    {activeTab === 'list' && <LeadList stages={stages} leads={filteredLeads} onSelectLead={setSelectedLead} onMoveLead={moveLead} />}
    {activeTab === 'today' && <TodayWorkQueue leads={filteredLeads} onSelectLead={setSelectedLead} />}
    {activeTab === 'calendar' && <CalendarView leads={filteredLeads} onSelectLead={setSelectedLead} />}
    {activeTab === 'sources' && <LeadSourcesDashboard dashboard={sourceDashboard} />}
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={createLead}>
      <Input placeholder="Nome" required value={leadForm.name} onChange={event => setLeadForm({ ...leadForm, name: event.target.value })} /><Input placeholder="Email" required type="email" value={leadForm.email} onChange={event => setLeadForm({ ...leadForm, email: event.target.value })} />
      <div className="grid grid-cols-2 gap-3"><Input placeholder="Telefone" value={leadForm.phone} onChange={event => setLeadForm({ ...leadForm, phone: event.target.value })} /><Input placeholder="Empresa" value={leadForm.company} onChange={event => setLeadForm({ ...leadForm, company: event.target.value })} /></div>
      <div className="grid grid-cols-3 gap-3"><Input placeholder="Origem" value={leadForm.source} onChange={event => setLeadForm({ ...leadForm, source: event.target.value })} /><Input placeholder="Score" type="number" min="0" max="100" value={leadForm.score} onChange={event => setLeadForm({ ...leadForm, score: Number(event.target.value) })} /><Input placeholder="Valor" type="number" min="0" value={leadForm.value} onChange={event => setLeadForm({ ...leadForm, value: event.target.value })} /></div>
      <Button type="submit">Criar lead</Button>
    </form></DialogContent></Dialog>
    <Dialog open={importOpen} onOpenChange={setImportOpen}>
      <DialogContent className="max-w-3xl">
        <LeadCsvImportPanel onExecute={() => toast.success('Preview de importacao validado')} />
      </DialogContent>
    </Dialog>
    <LeadOperationsModal organizationId={organization.id} lead={selectedLead} onClose={() => setSelectedLead(undefined)} />
  </div>
}

function CrmNotice({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return (
    <div className="flex max-w-2xl items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="space-y-3">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-amber-800">{description}</p>
        </div>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />Tentar novamente
          </Button>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-4">
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-950">{value}</p>
    </div>
  )
}

function LeadList({
  stages,
  leads,
  onSelectLead,
  onMoveLead,
}: {
  stages: CrmPipeline['stages']
  leads: CrmLead[]
  onSelectLead: (lead: CrmLead) => void
  onMoveLead: (lead: CrmLead, stageId: string) => void
}) {
  const stageNameById = new Map((stages || []).map(stage => [stage.id, stage.name]))

  return (
    <div className="overflow-hidden rounded-md border bg-white">
      <div className="grid grid-cols-[1.4fr_1fr_120px_160px_220px] border-b bg-slate-50 px-4 py-2 text-xs font-medium uppercase text-slate-500">
        <span>Lead</span>
        <span>Origem</span>
        <span>Score</span>
        <span>Valor</span>
        <span>Etapa</span>
      </div>
      {leads.map(lead => (
        <div key={lead.id} className="grid grid-cols-[1.4fr_1fr_120px_160px_220px] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0">
          <button type="button" className="text-left font-medium text-slate-950 hover:text-yux-700" onClick={() => onSelectLead(lead)}>
            {lead.name}
            <span className="block text-xs font-normal text-slate-500">{lead.company || lead.email}</span>
          </button>
          <span>{lead.sourceKind || lead.source}</span>
          <span>{lead.score}</span>
          <span>{lead.value !== undefined ? lead.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Sem valor'}</span>
          <Select value={lead.stageId} onValueChange={value => onMoveLead(lead, value)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={stageNameById.get(lead.stageId) || 'Etapa'} /></SelectTrigger>
            <SelectContent>{(stages || []).map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      ))}
    </div>
  )
}

function CalendarView({ leads, onSelectLead }: { leads: CrmLead[]; onSelectLead: (lead: CrmLead) => void }) {
  const scheduled = leads
    .filter(lead => lead.nextFollowUpAt)
    .sort((a, b) => new Date(a.nextFollowUpAt || '').getTime() - new Date(b.nextFollowUpAt || '').getTime())

  return (
    <div className="rounded-md border bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-900">Calendario de atividades</h2>
        <p className="text-sm text-gray-500">Follow-ups e proximas atividades vinculadas aos leads.</p>
      </div>
      {scheduled.map(lead => (
        <button key={lead.id} type="button" className="grid w-full grid-cols-[180px_1fr] gap-3 border-b px-4 py-3 text-left text-sm last:border-b-0 hover:bg-slate-50" onClick={() => onSelectLead(lead)}>
          <span className="text-gray-500">{new Date(lead.nextFollowUpAt || '').toLocaleString('pt-BR')}</span>
          <span className="font-medium text-gray-950">{lead.name}</span>
        </button>
      ))}
      {scheduled.length === 0 && <p className="px-4 py-6 text-sm text-gray-500">Nenhuma atividade agendada.</p>}
    </div>
  )
}

function LeadOperationsModal({ organizationId, lead, onClose }: { organizationId: string; lead?: CrmLead; onClose: () => void }) {
  const [interactions, setInteractions] = useState<CrmInteraction[]>([]), [tasks, setTasks] = useState<CrmTask[]>([]), [sequences, setSequences] = useState<CrmSequence[]>([]), [enrollments, setEnrollments] = useState<CrmSequenceEnrollment[]>([]), [executions, setExecutions] = useState<AutomationExecution[]>([])
  const [crmConversations, setCrmConversations] = useState<LeadConversationView[]>([]), [aiInsights, setAiInsights] = useState<LeadAiInsight[]>([]), [fieldSuggestions, setFieldSuggestions] = useState<LeadAiFieldSuggestion[]>([]), [responseSuggestions, setResponseSuggestions] = useState<LeadResponseSuggestion[]>([]), [slaEvents, setSlaEvents] = useState<LeadSlaEvent[]>([]), [quickReplies, setQuickReplies] = useState<CrmQuickReply[]>([]), [templates, setTemplates] = useState<CrmMessageTemplate[]>([])
  const [note, setNote] = useState(''), [taskTitle, setTaskTitle] = useState(''), [dueAt, setDueAt] = useState(''), [sequenceId, setSequenceId] = useState<string>(), [rescheduleAt, setRescheduleAt] = useState('')
  const refresh = useCallback(async () => {
    if (!lead) return
    const [i, t, s, e, x] = await Promise.all([crmService.getInteractions(lead.id), crmService.getTasks(lead.id), crmService.getSequences(organizationId), crmService.getEnrollments(lead.id), crmService.getExecutions(lead.id)])
    setInteractions(i); setTasks(t); setSequences(s); setEnrollments(e); setExecutions(x); setSequenceId(current => current || s[0]?.id)
    try {
      const [conversations, ai] = await Promise.all([crmConversationService.getLeadConversations(lead.id), crmConversationService.getLeadAiInsights(lead.id)])
      setCrmConversations(conversations as LeadConversationView[])
      setAiInsights(ai.insights)
      setFieldSuggestions(ai.fieldSuggestions)
      setResponseSuggestions(ai.responseSuggestions)
      setSlaEvents(ai.slaEvents)
      setQuickReplies(ai.quickReplies)
      setTemplates(ai.templates)
    } catch (error) {
      console.warn('CRM AI data unavailable:', error)
      setCrmConversations([]); setAiInsights([]); setFieldSuggestions([]); setResponseSuggestions([]); setSlaEvents([]); setQuickReplies([]); setTemplates([])
    }
  }, [lead, organizationId])
  useEffect(() => { refresh() }, [refresh])
  const addNote = async () => { if (!lead || !note.trim()) return; await crmService.createInteraction(organizationId, lead.id, { type: 'note', title: 'Atualizacao comercial', description: note.trim() }); setNote(''); refresh() }
  const addTask = async () => { if (!lead || !taskTitle.trim() || !dueAt) return; await crmService.createTask(organizationId, lead.id, taskTitle.trim(), new Date(dueAt).toISOString()); setTaskTitle(''); setDueAt(''); refresh() }
  const completeTask = async (taskId: string) => { await crmService.completeLeadTask(taskId); toast.success('Tarefa concluida'); refresh() }
  const markWon = async () => { if (!lead) return; await crmService.markLeadWon({ leadId: lead.id, value: lead.value }); toast.success('Lead marcado como ganho'); refresh() }
  const markLost = async () => { if (!lead) return; await crmService.markLeadLost({ leadId: lead.id, lostReason: 'Marcado manualmente no cockpit.' }); toast.success('Lead marcado como perdido'); refresh() }
  const enroll = async () => { if (!lead || !sequenceId) return; await crmService.enrollLead(organizationId, lead.id, sequenceId); toast.success('Sequencia iniciada'); refresh() }
  const setStatus = async (item: CrmSequenceEnrollment, status: CrmSequenceEnrollment['status']) => { await crmService.updateEnrollment(item.id, { status, manualNote: status === 'manual' ? 'Atendimento assumido manualmente.' : undefined }); refresh() }
  const reschedule = async (item: CrmSequenceEnrollment) => { if (!rescheduleAt) return; await crmService.updateEnrollment(item.id, { status: 'active', nextExecutionAt: new Date(rescheduleAt).toISOString() }); setRescheduleAt(''); toast.success('Follow-up reagendado'); refresh() }
  const sendSuggestion = async (suggestionId: string) => { await crmConversationService.sendSuggestedReply({ suggestionId }); toast.success('Resposta enviada'); refresh() }
  return <Dialog open={Boolean(lead)} onOpenChange={open => !open && onClose()}><DialogContent className="max-h-[90vh] max-w-7xl overflow-y-auto"><DialogHeader><DialogTitle>{lead?.name}</DialogTitle></DialogHeader>{lead && <Tabs defaultValue="follow-up">
    <TabsList className="grid w-full grid-cols-5"><TabsTrigger value="follow-up">Follow-up</TabsTrigger><TabsTrigger value="history">Historico</TabsTrigger><TabsTrigger value="tasks">Tarefas</TabsTrigger><TabsTrigger value="automations">Execucoes</TabsTrigger><TabsTrigger value="commercial">Comercial</TabsTrigger></TabsList>
    <TabsContent value="follow-up" className="space-y-4"><Lead360Panel lead={lead} interactions={interactions} tasks={tasks} conversations={crmConversations} aiInsights={aiInsights} fieldSuggestions={fieldSuggestions} responseSuggestions={responseSuggestions} slaEvents={slaEvents} quickReplies={quickReplies} templates={templates} onSendSuggestion={sendSuggestion} taskTitle={taskTitle} dueAt={dueAt} onTaskTitleChange={setTaskTitle} onDueAtChange={setDueAt} onCreateTask={addTask} onCompleteTask={completeTask} onMarkWon={markWon} onMarkLost={markLost} /><div className="flex gap-2"><Select value={sequenceId} onValueChange={setSequenceId}><SelectTrigger><SelectValue placeholder="Escolha uma sequencia" /></SelectTrigger><SelectContent>{sequences.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select><Button disabled={!sequenceId} onClick={enroll}>Iniciar sequencia</Button></div>{sequences.length === 0 && <p className="text-sm text-gray-500">Nenhuma sequencia configurada.</p>}{enrollments.map(item => <div key={item.id} className="space-y-3 rounded-md border p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm">{item.status}{item.nextExecutionAt ? ` - proximo envio ${new Date(item.nextExecutionAt).toLocaleString('pt-BR')}` : ''}</span><div className="flex gap-2"><Button size="sm" variant="outline" title="Pausar automacao" onClick={() => setStatus(item, 'paused')}><Pause className="h-3 w-3" /></Button><Button size="sm" variant="outline" title="Retomar automacao" onClick={() => setStatus(item, 'active')}><Play className="h-3 w-3" /></Button><Button size="sm" variant="outline" onClick={() => setStatus(item, 'manual')}><UserRoundCheck className="mr-1 h-3 w-3" />Assumir</Button></div></div><div className="flex gap-2"><Input type="datetime-local" value={rescheduleAt} onChange={event => setRescheduleAt(event.target.value)} /><Button size="sm" variant="outline" disabled={!rescheduleAt} onClick={() => reschedule(item)}>Reagendar</Button></div></div>)}</TabsContent>
    <TabsContent value="history" className="space-y-3"><div className="flex gap-2"><Textarea placeholder="Registrar atualizacao" value={note} onChange={event => setNote(event.target.value)} /><Button onClick={addNote}>Registrar</Button></div><LeadTimeline interactions={interactions} /></TabsContent>
    <TabsContent value="tasks" className="space-y-3"><LeadTaskPanel tasks={tasks} taskTitle={taskTitle} dueAt={dueAt} onTaskTitleChange={setTaskTitle} onDueAtChange={setDueAt} onCreateTask={addTask} onCompleteTask={completeTask} /></TabsContent>
    <TabsContent value="automations" className="space-y-3">{executions.length === 0 && <p className="text-sm text-gray-500">Nenhuma execucao registrada.</p>}{executions.map(item => <div key={item.id} className="flex justify-between gap-3 rounded-md border p-3 text-sm"><div><p>{item.actionType} - {item.status}</p><p className="text-xs text-gray-500">Agendado para {new Date(item.scheduledAt).toLocaleString('pt-BR')}</p>{item.lastError && <p className="mt-1 text-xs text-red-600">{item.lastError}</p>}</div>{item.status === 'failed' && <Button size="sm" variant="outline" onClick={() => crmService.retryExecution(item.id).then(refresh)}><RefreshCw className="mr-1 h-3 w-3" />Tentar novamente</Button>}</div>)}</TabsContent>
    <TabsContent value="commercial"><LeadCommercialPanel lead={lead} /></TabsContent>
  </Tabs>}</DialogContent></Dialog>
}

function buildLeadSourcesDashboardFromLeads(input: {
  organizationId: string
  crmInstanceId?: string
  leads: CrmLead[]
  stageById: Map<string, NonNullable<CrmPipeline['stages']>[number]>
}) {
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const periodEnd = now.toISOString().slice(0, 10)
  const grouped = input.leads.reduce((map, lead) => {
    const sourceName = lead.source || 'Manual'
    const sourceKey = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'manual'
    const stage = input.stageById.get(lead.stageId)
    const current = map.get(sourceKey) || {
      organizationId: input.organizationId,
      crmInstanceId: input.crmInstanceId,
      sourceId: lead.attributionContext?.campaignId || sourceKey,
      sourceKey,
      sourceName,
      sourceKind: normalizeAttributionSourceKind(lead.sourceKind),
      periodStart,
      periodEnd,
      leads: 0,
      opportunities: 0,
      sales: 0,
      mediaCost: 0,
      operationalCost: 0,
      clientVisibleCost: 0,
      attributedRevenue: 0,
      cpl: 0,
      opportunityRate: 0,
      conversionRate: 0,
      mroi: 0,
      campaignId: lead.attributionContext?.campaignId,
      landingPageId: lead.attributionContext?.landingPageId,
    } satisfies LeadSourceRollup

    current.leads += 1
    if ((lead.value || 0) > 0 || (stage?.orderIndex ?? 0) > 0) current.opportunities += 1
    if (lead.status === 'won' || stage?.isWon) {
      current.sales += 1
      current.attributedRevenue += lead.value || 0
    }
    map.set(sourceKey, current)
    return map
  }, new Map<string, LeadSourceRollup>())

  return buildAttributionDashboard({
    organizationId: input.organizationId,
    crmInstanceId: input.crmInstanceId,
    periodStart,
    periodEnd,
    rollups: Array.from(grouped.values()),
  })
}

function normalizeAttributionSourceKind(kind: CrmLead['sourceKind']): LeadSourceRollup['sourceKind'] {
  if (kind === 'whatsapp_cta') return 'whatsapp'
  if (kind === 'paid_campaign' || kind === 'landing_page' || kind === 'organic' || kind === 'referral' || kind === 'manual') return kind
  return 'manual'
}
