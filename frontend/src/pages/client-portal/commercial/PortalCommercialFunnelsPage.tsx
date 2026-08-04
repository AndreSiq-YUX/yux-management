import { ArrowRight, GitBranch, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { PipelineEditorDialog } from '@/components/crm/funnels/PipelineEditorDialog'
import { PipelineSummaryBoard } from '@/components/crm/funnels/PipelineSummaryBoard'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
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

  return (
    <PortalJourneyPage
      eyebrow="Comercial"
      title="Funis"
      description="Organize oportunidades por etapa, identifique gargalos e mova cada lead para a próxima ação comercial."
      icon={GitBranch}
      metrics={[
        { label: 'Funis ativos', value: String(pipelines.length), detail: 'Estruturas comerciais disponíveis.' },
        { label: 'Oportunidades', value: String(openLeads.length), detail: 'Leads abertos na operação.' },
        { label: 'Valor em aberto', value: formatPortalCurrency(openValue), detail: 'Soma das oportunidades abertas.' },
      ]}
      capabilities={[
        'Visualizar leads, valor, conversão e gargalos por etapa.',
        'Mover leads entre etapas e manter o histórico comercial integrado ao CRM.',
        'Configurar funis, etapas e ordem somente com a autorização da governança.',
        'Preservar a leitura para sellers e demais perfis sem permissão estrutural.',
      ]}
      primaryAction={!canConfigure ? { label: 'Abrir Leads', href: '/portal/comercial/leads' } : undefined}
      secondaryActions={[
        { label: 'Empresas / Contas', href: '/portal/comercial/contas' },
        { label: 'Tarefas e Follow-ups', href: '/portal/comercial/tarefas' },
      ]}
    >
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="funnels-operation-title">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/70 px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-white p-2 text-yux-700 shadow-sm ring-1 ring-inset ring-slate-200">
                <GitBranch className="h-4 w-4" aria-hidden="true" />
              </div>
              <h2 id="funnels-operation-title" className="text-base font-semibold text-slate-950">Operação comercial</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">Escolha um funil para acompanhar as oportunidades e agir no momento certo.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canConfigure && (
              <Button type="button" variant="outline" onClick={openCreateEditor} disabled={governanceLoading || !crmInstanceId} className="bg-white">
                <Plus className="mr-2 h-4 w-4" />
                Novo funil
              </Button>
            )}
            {selectedPipeline && canConfigure && (
              <Button type="button" onClick={openEditEditor} disabled={governanceLoading}>
                <Settings2 className="mr-2 h-4 w-4" />
                Configurar funil
              </Button>
            )}
          </div>
        </div>

        <div className="p-6">
        {loading ? (
          <p className="text-sm text-slate-600" role="status">Carregando sua operação comercial...</p>
        ) : error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700" role="alert">Não foi possível carregar os funis. {error}</p>
            <Button type="button" variant="outline" onClick={() => void reload()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            {governanceLoading && (
              <p className="text-sm text-slate-600" role="status">Verificando permissões de configuração...</p>
            )}
            {governanceError && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">{governanceError} A visualização continua disponível em modo somente leitura.</p>
            )}
            {!governanceLoading && !governanceError && governance && !canConfigure && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Seu perfil pode acompanhar e operar leads, mas não alterar a estrutura dos funis.</p>
            )}

            {pipelines.length > 0 && (
              <div className="max-w-md">
                <label htmlFor="selected-pipeline" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Funil em análise</label>
                <select
                  id="selected-pipeline"
                  className="mt-2 flex h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yux-500"
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
              <div className="mt-6 grid gap-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-6 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] md:p-8">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yux-100 text-yux-700">
                    <GitBranch className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-950">Comece pela sua primeira operação</h3>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">O funil organiza os leads que chegam pelos formulários, automações e canais comerciais. Crie as etapas uma vez e use-as para orientar o time.</p>
                  {canConfigure && crmInstanceId ? (
                    <Button type="button" className="mt-5" onClick={openCreateEditor}>
                      Criar primeiro funil
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : (
                    <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">A estrutura do CRM ainda precisa ser publicada por um administrador antes de criar o primeiro funil.</p>
                  )}
                </div>
                <ol className="space-y-3 rounded-xl border border-white bg-white p-4 shadow-sm">
                  {[
                    'Crie o funil e defina seu objetivo.',
                    'Ajuste etapas, cores e resultados.',
                    'Receba leads e mova-os conforme a próxima ação.',
                  ].map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm text-slate-700">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yux-50 text-xs font-bold text-yux-700">{index + 1}</span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
        </div>
      </section>

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
    </PortalJourneyPage>
  )
}
