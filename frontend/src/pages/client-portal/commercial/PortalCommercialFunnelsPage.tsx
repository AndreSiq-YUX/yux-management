import { ArrowRight, GitBranch, Plus, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ErrorState, SectionCard, SkeletonCard, portalButtonClasses } from '@/components/portal-ui'
import { PipelineEditorDialog } from '@/components/crm/funnels/PipelineEditorDialog'
import { PipelineSummaryBoard } from '@/components/crm/funnels/PipelineSummaryBoard'
import { PortalPage } from '@/components/client-portal/PortalPage'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { formatPortalCurrency } from '@/lib/client-portal/portalDisplay'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { crmService } from '@/services/crmService'
import type {
  CrmGovernanceContext,
  CrmPipeline,
  CrmPipelineCreateInput,
  CrmPipelinePatch,
  CrmPipelineStage,
  CrmPipelineStageCreateInput,
  CrmPipelineStagePatch,
} from '@/types/crm'

function canManagePipelineConfiguration(governance: CrmGovernanceContext | null, platformRole?: string | null) {
  if (platformRole === 'yux_admin' || platformRole === 'yux_operator') return true
  const memberRole = governance?.currentMember?.role || platformRole
  if (memberRole !== 'client_admin' && memberRole !== 'manager') return false
  return Boolean(governance?.instance.allowClientPipelineCustomization)
}

function canMoveLead(governance: CrmGovernanceContext | null, platformRole?: string | null) {
  return ['seller', 'manager', 'client_admin', 'yux_admin', 'yux_operator'].includes(governance?.currentMember?.role || platformRole || '')
}

export function PortalCommercialFunnelsPage() {
  const { organization, role, loading, error, pipelines, leads, reload } = usePortalCrmContext()
  const [selectedPipelineId, setSelectedPipelineId] = useState('')
  const [editingPipeline, setEditingPipeline] = useState<CrmPipeline | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null)
  const [governance, setGovernance] = useState<CrmGovernanceContext | null>(null)
  const [governanceLoading, setGovernanceLoading] = useState(true)
  const [governanceError, setGovernanceError] = useState<string | null>(null)

  const selectedPipeline = useMemo(
    () => pipelines.find(pipeline => pipeline.id === selectedPipelineId) || pipelines[0],
    [pipelines, selectedPipelineId],
  )
  const openLeads = leads.filter(lead => (lead.status || 'open') === 'open')
  const openValue = openLeads.reduce((sum, lead) => sum + (lead.value || 0), 0)
  const selectedPipelineLeads = selectedPipeline
    ? leads.filter(lead => lead.pipelineId === selectedPipeline.id)
    : []
  const leadCountsByStage = selectedPipelineLeads.reduce<Record<string, number>>((counts, lead) => {
    counts[lead.stageId] = (counts[lead.stageId] || 0) + 1
    return counts
  }, {})
  const pipelineLeadCount = selectedPipelineLeads.length
  const canConfigure = canManagePipelineConfiguration(governance, role?.key)
  const canMove = canMoveLead(governance, role?.key)
  const maxPipelineCount = governance?.instance.maxPipelineCount || Math.max(pipelines.length, 1)
  const crmInstanceId = governance?.instance.id || selectedPipeline?.crmInstanceId || ''

  useEffect(() => {
    if (!pipelines.length) {
      setSelectedPipelineId('')
      return
    }
    setSelectedPipelineId(current => (
      pipelines.some(pipeline => pipeline.id === current)
        ? current
        : (pipelines.find(pipeline => pipeline.isDefault) || pipelines[0]).id
    ))
  }, [pipelines])

  useEffect(() => {
    let active = true
    if (!organization?.id) {
      setGovernance(null)
      setGovernanceLoading(false)
      setGovernanceError(null)
      return () => { active = false }
    }

    setGovernanceLoading(true)
    setGovernanceError(null)
    void crmGovernanceService.getActiveInstanceForOrganization(organization.id)
      .then(instance => instance ? crmGovernanceService.getGovernanceContext(instance.id) : null)
      .then(context => {
        if (!active) return
        setGovernance(context)
      })
      .catch(loadError => {
        if (!active) return
        console.error('Erro ao carregar governança do CRM:', loadError)
        setGovernance(null)
        setGovernanceError('Não foi possível validar as permissões de configuração do CRM.')
      })
      .finally(() => {
        if (active) setGovernanceLoading(false)
      })

    return () => { active = false }
  }, [organization?.id])

  const moveLead = async (leadId: string, stageId: string) => {
    setMovingLeadId(leadId)
    try {
      await crmService.moveLeadToStage(leadId, stageId)
      await reload()
      toast.success('Lead movido para a nova etapa.')
    } catch (moveError) {
      console.error('Erro ao mover lead no funil:', moveError)
      toast.error('Não foi possível mover o lead.')
    } finally {
      setMovingLeadId(null)
    }
  }

  const createPipeline = async (input: CrmPipelineCreateInput) => {
    const created = await crmService.createPipeline(input)
    await reload()
    toast.success('Funil criado.')
    return created
  }

  const updatePipeline = async (id: string, patch: CrmPipelinePatch) => {
    const updated = await crmService.updatePipeline(id, patch)
    await reload()
    toast.success('Funil atualizado.')
    return updated
  }

  const createStage = async (input: CrmPipelineStageCreateInput) => {
    const created = await crmService.createPipelineStage(input)
    await reload()
    toast.success('Etapa criada.')
    return created
  }

  const updateStage = async (id: string, patch: CrmPipelineStagePatch) => {
    const updated = await crmService.updatePipelineStage(id, patch)
    await reload()
    toast.success('Etapa atualizada.')
    return updated
  }

  const reorderStages = async (pipelineId: string, stageIds: string[]) => {
    const reordered = await crmService.reorderPipelineStages(pipelineId, stageIds)
    await reload()
    toast.success('Ordem das etapas atualizada.')
    return reordered
  }

  const openCreateEditor = () => {
    setEditingPipeline(null)
    setEditorOpen(true)
  }

  const openEditEditor = () => {
    if (!selectedPipeline) return
    setEditingPipeline(selectedPipeline)
    setEditorOpen(true)
  }

  const noticeClasses = 'rounded-[10px] border px-4 py-3 text-sm'
  const adminHint = 'um administrador da sua empresa ou a equipe YUX'

  return (
    <PortalPage
      eyebrow="Comercial"
      title="Funis"
      description="Organize suas oportunidades por etapa, veja onde elas travam e mova cada lead para a próxima ação."
      help={[
        'Veja leads, valor, conversão e gargalos de cada etapa.',
        'Mova leads entre etapas; o histórico do lead é mantido.',
        'Criar funis, etapas e mudar a ordem depende do seu perfil. Se você não puder alterar a estrutura, ainda acompanha e move os leads.',
      ]}
      primaryAction={canConfigure && pipelines.length > 0
        ? (
          <button type="button" onClick={openCreateEditor} disabled={governanceLoading || !crmInstanceId} className={portalButtonClasses('primary')}>
            <Plus aria-hidden="true" />
            Novo funil
          </button>
        )
        : { label: 'Ver leads', href: '/portal/comercial/leads' }}
      metrics={[
        { label: 'Funis ativos', value: String(pipelines.length) },
        { label: 'Oportunidades', value: String(openLeads.length), detail: 'Leads abertos.' },
        { label: 'Valor em aberto', value: formatPortalCurrency(openValue), detail: 'Soma das oportunidades abertas.' },
      ]}
      related={[
        { label: 'Empresas e contas', href: '/portal/comercial/contas' },
        { label: 'Tarefas e follow-ups', href: '/portal/comercial/tarefas' },
      ]}
    >
      <SectionCard
        id="funnels-operation"
        title="Operação comercial"
        description="Escolha um funil para acompanhar as oportunidades e agir no momento certo."
        action={selectedPipeline && canConfigure ? (
          <button type="button" onClick={openEditEditor} disabled={governanceLoading} className={portalButtonClasses('ghost')}>
            <Settings2 aria-hidden="true" />
            Configurar funil
          </button>
        ) : undefined}
      >
        {loading ? (
          <SkeletonCard lines={4} />
        ) : error ? (
          <ErrorState title="Não foi possível carregar os funis" description={error} onRetry={() => void reload()} />
        ) : (
          <>
            {governanceLoading && (
              <p className="text-sm text-yx-fg-3" role="status">Verificando permissões de configuração...</p>
            )}
            {governanceError && (
              <p className={`${noticeClasses} border-yx-warn-line bg-yx-warn-soft text-yx-warn`} role="alert">{governanceError} A visualização continua disponível em modo somente leitura.</p>
            )}
            {!governanceLoading && !governanceError && governance && !canConfigure && (
              <p className={`${noticeClasses} border-yx-line bg-yx-surface-2 text-yx-fg-2`}>Seu perfil pode acompanhar e mover leads, mas não alterar a estrutura dos funis. Para mudar etapas, fale com {adminHint}.</p>
            )}

            {pipelines.length > 0 && (
              <div className="mt-4 max-w-md">
                <label htmlFor="selected-pipeline" className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">Funil em análise</label>
                <select
                  id="selected-pipeline"
                  className="mt-1.5 flex h-10 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-3 py-2 text-sm font-medium text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue"
                  value={selectedPipeline?.id || ''}
                  onChange={event => setSelectedPipelineId(event.target.value)}
                >
                  {pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
                </select>
              </div>
            )}

            {selectedPipeline ? (
              <div className="mt-6">
                <PipelineSummaryBoard
                  pipeline={selectedPipeline}
                  leads={selectedPipelineLeads}
                  allPipelines={pipelines}
                  canMoveLeads={canMove}
                  movingLeadId={movingLeadId}
                  onMoveLead={moveLead}
                />
              </div>
            ) : (
              <div className="mt-2 grid gap-6 rounded-[10px] border border-dashed border-yx-line-strong bg-yx-surface-2 p-5 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] md:p-8">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yx-blue-soft text-yx-blue">
                    <GitBranch className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold tracking-tight text-yx-fg">Comece pela sua primeira operação</h3>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-yx-fg-2">O funil organiza os leads que chegam pelos formulários, automações e canais comerciais. Crie as etapas uma vez e use-as para orientar o time.</p>
                  {canConfigure && crmInstanceId ? (
                    <button type="button" className={portalButtonClasses('primary', 'mt-5')} onClick={openCreateEditor}>
                      Criar primeiro funil
                      <ArrowRight aria-hidden="true" />
                    </button>
                  ) : !crmInstanceId ? (
                    <p className={`mt-5 ${noticeClasses} border-yx-warn-line bg-yx-warn-soft text-yx-warn`}>A estrutura do CRM ainda precisa ser publicada por {adminHint} antes de criar o primeiro funil.</p>
                  ) : (
                    <p className={`mt-5 ${noticeClasses} border-yx-warn-line bg-yx-warn-soft text-yx-warn`}>Seu perfil não pode criar funis. Peça a {adminHint} para criar o primeiro.</p>
                  )}
                </div>
                <ol className="m-0 list-none space-y-3 rounded-xl border border-yx-line bg-yx-surface p-4">
                  {[
                    'Crie o funil e defina seu objetivo.',
                    'Ajuste etapas, cores e resultados.',
                    'Receba leads e mova-os conforme a próxima ação.',
                  ].map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm text-yx-fg-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yx-blue-soft font-mono text-xs font-bold text-yx-blue">{index + 1}</span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </SectionCard>

      <PipelineEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        pipeline={editingPipeline}
        pipelines={pipelines}
        organizationId={organization?.id || ''}
        crmInstanceId={crmInstanceId}
        maxPipelineCount={maxPipelineCount}
        canEdit={canConfigure}
        pipelineLeadCount={pipelineLeadCount}
        leadCountsByStage={leadCountsByStage}
        onCreatePipeline={createPipeline}
        onUpdatePipeline={updatePipeline}
        onCreateStage={createStage}
        onUpdateStage={updateStage}
        onReorderStages={reorderStages}
      />
    </PortalPage>
  )
}
