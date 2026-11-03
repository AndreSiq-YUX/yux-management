import { ActivateQualification } from '@/components/crm/scoring/ActivateQualification'
import { QualificationSettings } from '@/components/crm/scoring/QualificationSettings'
import { PrioritySettings } from '@/components/crm/scoring/PrioritySettings'
import { Gauge, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalPage } from '@/components/client-portal/PortalPage'
import { EmptyState, ErrorState, ResponsiveTable, SectionCard, SkeletonCard, portalButtonClasses, type ResponsiveTableColumn } from '@/components/portal-ui'
import { ScoringModelForm } from '@/components/crm/scoring/ScoringModelForm'
import { ScoringRuleEditor, ScoringRuleRow } from '@/components/crm/scoring/ScoringRuleEditor'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { crmScoringService } from '@/services/crmScoringService'
import type { CrmGovernanceContext, CrmLead, LeadScoringModel, LeadScoringRule } from '@/types/crm'

/** Papéis que podem alterar o modelo e as regras de pontuação. */
const EDITOR_ROLES = ['client_admin', 'manager', 'yux_admin', 'yux_operator', 'yux_manager']

export function canEditLeadScoring(governanceRole?: string | null, platformRole?: string | null) {
  return ['yux_admin', 'yux_operator'].includes(platformRole || '') || EDITOR_ROLES.includes(governanceRole || '')
}

/** Pontuação final = perfil e interesse combinados pelos pesos do modelo. */
export function combineScore(fit: number, intent: number, fitWeight: number, intentWeight: number) {
  const total = fitWeight + intentWeight
  if (total <= 0) return Math.round((fit + intent) / 2)
  return Math.round((fit * fitWeight + intent * intentWeight) / total)
}

const simulationEvents = [
  { value: 'lead.task_completed', label: 'Tarefa concluída' },
  { value: 'form.submitted', label: 'Formulário enviado' },
  { value: 'lead.stage_changed', label: 'Etapa alterada' },
  { value: 'email.opened', label: 'E-mail aberto' },
]

type Simulation = { resultingFitScore: number; resultingIntentScore: number; resultingCombinedScore: number; appliedRules: Array<{ name: string; dimension: string; points: number }> }

const MAX_LEADS_LISTED = 50

export function PortalLeadScoringPage() {
  const { organization, role, leads, pipelines } = usePortalCrmContext()
  const [creating,setCreating] = useState(false)
  const [priorityInstance,setPriorityInstance] = useState<string|null>(null)
  const [governance, setGovernance] = useState<CrmGovernanceContext | null>(null)
  const [model, setModel] = useState<LeadScoringModel | null>(null)
  const [rules, setRules] = useState<LeadScoringRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [simulationEvent, setSimulationEvent] = useState(simulationEvents[0].value)
  const [simulating, setSimulating] = useState(false)
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [simulationError, setSimulationError] = useState<string | null>(null)
  const crmInstanceId = governance?.instance.id || pipelines.find(pipeline => pipeline.crmInstanceId)?.crmInstanceId
  const priorityActive = Boolean(crmInstanceId && priorityInstance === crmInstanceId)
  const onPriorityActive = useCallback((active:boolean)=>setPriorityInstance(active ? crmInstanceId ?? null : null),[crmInstanceId])
  const canEdit = canEditLeadScoring(governance?.currentMember?.status === 'active' ? governance.currentMember.role : undefined, role?.key)
  const activeRules = useMemo(() => rules.filter(rule => rule.isActive), [rules])
  const rankedLeads = useMemo(() => [...leads].sort((a, b) => b.score - a.score), [leads])

  const load = useCallback(async () => {
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
  }, [organization?.id])
  useEffect(() => { void load() }, [load])

  const simulate = async () => {
    if (!selectedLeadId || !crmInstanceId) return
    setSimulating(true); setSimulationError(null)
    try {
      setSimulation(await crmScoringService.simulate({ crmInstanceId, leadId: selectedLeadId, eventType: simulationEvent }))
    } catch (simulateError) {
      console.error(simulateError)
      setSimulation(null)
      setSimulationError('Não foi possível simular agora. Tente novamente.')
    } finally { setSimulating(false) }
  }

  const fitWeight = model?.fitWeight ?? 50
  const intentWeight = model?.intentWeight ?? 50
  const exampleScore = combineScore(80, 60, fitWeight, intentWeight)

  const leadColumns: ResponsiveTableColumn<CrmLead>[] = [
    { key: 'name', header: 'Lead', mobileLabel: '', render: lead => (<span><span className="font-semibold text-yx-fg">{lead.name}</span>{lead.company ? <span className="block text-xs text-yx-fg-3">{lead.company}</span> : null}</span>) },
    { key: 'fit', header: 'Perfil', className: 'text-right', render: lead => (lead.fitScore !== undefined ? `${lead.fitScore}/100` : '—') },
    { key: 'intent', header: 'Interesse', className: 'text-right', render: lead => (lead.intentScore !== undefined ? `${lead.intentScore}/100` : '—') },
    { key: 'score', header: 'Pontuação', className: 'text-right', render: lead => <span className="font-display font-semibold text-yx-fg">{lead.score}/100</span> },
  ]

  return (
    <PortalPage
      eyebrow="Comercial"
      title="Pontuação de leads"
      description="Entenda como cada lead ganha pontos para você saber quem tem mais chance de fechar e atender essas pessoas primeiro."
      help={priorityActive ? [
        'Potencial mede a adequação da conta. Temperatura acompanha as interações comerciais.',
        'A fila indica o tipo de ação. A prioridade ordena os leads dentro dela.',
      ] : model?.calculationMode==='sum' ? [
        'A pontuação soma regras do perfil e das atividades, limitada a 0 a 100.',
        'Faixas numéricas usam início incluído e fim não incluído. A mesma mensagem ou tarefa não pontua duas vezes.',
        'Confira a prévia e recalcule os leads existentes depois de alterar as regras.',
      ] : [
        'Cada lead tem duas notas: Perfil (o quanto ele se parece com o seu cliente ideal) e Interesse (o quanto ele age: abre e-mails, responde, envia formulário).',
        'A pontuação final combina as duas notas pelos pesos do modelo.',
        'Quem pode editar as regras também consegue simular o efeito de uma ação antes de salvar.',
      ]}
      primaryAction={{ label: 'Ver leads', href: '/portal/comercial/leads' }}
      metrics={priorityActive ? undefined : model?.calculationMode === 'sum' ? [
        { label: 'Pontuação', value: '0–100', detail: 'Soma do perfil e das atividades.' },
        { label: 'Morno a partir de', value: String(model.warmThreshold ?? 40), detail: 'Limite configurável.' },
        { label: 'Quente a partir de', value: String(model.hotThreshold ?? 70), detail: 'Priorize o contato comercial.' },
      ] : model ? [
        { label: 'Peso do perfil', value: `${model.fitWeight}%`, detail: 'Na pontuação final.' },
        { label: 'Peso do interesse', value: `${model.intentWeight}%`, detail: 'Na pontuação final.' },
        { label: 'Regras ativas', value: String(activeRules.length), detail: 'Ações que mudam a pontuação.' },
      ] : undefined}
      related={[
        { label: 'Funis', href: '/portal/comercial/funis' },
        { label: 'Tarefas e follow-ups', href: '/portal/comercial/tarefas' },
      ]}
    >
      {crmInstanceId && <SectionCard title="Prioridade comercial" description="Configure potencial, temperatura e filas para este CRM.">
        <PrioritySettings key={crmInstanceId} crmInstanceId={crmInstanceId} onActiveChange={onPriorityActive} />
      </SectionCard>}
      {priorityActive ? null : loading ? (
        <SkeletonCard lines={5} />
      ) : error ? (
        <ErrorState title="Não foi possível carregar a pontuação" description={error} onRetry={() => void load()} />
      ) : !model ? (
        <EmptyState
          icon={Gauge}
          title="A pontuação ainda não foi configurada"
          description="Configure regras por perfil, campos personalizados e atividades para priorizar seus leads."
          action={canEdit && crmInstanceId ? {label: creating ? 'Configurando...' : 'Configurar pontuação', onClick: async () => { if(creating) return; setCreating(true); try { await crmScoringService.createModel(crmInstanceId); await load() } catch { setError('Não foi possível configurar a pontuação.') } finally { setCreating(false) } }} : undefined}
        />
      ) : model.calculationMode === 'sum' ? (
        <>
          <SectionCard title="Qualificação por perfil e atividades" description="Configure condições e faixas numéricas, acompanhe a temperatura e explique cada ponto.">
            {canEdit && crmInstanceId ? <QualificationSettings key={crmInstanceId} crmInstanceId={crmInstanceId} warmThreshold={model.warmThreshold} hotThreshold={model.hotThreshold} onChanged={() => { void crmScoringService.getModel(crmInstanceId).then(response => { setModel(response.model); setRules(response.rules) }).catch(() => setError('Não foi possível atualizar a pontuação.')) }} /> : <p className="text-sm">A pontuação soma o perfil e as atividades. Administradores do CRM podem configurar as regras.</p>}
          </SectionCard>
          <SectionCard title="Pontuação dos seus leads" description="Do maior para o menor."><ResponsiveTable caption="Pontuação dos leads" columns={leadColumns} rows={rankedLeads.slice(0,MAX_LEADS_LISTED)} getRowKey={lead => lead.id} empty={<p>Nenhum lead cadastrado.</p>} /></SectionCard>
        </>
      ) : (
        <>
          {canEdit && crmInstanceId && <ActivateQualification crmInstanceId={crmInstanceId} onChanged={() => void load()} />}
          <SectionCard title="Como a pontuação funciona" description="Em linguagem simples.">
            <div className="max-w-[70ch] space-y-3 text-[14px] leading-relaxed text-yx-fg-2">
              <p><strong className="text-yx-fg">Perfil</strong> mede se o lead se parece com o cliente que você quer atender (setor, porte, região). <strong className="text-yx-fg">Interesse</strong> mede o que ele faz: abrir e-mails, responder, enviar um formulário.</p>
              <p>A <strong className="text-yx-fg">pontuação</strong> de 0 a 100 junta as duas notas: o perfil vale {model.fitWeight}% e o interesse vale {model.intentWeight}%. Quanto maior, mais vale atender o lead primeiro.</p>
              <p className="rounded-lg border border-yx-line bg-yx-surface-2 px-3 py-2.5 text-[13.5px]">
                <strong className="text-yx-fg">Exemplo:</strong> um lead do setor certo (perfil 80) que abriu 3 e-mails (interesse 60) fica com {exampleScore} pontos.
              </p>
            </div>
          </SectionCard>

          <SectionCard
            title="Pontuação dos seus leads"
            description={rankedLeads.length > MAX_LEADS_LISTED ? `Os ${MAX_LEADS_LISTED} leads com maior pontuação.` : 'Do maior para o menor.'}
          >
            <ResponsiveTable
              caption="Pontuação dos leads"
              columns={leadColumns}
              rows={rankedLeads.slice(0, MAX_LEADS_LISTED)}
              getRowKey={lead => lead.id}
              empty={<EmptyState title="Nenhum lead pontuado ainda" description="Assim que seus primeiros leads chegarem, a pontuação de cada um aparece aqui." action={{ label: 'Ir para Leads', href: '/portal/comercial/leads' }} />}
            />
          </SectionCard>

          {canEdit && model.calculationMode !== "sum" ? (
            <>
              <SectionCard
                title="Modelo de pontuação"
                description="Os pesos devem somar 100. Regras com pontos negativos reduzem a nota sem apagar o histórico."
                action={<button type="button" onClick={() => void load()} className={portalButtonClasses('ghost')}><RefreshCw aria-hidden="true" />Atualizar</button>}
              >
                <ScoringModelForm model={model} onSave={async input => { const updated = await crmScoringService.updateModel(model.id, input); setModel(updated); toast.success('Modelo salvo.') }} />
              </SectionCard>

              <SectionCard title="Regras por ação" description="Cada ação do lead pode somar (ou tirar) pontos do perfil ou do interesse.">
                <div className="space-y-3">
                  <ScoringRuleEditor modelId={model.id} onCreate={async input => { const created = await crmScoringService.createRule(input); setRules(current => [...current, created]); toast.success('Regra criada.') }} />
                  {activeRules.length === 0 ? <p className="text-sm text-yx-fg-3">Nenhuma regra ativa. Adicione a primeira acima.</p> : null}
                  {activeRules.map(rule => <ScoringRuleRow key={rule.id} rule={rule} onDeactivate={async id => { await crmScoringService.deactivateRule(id); setRules(current => current.map(item => item.id === id ? { ...item, isActive: false } : item)); toast.success('Regra desativada.') }} />)}
                </div>
              </SectionCard>

              <SectionCard title="Simular uma ação" description="Veja como a pontuação mudaria. A simulação não grava nada no lead.">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                  <div>
                    <label htmlFor="score-simulation-lead" className="text-sm font-medium text-yx-fg">Lead</label>
                    <select id="score-simulation-lead" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedLeadId} onChange={event => { setSelectedLeadId(event.target.value); setSimulation(null) }}>
                      <option value="">Selecione</option>
                      {leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="score-simulation-event" className="text-sm font-medium text-yx-fg">Ação</label>
                    <select id="score-simulation-event" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={simulationEvent} onChange={event => { setSimulationEvent(event.target.value); setSimulation(null) }}>
                      {simulationEvents.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <button type="button" disabled={!selectedLeadId || !crmInstanceId || simulating} onClick={() => void simulate()} className={portalButtonClasses('primary')}>
                    {simulating ? 'Simulando...' : 'Simular'}
                  </button>
                </div>
                {simulationError ? <p role="alert" className="mt-3 text-sm text-yx-crit">{simulationError}</p> : null}
                {simulation ? (
                  <p className="mt-3 text-sm text-yx-fg-2">
                    Resultado previsto: Perfil {simulation.resultingFitScore}/100 · Interesse {simulation.resultingIntentScore}/100 · Pontuação {simulation.resultingCombinedScore}/100.{' '}
                    {simulation.appliedRules.length ? `${simulation.appliedRules.length} regra(s) aplicada(s).` : 'Nenhuma regra se aplica a essa ação.'}
                  </p>
                ) : null}
              </SectionCard>
            </>
          ) : !canEdit ? (
            <p className="rounded-[10px] border border-yx-line bg-yx-surface-2 px-4 py-3 text-sm text-yx-fg-2">
              Seu perfil pode consultar a pontuação, mas não alterar as regras. Para mudar como os leads ganham pontos, fale com um administrador da sua empresa ou com a equipe YUX.
            </p>
          ) : null}
        </>
      )}
    </PortalPage>
  )
}
