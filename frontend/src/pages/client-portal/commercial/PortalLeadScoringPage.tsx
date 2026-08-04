import { Gauge, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { ScoringModelForm } from '@/components/crm/scoring/ScoringModelForm'
import { ScoringRuleEditor, ScoringRuleRow } from '@/components/crm/scoring/ScoringRuleEditor'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { crmScoringService } from '@/services/crmScoringService'
import type { CrmGovernanceContext, LeadScoringModel, LeadScoringRule } from '@/types/crm'

export function PortalLeadScoringPage() {
  const { organization, leads, pipelines } = usePortalCrmContext()
  const [governance, setGovernance] = useState<CrmGovernanceContext | null>(null)
  const [model, setModel] = useState<LeadScoringModel | null>(null)
  const [rules, setRules] = useState<LeadScoringRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [simulation, setSimulation] = useState<{ resultingFitScore: number; resultingIntentScore: number; resultingCombinedScore: number; appliedRules: Array<{ name: string; dimension: string; points: number }> } | null>(null)
  const crmInstanceId = governance?.instance.id || pipelines.find(pipeline => pipeline.crmInstanceId)?.crmInstanceId
  const canEdit = ['client_admin', 'manager', 'yux_admin'].includes(governance?.currentMember?.role || '')
  const activeRules = useMemo(() => rules.filter(rule => rule.isActive), [rules])

  const load = async () => {
    if (!organization?.id) return
    setLoading(true); setError(null)
    try {
      const instance = await crmGovernanceService.getActiveInstanceForOrganization(organization.id)
      const context = instance ? await crmGovernanceService.getGovernanceContext(instance.id) : null
      setGovernance(context)
      if (!instance) { setModel(null); setRules([]); return }
      const response = await crmScoringService.getModel(instance.id)
      setModel(response.model); setRules(response.rules)
    } catch (loadError) { console.error(loadError); setError('Não foi possível carregar a pontuação de leads.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [organization?.id])

  return <PortalJourneyPage eyebrow="Comercial" title="Pontuação de leads" description="Configure fit e intenção separadamente e transforme ações reais em sinais para as automações." icon={Gauge} metrics={[{ label: 'Fit', value: model ? `${model.fitWeight}%` : '—', detail: 'Peso no score combinado.' }, { label: 'Intenção', value: model ? `${model.intentWeight}%` : '—', detail: 'Peso no score combinado.' }, { label: 'Regras ativas', value: String(activeRules.length), detail: 'Ações que alteram o score.' }]} capabilities={['Separar score de fit e score de intenção.', 'Criar regras por formulário, etapa, tarefa, interação e e-mail.', 'Simular o efeito de uma ação antes de salvar ou publicar automações.', 'Usar limiares de score para iniciar outros fluxos.']} primaryAction={{ label: 'Abrir Leads', href: '/portal/comercial/leads' }} secondaryActions={[{ label: 'Funis', href: '/portal/comercial/funis' }, { label: 'Tarefas', href: '/portal/comercial/tarefas' }]}>
    <section className="space-y-4 rounded-lg border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-gray-900">Modelo de pontuação</h2><p className="mt-1 text-sm text-gray-600">Os pesos devem somar 100. Regras negativas podem reduzir uma dimensão sem apagar o histórico.</p></div><Button type="button" variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div>
      {loading ? <p className="text-sm text-gray-600" role="status">Carregando modelo...</p> : error ? <p className="text-sm text-red-600" role="alert">{error}</p> : !model ? <p className="rounded-md border border-dashed p-5 text-sm text-gray-600">Nenhum modelo ativo foi criado para esta instância CRM.</p> : <>
        {canEdit ? <ScoringModelForm model={model} onSave={async input => { const updated = await crmScoringService.updateModel(model.id, input); setModel(updated); toast.success('Modelo salvo.') }} /> : <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-600">Seu perfil pode consultar a pontuação, mas não alterar suas regras.</p>}
        <div className="space-y-3"><div><h2 className="text-base font-semibold text-gray-900">Regras por ação</h2><p className="mt-1 text-sm text-gray-600">Cada evento pode alimentar mais de uma regra e mais de uma automação.</p></div>{canEdit && <ScoringRuleEditor modelId={model.id} onCreate={async input => { const created = await crmScoringService.createRule(input); setRules(current => [...current, created]); toast.success('Regra criada.') }} />}{activeRules.map(rule => <ScoringRuleRow key={rule.id} rule={rule} onDeactivate={async id => { await crmScoringService.deactivateRule(id); setRules(current => current.map(rule => rule.id === id ? { ...rule, isActive: false } : rule)); toast.success('Regra desativada.') }} />)}</div>
        <div className="space-y-3 rounded-md border bg-gray-50 p-4"><div><h2 className="text-base font-semibold text-gray-900">Simular ação</h2><p className="mt-1 text-sm text-gray-600">A simulação não grava nada no lead.</p></div><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"><div><label htmlFor="score-simulation-lead" className="text-sm font-medium">Lead</label><select id="score-simulation-lead" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedLeadId} onChange={event => setSelectedLeadId(event.target.value)}><option value="">Selecione</option>{leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></div><div><label htmlFor="score-simulation-event" className="text-sm font-medium">Ação</label><select id="score-simulation-event" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue="lead.task_completed"><option value="lead.task_completed">Tarefa concluída</option><option value="form.submitted">Formulário enviado</option><option value="lead.stage_changed">Etapa alterada</option><option value="email.opened">E-mail aberto</option></select></div><Button type="button" disabled={!selectedLeadId || !crmInstanceId} onClick={async event => { const target = event.currentTarget.parentElement?.querySelector('select[id="score-simulation-event"]') as HTMLSelectElement | null; const result = await crmScoringService.simulate({ crmInstanceId: crmInstanceId || '', leadId: selectedLeadId, eventType: target?.value || 'lead.task_completed' }); setSimulation(result) }}>Simular</Button></div>{simulation && <p className="text-sm text-gray-700">Resultado previsto: Fit {simulation.resultingFitScore}/100 · Intenção {simulation.resultingIntentScore}/100 · Combinado {simulation.resultingCombinedScore}/100. {simulation.appliedRules.length ? `${simulation.appliedRules.length} regra(s) aplicada(s).` : 'Nenhuma regra se aplica.'}</p>}</div>
      </>}
    </section>
  </PortalJourneyPage>
}
